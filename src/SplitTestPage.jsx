import { useState, useEffect, useMemo } from "react";
import { fetchSplitTests, createSplitTest, updateSplitTest, deleteSplitTest, fetchVariations, createVariation, updateVariation, fetchSnapshots, bulkUpsertSnapshots, fetchOfferLibrary, createOffer, updateOffer, deleteOffer } from "./supabaseData.js";

// ════════════════════════════════════════════════
// METRICS ENGINE
// ════════════════════════════════════════════════

function computeMetrics(variation, snapshots) {
  const tiers = variation.tiers || [];
  const mix = variation.quantity_mix || [];
  const paymentPct = variation.payment_pct ?? 5;
  const refundRate = variation.refund_rate ?? 0.05;

  // Blended AOV and Blended Landed Cost
  let blendedAOV = 0, blendedLandedCost = 0;
  tiers.forEach((t, i) => {
    const pct = (mix[i] || 0) / 100;
    blendedAOV += (t.price || 0) * pct;
    blendedLandedCost += (t.landed_cost || 0) * pct;
  });

  // Aggregate snapshots
  let totalSpend = 0, totalOrders = 0, totalRevenue = 0;
  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => { totalSpend += s.ad_spend || 0; totalOrders += s.orders || 0; totalRevenue += s.revenue || 0; });
  } else {
    totalSpend = variation.manual_spend || 0;
    totalOrders = variation.manual_orders || 0;
    totalRevenue = variation.manual_revenue || 0;
  }

  const grossRevenue = totalOrders * blendedAOV;
  const netRevenue = grossRevenue * (1 - refundRate / 100);
  const totalLandedCost = totalOrders * blendedLandedCost;
  const cm1 = netRevenue - totalLandedCost;
  const cm1Pct = netRevenue > 0 ? (cm1 / netRevenue) * 100 : 0;
  const cm2 = cm1 - totalSpend;
  const paymentFees = netRevenue * (paymentPct / 100);
  const cm3 = cm2 - paymentFees;
  const roas = totalSpend > 0 ? grossRevenue / totalSpend : 0;
  const cpa = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const ncmPerDollar = totalSpend > 0 ? cm3 / totalSpend : 0;

  return {
    blendedAOV, blendedLandedCost,
    totalSpend, totalOrders, totalRevenue: grossRevenue,
    grossRevenue, netRevenue, totalLandedCost,
    cm1, cm1Pct, cm2, paymentFees, cm3,
    roas, cpa, ncmPerDollar,
  };
}

function computeDailyNCM(variation, snapshots) {
  const tiers = variation.tiers || [];
  const mix = variation.quantity_mix || [];
  const paymentPct = variation.payment_pct ?? 5;
  const refundRate = variation.refund_rate ?? 0.05;

  let blendedAOV = 0, blendedLandedCost = 0;
  tiers.forEach((t, i) => {
    const pct = (mix[i] || 0) / 100;
    blendedAOV += (t.price || 0) * pct;
    blendedLandedCost += (t.landed_cost || 0) * pct;
  });

  // Cumulative NCM/$ per day
  let cumSpend = 0, cumOrders = 0;
  return snapshots.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
    cumSpend += s.ad_spend || 0;
    cumOrders += s.orders || 0;
    const gr = cumOrders * blendedAOV;
    const nr = gr * (1 - refundRate / 100);
    const lc = cumOrders * blendedLandedCost;
    const c1 = nr - lc;
    const c2 = c1 - cumSpend;
    const pf = nr * (paymentPct / 100);
    const c3 = c2 - pf;
    return { date: s.date, label: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: cumSpend > 0 ? c3 / cumSpend : 0 };
  });
}

// ════════════════════════════════════════════════
// NCM TREND CHART (SVG)
// ════════════════════════════════════════════════

