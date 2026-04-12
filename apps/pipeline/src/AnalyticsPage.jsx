import { useState, useMemo } from "react";
import DateRangePicker from "./DateRangePicker.jsx";

const CUR = "SAR";
const USD_TO_SAR = 3.75;

const CREATIVE_DIMENSIONS = [
  { key: "hook_type", label: "Hook Type" },
  { key: "vsl_body_type", label: "VSL Body" },
  { key: "ump", label: "UMP" },
  { key: "ums", label: "UMS" },
  { key: "offer_name", label: "Offer" },
  { key: "landing_page_name", label: "Landing Page" },
  { key: "avatar", label: "Avatar" },
  { key: "angle", label: "Ad Angle" },
  { key: "awareness_level", label: "Awareness Level" },
  { key: "ad_format", label: "Ad Format" },
  { key: "variable_tested", label: "Variable Tested" },
];

function adSpendOf(ad, dateFrom, dateTo) {
  let sp = 0;
  (ad.metrics || []).forEach(m => {
    if (dateFrom && m.date < dateFrom) return;
    if (dateTo && m.date > dateTo) return;
    sp += m.spend || 0;
  });
  Object.values(ad.channelMetrics || {}).forEach(metrics => {
    (metrics || []).forEach(m => {
      if (dateFrom && m.date < dateFrom) return;
      if (dateTo && m.date > dateTo) return;
      sp += m.spend || 0;
    });
  });
  return sp;
}

function adRevenueOf(ad, dateFrom, dateTo) {
  let rev = 0;
  (ad.metrics || []).forEach(m => {
    if (dateFrom && m.date < dateFrom) return;
    if (dateTo && m.date > dateTo) return;
    rev += m.revenue || (m.roas && m.spend ? m.roas * m.spend : 0);
  });
  Object.values(ad.channelMetrics || {}).forEach(metrics => {
    (metrics || []).forEach(m => {
      if (dateFrom && m.date < dateFrom) return;
      if (dateTo && m.date > dateTo) return;
      rev += m.revenue || (m.roas && m.spend ? m.roas * m.spend : 0);
    });
  });
  return rev;
}

function adConversions(ad, dateFrom, dateTo) {
  let conv = 0;
  (ad.metrics || []).forEach(m => {
    if (dateFrom && m.date < dateFrom) return;
    if (dateTo && m.date > dateTo) return;
    conv += m.conv || 0;
  });
  Object.values(ad.channelMetrics || {}).forEach(metrics => {
    (metrics || []).forEach(m => {
      if (dateFrom && m.date < dateFrom) return;
      if (dateTo && m.date > dateTo) return;
      conv += m.conv || m.purchases || 0;
    });
  });
  return conv;
}

