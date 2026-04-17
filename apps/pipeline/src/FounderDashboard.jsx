import { useState, useMemo } from "react";

const CUR = "SAR";

function lm(ad) {
  const m = ad.metrics || [];
  return m.length > 0 ? m[m.length - 1] : null;
}

function weekSpend(ad) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  let spend = 0;
  (ad.metrics || []).forEach(m => {
    const d = new Date(m.date).getTime();
    if (d >= weekAgo) spend += m.spend || 0;
  });
  Object.values(ad.channelMetrics || {}).forEach(metrics => {
    (metrics || []).forEach(m => {
      const d = new Date(m.date).getTime();
      if (d >= weekAgo) spend += m.spend || 0;
    });
  });
  return spend;
}

export default function FounderDashboard({ ads, th, onOpenAd, setPage }) {
  const allAds = ads.filter(a => a.stage !== "killed");

  const inbox = allAds.filter(a => a.stage === "inbox");
  const researching = allAds.filter(a => a.stage === "researching");
  const drafting = allAds.filter(a => a.stage === "drafting");
  const scripted = allAds.filter(a => a.stage === "scripted");
  const ready = allAds.filter(a => a.stage === "ready");
  const analyzed = allAds.filter(a => a.stage === "analyzed");
  const live = allAds.filter(a => a.stage === "live");

  const bufferTarget = 40;
  const bufferPct = scripted.length / bufferTarget;
  const bufferColor = bufferPct >= 0.9 ? "var(--green)" : bufferPct >= 0.6 ? "var(--yellow)" : "var(--red)";

  // Weekly deploy rate (cards that entered live in last 7 days)
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const deployedThisWeek = live.filter(a => {
    const entered = a.stage_entered_at ? new Date(a.stage_entered_at).getTime() : (a.stageEnteredAt || 0);
    return entered >= weekAgo;
  }).length;
  const runwayDays = deployedThisWeek > 0 ? Math.round((scripted.length / deployedThisWeek) * 7) : scripted.length > 0 ? 99 : 0;

  // Weekly performance
  const totalWeekSpend = live.reduce((s, a) => s + weekSpend(a), 0);
  const liveWithMetrics = live.filter(a => lm(a));
  const avgRoas = liveWithMetrics.length > 0
    ? (liveWithMetrics.reduce((s, a) => s + (lm(a)?.roas || 0), 0) / liveWithMetrics.length).toFixed(1)
    : "—";
  const winners = live.filter(a => { const m = lm(a); return m && m.roas >= (th.green || 2); }).length;
  const losers = live.filter(a => { const m = lm(a); return m && m.roas > 0 && m.roas < (th.yellow || 1.48); }).length;

  const cardStyle = { background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "16px 18px" };
  const metricStyle = { fontSize: 28, fontWeight: 700, fontFamily: "var(--fm)", lineHeight: 1 };
  const labelStyle = { fontSize: 11, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" };

  const QueueCard = ({ title, items, emptyText, color }) => (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "var(--fm)" }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
          {items.map(ad => {
            const age = ad.stage_entered_at ? Math.floor((Date.now() - new Date(ad.stage_entered_at).getTime()) / (1000 * 60 * 60)) : null;
            return (
              <div key={ad.id} onClick={() => onOpenAd(ad)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
                {ad.priority && <div style={{ width: 6, height: 6, borderRadius: "50%", background: ad.priority === "P0" ? "#ef4444" : ad.priority === "P1" ? "#f59e0b" : "#6b7280", flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</span>
                {age !== null && <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)", flexShrink: 0 }}>{age < 24 ? `${age}h` : `${Math.floor(age / 24)}d`}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-fade">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Dashboard</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Pipeline overview and action items</p>
      </div>

      {/* Top metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: bufferColor }}>{scripted.length}<span style={{ fontSize: 14, color: "var(--text-muted)" }}>/{bufferTarget}</span></div>
          <div style={labelStyle}>Scripted Buffer</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{runwayDays === 99 ? "∞" : `${runwayDays}d`} runway</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: "var(--text-primary)" }}>{deployedThisWeek}</div>
          <div style={labelStyle}>Deployed This Week</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: "var(--accent-light)" }}>{CUR} {totalWeekSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          <div style={labelStyle}>Week Spend</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: "var(--green)" }}>{avgRoas}x</div>
          <div style={labelStyle}>Avg ROAS (Live)</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span style={{ ...metricStyle, color: "var(--green)" }}>{winners}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>W</span>
            <span style={{ ...metricStyle, color: "var(--red)" }}>{losers}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>L</span>
          </div>
          <div style={labelStyle}>Win / Loss</div>
        </div>
      </div>

      {/* Action queues */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <QueueCard title="Ready to Deploy" items={ready} emptyText="No cards awaiting deploy" color="var(--green)" />
        <QueueCard title="Needs Learnings" items={analyzed} emptyText="No cards awaiting learnings" color="var(--accent-light)" />
        <QueueCard title="Live Ads" items={live} emptyText="No live ads" color="var(--green)" />
      </div>

      {/* Writing queues */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Your Writing Queues</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <QueueCard title="💡 Inbox" items={inbox} emptyText="No ideas captured" color="var(--text-muted)" />
        <QueueCard title="🔍 Researching" items={researching} emptyText="Nothing in research" color="var(--accent-light)" />
        <QueueCard title="✎ Drafting" items={drafting} emptyText="No scripts in progress" color="var(--accent-light)" />
      </div>
    </div>
  );
}
