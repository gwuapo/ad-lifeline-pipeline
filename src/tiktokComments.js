import { getApiKey, getSelectedModel } from "./apiKeys.js";

const TT_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

function getConfig() {
  const accessToken = localStorage.getItem("al_tiktok_access_token") || "";
  const advertiserId = localStorage.getItem("al_tiktok_advertiser_id") || "";
  return { accessToken, advertiserId };
}

export function setTikTokConfig(accessToken, advertiserId) {
  localStorage.setItem("al_tiktok_access_token", accessToken);
  localStorage.setItem("al_tiktok_advertiser_id", advertiserId);
}

export function getTikTokConfig() {
  return getConfig();
}

export function isTikTokConfigured() {
  const { accessToken, advertiserId } = getConfig();
  return !!(accessToken && advertiserId);
}

async function ttFetch(path, params = {}) {
  const { accessToken, advertiserId } = getConfig();
  if (!accessToken) throw new Error("TikTok access token not configured");

  const url = new URL(`${TT_API_BASE}${path}`);
  url.searchParams.set("advertiser_id", advertiserId);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) throw new Error("TikTok access token expired or invalid — re-authenticate in Settings");
  if (res.status === 403) throw new Error("TikTok API: insufficient permissions — ensure comment_manage scope");
  if (res.status === 429) throw new Error("TikTok API rate limited — try again in a minute");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TikTok API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (data.code !== 0) throw new Error(`TikTok API: ${data.message || "Unknown error"} (code ${data.code})`);
  return data.data;
}

// Fetch comments for a specific ad, including hidden ones
export async function fetchAdComments(adId, { page = 1, pageSize = 50, hiddenOnly = false } = {}) {
  const params = {
    ad_id: adId,
    page: page,
    page_size: Math.min(pageSize, 100),
  };
  if (hiddenOnly) params.hidden_status = "HIDDEN";

  const data = await ttFetch("/ad_comment/list/", params);
  return {
    comments: (data.list || []).map(normalizeComment),
    totalCount: data.page_info?.total_count || 0,
    page: data.page_info?.page || page,
    totalPages: data.page_info?.total_page || 1,
  };
}

// Fetch ALL comments (paginated) including hidden
export async function fetchAllAdComments(adId, maxComments = 500) {
  const allComments = [];
  let page = 1;

  // Fetch visible comments
  while (allComments.length < maxComments) {
    const result = await fetchAdComments(adId, { page, pageSize: 100 });
    allComments.push(...result.comments);
    if (page >= result.totalPages) break;
    page++;
  }

  // Fetch hidden comments separately
  let hiddenPage = 1;
  while (allComments.length < maxComments) {
    const result = await fetchAdComments(adId, { page: hiddenPage, pageSize: 100, hiddenOnly: true });
    // Mark these as hidden and deduplicate
    const existingIds = new Set(allComments.map(c => c.commentId));
    for (const c of result.comments) {
      if (!existingIds.has(c.commentId)) {
        allComments.push({ ...c, hidden: true });
      }
    }
    if (hiddenPage >= result.totalPages) break;
    hiddenPage++;
  }

  return allComments.slice(0, maxComments);
}

// Bulk export comments (for large volumes)
export async function createCommentExport(adIds) {
  const { accessToken, advertiserId } = getConfig();
  if (!accessToken) throw new Error("TikTok access token not configured");

  const res = await fetch(`${TT_API_BASE}/ad_comment/export/create/`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      ad_ids: Array.isArray(adIds) ? adIds : [adIds],
    }),
  });

  if (!res.ok) throw new Error(`Export create failed (${res.status})`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Export error: ${data.message}`);
  return data.data.task_id;
}

export async function checkExportStatus(taskId) {
  const { accessToken, advertiserId } = getConfig();
  const res = await fetch(`${TT_API_BASE}/ad_comment/export/status/?advertiser_id=${advertiserId}&task_id=${taskId}`, {
    headers: { "Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Export status check failed (${res.status})`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Export status error: ${data.message}`);
  return data.data; // { status: "PROCESSING"|"COMPLETED"|"FAILED", download_url: "..." }
}

export async function downloadExportedComments(taskId) {
  const status = await checkExportStatus(taskId);
  if (status.status !== "COMPLETED") return { ready: false, status: status.status };

  const { accessToken, advertiserId } = getConfig();
  const res = await fetch(`${TT_API_BASE}/ad_comment/export/download/?advertiser_id=${advertiserId}&task_id=${taskId}`, {
    headers: { "Access-Token": accessToken },
  });
  if (!res.ok) throw new Error(`Export download failed (${res.status})`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Export download error: ${data.message}`);

  return {
    ready: true,
    comments: (data.data?.list || []).map(normalizeComment),
  };
}

