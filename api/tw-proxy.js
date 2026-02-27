// Vercel Serverless Function: Triple Whale API Proxy
// Bypasses CORS restrictions by proxying requests server-side

const TW_API = "https://api.triplewhale.com/api/v2";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(400).json({ error: "Missing x-api-key header" });
  }

  // The path after /api/tw-proxy becomes the Triple Whale endpoint
  // e.g., /api/tw-proxy?path=/users/api-keys/me
  const twPath = req.query.path || req.url.split("?path=")[1]?.split("&")[0];
  if (!twPath) {
    return res.status(400).json({ error: "Missing path query parameter" });
  }

  const twUrl = `${TW_API}${twPath}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
    };

    if (req.method === "POST" && req.body) {
      fetchOptions.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const twRes = await fetch(twUrl, fetchOptions);
    const data = await twRes.text();

    res.status(twRes.status);
    res.setHeader("Content-Type", twRes.headers.get("content-type") || "application/json");
    return res.send(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
