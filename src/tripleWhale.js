const TW_API_DIRECT = "https://api.triplewhale.com/api/v2";
const TW_PROXY = "/api/tw-proxy";

function twFetch(path, options = {}) {
  const { apiKey, ...fetchOpts } = options;
  // Use the Vercel proxy to avoid CORS
  const url = `${TW_PROXY}?path=${encodeURIComponent(path)}`;
  return fetch(url, {
    ...fetchOpts,
    headers: {
      ...fetchOpts.headers,
      "x-api-key": apiKey,
    },
  });
}

const TW_CHANNEL_MAP = {
  meta: "facebook-ads",
  tiktok: "tiktok-ads",
  snapchat: "snapchat-ads",
  applovin: "applovin",
};

function getConfig() {
  const apiKey = localStorage.getItem("tw_api_key") || import.meta.env.VITE_TW_API_KEY || "";
  const shopDomain = localStorage.getItem("tw_shop_domain") || import.meta.env.VITE_TW_SHOP_DOMAIN || "";
  return { apiKey, shopDomain };
}

export function isTripleWhaleConfigured() {
  const { apiKey, shopDomain } = getConfig();
  return !!(apiKey && shopDomain);
}

export function setTripleWhaleConfig(apiKey, shopDomain) {
  localStorage.setItem("tw_api_key", apiKey);
  localStorage.setItem("tw_shop_domain", shopDomain);
}

export function getTripleWhaleConfig() {
  return getConfig();
}