// Get replies to a specific comment
export async function fetchCommentReplies(commentId) {
  const data = await ttFetch("/ad_comment/related/", { comment_id: commentId });
  return (data.list || []).map(normalizeComment);
}

function normalizeComment(raw) {
  return {
    commentId: raw.comment_id || raw.id || "",
    text: (raw.text || raw.content || "").trim(),
    username: raw.user_name || raw.username || "",
    likes: raw.like_count || raw.likes || 0,
    replies: raw.reply_count || 0,
    hidden: raw.hidden_status === "HIDDEN" || raw.is_hidden || false,
    timestamp: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : raw.create_time_iso || "",
    adId: raw.ad_id || "",
    sentiment: "neutral", // will be classified by AI
  };
}

// AI sentiment classification (reuses existing Gemini setup)
export async function classifyCommentSentiment(comments) {
  const geminiKey = getApiKey("gemini").trim();
  if (!geminiKey || comments.length === 0) {
    return comments.map(c => ({ ...c, sentiment: keywordSentiment(c.text) }));
  }

  const batchSize = 50;
  const results = [];

  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);
    const numbered = batch.map((c, j) => `${j}: ${c.text}${c.hidden ? " [HIDDEN BY TIKTOK]" : ""}`).join("\n");

    try {
      const model = getSelectedModel("gemini");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Classify each comment's sentiment as "positive", "negative", or "neutral". These are TikTok ad comments. Pay special attention to comments marked [HIDDEN BY TIKTOK] — these were auto-hidden and are likely negative. Consider sarcasm, slang, and context.

Respond with ONLY a JSON array of sentiment strings in the same order. Example: ["positive","negative","neutral"]

Comments:
${numbered}` }] }],
            generationConfig: { maxOutputTokens: 500 },
          }),
        }
      );

      if (!res.ok) throw new Error("Gemini failed");
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      const sentiments = JSON.parse(text.replace(/```json|```/g, "").trim());

      for (let j = 0; j < batch.length; j++) {
        const s = (sentiments[j] || "neutral").toLowerCase();
        results.push({ ...batch[j], sentiment: ["positive", "negative", "neutral"].includes(s) ? s : "neutral" });
      }
    } catch {
      results.push(...batch.map(c => ({ ...c, sentiment: keywordSentiment(c.text) })));
    }
  }

  return results;
}

function keywordSentiment(text) {
  const t = text.toLowerCase();
  const NEG = ["scam", "fake", "waste", "trash", "don't buy", "doesn't work", "terrible", "awful", "horrible", "worst", "rip off", "ripoff", "fraud", "lie", "liar", "garbage", "refund", "returning", "returned", "junk", "broke", "broken"];
  const POS = ["works", "love", "amazing", "great", "ordered", "bought", "recommend", "best", "results", "helped", "thank", "perfect", "incredible", "changed my life", "worth it"];
  if (NEG.some(w => t.includes(w))) return "negative";
  if (POS.some(w => t.includes(w))) return "positive";
  return "neutral";
}

// Auto-scrape scheduler for a set of live ads
let _commentSyncInterval = null;
const COMMENT_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startCommentAutoSync(syncFn) {
  stopCommentAutoSync();
  syncFn();
  _commentSyncInterval = setInterval(syncFn, COMMENT_SYNC_INTERVAL_MS);
}

export function stopCommentAutoSync() {
  if (_commentSyncInterval) {
    clearInterval(_commentSyncInterval);
    _commentSyncInterval = null;
  }
}

export function isCommentAutoSyncRunning() {
  return _commentSyncInterval !== null;
}