const CHART_COLORS = ["#22c55e", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6"];

function NCMChart({ variationData, width = 600, height = 200 }) {
  if (!variationData || variationData.length === 0) return <div className="empty-state">No data for chart yet</div>;

  const allValues = variationData.flatMap(v => v.data.map(d => d.value));
  const maxVal = Math.max(...allValues, 0.01);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;
  const padY = 20, padX = 0;
  const chartH = height - padY * 2, chartW = width;

  const [hover, setHover] = useState(null);

  function linePath(data) {
    if (data.length < 2) return "";
    const pts = data.map((d, i) => ({ x: padX + (i / Math.max(data.length - 1, 1)) * chartW, y: padY + chartH - ((d.value - minVal) / range) * chartH }));
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      path += ` C ${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
    }
    return path;
  }

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padY + chartH * (1 - pct);
          return <line key={pct} x1={0} y1={y} x2={width} y2={y} stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="4 4" />;
        })}
        {variationData.map((v, vi) => (
          <path key={vi} d={linePath(v.data)} fill="none" stroke={CHART_COLORS[vi % CHART_COLORS.length]} strokeWidth="2.5" strokeLinecap="round" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 6, justifyContent: "center" }}>
        {variationData.map((v, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
            <div style={{ width: 10, height: 3, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span style={{ color: "var(--text-muted)" }}>{v.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// METRIC ROW HELPER
// ════════════════════════════════════════════════

function MetricRow({ label, values, format = "currency", highlight, currency = "SAR" }) {
  const fmt = (v) => {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "—";
    if (format === "currency") return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (format === "pct") return v.toFixed(1) + "%";
    if (format === "ratio") return v.toFixed(2) + "x";
    if (format === "ncm") return v.toFixed(3);
    return String(v);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${values.length}, 1fr)`, gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-light)", alignItems: "center" }}>
      <div style={{ fontSize: 11, fontWeight: highlight ? 700 : 500, color: highlight ? "var(--accent-light)" : "var(--text-secondary)" }}>{label}</div>
      {values.map((v, i) => (
        <div key={i} style={{ fontSize: 12, fontWeight: highlight ? 800 : 600, color: highlight ? "var(--green)" : (typeof v === "number" && v < 0 ? "var(--red)" : "var(--text-primary)"), fontFamily: "var(--fm)", textAlign: "right" }}>
          {fmt(v)}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// NEW TEST WIZARD
// ════════════════════════════════════════════════

function NewTestWizard({ onClose, onCreated, workspaceId, offerLibrary }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [platforms, setPlatforms] = useState(["meta"]);
  const [currency, setCurrency] = useState("SAR");
  const [exchangeRate, setExchangeRate] = useState(3.75);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [varCount, setVarCount] = useState(2);
  const [variations, setVariations] = useState([]);

  useEffect(() => {
    const arr = [];
    for (let i = 0; i < varCount; i++) {
      arr.push(variations[i] || { name: `Variation ${i + 1}`, tiers: [{ label: "Tier 1", price: 0, landed_cost: 0 }], quantity_mix: [100], tier_count: 1, ad_set_id_meta: "", ad_set_id_tiktok: "", payment_pct: 5, refund_rate: 0.05 });
    }
    setVariations(arr);
  }, [varCount]);

  const setVar = (i, k, v) => { const n = [...variations]; n[i] = { ...n[i], [k]: v }; setVariations(n); };
  const setTier = (vi, ti, k, v) => {
    const n = [...variations];
    const tiers = [...(n[vi].tiers || [])];
    tiers[ti] = { ...tiers[ti], [k]: v };
    n[vi] = { ...n[vi], tiers };
    setVariations(n);
  };
  const setMix = (vi, ti, v) => {
    const n = [...variations];
    const mix = [...(n[vi].quantity_mix || [])];
    mix[ti] = Number(v) || 0;
    n[vi] = { ...n[vi], quantity_mix: mix };
    setVariations(n);
  };
  const setTierCount = (vi, count) => {
    const n = [...variations];
    const tiers = [...(n[vi].tiers || [])];
    const mix = [...(n[vi].quantity_mix || [])];
    while (tiers.length < count) { tiers.push({ label: `Tier ${tiers.length + 1}`, price: 0, landed_cost: 0 }); mix.push(0); }
    n[vi] = { ...n[vi], tiers: tiers.slice(0, count), quantity_mix: mix.slice(0, count), tier_count: count };
    setVariations(n);
  };

  const loadOffer = (vi, offer) => {
    const n = [...variations];
    n[vi] = { ...n[vi], name: offer.name, tiers: offer.tiers || [], quantity_mix: offer.quantity_mix || [], tier_count: (offer.tiers || []).length, payment_pct: offer.payment_pct ?? 5, refund_rate: offer.refund_rate ?? 0.05 };
    setVariations(n);
  };

  const [creating, setCreating] = useState(false);
  const [activeVarTab, setActiveVarTab] = useState(0);

  const [createError, setCreateError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const test = await createSplitTest(workspaceId, { name, platforms, currency, usd_exchange_rate: exchangeRate, start_date: startDate, status: "active" });
      for (const v of variations) {
        await createVariation({ split_test_id: test.id, name: v.name, tiers: v.tiers, quantity_mix: v.quantity_mix, ad_set_id_meta: v.ad_set_id_meta || null, ad_set_id_tiktok: v.ad_set_id_tiktok || null, payment_pct: v.payment_pct, refund_rate: v.refund_rate });
      }
      onCreated(test);
    } catch (e) {
      console.error("Create test error:", e);
      setCreateError(e.message || "Failed to create test. Make sure you've run supabase-split-tests.sql.");
    }
    setCreating(false);
  };

  const mixSum = (vi) => (variations[vi]?.quantity_mix || []).reduce((s, v) => s + v, 0);

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>New Split Test</h3>
        <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= s ? "var(--accent)" : "var(--border-light)", transition: "background 0.3s" }} />
        ))}
      </div>

      {/* Step 1: Metadata */}
      {step === 1 && (
        <div style={{ display: "grid", gap: 14, maxWidth: 500 }}>
          <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Test Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Serum Only vs Bundle — March 2026" /></div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Platforms</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["meta", "tiktok"].map(p => (
                <button key={p} onClick={() => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} className={`btn btn-xs ${platforms.includes(p) ? "btn-primary" : "btn-ghost"}`} style={{ textTransform: "capitalize" }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Currency</label><select className="input" value={currency} onChange={e => setCurrency(e.target.value)}><option value="SAR">SAR</option><option value="USD">USD</option><option value="AED">AED</option></select></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>USD Exchange Rate</label><input className="input" type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(+e.target.value)} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Start Date</label><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Number of Variations</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setVarCount(n)} className={`btn btn-xs ${varCount === n ? "btn-primary" : "btn-ghost"}`}>{n}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={!name.trim()} className="btn btn-primary" style={{ marginTop: 8 }}>Next: Configure Variations →</button>
        </div>
      )}

      {/* Step 2: Variations */}
      {step === 2 && (
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {variations.map((v, i) => (
              <button key={i} className={`btn btn-xs ${i === activeVarTab ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveVarTab(i)}>{v.name || `Var ${i + 1}`}</button>
            ))}
          </div>
          {variations.map((v, vi) => {
            if (vi !== activeVarTab) return null;
            return (
              <div key={vi} className="card-flat" style={{ padding: 16 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Variation Name</label><input className="input" value={v.name} onChange={e => setVar(vi, "name", e.target.value)} /></div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Load from Offer Library</label>
                      <select className="input" value="" onChange={e => { const o = offerLibrary.find(o => o.id === e.target.value); if (o) loadOffer(vi, o); }}>
                        <option value="">Select saved offer...</option>
                        {offerLibrary.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>SKU Tiers</label>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[1, 2, 3].map(n => <button key={n} onClick={() => setTierCount(vi, n)} className={`btn btn-xs ${(v.tier_count || v.tiers?.length || 1) === n ? "btn-primary" : "btn-ghost"}`}>{n} tier{n > 1 ? "s" : ""}</button>)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${v.tiers?.length || 1}, 1fr)`, gap: 8 }}>
                      {(v.tiers || []).map((t, ti) => (
                        <div key={ti} className="card-flat" style={{ padding: 10 }}>
                          <input className="input" value={t.label || ""} onChange={e => setTier(vi, ti, "label", e.target.value)} placeholder="Tier label" style={{ fontSize: 11, marginBottom: 6, fontWeight: 600 }} />
                          <div style={{ display: "grid", gap: 4 }}>
                            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Selling Price</label><input className="input" type="number" value={t.price || ""} onChange={e => setTier(vi, ti, "price", +e.target.value)} placeholder="0" style={{ fontSize: 11 }} /></div>
                            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Landed Cost</label><input className="input" type="number" value={t.landed_cost || ""} onChange={e => setTier(vi, ti, "landed_cost", +e.target.value)} placeholder="0" style={{ fontSize: 11 }} /></div>
                            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Qty Mix %</label><input className="input" type="number" value={v.quantity_mix?.[ti] ?? ""} onChange={e => setMix(vi, ti, e.target.value)} placeholder="%" style={{ fontSize: 11 }} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {mixSum(vi) !== 100 && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>Mix must sum to 100% (currently {mixSum(vi)}%)</div>}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Meta Ad Set ID</label><input className="input" value={v.ad_set_id_meta || ""} onChange={e => setVar(vi, "ad_set_id_meta", e.target.value)} placeholder="Optional" style={{ fontSize: 11 }} /></div>
                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>TikTok Ad Set ID</label><input className="input" value={v.ad_set_id_tiktok || ""} onChange={e => setVar(vi, "ad_set_id_tiktok", e.target.value)} placeholder="Optional" style={{ fontSize: 11 }} /></div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Payment Processing %</label><input className="input" type="number" step="0.1" value={v.payment_pct} onChange={e => setVar(vi, "payment_pct", +e.target.value)} style={{ fontSize: 11 }} /></div>
                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Refund Rate %</label><input className="input" type="number" step="0.01" value={v.refund_rate} onChange={e => setVar(vi, "refund_rate", +e.target.value)} style={{ fontSize: 11 }} /></div>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setStep(1)} className="btn btn-ghost">← Back</button>
            <button onClick={() => setStep(3)} className="btn btn-primary">Review & Launch →</button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div>
          <div className="card-flat" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{name}</div>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
              {platforms.map(p => <span key={p} className="badge">{p}</span>)}
              <span>{currency} · Rate: {exchangeRate}</span>
              <span>Start: {startDate}</span>
              <span>{variations.length} variations</span>
            </div>
          </div>
          {variations.filter((_, i) => i < varCount).map((v, i) => (
            <div key={i} className="card-flat" style={{ padding: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{v.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {(v.tiers || []).map((t, ti) => `${t.label}: ${currency} ${t.price} (cost: ${currency} ${t.landed_cost}, mix: ${v.quantity_mix?.[ti]}%)`).join(" · ")}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {v.ad_set_id_meta ? `Meta: ${v.ad_set_id_meta}` : "Meta: manual"} · {v.ad_set_id_tiktok ? `TikTok: ${v.ad_set_id_tiktok}` : "TikTok: manual"}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setStep(2)} className="btn btn-ghost">← Back</button>
            <button onClick={handleCreate} disabled={creating} className="btn btn-primary">{creating ? "Creating..." : "Launch Test"}</button>
            {createError && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{createError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// TEST DETAIL VIEW
// ════════════════════════════════════════════════

function TestDetail({ test, onBack, onSync, syncing, currency }) {
  const [vars, setVars] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const v = await fetchVariations(test.id);
      setVars(v);
      if (v.length > 0) {
        const s = await fetchSnapshots(v.map(x => x.id));
        setSnapshots(s);
      }
      setLoading(false);
    };
    load();
  }, [test.id]);

  const cur = currency || test.currency || "SAR";

  const metricsPerVar = useMemo(() =>
    vars.map(v => ({
      variation: v,
      metrics: computeMetrics(v, snapshots.filter(s => s.variation_id === v.id)),
    })),
    [vars, snapshots]
  );

  const winner = metricsPerVar.length > 0 ? metricsPerVar.reduce((best, curr) => curr.metrics.ncmPerDollar > best.metrics.ncmPerDollar ? curr : best, metricsPerVar[0]) : null;

  const chartData = useMemo(() =>
    vars.map((v, i) => ({
      name: v.name,
      data: computeDailyNCM(v, snapshots.filter(s => s.variation_id === v.id)),
    })),
    [vars, snapshots]
  );

  const daysSinceStart = test.start_date ? Math.floor((Date.now() - new Date(test.start_date).getTime()) / 86400000) : 0;
  const isSettling = daysSinceStart < 2;

  if (loading) return <div className="empty-state">Loading test data...</div>;

  return (
    <div className="animate-fade">
      <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← All Tests</button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>{test.name}</h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {(test.platforms || []).map(p => <span key={p} className="badge" style={{ fontSize: 9 }}>{p}</span>)}
            <span className="badge" style={{ fontSize: 9, background: test.status === "active" ? "rgba(34,197,94,0.15)" : "var(--bg-elevated)", color: test.status === "active" ? "var(--green)" : "var(--text-muted)" }}>{test.status}</span>
            {isSettling && <span className="badge" style={{ fontSize: 9, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>Data still settling</span>}
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{daysSinceStart} days running</span>
          </div>
        </div>
        <button onClick={() => onSync(test, vars)} disabled={syncing} className="btn btn-primary btn-sm">{syncing ? "Syncing..." : "Sync Data"}</button>
      </div>

      {/* Winner callout */}
      {winner && metricsPerVar.length > 1 && winner.metrics.totalSpend > 0 && (
        <div style={{ padding: "14px 18px", borderRadius: 12, marginBottom: 16, background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>
            Based on NCM/$, <strong>{winner.variation.name}</strong> is the current winner
          </div>
          {metricsPerVar.length > 1 && (() => {
            const others = metricsPerVar.filter(m => m.variation.id !== winner.variation.id);
            const nearest = others.reduce((best, c) => c.metrics.ncmPerDollar > best.metrics.ncmPerDollar ? c : best, others[0]);
            const delta = nearest.metrics.ncmPerDollar !== 0 ? ((winner.metrics.ncmPerDollar - nearest.metrics.ncmPerDollar) / Math.abs(nearest.metrics.ncmPerDollar) * 100) : 0;
            return <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{delta.toFixed(1)}% higher NCM/$ than {nearest.variation.name}</div>;
          })()}
        </div>
      )}

      {/* NCM Chart */}
      {chartData.some(c => c.data.length > 1) && (
        <div style={{ padding: "16px 18px", borderRadius: 12, marginBottom: 16, background: "var(--bg-elevated)", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>NCM/$ Trend</div>
          <NCMChart variationData={chartData} />
        </div>
      )}

      {/* Metrics table */}
      <div style={{ padding: "16px 18px", borderRadius: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-light)", marginBottom: 16 }}>
        {/* Variation headers */}
        <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${vars.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
          <div />
          {vars.map((v, i) => (
            <div key={v.id} style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: winner?.variation.id === v.id ? "var(--green)" : "var(--text-primary)" }}>
              {v.name} {winner?.variation.id === v.id && "🏆"}
            </div>
          ))}
        </div>

        <MetricRow label="Ad Spend" values={metricsPerVar.map(m => m.metrics.totalSpend)} currency={cur} />
        <MetricRow label="Orders" values={metricsPerVar.map(m => m.metrics.totalOrders)} format="number" />
        <MetricRow label="Blended AOV" values={metricsPerVar.map(m => m.metrics.blendedAOV)} currency={cur} />
        <MetricRow label="ROAS" values={metricsPerVar.map(m => m.metrics.roas)} format="ratio" />
        <MetricRow label="CPA" values={metricsPerVar.map(m => m.metrics.cpa)} currency={cur} />
        <MetricRow label="Gross Revenue" values={metricsPerVar.map(m => m.metrics.grossRevenue)} currency={cur} />
        <MetricRow label="Net Revenue" values={metricsPerVar.map(m => m.metrics.netRevenue)} currency={cur} />
        <MetricRow label="CM1" values={metricsPerVar.map(m => m.metrics.cm1)} currency={cur} />
        <MetricRow label="CM1 %" values={metricsPerVar.map(m => m.metrics.cm1Pct)} format="pct" />
        <MetricRow label="CM2" values={metricsPerVar.map(m => m.metrics.cm2)} currency={cur} />
        <MetricRow label="Payment Fees" values={metricsPerVar.map(m => m.metrics.paymentFees)} currency={cur} />
        <MetricRow label="CM3" values={metricsPerVar.map(m => m.metrics.cm3)} currency={cur} />
        <MetricRow label="NCM per $1 Ad Spend" values={metricsPerVar.map(m => m.metrics.ncmPerDollar)} format="ncm" highlight />
      </div>

      {/* Manual data entry for variations without ad set IDs */}
      {vars.some(v => !v.ad_set_id_meta && !v.ad_set_id_tiktok) && (
        <div style={{ padding: "16px 18px", borderRadius: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Manual Data Entry</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>For variations without ad set IDs linked</div>
          {vars.filter(v => !v.ad_set_id_meta && !v.ad_set_id_tiktok).map(v => (
            <div key={v.id} className="card-flat" style={{ padding: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{v.name} <span className="badge" style={{ fontSize: 8 }}>Manual</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Total Spend</label><input className="input" type="number" defaultValue={v.manual_spend || 0} onBlur={e => updateVariation(v.id, { manual_spend: +e.target.value })} style={{ fontSize: 11 }} /></div>
                <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Total Orders</label><input className="input" type="number" defaultValue={v.manual_orders || 0} onBlur={e => updateVariation(v.id, { manual_orders: +e.target.value })} style={{ fontSize: 11 }} /></div>
                <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Total Revenue</label><input className="input" type="number" defaultValue={v.manual_revenue || 0} onBlur={e => updateVariation(v.id, { manual_revenue: +e.target.value })} style={{ fontSize: 11 }} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// OFFER LIBRARY
// ════════════════════════════════════════════════

function OfferLibraryView({ workspaceId }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetchOfferLibrary(workspaceId).then(setOffers).finally(() => setLoading(false));
  }, [workspaceId]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSave = async (offer) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (offer.id) {
        const updated = await updateOffer(offer.id, { name: offer.name, tiers: offer.tiers, quantity_mix: offer.quantity_mix, payment_pct: offer.payment_pct, refund_rate: offer.refund_rate });
        setOffers(prev => prev.map(o => o.id === updated.id ? updated : o));
      } else {
        const created = await createOffer(workspaceId, { name: offer.name, tiers: offer.tiers, quantity_mix: offer.quantity_mix, payment_pct: offer.payment_pct, refund_rate: offer.refund_rate });
        setOffers(prev => [created, ...prev]);
      }
      setEditing(null);
    } catch (e) {
      console.error("Save offer error:", e);
      setSaveError(e.message || "Failed to save offer. Make sure you've run supabase-split-tests.sql.");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await deleteOffer(id);
    setOffers(prev => prev.filter(o => o.id !== id));
  };

  if (loading) return <div className="empty-state">Loading offers...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Offer Library</div>
        <button onClick={() => setEditing({ name: "", tiers: [{ label: "Tier 1", price: 0, landed_cost: 0 }], quantity_mix: [100], payment_pct: 5, refund_rate: 0.05 })} className="btn btn-primary btn-sm">+ New Offer</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Reusable offer configurations. Select these when creating a new split test.</div>

      {editing && (
        <div className="card-flat" style={{ padding: 16, marginBottom: 12, borderLeft: "3px solid var(--accent)" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <input className="input" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Offer name" style={{ fontWeight: 600 }} />
            {(editing.tiers || []).map((t, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                <input className="input" value={t.label} onChange={e => { const tiers = [...editing.tiers]; tiers[i] = { ...tiers[i], label: e.target.value }; setEditing(p => ({ ...p, tiers })); }} placeholder="Label" style={{ fontSize: 11 }} />
                <input className="input" type="number" value={t.price || ""} onChange={e => { const tiers = [...editing.tiers]; tiers[i] = { ...tiers[i], price: +e.target.value }; setEditing(p => ({ ...p, tiers })); }} placeholder="Price" style={{ fontSize: 11 }} />
                <input className="input" type="number" value={t.landed_cost || ""} onChange={e => { const tiers = [...editing.tiers]; tiers[i] = { ...tiers[i], landed_cost: +e.target.value }; setEditing(p => ({ ...p, tiers })); }} placeholder="Landed Cost" style={{ fontSize: 11 }} />
                <input className="input" type="number" value={editing.quantity_mix?.[i] ?? ""} onChange={e => { const mix = [...(editing.quantity_mix || [])]; mix[i] = +e.target.value; setEditing(p => ({ ...p, quantity_mix: mix })); }} placeholder="Mix %" style={{ fontSize: 11 }} />
              </div>
            ))}
            <button onClick={() => { const tiers = [...editing.tiers, { label: `Tier ${editing.tiers.length + 1}`, price: 0, landed_cost: 0 }]; const mix = [...(editing.quantity_mix || []), 0]; setEditing(p => ({ ...p, tiers, quantity_mix: mix })); }} className="btn btn-ghost btn-xs">+ Add Tier</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => handleSave(editing)} className="btn btn-primary btn-sm" disabled={!editing.name?.trim() || saving}>{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
            {saveError && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{saveError}</div>}
          </div>
        </div>
      )}

      {offers.length === 0 && !editing && <div className="empty-state">No saved offers yet.</div>}
      {offers.map(o => (
        <div key={o.id} className="card-flat" style={{ padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{o.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {(o.tiers || []).map((t, i) => `${t.label}: ${t.price} / ${t.landed_cost} (${o.quantity_mix?.[i]}%)`).join(" · ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setEditing({ ...o })} className="btn btn-ghost btn-xs">Edit</button>
            <button onClick={() => handleDelete(o.id)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// MAIN SPLIT TEST PAGE
// ════════════════════════════════════════════════

export default function SplitTestPage({ activeWorkspaceId }) {
  const [view, setView] = useState("dashboard"); // dashboard | new | detail | library
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState(null);
  const [filter, setFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [offerLib, setOfferLib] = useState([]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    Promise.all([
      fetchSplitTests(activeWorkspaceId),
      fetchOfferLibrary(activeWorkspaceId),
    ]).then(([t, o]) => { setTests(t); setOfferLib(o); }).finally(() => setLoading(false));
  }, [activeWorkspaceId]);

  const handleSync = async (test, vars) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/tw-sync?testId=${test.id}`, { method: "POST" });
      if (res.ok) {
        // Refresh test data
        const v = await fetchVariations(test.id);
        if (v.length > 0) await fetchSnapshots(v.map(x => x.id));
      }
    } catch (e) { console.error("Sync error:", e); }
    setSyncing(false);
    // Force re-render by re-selecting
    setSelectedTest({ ...test });
  };

  const filteredTests = filter === "all" ? tests : tests.filter(t => t.status === filter);

  if (loading) return <div className="empty-state">Loading split tests...</div>;

  return (
    <div className="animate-fade">
      {view === "dashboard" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Split Tests</h2>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>NCM-based offer split testing. Compare profitability, not just ROAS.</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setView("library")} className="btn btn-ghost btn-sm">Offer Library</button>
              <button onClick={() => setView("new")} className="btn btn-primary btn-sm">+ New Split Test</button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {["all", "active", "completed", "archived"].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`btn btn-xs ${filter === f ? "btn-primary" : "btn-ghost"}`} style={{ textTransform: "capitalize" }}>{f}</button>
            ))}
          </div>

          {/* Test list */}
          {filteredTests.length === 0 && <div className="empty-state">No split tests yet. Click "+ New Split Test" to create one.</div>}
          {filteredTests.map(t => (
            <div key={t.id} className="card-flat" style={{ padding: "14px 16px", marginBottom: 8, cursor: "pointer" }} onClick={() => { setSelectedTest(t); setView("detail"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                    {(t.platforms || []).map(p => <span key={p} className="badge" style={{ fontSize: 9 }}>{p}</span>)}
                    <span className="badge" style={{ fontSize: 9, background: t.status === "active" ? "rgba(34,197,94,0.15)" : "var(--bg-elevated)", color: t.status === "active" ? "var(--green)" : "var(--text-muted)" }}>{t.status}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{t.start_date}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>→</div>
              </div>
            </div>
          ))}
        </>
      )}

      {view === "new" && (
        <NewTestWizard
          onClose={() => setView("dashboard")}
          onCreated={(test) => { setTests(prev => [test, ...prev]); setSelectedTest(test); setView("detail"); }}
          workspaceId={activeWorkspaceId}
          offerLibrary={offerLib}
        />
      )}

      {view === "detail" && selectedTest && (
        <TestDetail test={selectedTest} onBack={() => { setView("dashboard"); setSelectedTest(null); }} onSync={handleSync} syncing={syncing} />
      )}

      {view === "library" && (
        <div>
          <button onClick={() => setView("dashboard")} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← Back to Tests</button>
          <OfferLibraryView workspaceId={activeWorkspaceId} />
        </div>
      )}
    </div>
  );
}
