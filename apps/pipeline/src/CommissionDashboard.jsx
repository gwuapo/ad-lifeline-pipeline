import { useState, useMemo } from "react";
import DateRangePicker from "./DateRangePicker.jsx";

const CUR = "SAR";

// ════════════════════════════════════════════════
// SVG LINE CHART (smooth, glassy, animated)
// ════════════════════════════════════════════════

function SmoothLineChart({ data, width = 500, height = 200, color = "#22c55e", gradientId, label, valuePrefix = CUR + " " }) {
  if (!data || data.length === 0) return <div className="empty-state" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>No data yet</div>;

  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const padX = 0;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padY + chartH - ((d.value - minVal) / range) * chartH,
    ...d,
  }));

  // Smooth catmull-rom to bezier
  function catmullRomToBezier(pts) {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }

  const linePath = catmullRomToBezier(points);
  const areaPath = linePath + ` L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

  const [hover, setHover] = useState(null);

  return (
    <div style={{ position: "relative" }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <filter id={`glow-${gradientId}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padY + chartH * (1 - pct);
          return <line key={pct} x1={padX} y1={y} x2={width - padX} y2={y} stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="4 4" />;
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${gradientId})`} style={{ transition: "d 0.3s ease" }}>
          <animate attributeName="stroke-dashoffset" from="2000" to="0" dur="1.5s" fill="freeze" />
          <animate attributeName="stroke-dasharray" from="2000" to="2000" dur="0.01s" fill="freeze" />
        </path>

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 3.5} fill={color} stroke="var(--bg-root)" strokeWidth="2" style={{ transition: "r 0.15s ease" }} />
            {hover === i && (
              <circle cx={p.x} cy={p.y} r="12" fill={color} opacity="0.15">
                <animate attributeName="r" from="6" to="16" dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.2" to="0" dur="0.8s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hover !== null && points[hover] && (
        <div style={{
          position: "absolute",
          left: `${(points[hover].x / width) * 100}%`,
          top: `${points[hover].y - 40}px`,
          transform: "translateX(-50%)",
          background: "var(--bg-root)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 10px", fontSize: 11,
          boxShadow: "var(--shadow-lg)", zIndex: 5, whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 700, color }}>{valuePrefix}{data[hover].value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 9 }}>{data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// PROGRESS RING
// ════════════════════════════════════════════════

function ProgressRing({ value, max, size = 80, strokeWidth = 6, color = "var(--green)", label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / (max || 1), 1);
  const offset = circumference * (1 - pct);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-light)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position: "relative", marginTop: -size + 4, height: size - 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>{Math.round(pct * 100)}%</div>
      </div>
      {label && <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", marginTop: 2, textAlign: "center" }}>{label}</div>}
      {sublabel && <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>{sublabel}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════
// MILESTONE BADGE
// ════════════════════════════════════════════════

function MilestoneBadge({ icon, title, subtitle, achieved, color }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 12,
      background: achieved ? `${color}12` : "var(--bg-elevated)",
      border: `1px solid ${achieved ? color : "var(--border-light)"}`,
      opacity: achieved ? 1 : 0.5, transition: "all 0.3s ease",
      textAlign: "center", minWidth: 80,
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: achieved ? color : "var(--text-muted)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 8.5, color: "var(--text-muted)", marginTop: 1 }}>{subtitle}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

function calcTotalAdSpend(ad) {
  let spend = (ad.metrics || []).reduce((s, m) => s + (m.spend || 0), 0);
  const chm = ad.channelMetrics || {};
  Object.values(chm).forEach(metrics => {
    spend += (metrics || []).reduce((s, m) => s + (m.spend || 0), 0);
  });
  return spend;
}

function getMetricsByPeriod(ads, period, fromDate, toDate) {
  const buckets = new Map();
  const now = new Date();
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate + "T23:59:59") : null;

  ads.forEach(ad => {
    const allMetrics = [...(ad.metrics || [])];
    const chm = ad.channelMetrics || {};
    Object.values(chm).forEach(m => allMetrics.push(...(m || [])));

    allMetrics.forEach(m => {
      if (!m.date) return;
      const d = new Date(m.date);
      if (from && d < from) return;
      if (to && d > to) return;
      let key, label;

      if (period === "daily") {
        key = m.date;
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (period === "weekly") {
        const day = d.getDay();
        const start = new Date(d);
        start.setDate(d.getDate() - day);
        key = start.toISOString().split("T")[0];
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " - " + end.toLocaleDateString("en-US", { day: "numeric" });
      } else {
        key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }

      if (!buckets.has(key)) buckets.set(key, { key, label, spend: 0 });
      buckets.get(key).spend += (m.spend || 0);
    });
  });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// ════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════

export default function CommissionDashboard({ ads, editorName, commissionPct, isEditorView }) {
  const [chartPeriod, setChartPeriod] = useState("weekly");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const editorAds = useMemo(() =>
    ads.filter(a => a.editor === editorName && a.stage !== "killed"),
    [ads, editorName]
  );

  const liveAds = editorAds.filter(a => a.stage === "live");
  const totalSpend = editorAds.reduce((s, a) => s + calcTotalAdSpend(a), 0);
  const totalCommission = totalSpend * (commissionPct / 100);

  // Win rate calculation
  const completedAds = editorAds.filter(a => a.stage === "live" || a.finalApproved);
  const winnerAds = liveAds.filter(a => {
    const lm = a.metrics?.[a.metrics.length - 1];
    return lm && lm.cpa > 0;
  });
  const winRate = completedAds.length > 0 ? (winnerAds.length / completedAds.length) * 100 : 0;

  // Auto-pick granularity based on date range
  const autoGranularity = useMemo(() => {
    const days = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / 86400000);
    if (days <= 14) return "daily";
    if (days <= 90) return "weekly";
    return "monthly";
  }, [dateFrom, dateTo]);

  // Chart data
  const periodData = useMemo(() => {
    const raw = getMetricsByPeriod(editorAds, autoGranularity, dateFrom, dateTo);
    return raw.map(d => ({ label: d.label, value: d.spend * (commissionPct / 100) }));
  }, [editorAds, autoGranularity, dateFrom, dateTo, commissionPct]);

  const spendData = useMemo(() => {
    const raw = getMetricsByPeriod(editorAds, autoGranularity, dateFrom, dateTo);
    return raw.map(d => ({ label: d.label, value: d.spend }));
  }, [editorAds, autoGranularity, dateFrom, dateTo]);

  // Earning potential projections
  const projections = useMemo(() => {
    const currentMonthlySpend = totalSpend; // simplified
    return [
      { winRate: 10, label: "10% Win Rate", spend: currentMonthlySpend * 0.7, commission: currentMonthlySpend * 0.7 * (commissionPct / 100) },
      { winRate: 25, label: "25% Win Rate", spend: currentMonthlySpend * 1.2, commission: currentMonthlySpend * 1.2 * (commissionPct / 100) },
      { winRate: 40, label: "40% Win Rate", spend: currentMonthlySpend * 2.0, commission: currentMonthlySpend * 2.0 * (commissionPct / 100) },
      { winRate: 60, label: "60% Win Rate", spend: currentMonthlySpend * 3.5, commission: currentMonthlySpend * 3.5 * (commissionPct / 100) },
      { winRate: 80, label: "80% Win Rate", spend: currentMonthlySpend * 5.0, commission: currentMonthlySpend * 5.0 * (commissionPct / 100) },
    ];
  }, [totalSpend, commissionPct]);

  const potentialData = projections.map(p => ({ label: p.label, value: p.commission }));

  // Milestones
  const milestones = [
    { icon: "🎯", title: "First Ad", subtitle: "Assigned", achieved: editorAds.length >= 1 },
    { icon: "🔥", title: "5 Ads", subtitle: "In pipeline", achieved: editorAds.length >= 5 },
    { icon: "💰", title: CUR + " 500", subtitle: "Earned", achieved: totalCommission >= 500, color: "var(--green)" },
    { icon: "🏆", title: "Winner", subtitle: "First green CPA", achieved: winnerAds.length >= 1, color: "var(--green)" },
    { icon: "⚡", title: "3 Winners", subtitle: "Hat trick", achieved: winnerAds.length >= 3, color: "var(--accent)" },
    { icon: "👑", title: CUR + " 5K", subtitle: "Commission", achieved: totalCommission >= 5000, color: "#f59e0b" },
  ];

  // Current "level" based on commission earned
  const levels = [
    { name: "Rookie", min: 0, color: "var(--text-muted)" },
    { name: "Rising Star", min: 500, color: "var(--accent-light)" },
    { name: "Pro Editor", min: 2000, color: "var(--green)" },
    { name: "Elite Creator", min: 5000, color: "#f59e0b" },
    { name: "Legend", min: 15000, color: "#ef4444" },
  ];
  const currentLevel = [...levels].reverse().find(l => totalCommission >= l.min) || levels[0];
  const nextLevel = levels[levels.indexOf(currentLevel) + 1];

  return (
    <div className="animate-fade">
      {/* ── HERO STATS ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20,
      }}>
        {/* Total Earnings Card */}
        <div style={{
          padding: "20px 18px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.03))",
          border: "1px solid rgba(34,197,94,0.2)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Total Earnings</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green)", fontFamily: "var(--fm)", lineHeight: 1 }}>
            {CUR} {totalCommission.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            from {CUR} {totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} total ad spend
          </div>
        </div>

        {/* Commission Rate + Level */}
        <div style={{
          padding: "20px 18px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.03))",
          border: "1px solid rgba(99,102,241,0.2)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--accent-light)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Your Rate</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent-light)", fontFamily: "var(--fm)", lineHeight: 1 }}>
            {commissionPct}%
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: currentLevel.color }}>{currentLevel.name}</span>
            {nextLevel && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>→ {nextLevel.name} at {CUR} {nextLevel.min.toLocaleString()}</span>}
          </div>
        </div>

        {/* Win Rate Ring */}
        <div style={{
          padding: "12px 18px", borderRadius: 16,
          background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <ProgressRing value={winRate} max={100} size={72} color={winRate >= 25 ? "var(--green)" : winRate >= 10 ? "var(--yellow)" : "var(--red)"} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>Win Rate</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>{winRate.toFixed(0)}%</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{winnerAds.length}/{completedAds.length} winners</div>
          </div>
        </div>
      </div>

      {/* ── QUICK STATS ROW ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Assigned Ads", value: editorAds.length, color: "var(--accent-light)" },
          { label: "Live Ads", value: liveAds.length, color: "var(--green)" },
          { label: "Total Spend", value: CUR + " " + totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 }), color: "var(--text-primary)" },
          { label: "Avg CPA", value: liveAds.length > 0 ? CUR + " " + (liveAds.reduce((s, a) => s + (a.metrics?.[a.metrics.length - 1]?.cpa || 0), 0) / liveAds.length).toFixed(2) : "N/A", color: "var(--accent-light)" },
        ].map(s => (
          <div key={s.label} className="stat-box" style={{ padding: "12px 10px" }}>
            <div className="stat-value" style={{ fontSize: 15, color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── EARNINGS CHART ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 16, marginBottom: 20,
        background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Earnings Over Time</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Commission earned · {autoGranularity} view</div>
          </div>
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        </div>
        <SmoothLineChart data={periodData} width={600} height={180} color="#22c55e" gradientId="earnings-grad" />
      </div>

      {/* ── AD SPEND CHART ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 16, marginBottom: 20,
        background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Ad Spend Trend</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total spend on your ads over time</div>
        </div>
        <SmoothLineChart data={spendData} width={600} height={160} color="#6366f1" gradientId="spend-grad" />
      </div>

      {/* ── EARNING POTENTIAL ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 16, marginBottom: 20,
        background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(99,102,241,0.06))",
        border: "1px solid rgba(245,158,11,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Earning Potential 🚀</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Higher win rate = more spend on your ads = more commission for you</div>
          </div>
        </div>

        <SmoothLineChart data={potentialData} width={600} height={180} color="#f59e0b" gradientId="potential-grad" />

        {/* Projection table */}
        <div style={{ marginTop: 14 }}>
          {projections.map((p, i) => {
            const isCurrent = Math.abs(winRate - p.winRate) < 8;
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                background: isCurrent ? "rgba(99,102,241,0.1)" : "transparent",
                border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isCurrent && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--accent)", color: "#fff", fontWeight: 700 }}>YOU</span>}
                  <span style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? "var(--accent-light)" : "var(--text-secondary)" }}>{p.label}</span>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>Spend: {CUR} {p.spend.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? "var(--green)" : "var(--text-primary)", fontFamily: "var(--fm)", minWidth: 80, textAlign: "right" }}>
                    {CUR} {p.commission.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, textAlign: "center" }}>
            Better ads → Higher win rate → More ad spend → More commission for you 💪
          </div>
        </div>
      </div>

      {/* ── AD BREAKDOWN ── */}
      <div style={{
        padding: "18px 20px", borderRadius: 16,
        background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Your Ads</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Breakdown by ad</div>
        {editorAds.length === 0 && <div className="empty-state">No ads assigned yet</div>}
        {editorAds.map(ad => {
          const spend = calcTotalAdSpend(ad);
          const comm = spend * (commissionPct / 100);
          const lm = ad.metrics?.[ad.metrics.length - 1];
          return (
            <div key={ad.id} className="card-flat" style={{ marginBottom: 6, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{ad.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                    <span className="badge" style={{ fontSize: 9 }}>{ad.type}</span>
                    <span className="badge" style={{ fontSize: 9 }}>{ad.stage}</span>
                    {lm && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>CPA: {CUR} {lm.cpa}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>
                    {CUR} {spend.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>
                    +{CUR} {comm.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
