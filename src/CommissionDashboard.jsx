import { useState, useMemo } from "react";

const CUR = "SAR";

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " - " + end.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

function getWeeksFromMetrics(ads) {
  const weeks = new Map();
  ads.forEach(ad => {
    (ad.metrics || []).forEach(m => {
      const w = getWeekRange(m.date);
      const key = w.start.toISOString();
      if (!weeks.has(key)) weeks.set(key, { ...w, key });
    });
    const chm = ad.channelMetrics || {};
    Object.values(chm).forEach(metrics => {
      (metrics || []).forEach(m => {
        if (m.date) {
          const w = getWeekRange(m.date);
          const key = w.start.toISOString();
          if (!weeks.has(key)) weeks.set(key, { ...w, key });
        }
      });
    });
  });
  return Array.from(weeks.values()).sort((a, b) => b.start - a.start);
}

function calcAdSpend(ad, weekStart, weekEnd) {
  let spend = 0;
  (ad.metrics || []).forEach(m => {
    const d = new Date(m.date);
    if (d >= weekStart && d <= weekEnd) spend += (m.spend || 0);
  });
  const chm = ad.channelMetrics || {};
  Object.values(chm).forEach(metrics => {
    (metrics || []).forEach(m => {
      if (m.date) {
        const d = new Date(m.date);
        if (d >= weekStart && d <= weekEnd) spend += (m.spend || 0);
      }
    });
  });
  return spend;
}

function calcTotalAdSpend(ad) {
  let spend = (ad.metrics || []).reduce((s, m) => s + (m.spend || 0), 0);
  const chm = ad.channelMetrics || {};
  Object.values(chm).forEach(metrics => {
    spend += (metrics || []).reduce((s, m) => s + (m.spend || 0), 0);
  });
  return spend;
}

function AdSpendRow({ ad, commissionPct, weekStart, weekEnd, showWeekly }) {
  const totalSpend = calcTotalAdSpend(ad);
  const weekSpend = showWeekly && weekStart ? calcAdSpend(ad, weekStart, weekEnd) : totalSpend;
  const commission = weekSpend * (commissionPct / 100);
  const latestMetric = ad.metrics?.[ad.metrics.length - 1];

  return (
    <div className="card-flat" style={{ marginBottom: 6, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{ad.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <span className="badge" style={{ fontSize: 9 }}>{ad.type}</span>
            <span className="badge" style={{ fontSize: 9 }}>{ad.stage}</span>
            {latestMetric && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>CPA: {CUR} {latestMetric.cpa}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 120 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>
            {CUR} {weekSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600, fontFamily: "var(--fm)" }}>
            +{CUR} {commission.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CommissionDashboard({ ads, editorName, commissionPct, isEditorView }) {
  const [viewMode, setViewMode] = useState("weekly");
  const [selectedWeek, setSelectedWeek] = useState(null);

  const editorAds = useMemo(() =>
    ads.filter(a => a.editor === editorName && a.stage !== "killed"),
    [ads, editorName]
  );

  const liveAds = editorAds.filter(a => a.stage === "live");
  const weeks = useMemo(() => getWeeksFromMetrics(editorAds), [editorAds]);

  // Auto-select current week
  const currentWeek = useMemo(() => {
    if (selectedWeek) return selectedWeek;
    if (weeks.length > 0) return weeks[0];
    return null;
  }, [weeks, selectedWeek]);

  const totalSpendAllTime = editorAds.reduce((s, a) => s + calcTotalAdSpend(a), 0);
  const totalCommissionAllTime = totalSpendAllTime * (commissionPct / 100);

  const weeklySpend = currentWeek ? editorAds.reduce((s, a) => s + calcAdSpend(a, currentWeek.start, currentWeek.end), 0) : 0;
  const weeklyCommission = weeklySpend * (commissionPct / 100);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: "var(--accent-light)" }}>{commissionPct}%</div>
          <div className="stat-label">Commission Rate</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: "var(--text-primary)" }}>{editorAds.length}</div>
          <div className="stat-label">Assigned Ads</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: "var(--text-primary)" }}>{CUR} {weeklySpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          <div className="stat-label">This Week Spend</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ fontSize: 14, color: "var(--green)" }}>{CUR} {weeklyCommission.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div className="stat-label">This Week Commission</div>
        </div>
      </div>

      {/* All-time totals */}
      <div className="card-flat" style={{ marginBottom: 16, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>All-Time Totals</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            Total Spend: <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>{CUR} {totalSpendAllTime.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Commission</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>
            {CUR} {totalCommissionAllTime.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* View toggle + week selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setViewMode("weekly")} className={`btn btn-xs ${viewMode === "weekly" ? "btn-primary" : "btn-ghost"}`}>Weekly</button>
          <button onClick={() => setViewMode("all")} className={`btn btn-xs ${viewMode === "all" ? "btn-primary" : "btn-ghost"}`}>All Time</button>
        </div>
        {viewMode === "weekly" && weeks.length > 0 && (
          <select
            value={currentWeek?.key || ""}
            onChange={e => setSelectedWeek(weeks.find(w => w.key === e.target.value))}
            className="input"
            style={{ width: 220, fontSize: 11, cursor: "pointer" }}
          >
            {weeks.map(w => (
              <option key={w.key} value={w.key}>{w.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Ad breakdown */}
      <div className="section-title" style={{ fontSize: 11 }}>Ad Breakdown</div>
      {editorAds.length === 0 && (
        <div className="empty-state">No ads assigned to {editorName}</div>
      )}
      {editorAds.map(ad => (
        <AdSpendRow
          key={ad.id}
          ad={ad}
          commissionPct={commissionPct}
          weekStart={viewMode === "weekly" && currentWeek ? currentWeek.start : null}
          weekEnd={viewMode === "weekly" && currentWeek ? currentWeek.end : null}
          showWeekly={viewMode === "weekly"}
        />
      ))}

      {/* Weekly summary footer */}
      {editorAds.length > 0 && (
        <div className="card-flat" style={{ marginTop: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid var(--accent)" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
            {viewMode === "weekly" && currentWeek ? currentWeek.label : "All Time"} Total
          </span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>
              Spend: {CUR} {(viewMode === "weekly" ? weeklySpend : totalSpendAllTime).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>
              Commission: {CUR} {(viewMode === "weekly" ? weeklyCommission : totalCommissionAllTime).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
