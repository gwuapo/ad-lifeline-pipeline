import { getApiKey, getAnalysisPrompt, getSelectedModel, getProxyUrl, isProxyConfigured } from "./apiKeys.js";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const INLINE_LIMIT = 20 * 1024 * 1024; // 20MB for inline base64
const PROXY_LIMIT = 100 * 1024 * 1024; // 100MB Cloudflare Workers paid plan limit

export function isGeminiConfigured() {
  return !!getApiKey("gemini").trim();
}

// ── Video preparation ──

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function prepareVideoFile(file, onStatus) {
  if (!file) throw new Error("No video file provided");

  const key = getApiKey("gemini").trim();
  if (!key) throw new Error("Gemini API key not configured");

  // Small files: inline base64 (no proxy needed)
  if (file.size <= INLINE_LIMIT) {
    if (onStatus) onStatus("Reading video file...");
    const base64 = await fileToBase64(file);
    return { type: "inline", base64, mimeType: file.type || "video/mp4" };
  }

  // Large files: need proxy
  if (!isProxyConfigured()) {
    throw new Error(
      `Video is ${(file.size / 1024 / 1024).toFixed(0)}MB — files over 20MB require the upload proxy. ` +
      `Deploy the Cloudflare Worker (see worker/gemini-proxy.js) and add the URL in Settings.`
    );
  }

  if (file.size > PROXY_LIMIT) {
    throw new Error(
      `Video is ${(file.size / 1024 / 1024).toFixed(0)}MB — the upload proxy supports up to 100MB. ` +
      `Compress your video first: ffmpeg -i input.mov -vf scale=720:-2 -crf 28 output.mp4`
    );
  }

  // Upload via proxy
  const proxyUrl = getProxyUrl().trim().replace(/\/$/, "");
  const mimeType = file.type || "video/mp4";

  // Step 1: Get resumable upload URL via proxy (small JSON request)
  if (onStatus) onStatus("Starting upload...");
  let initRes;
  try {
    initRes = await fetch(`${proxyUrl}/upload/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Gemini-Key": key },
      body: JSON.stringify({ mimeType, numBytes: file.size, displayName: file.name }),
    });
  } catch (e) {
    throw new Error(`Cannot reach upload proxy — check the URL in Settings. (${e.message})`);
  }
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.error || `Proxy upload init failed (${initRes.status})`);
  }
  const { uploadUrl } = await initRes.json();

  // Step 2: Stream file bytes through the proxy to Gemini
  if (onStatus) onStatus(`Uploading ${(file.size / 1024 / 1024).toFixed(0)}MB to Gemini...`);
  let sendRes;
  try {
    sendRes = await fetch(
      `${proxyUrl}/upload/send?uploadUrl=${encodeURIComponent(uploadUrl)}&numBytes=${file.size}`,
      {
        method: "PUT",
        headers: { "X-Gemini-Key": key },
        body: file,
      }
    );
  } catch (e) {
    throw new Error(`Video upload failed. If your file is over 500MB, it exceeds the Cloudflare paid plan limit. (${e.message})`);
  }
  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}));
    throw new Error(err.error || `Proxy upload failed (${sendRes.status})`);
  }
  const uploadData = await sendRes.json();
  const fileUri = uploadData.file?.uri;
  const fileName = uploadData.file?.name;
  if (!fileUri) throw new Error("Upload succeeded but no file URI returned");

  // Step 3: Poll until processed
  if (onStatus) onStatus("Gemini is processing your video...");
  const maxAttempts = 60; // 5 min for large files
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `${proxyUrl}/file/status?name=${encodeURIComponent(fileName)}`,
      { headers: { "X-Gemini-Key": key } }
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.state === "ACTIVE") {
      return { type: "fileApi", fileUri, mimeType };
    }
    if (statusData.state === "FAILED") {
      throw new Error("Gemini video processing failed");
    }
  }
  throw new Error("Video processing timed out (5 min)");
}

// ── Analysis ──

export async function analyzeAdWithVideo(ad, thresholds, videoData) {
  const key = getApiKey("gemini").trim();
  if (!key) throw new Error("Gemini API key not configured");

  const la = ad.metrics?.length ? ad.metrics[ad.metrics.length - 1] : null;
  const tot = ad.metrics?.length ? {
    spend: ad.metrics.reduce((s, x) => s + x.spend, 0),
    conv: ad.metrics.reduce((s, x) => s + x.conv, 0),
    ac: +(ad.metrics.reduce((s, x) => s + x.cpa, 0) / ad.metrics.length).toFixed(2),
  } : null;
  const sn = { positive: 0, negative: 0, neutral: 0 };
  ad.comments.forEach(c => sn[c.sentiment]++);

  const adData = `AD: "${ad.name}" (${ad.type})
BRIEF: ${ad.brief}
METRICS (latest): CPA $${la?.cpa || "N/A"} | Spend $${la?.spend || 0} | Conv ${la?.conv || 0} | CTR ${la?.ctr || 0}% | CPM $${la?.cpm || 0}
Thresholds: Green <=$${thresholds.green}, Yellow <=$${thresholds.yellow}, Red >$${thresholds.yellow}
CPA TREND: ${ad.metrics.map(m => "$" + m.cpa).join(" → ")}
TOTALS: $${tot?.spend || 0} spent, ${tot?.conv || 0} conversions, avg CPA $${tot?.ac || "N/A"}

COMMENTS (${ad.comments.length} total — ${sn.positive} pos, ${sn.negative} neg, ${sn.neutral} neutral):
${ad.comments.map(c => `"${c.text}" [${c.sentiment}]${c.hidden ? " [HIDDEN]" : ""}`).join("\n")}

ITERATION HISTORY: ${ad.iterations > 0 ? ad.iterHistory.map(h => "Iter " + h.iter + ": " + h.reason).join("; ") : "None"}`;

  const textPrompt = getAnalysisPrompt().replace("{AD_DATA}", adData);
  const parts = [];

  if (videoData?.type === "inline" && videoData.base64) {
    parts.push({ inlineData: { mimeType: videoData.mimeType, data: videoData.base64 } });
  } else if (videoData?.type === "fileApi" && videoData.fileUri) {
    parts.push({ fileData: { mimeType: videoData.mimeType, fileUri: videoData.fileUri } });
  }

  parts.push({ text: textPrompt });

  const model = getSelectedModel("gemini");
  const res = await fetch(
    `${GEMINI_API}/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );

  if (res.status === 401 || res.status === 403) throw new Error("Invalid Gemini API key");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // If JSON is truncated, try to salvage what we can
    return { summary: cleaned.slice(0, 500), findings: [], nextIterationPlan: null, suggestedLearnings: [] };
  }
}

export async function analyzeAdTextOnly(ad, thresholds) {
  return analyzeAdWithVideo(ad, thresholds, null);
}
