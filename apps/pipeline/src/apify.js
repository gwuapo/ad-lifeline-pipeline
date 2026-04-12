import { getApiKey, getSelectedModel } from "./apiKeys.js";

const ACTOR_ID = "BDec00yAmCm1QbMEI"; // clockworks/tiktok-comments-scraper

export function isApifyConfigured() {
  return !!getApiKey("apify").trim();
}

export async function scrapeTikTokComments(tiktokUrl, maxComments = 100) {
  const token = getApiKey("apify").trim();
  if (!token) throw new Error("Apify API key not configured — add it in Settings");
  if (!tiktokUrl?.trim()) throw new Error("TikTok video URL is required");

  // Start the actor run
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postURLs: [tiktokUrl.trim()],
        commentsPerPost: maxComments,
        maxRepliesPerComment: 0,
      }),
    }
  );

  if (startRes.status === 401) throw new Error("Invalid Apify API key");
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    throw new Error(`Apify error (${startRes.status}): ${body}`);
  }

  const run = await startRes.json();
  const runId = run.data?.id;
  if (!runId) throw new Error("Failed to start Apify run");

  // Poll for completion (max ~2 min)
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === "SUCCEEDED") {
      const datasetId = statusData.data?.defaultDatasetId;
      if (!datasetId) throw new Error("Run succeeded but no dataset found");

      const dataRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`
      );
      if (!dataRes.ok) throw new Error("Failed to fetch results from Apify");

      const items = await dataRes.json();
      return normalizeComments(items);
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
  }

  throw new Error("Apify run timed out after 2 minutes");
}

async function normalizeComments(items) {
  if (!Array.isArray(items)) return [];
  const comments = items.map(item => ({
    text: (item.text || item.comment || "").trim(),
    sentiment: "neutral",
    hidden: false,
    likes: item.diggCount || item.likes || 0,
    username: item.uniqueId || item.user || "",
    timestamp: item.createTimeISO || item.createTime || "",
  })).filter(c => c.text.length > 0);

  // Try AI classification with Gemini, fall back to keyword matching
  const geminiKey = getApiKey("gemini").trim();
  if (geminiKey && comments.length > 0) {
    try {
      return await classifyWithGemini(comments, geminiKey);
    } catch {
      // Fall back silently to keywords
    }
  }
  return comments.map(c => ({ ...c, sentiment: keywordSentiment(c.text) }));
}

async function classifyWithGemini(comments, key) {
  // Batch comments in groups of 50 to stay within token limits
  const batchSize = 50;
  const results = [];

  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);
    const numbered = batch.map((c, j) => `${j}: ${c.text}`).join("\n");

    const model = getSelectedModel("gemini");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Classify each comment's sentiment as "positive", "negative", or "neutral". These are TikTok ad comments. Consider sarcasm, slang, and context.

Respond with ONLY a JSON array of sentiment strings in the same order. Example: ["positive","negative","neutral"]

Comments:
${numbered}` }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    if (!res.ok) throw new Error("Gemini classification failed");
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const sentiments = JSON.parse(text.replace(/```json|```/g, "").trim());

    for (let j = 0; j < batch.length; j++) {
      const s = (sentiments[j] || "neutral").toLowerCase();
      results.push({ ...batch[j], sentiment: ["positive", "negative", "neutral"].includes(s) ? s : "neutral" });
    }
  }

  return results;
}

function keywordSentiment(text) {
  const t = text.toLowerCase();
  const NEG = ["scam", "fake", "waste", "trash", "don't buy", "doesn't work", "terrible", "awful", "horrible", "worst", "rip off", "ripoff", "fraud", "lie", "liar", "garbage"];
  const POS = ["works", "love", "amazing", "great", "ordered", "bought", "recommend", "best", "results", "helped", "thank"];
  if (NEG.some(w => t.includes(w))) return "negative";
  if (POS.some(w => t.includes(w))) return "positive";
  return "neutral";
}
