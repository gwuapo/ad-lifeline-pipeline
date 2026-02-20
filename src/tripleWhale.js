const TW_API = "https://api.triplewhale.com/api/v2";

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
  const res = await fetch(`${TW_API}/users/api-keys/me`, {
    headers: { accept: "application/json", "x-api-key": apiKey },
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

  const res = await fetch(`${TW_API}/orcabase/api/sql`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": apiKey,
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
    byDate[d].purchases += Number(row.pixel_purchases) || 0;
    byDate[d].revenue += Number(row.pixel_revenue) || 0;
    byDate[d].clicks += Number(row.clicks) || 0;
    byDate[d].impressions += Number(row.impressions) || 0;
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({
      date,
      cpa: m.purchases > 0 ? +(m.spend / m.purchases).toFixed(2) : 0,
      spend: +m.spend.toFixed(2),
      conv: Math.round(m.purchases),
      ctr: m.impressions > 0 ? +((m.clicks / m.impressions) * 100).toFixed(1) : 0,
      cpm: m.impressions > 0 ? +((m.spend / m.impressions) * 1000).toFixed(2) : 0,
      roas: m.spend > 0 ? +(m.revenue / m.spend).toFixed(2) : 0,
      revenue: +m.revenue.toFixed(2),
    }));
}

export function matchMetricsToAds(twRows, ads) {
  const matches = [];

  for (const ad of ads) {
    if (ad.stage === "killed") continue;
    const chIds = ad.channelIds || {};
    const channelResults = {};

    for (const [localCh, twCh] of Object.entries(TW_CHANNEL_MAP)) {
      const adSetId = (chIds[localCh] || "").trim();
      if (!adSetId) continue;

      const matched = twRows.filter(
        (row) => String(row.adset_id) === adSetId && row.channel === twCh
      );

      if (matched.length > 0) {
        channelResults[localCh] = { metrics: buildMetricsFromRows(matched), matchType: "id" };
      } else {
        // ID was provided but no data found — mark as empty so UI shows N/A
        channelResults[localCh] = { metrics: [], matchType: "id_no_data" };
      }
    }

    // Fallback: name match for channels without an ID
    const hasAnyId = Object.values(chIds).some((v) => v?.trim());
    if (!hasAnyId) {
      const adNameLower = ad.name.toLowerCase();
      const matched = twRows.filter((row) => {
        const twName = (row.adset_name || "").toLowerCase();
        return twName && adNameLower && (twName.includes(adNameLower) || adNameLower.includes(twName));
      });

      if (matched.length > 0) {
        const byChannel = {};
        for (const row of matched) {
          const local = twChannelToLocal(row.channel);
          if (!local) continue;
          if (!byChannel[local]) byChannel[local] = [];
          byChannel[local].push(row);
        }
        for (const [ch, rows] of Object.entries(byChannel)) {
          channelResults[ch] = { metrics: buildMetricsFromRows(rows), matchType: "name" };
        }
      }
    }

    if (Object.keys(channelResults).length > 0) {
      matches.push({ adId: ad.id, adName: ad.name, channels: channelResults });
    }
  }

  return matches;
}
