import { useState, useMemo } from "react";

export default function ManagerDashboard({ ads, editors, editorProfiles, onOpenAd, slaConfig }) {
  const allAds = ads.filter(a => a.stage !== "killed");

  // Queues
  const scriptedForBrief = allAds.filter(a => a.stage === "scripted");
  const briefed = allAds.filter(a => a.stage === "briefed");
  const qaQueue = allAds.filter(a => a.stage === "qa");
  const readyQueue = allAds.filter(a => a.stage === "ready");
  const assigned = allAds.filter(a => a.stage === "assigned");
  const inEdit = allAds.filter(a => a.stage === "in_edit");
  const live = allAds.filter(a => a.stage === "live");

  // SLA breaches
  const getSlaHours = (stageId) => slaConfig?.[stageId] || null;
  const breached = allAds.filter(a => {
    const sla = getSlaHours(a.stage);
    if (!sla) return false;
    const entered = a.stage_entered_at ? new Date(a.stage_entered_at).getTime() : (a.stageEnteredAt || 0);
    return (Date.now() - entered) / (1000 * 60 * 60) > sla;
  });

  // Editor WIP
  const editorLoad = useMemo(() => {
    const load = {};
    editors.forEach(name => { load[name] = { assigned: 0, inEdit: 0, qa: 0, total: 0 }; });
    allAds.forEach(a => {
      if (!a.editor || !load[a.editor]) return;
      if (a.stage === "assigned") load[a.editor].assigned++;
      if (a.stage === "in_edit") load[a.editor].inEdit++;
      if (a.stage === "qa") load[a.editor].qa++;
      if (["assigned", "in_edit", "qa"].includes(a.stage)) load[a.editor].total++;
    });
    return load;
  }, [allAds, editors]);

  const cardStyle = { background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)", padding: "16px 18px" };
  const metricStyle = { fontSize: 28, fontWeight: 700, fontFamily: "var(--fm)", lineHeight: 1 };
  const labelStyle = { fontSize: 11, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" };

  const QueueCard = ({ title, items, emptyText, color, badge }) => (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "var(--fm)", background: color + "18", padding: "2px 8px", borderRadius: 8 }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
          {items.map(ad => {
            const age = ad.stage_entered_at ? Math.floor((Date.now() - new Date(ad.stage_entered_at).getTime()) / (1000 * 60 * 60)) : null;
            const sla = getSlaHours(ad.stage);
            const isBreached = sla && age && age > sla;
            return (
              <div key={ad.id} onClick={() => onOpenAd(ad)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: isBreached ? "rgba(239,68,68,0.04)" : "var(--bg-card)", border: `1px solid ${isBreached ? "rgba(239,68,68,0.15)" : "var(--border-light)"}` }}>
                {ad.priority && <div style={{ width: 6, height: 6, borderRadius: "50%", background: ad.priority === "P0" ? "#ef4444" : ad.priority === "P1" ? "#f59e0b" : "#6b7280", flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</span>
                {ad.editor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>@{ad.editor}</span>}
                {age !== null && <span style={{ fontSize: 10, color: isBreached ? "var(--red)" : "var(--text-muted)", fontWeight: isBreached ? 600 : 400, fontFamily: "var(--fm)", flexShrink: 0 }}>{age < 24 ? `${age}h` : `${Math.floor(age / 24)}d`}</span>}
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
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Creative Director Dashboard</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Production overview, queues, and team load</p>
      </div>

      {/* Top metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: "var(--accent-light)" }}>{briefed.length + scriptedForBrief.length}</div>
          <div style={labelStyle}>Needs Brief</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: "#3b82f6" }}>{qaQueue.length}</div>
          <div style={labelStyle}>QA Queue</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: inEdit.length > 0 ? "var(--yellow)" : "var(--text-muted)" }}>{inEdit.length}</div>
          <div style={labelStyle}>In Edit</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...metricStyle, color: breached.length > 0 ? "var(--red)" : "var(--green)" }}>{breached.length}</div>
          <div style={labelStyle}>SLA Breached</div>
        </div>
      </div>

      {/* Queues */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <QueueCard title="📋 Needs Brief" items={[...scriptedForBrief, ...briefed]} emptyText="All briefs done" color="var(--accent-light)" />
        <QueueCard title="◎ QA Review" items={qaQueue} emptyText="No cuts to review" color="#3b82f6" />
        <QueueCard title="✓ Ready to Deploy" items={readyQueue} emptyText="Nothing ready" color="var(--green)" />
      </div>

      {/* SLA Breaches */}
      {breached.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20, borderColor: "rgba(239,68,68,0.2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red)", marginBottom: 10 }}>SLA Breaches ({breached.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {breached.map(ad => {
              const age = ad.stage_entered_at ? Math.floor((Date.now() - new Date(ad.stage_entered_at).getTime()) / (1000 * 60 * 60)) : 0;
              const stageLabel = ad.stage.replace("_", " ");
              return (
                <div key={ad.id} onClick={() => onOpenAd(ad)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1 }}>{ad.name}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{stageLabel}</span>
                  <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 600, fontFamily: "var(--fm)" }}>{age < 24 ? `${age}h` : `${Math.floor(age / 24)}d`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Load */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Team Load</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 60px", gap: 8, padding: "6px 8px", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Editor</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "center" }}>Assigned</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "center" }}>In Edit</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "center" }}>QA</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "center" }}>Total</span>
          </div>
          {editors.map(name => {
            const load = editorLoad[name] || { assigned: 0, inEdit: 0, qa: 0, total: 0 };
            const overWip = load.inEdit > 2;
            return (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 60px", gap: 8, padding: "8px 8px", borderBottom: "1px solid var(--border-light)", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>{name[0]}</div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{name}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: load.assigned > 0 ? "var(--yellow)" : "var(--text-muted)", textAlign: "center", fontFamily: "var(--fm)" }}>{load.assigned}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: overWip ? "var(--red)" : load.inEdit > 0 ? "var(--text-primary)" : "var(--text-muted)", textAlign: "center", fontFamily: "var(--fm)" }}>{load.inEdit}{overWip ? " ⚠" : ""}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: load.qa > 0 ? "#3b82f6" : "var(--text-muted)", textAlign: "center", fontFamily: "var(--fm)" }}>{load.qa}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textAlign: "center", fontFamily: "var(--fm)" }}>{load.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