export async function validateApiKey() {
  const { apiKey } = getConfig();
  if (!apiKey) throw new Error("Triple Whale API key not configured");
  const res = await twFetch("/users/api-keys/me", {
    apiKey,
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Validation failed (${res.status})`);
  return res.json();
}

export async function fetchAdSetMetrics(startDate, endDate) {
  const { apiKey, shopDomain } = getConfig();
  if (!apiKey || !shopDomain) throw new Error("Triple Whale not configured — add API key and shop domain in Settings");

  const query = `
    SELECT
      event_date,
      adset_id,
      adset_name,
      channel,
      SUM(spend) as spend,
      SUM(orders_quantity) as pixel_purchases,
      SUM(order_revenue) as pixel_revenue,
      SUM(clicks) as clicks,
      SUM(impressions) as impressions
    FROM pixel_joined_tvf
    WHERE event_date BETWEEN @startDate AND @endDate
    GROUP BY event_date, adset_id, adset_name, channel
    ORDER BY event_date DESC
  `;

  const res = await twFetch("/orcabase/api/sql", {
    apiKey,
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      shopId: shopDomain,
      query,
      period: { startDate, endDate },
    }),
  });

  if (res.status === 429) throw new Error("Rate limited — try again in a minute");
  if (res.status === 403) throw new Error("Invalid API key or insufficient permissions");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Triple Whale API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.rows || data.data || [];
}

function twChannelToLocal(twChannel) {
  for (const [local, tw] of Object.entries(TW_CHANNEL_MAP)) {
    if (twChannel === tw) return local;
  }
  return null;
}

function buildMetricsFromRows(rows) {
  const byDate = {};
  for (const row of rows) {
    const d = row.event_date;
    if (!byDate[d]) byDate[d] = { spend: 0, purchases: 0, revenue: 0, clicks: 0, impressions: 0 };
    byDate[d].spend += Number(row.spend) || 0;
    // TW pixel purchases can be fractional due to attribution model -- keep raw value
    byDate[d].purchases += Number(row.pixel_purchases) || 0;
    byDate[d].revenue += Number(row.pixel_revenue) || 0;
    byDate[d].clicks += Number(row.clicks) || 0;
    byDate[d].impressions += Number(row.impressions) || 0;
  }

  // Sort dates and compute running totals for accurate rounding
  const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  let runningPurchases = 0;
  let prevRounded = 0;

  return sorted.map(([date, m]) => {
    // Accumulate fractional purchases and round the running total
    // This ensures e.g. 0.8 + 0.8 + 0.8 + 0.6 = 3.0 -> shows 3, not 0+1+1+1=3
    runningPurchases += m.purchases;
    const roundedTotal = Math.round(runningPurchases);
    const dayConv = roundedTotal - prevRounded;
    prevRounded = roundedTotal;

    return {
      date,
      cpa: m.purchases > 0 ? +(m.spend / m.purchases).toFixed(2) : 0,
      spend: +m.spend.toFixed(2),
      conv: dayConv,
      rawConv: +m.purchases.toFixed(2),
      ctr: m.impressions > 0 ? +((m.clicks / m.impressions) * 100).toFixed(1) : 0,
      cpm: m.impressions > 0 ? +((m.spend / m.impressions) * 1000).toFixed(2) : 0,
      roas: m.spend > 0 ? +(m.revenue / m.spend).toFixed(2) : 0,
      revenue: +m.revenue.toFixed(2),
    };
  });
}

// Normalize a name for fuzzy matching: lowercase, strip common suffixes/prefixes, collapse whitespace
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Score how well two names match (0 = no match, higher = better)
function nameMatchScore(adName, twName) {
  const a = normalizeName(adName);
  const t = normalizeName(twName);
  if (!a || !t) return 0;
  if (a === t) return 100; // exact
  if (t.includes(a) || a.includes(t)) return 80; // substring
  // Token overlap: count shared words
  const aTokens = a.split(" ");
  const tTokens = t.split(" ");
  const shared = aTokens.filter(w => w.length > 2 && tTokens.includes(w)).length;
  const maxTokens = Math.max(aTokens.length, tTokens.length);
  if (shared === 0) return 0;
  return Math.round((shared / maxTokens) * 60);
}

export function matchMetricsToAds(twRows, ads) {
  const matches = [];

  for (const ad of ads) {
    if (ad.stage === "killed") continue;
    const chIds = ad.channelIds || {};
    const channelResults = {};

    // Phase 1: Match by explicit adset ID if provided
    for (const [localCh, twCh] of Object.entries(TW_CHANNEL_MAP)) {
      const adSetId = (chIds[localCh] || "").trim();
      if (!adSetId) continue;

      const matched = twRows.filter(
        (row) => String(row.adset_id) === adSetId && row.channel === twCh
      );

      if (matched.length > 0) {
        channelResults[localCh] = { metrics: buildMetricsFromRows(matched), matchType: "id" };
      } else {
        channelResults[localCh] = { metrics: [], matchType: "id_no_data" };
      }
    }

    // Phase 2: Auto-match by name for channels without an explicit ID
    for (const [localCh, twCh] of Object.entries(TW_CHANNEL_MAP)) {
      if (channelResults[localCh]) continue; // already matched by ID

      const channelRows = twRows.filter((row) => row.channel === twCh);
      if (channelRows.length === 0) continue;

      // Find the best name match among all adset_names in this channel
      let bestScore = 0;
      let bestAdsetId = null;
      const seenAdsets = new Map(); // adset_id -> adset_name
      for (const row of channelRows) {
        if (seenAdsets.has(row.adset_id)) continue;
        seenAdsets.set(row.adset_id, row.adset_name);
      }

      for (const [asId, asName] of seenAdsets) {
        const score = nameMatchScore(ad.name, asName);
        if (score > bestScore) { bestScore = score; bestAdsetId = asId; }
      }

      // Require a minimum match score to avoid false positives
      if (bestScore >= 50 && bestAdsetId) {
        const matched = channelRows.filter((row) => String(row.adset_id) === bestAdsetId);
        if (matched.length > 0) {
          const matchedName = seenAdsets.get(bestAdsetId);
          channelResults[localCh] = {
            metrics: buildMetricsFromRows(matched),
            matchType: "auto",
            matchedAdsetId: bestAdsetId,
            matchedAdsetName: matchedName,
            matchScore: bestScore,
          };
        }
      }
    }

    if (Object.keys(channelResults).length > 0) {
      matches.push({ adId: ad.id, adName: ad.name, channels: channelResults });
    }
  }

  return matches;
}

// Auto-sync interval management
let _autoSyncInterval = null;
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function startAutoSync(syncFn) {
  stopAutoSync();
  syncFn(); // run immediately on start
  _autoSyncInterval = setInterval(syncFn, AUTO_SYNC_INTERVAL_MS);
}

export function stopAutoSync() {
  if (_autoSyncInterval) {
    clearInterval(_autoSyncInterval);
    _autoSyncInterval = null;
  }
}

export function isAutoSyncRunning() {
  return _autoSyncInterval !== null;
}

export function getAutoSyncIntervalMinutes() {
  return AUTO_SYNC_INTERVAL_MS / 60000;
}
