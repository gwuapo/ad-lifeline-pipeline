// Cloudflare Worker: Gemini File API Upload Proxy
// Deploy: npx wrangler deploy worker/gemini-proxy.js --name gemini-upload-proxy --compatibility-date=2026-02-20
//
// Proxies all Gemini File API requests to bypass browser CORS restrictions.
// Paid Workers plan required for files over 100MB (supports up to 500MB).
//
//   POST /upload/start  - Initiate a resumable upload, get upload URL
//   PUT  /upload/send   - Stream file bytes to Gemini
//   GET  /file/status   - Poll file processing status

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Gemini-Key",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const key = request.headers.get("X-Gemini-Key");

    if (!key) {
      return json({ error: "Missing X-Gemini-Key header" }, 400);
    }

    try {
      // Step 1: Get resumable upload URL from Gemini
      if (url.pathname === "/upload/start" && request.method === "POST") {
        const { mimeType, numBytes, displayName } = await request.json();

        const initRes = await fetch(
          `${GEMINI_BASE}/upload/v1beta/files?key=${key}`,
          {
            method: "POST",
            headers: {
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": String(numBytes),
              "X-Goog-Upload-Header-Content-Type": mimeType,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ file: { displayName: displayName || "ad-creative" } }),
          }
        );

        if (!initRes.ok) {
          const body = await initRes.text();
          return json({ error: `Gemini upload init failed (${initRes.status}): ${body}` }, initRes.status);
        }

        const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
        if (!uploadUrl) {
          return json({ error: "No upload URL returned from Gemini" }, 500);
        }

        return json({ uploadUrl });
      }

      // Step 2: Stream file bytes through to Gemini's upload URL
      if (url.pathname === "/upload/send" && request.method === "PUT") {
        const uploadUrl = url.searchParams.get("uploadUrl");
        const numBytes = url.searchParams.get("numBytes");

        if (!uploadUrl) {
          return json({ error: "Missing uploadUrl parameter" }, 400);
        }

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": numBytes,
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
          },
          body: request.body,
        });

        if (!uploadRes.ok) {
          const body = await uploadRes.text();
          return json({ error: `Gemini upload failed (${uploadRes.status}): ${body}` }, uploadRes.status);
        }

        const data = await uploadRes.json();
        return json(data);
      }

      // Step 3: Poll file processing status
      if (url.pathname === "/file/status" && request.method === "GET") {
        const fileName = url.searchParams.get("name");
        if (!fileName) {
          return json({ error: "Missing name parameter" }, 400);
        }

        const statusRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${key}`);
        if (!statusRes.ok) {
          const body = await statusRes.text();
          return json({ error: `Status check failed (${statusRes.status}): ${body}` }, statusRes.status);
        }

        const data = await statusRes.json();
        return json(data);
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
