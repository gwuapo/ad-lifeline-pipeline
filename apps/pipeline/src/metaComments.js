import { getApiKey, getSelectedModel } from "./apiKeys.js";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function getConfig() {
  const accessToken = localStorage.getItem("al_meta_access_token") || "";
  const adAccountId = localStorage.getItem("al_meta_ad_account_id") || "";
  return { accessToken, adAccountId };
}

export function setMetaConfig(accessToken, adAccountId) {
  localStorage.setItem("al_meta_access_token", accessToken);
  localStorage.setItem("al_meta_ad_account_id", adAccountId);
}

export function getMetaConfig() {
  return getConfig();
}

export function isMetaConfigured() {
  const { accessToken, adAccountId } = getConfig();
  return !!(accessToken && adAccountId);
}

async function graphFetch(path, params = {}) {
  const { accessToken } = getConfig();
  if (!accessToken) throw new Error("Meta access token not configured");

  const url = new URL(`${GRAPH_API}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());

  if (res.status === 401 || res.status === 190) throw new Error("Meta access token expired -- regenerate in Settings");
  if (res.status === 403) throw new Error("Meta API: insufficient permissions -- ensure ads_read and pages_read_engagement scopes");
  if (res.status === 429) throw new Error("Meta API rate limited -- try again in a minute");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta API error: ${msg}`);
  }

  return res.json();
}

// Get the effective_object_story_id (post ID) for an ad creative
async function getAdPostId(adId) {
  const data = await graphFetch(`/${adId}`, {
    fields: "creative{effective_object_story_id}",
  });
  return data.creative?.effective_object_story_id || null;
}

// Fetch comments on a post (which is what Meta ads are tied to)
async function fetchPostComments(postId, { limit = 100, after = null, filter = "stream" } = {}) {
  const params = {
    fields: "message,from{name},created_time,like_count,is_hidden,comment_count",
    limit: Math.min(limit, 100),
    filter, // "stream" includes hidden/filtered comments, "toplevel" does not
  };
  if (after) params.after = after;

  const data = await graphFetch(`/${postId}/comments`, params);
  return {
    comments: (data.data || []).map(normalizeComment),
    paging: data.paging || null,
  };
}

// Fetch ALL comments for an ad (paginated)
export async function fetchAllMetaAdComments(adId, maxComments = 500) {
  // Step 1: Get the post ID from the ad creative
  const postId = await getAdPostId(adId);
  if (!postId) throw new Error("Could not find post for this Meta ad -- the ad may not have a linked post");

  const allComments = [];
  let after = null;

  while (allComments.length < maxComments) {
    const result = await fetchPostComments(postId, { limit: 100, after, filter: "stream" });
    allComments.push(...result.comments);

    if (!result.paging?.cursors?.after || result.comments.length === 0) break;
    after = result.paging.cursors.after;
  }

  return allComments.slice(0, maxComments);
}

// Fetch comments for multiple ads at once
export async function fetchMetaCommentsForAds(adIds, maxPerAd = 200) {
  const results = {};
  for (const adId of adIds) {
    try {
      results[adId] = await fetchAllMetaAdComments(adId, maxPerAd);
    } catch (e) {
      console.error(`Meta comments for ad ${adId}:`, e.message);
      results[adId] = [];
    }
  }
  return results;
}

function normalizeComment(raw) {
  return {
    commentId: raw.id || "",
    text: (raw.message || "").trim(),
    username: raw.from?.name || "",
    likes: raw.like_count || 0,
    replies: raw.comment_count || 0,
    hidden: raw.is_hidden || false,
    timestamp: raw.created_time || "",
    platform: "meta",
    sentiment: "neutral",
  };
}

// AI sentiment classification (shared with TikTok module pattern)
export async function classifyMetaCommentSentiment(comments) {
  const geminiKey = getApiKey("gemini").trim();
  if (!geminiKey || comments.length === 0) {
    return comments.map(c => ({ ...c, sentiment: keywordSentiment(c.text) }));
  }

  const batchSize = 50;
  const results = [];

  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);
    const numbered = batch.map((c, j) => `${j}: ${c.text}${c.hidden ? " [HIDDEN BY META]" : ""}`).join("\n");

    try {
      const model = getSelectedModel("gemini");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Classify each comment's sentiment as "positive", "negative", or "neutral". These are Facebook/Instagram ad comments. Pay attention to comments marked [HIDDEN BY META] — these were auto-hidden and are likely negative or spam. Consider sarcasm, slang, emojis, and context.

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
  const NEG = ["scam", "fake", "waste", "trash", "don't buy", "doesn't work", "terrible", "awful", "horrible", "worst", "rip off", "ripoff", "fraud", "lie", "liar", "garbage", "refund", "returning", "returned", "junk", "broke", "broken", "spam", "pyramid"];
  const POS = ["works", "love", "amazing", "great", "ordered", "bought", "recommend", "best", "results", "helped", "thank", "perfect", "incredible", "changed my life", "worth it", "obsessed"];
  if (NEG.some(w => t.includes(w))) return "negative";
  if (POS.some(w => t.includes(w))) return "positive";
  return "neutral";
}
