// Vercel Serverless Function: Triple Whale Sync for Split Tests
// Manual trigger: POST /api/tw-sync?testId=xxx
// Cron trigger: GET /api/tw-sync (syncs all active tests for all workspaces)

const TW_API = "https://api.triplewhale.com/api/v2";

async function twQuery(apiKey, shopDomain, adSetId, channel, startDate) {
  const endDate = new Date(Date.now() - 86400000).toISOString().split("T")[0]; // yesterday
  const query = `
    SELECT event_date, adset_id, SUM(spend) as spend, SUM(orders_quantity) as orders, SUM(order_revenue) as revenue
    FROM pixel_joined_tvf
    WHERE event_date BETWEEN @startDate AND @endDate AND adset_id = '${adSetId}' AND channel = '${channel}'
    GROUP BY event_date, adset_id ORDER BY event_date ASC
  `;

  const res = await fetch(`${TW_API}/orcabase/api/sql`, {
    method: "POST",
    headers: { "accept": "application/json", "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ shopId: shopDomain, query, period: { startDate, endDate } }),
  });

  if (!res.ok) throw new Error(`TW API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.rows || data.data || [];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  // For now, return instructions -- full implementation requires Supabase service key
  // The actual sync happens client-side through the TW proxy
  return res.status(200).json({
    message: "Use client-side sync via /api/tw-proxy. This endpoint is reserved for future cron-based sync.",
  });
}