export default function AnalyticsPage({ ads, th }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState("overview");
  const [dimension, setDimension] = useState("hook_type");
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [searchTerm, setSearchTerm] = useState("");

  const grossMargin = (th?.grossMarginPct ?? 70) / 100;

  // Filter to ads with spend
  const liveAds = useMemo(() => {
    return ads.filter(a => a.stage !== "killed").filter(a => {
      const spend = adSpendOf(a, dateFrom, dateTo);
      return spend > 0;
    });
  }, [ads, dateFrom, dateTo]);

  // All ads with any metrics or in live stage
  const allActiveAds = useMemo(() => {
    return ads.filter(a => a.stage !== "killed");
  }, [ads]);

  // Totals
  const totals = useMemo(() => {
    let spend = 0, revenue = 0, conv = 0, prodCostUSD = 0;
    liveAds.forEach(a => {
      spend += adSpendOf(a, dateFrom, dateTo);
      revenue += adRevenueOf(a, dateFrom, dateTo);
      conv += adConversions(a, dateFrom, dateTo);
      prodCostUSD += parseFloat(a.production_cost) || 0;
    });
    const prodCost = prodCostUSD * USD_TO_SAR;
    const grossProfit = revenue * grossMargin;
    const netProfit = grossProfit - spend - prodCost;
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conv > 0 ? spend / conv : 0;
    return { spend, revenue, conv, roas, cpa, netProfit, prodCost, grossProfit };
  }, [liveAds, dateFrom, dateTo, grossMargin]);

  // Per-ad table data
  const adRows = useMemo(() => {
    return allActiveAds.map(a => {
      const spend = adSpendOf(a, dateFrom, dateTo);
      const revenue = adRevenueOf(a, dateFrom, dateTo);
      const conv = adConversions(a, dateFrom, dateTo);
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conv > 0 ? spend / conv : 0;
      const ctr = 0; // would come from API
      const cpm = 0;
      const s = a.strategy || {};
      return {
        id: a.id, name: a.name, stage: a.stage, editor: a.editor,
        spend, revenue, conv, roas, cpa, ctr, cpm,
        hook_type: s.hook_type || "", hook_rate: s.hook_rate ?? null, hold_rate: s.hold_rate ?? null,
        tiktok_2s: s.tiktok_2s_rate ?? null, tiktok_100: s.tiktok_100_rate ?? null,
        vsl_body_type: s.vsl_body_type || "", ump: s.ump || "", ums: s.ums || "",
        offer_name: s.offer_name || "", landing_page_name: s.landing_page_name || "",
        avatar: s.avatar || "", angle: s.angle || "", ad_format: s.ad_format || "",
        awareness_level: s.awareness_level || "", variable_tested: s.variable_tested || "",
      };
    }).filter(r => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return r.name.toLowerCase().includes(term) || r.editor?.toLowerCase().includes(term) || r.hook_type.toLowerCase().includes(term) || r.offer_name.toLowerCase().includes(term);
    }).sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [allActiveAds, dateFrom, dateTo, sortCol, sortDir, searchTerm]);

  // Creative dimension aggregation
  const dimensionData = useMemo(() => {
    const groups = {};
    allActiveAds.forEach(a => {
      const s = a.strategy || {};
      const val = s[dimension];
      if (!val) return;
      if (!groups[val]) groups[val] = { name: val, ads: 0, spend: 0, revenue: 0, conv: 0, hookRates: [], holdRates: [] };
      const g = groups[val];
      g.ads++;
      g.spend += adSpendOf(a, dateFrom, dateTo);
      g.revenue += adRevenueOf(a, dateFrom, dateTo);
      g.conv += adConversions(a, dateFrom, dateTo);
      if (s.hook_rate != null) g.hookRates.push(s.hook_rate);
      if (s.hold_rate != null) g.holdRates.push(s.hold_rate);
    });
    return Object.values(groups).map(g => ({
      ...g,
      roas: g.spend > 0 ? g.revenue / g.spend : 0,
      cpa: g.conv > 0 ? g.spend / g.conv : 0,
      avgHook: g.hookRates.length > 0 ? g.hookRates.reduce((s, v) => s + v, 0) / g.hookRates.length : null,
      avgHold: g.holdRates.length > 0 ? g.holdRates.reduce((s, v) => s + v, 0) / g.holdRates.length : null,
    })).sort((a, b) => b.roas - a.roas);
  }, [allActiveAds, dimension, dateFrom, dateTo]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const fmtN = (n, d = 0) => n?.toLocaleString("en-US", { maximumFractionDigits: d }) ?? "—";
  const fmtC = (n) => `${CUR} ${fmtN(n, 0)}`;

  const views = [
    ["overview", "Overview"],
    ["ads", "All Ads"],
    ["creative", "By Creative Element"],
  ];

  return (
    <div className="animate-fade" style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Analytics</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>Unified performance data across all channels.</p>
        </div>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {views.map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} className={`btn btn-sm ${view === id ? "btn-primary" : "btn-ghost"}`}>{label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {view === "overview" && (
        <div>
          {/* Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
            <MetricCard label="Total Spend" value={fmtC(totals.spend)} color="var(--text-primary)" />
            <MetricCard label="Revenue" value={fmtC(totals.revenue)} color="var(--green)" />
            <MetricCard label="ROAS" value={`${totals.roas.toFixed(2)}x`} color={totals.roas >= 2 ? "var(--green)" : totals.roas >= 1 ? "var(--yellow)" : "var(--red)"} />
            <MetricCard label="CPA" value={fmtC(totals.cpa)} color="var(--text-primary)" />
            <MetricCard label="Conversions" value={fmtN(totals.conv)} color="var(--accent-light)" />
            <MetricCard label="Net Profit" value={fmtC(totals.netProfit)} color={totals.netProfit >= 0 ? "var(--green)" : "var(--red)"} />
            <MetricCard label="Active Ads" value={liveAds.length} color="var(--accent-light)" />
            <MetricCard label="Prod Cost" value={`$${fmtN(totals.prodCost / USD_TO_SAR, 0)}`} color="var(--text-muted)" />
          </div>

          {/* Top performers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Top Ads by ROAS</div>
              {adRows.filter(r => r.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 8).map((r, i) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: i < 3 ? "var(--green)" : "var(--text-muted)", width: 16 }}>{i + 1}</span>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: 700, fontFamily: "var(--fm)" }}>{r.roas.toFixed(2)}x</span>
                    <span style={{ color: "var(--text-muted)", fontFamily: "var(--fm)", fontSize: 10 }}>{fmtC(r.spend)}</span>
                  </div>
                </div>
              ))}
              {adRows.filter(r => r.spend > 0).length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No ads with spend in this period.</div>}
            </div>

            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Top Ads by Revenue</div>
              {adRows.filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((r, i) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: i < 3 ? "var(--green)" : "var(--text-muted)", width: 16 }}>{i + 1}</span>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{r.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ color: "var(--green)", fontWeight: 700, fontFamily: "var(--fm)" }}>{fmtC(r.revenue)}</span>
                    <span style={{ color: "var(--text-muted)", fontFamily: "var(--fm)", fontSize: 10 }}>{r.roas.toFixed(2)}x</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick dimension insights */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Creative Performance Snapshot</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Best-performing creative element in each category (by ROAS)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {CREATIVE_DIMENSIONS.slice(0, 6).map(dim => {
                const groups = {};
                allActiveAds.forEach(a => {
                  const val = (a.strategy || {})[dim.key];
                  if (!val) return;
                  if (!groups[val]) groups[val] = { spend: 0, revenue: 0 };
                  groups[val].spend += adSpendOf(a, dateFrom, dateTo);
                  groups[val].revenue += adRevenueOf(a, dateFrom, dateTo);
                });
                const best = Object.entries(groups).filter(([, g]) => g.spend > 0).sort(([, a], [, b]) => (b.revenue / b.spend) - (a.revenue / a.spend))[0];
                if (!best) return (
                  <div key={dim.key} className="card-flat" style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{dim.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>No data</div>
                  </div>
                );
                const roas = best[1].spend > 0 ? best[1].revenue / best[1].spend : 0;
                return (
                  <div key={dim.key} className="card-flat" style={{ padding: "10px 12px", cursor: "pointer" }} onClick={() => { setDimension(dim.key); setView("creative"); }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{dim.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>{best[0]}</div>
                    <div style={{ fontSize: 12, color: roas >= 2 ? "var(--green)" : "var(--yellow)", fontFamily: "var(--fm)", fontWeight: 700 }}>{roas.toFixed(2)}x ROAS</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ALL ADS TABLE ── */}
      {view === "ads" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input" placeholder="Search ads..." style={{ maxWidth: 300 }} />
          </div>
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border-light)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)", borderBottom: "2px solid var(--border)" }}>
                  {[
                    ["name", "Ad Name", 180],
                    ["stage", "Stage", 80],
                    ["spend", "Spend", 90],
                    ["revenue", "Revenue", 90],
                    ["roas", "ROAS", 60],
                    ["cpa", "CPA", 70],
                    ["conv", "Conv", 50],
                    ["hook_rate", "Hook%", 55],
                    ["hold_rate", "Hold%", 55],
                    ["tiktok_2s", "TT 2s%", 55],
                    ["hook_type", "Hook Type", 100],
                    ["offer_name", "Offer", 100],
                    ["vsl_body_type", "VSL Body", 90],
                    ["avatar", "Avatar", 80],
                  ].map(([col, label, w]) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ padding: "8px 6px", textAlign: "left", cursor: "pointer", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, width: w, whiteSpace: "nowrap" }}>
                      {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adRows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                    <td style={{ padding: "6px", fontWeight: 600, color: "var(--accent-light)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                    <td style={{ padding: "6px" }}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: stageColor(r.stage) + "15", color: stageColor(r.stage) }}>{r.stage}</span></td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)" }}>{r.spend > 0 ? fmtC(r.spend) : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)", color: "var(--green)" }}>{r.revenue > 0 ? fmtC(r.revenue) : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)", fontWeight: 700, color: r.roas >= 2 ? "var(--green)" : r.roas >= 1 ? "var(--yellow)" : r.spend > 0 ? "var(--red)" : "var(--text-muted)" }}>{r.spend > 0 ? r.roas.toFixed(2) + "x" : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)" }}>{r.conv > 0 ? fmtC(r.cpa) : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)" }}>{r.conv > 0 ? r.conv : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)", color: r.hook_rate != null ? (r.hook_rate >= 30 ? "var(--green)" : "var(--yellow)") : "var(--text-muted)" }}>{r.hook_rate != null ? r.hook_rate.toFixed(1) + "%" : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)", color: r.hold_rate != null ? (r.hold_rate >= 15 ? "var(--green)" : "var(--yellow)") : "var(--text-muted)" }}>{r.hold_rate != null ? r.hold_rate.toFixed(1) + "%" : "—"}</td>
                    <td style={{ padding: "6px", fontFamily: "var(--fm)" }}>{r.tiktok_2s != null ? r.tiktok_2s.toFixed(1) + "%" : "—"}</td>
                    <td style={{ padding: "6px", color: "var(--text-secondary)" }}>{r.hook_type || "—"}</td>
                    <td style={{ padding: "6px", color: "var(--text-secondary)" }}>{r.offer_name || "—"}</td>
                    <td style={{ padding: "6px", color: "var(--text-secondary)" }}>{r.vsl_body_type || "—"}</td>
                    <td style={{ padding: "6px", color: "var(--text-secondary)" }}>{r.avatar || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {adRows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No ads found.</div>}
          </div>
        </div>
      )}

      {/* ── BY CREATIVE ELEMENT ── */}
      {view === "creative" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {CREATIVE_DIMENSIONS.map(d => (
              <button key={d.key} onClick={() => setDimension(d.key)} className={`btn btn-xs ${dimension === d.key ? "btn-primary" : "btn-ghost"}`}>{d.label}</button>
            ))}
          </div>

          {dimensionData.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No ads tagged with {CREATIVE_DIMENSIONS.find(d => d.key === dimension)?.label || dimension}.</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Tag your ads in the Overview tab to see aggregated performance here.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: "var(--bg-elevated)", borderBottom: "2px solid var(--border)" }}>
                    {[CREATIVE_DIMENSIONS.find(d => d.key === dimension)?.label || "Value", "Ads", "Spend", "Revenue", "ROAS", "CPA", "Conversions", "Avg Hook%", "Avg Hold%"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dimensionData.map((g, i) => (
                    <tr key={g.name} style={{ borderBottom: "1px solid var(--border-light)", background: i % 2 === 0 ? "transparent" : "var(--bg-elevated)" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--text-primary)" }}>{g.name}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)" }}>{g.ads}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)" }}>{fmtC(g.spend)}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)", color: "var(--green)" }}>{fmtC(g.revenue)}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)", fontWeight: 700, color: g.roas >= 2 ? "var(--green)" : g.roas >= 1 ? "var(--yellow)" : "var(--red)" }}>{g.spend > 0 ? g.roas.toFixed(2) + "x" : "—"}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)" }}>{g.conv > 0 ? fmtC(g.cpa) : "—"}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)" }}>{g.conv}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)", color: g.avgHook != null ? "var(--accent-light)" : "var(--text-muted)" }}>{g.avgHook != null ? g.avgHook.toFixed(1) + "%" : "—"}</td>
                      <td style={{ padding: "8px 10px", fontFamily: "var(--fm)", color: g.avgHold != null ? "var(--accent-light)" : "var(--text-muted)" }}>{g.avgHold != null ? g.avgHold.toFixed(1) + "%" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Visual bar chart for the selected dimension */}
          {dimensionData.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
                ROAS by {CREATIVE_DIMENSIONS.find(d => d.key === dimension)?.label}
              </div>
              {dimensionData.filter(g => g.spend > 0).map(g => {
                const maxRoas = Math.max(...dimensionData.filter(x => x.spend > 0).map(x => x.roas), 1);
                const widthPct = (g.roas / maxRoas) * 100;
                return (
                  <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 120, fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ flex: 1, height: 22, background: "var(--border-light)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: widthPct + "%", height: "100%", borderRadius: 4, background: g.roas >= 2 ? "var(--green)" : g.roas >= 1 ? "var(--yellow)" : "var(--red)", transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ width: 60, fontSize: 12, fontWeight: 700, color: g.roas >= 2 ? "var(--green)" : g.roas >= 1 ? "var(--yellow)" : "var(--red)", fontFamily: "var(--fm)", textAlign: "right" }}>{g.roas.toFixed(2)}x</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "var(--fm)" }}>{value}</div>
    </div>
  );
}

function stageColor(stage) {
  const colors = { pre: "#8b5cf6", in: "#d97706", post: "#3b82f6", live: "#10b981", killed: "#ef4444" };
  return colors[stage] || "#888";
}
