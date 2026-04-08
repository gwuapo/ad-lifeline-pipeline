import { useState, useEffect, useMemo } from "react";
import { getPointTransactions, getDeliverableRatings } from "./supabaseData.js";

const STAGES = [
  { id: "pre", label: "Pre-Production", color: "#8b5cf6" },
  { id: "in", label: "In-Production", color: "#d97706" },
  { id: "post", label: "Post-Production", color: "#3b82f6" },
  { id: "live", label: "Live", color: "#10b981" },
];

export default function EditorHomePage({ ads, userName, setPage, activeWorkspaceId, session, myEditorProfile }) {
  const [pointTxns, setPointTxns] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [showWelcome, setShowWelcome] = useState(false);

  // Show welcome video popup once for new editors
  useEffect(() => {
    const key = `al_welcome_seen_${session?.user?.id || "anon"}`;
    if (!localStorage.getItem(key)) setShowWelcome(true);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    getPointTransactions(activeWorkspaceId, session?.user?.id).then(setPointTxns).catch(() => {});
    getDeliverableRatings(activeWorkspaceId).then(r => setRatings(r.filter(x => x.editor_name === userName))).catch(() => {});
  }, [activeWorkspaceId]);

  const myAds = useMemo(() => ads.filter(a => a.editor === userName), [ads, userName]);
  const activeAds = myAds.filter(a => a.stage !== "killed");
  const pointBalance = pointTxns.reduce((s, t) => s + (t.type === "earn" ? t.amount : -t.amount), 0);
  const avgRating = ratings.length > 0 ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) : null;

  // Pipeline stage counts for chart
  const stageCounts = useMemo(() => {
    const counts = {};
    STAGES.forEach(s => { counts[s.id] = 0; });
    activeAds.forEach(a => { if (counts[a.stage] !== undefined) counts[a.stage]++; });
    return counts;
  }, [activeAds]);
  const maxCount = Math.max(...Object.values(stageCounts), 1);

  // Activity feed: combine thread messages, notifications, point txns, revision requests
  const activityFeed = useMemo(() => {
    const items = [];

    myAds.forEach(ad => {
      // Thread messages (discussions)
      (ad.thread || []).forEach(msg => {
        if (msg.from === userName) return;
        items.push({
          type: "message",
          icon: "💬",
          title: msg.from,
          text: msg.text,
          ts: msg.ts,
          adName: ad.name,
          adId: ad.id,
          sortKey: parseTs(msg.ts),
        });
      });

      // Notifications on ads assigned to editor
      (ad.notifications || []).forEach(n => {
        items.push({
          type: "notification",
          icon: "🔔",
          title: "Notification",
          text: n.text,
          ts: n.ts,
          adName: ad.name,
          adId: ad.id,
          sortKey: parseTs(n.ts),
        });
      });

      // Revision requests
      (ad.revisionRequests || []).forEach(r => {
        items.push({
          type: "revision",
          icon: "🔄",
          title: "Revision Requested",
          text: r.notes || r.reason || "Please revise",
          ts: r.ts || r.date,
          adName: ad.name,
          adId: ad.id,
          sortKey: parseTs(r.ts || r.date),
        });
      });
    });

    // Point transactions
    pointTxns.forEach(t => {
      items.push({
        type: "points",
        icon: t.type === "earn" ? "⭐" : "🎁",
        title: t.type === "earn" ? `+${t.amount} Points` : `Redeemed ${t.amount} Points`,
        text: t.reason,
        ts: new Date(t.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        sortKey: new Date(t.created_at).getTime(),
      });
    });

    items.sort((a, b) => b.sortKey - a.sortKey);
    return items.slice(0, 30);
  }, [myAds, pointTxns, userName]);

  // Payment setup check
  const hasPayment = myEditorProfile?.payment_methods &&
    Object.keys(myEditorProfile.payment_methods).some(k =>
      Object.values(myEditorProfile.payment_methods[k] || {}).some(v => v)
    );

  // Upcoming deadlines
  const deadlines = useMemo(() => {
    return activeAds
      .filter(a => a.deadline)
      .map(a => ({ ...a, deadlineDate: new Date(a.deadline) }))
      .filter(a => a.deadlineDate >= new Date())
      .sort((a, b) => a.deadlineDate - b.deadlineDate)
      .slice(0, 5);
  }, [activeAds]);

  const dismissWelcome = () => {
    const key = `al_welcome_seen_${session?.user?.id || "anon"}`;
    localStorage.setItem(key, "1");
    setShowWelcome(false);
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 1100 }}>
      {/* ── WELCOME VIDEO POPUP ── */}
      {showWelcome && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={dismissWelcome}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 720, maxWidth: "92vw", background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>Welcome to Ad Lifeline, {userName}!</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Watch this quick tutorial to get started</div>
              </div>
              <button onClick={dismissWelcome} style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8,
                color: "var(--text-muted)", cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600,
              }}>Skip</button>
            </div>
            <div style={{ padding: "8px 24px 20px" }}>
              <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 10, overflow: "hidden", background: "#000" }}>
                <iframe
                  src="https://www.youtube.com/embed/B4BbRujb2i0?rel=0"
                  title="Welcome Tutorial"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                />
              </div>
            </div>
            <div style={{ padding: "0 24px 20px", textAlign: "center" }}>
              <button onClick={dismissWelcome} className="btn btn-primary" style={{ padding: "10px 32px", fontSize: 13 }}>
                Got it, let's go!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT SETUP BANNER ── */}
      {!hasPayment && (
        <div onClick={() => setPage("settings")} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", marginBottom: 16, borderRadius: 12, cursor: "pointer",
          background: "linear-gradient(135deg, #7c3aed22, #db277822)", border: "1px solid #7c3aed55",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>💳</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Set Up Payment</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Add your payment method to receive earnings</div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm">Set Up Payment &rarr;</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Welcome back, {userName?.split(" ")[0] || "Editor"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Here&apos;s what&apos;s happening with your ads.
        </p>
      </div>

      {/* ── STAT CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatCard label="Active Ads" value={activeAds.length} icon="📊" color="var(--accent-light)" />
        <StatCard label="Points Balance" value={`⭐ ${pointBalance}`} icon="" color="var(--green)" />
        <StatCard label="Avg Rating" value={avgRating ? `${avgRating.toFixed(1)}/5` : "—"} icon="⭐" color="#f59e0b" />
        <StatCard label="Total Completed" value={myAds.filter(a => a.stage === "killed" && a.finalApproved).length} icon="✓" color="var(--green)" />
      </div>

      {/* ── MAIN CONTENT: Chart + Activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        {/* LEFT: Pipeline chart + deadlines */}
        <div>
          {/* Pipeline Overview Chart */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Your Pipeline Overview</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", height: 180, padding: "0 10px" }}>
              {STAGES.map(s => {
                const count = stageCounts[s.id];
                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "var(--fm)" }}>{count}</span>
                    <div style={{
                      width: "100%", maxWidth: 60, borderRadius: "8px 8px 4px 4px",
                      background: `linear-gradient(180deg, ${s.color}, ${s.color}88)`,
                      height: Math.max(heightPct * 1.4, 8),
                      transition: "height 0.4s ease",
                    }} />
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.2 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Upcoming Deadlines</div>
            {deadlines.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>No upcoming deadlines.</div>
            ) : (
              deadlines.map(a => {
                const daysLeft = Math.ceil((a.deadlineDate - new Date()) / 86400000);
                const urgent = daysLeft <= 2;
                return (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {STAGES.find(s => s.id === a.stage)?.label || a.stage}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, fontFamily: "var(--fm)",
                      color: urgent ? "var(--red)" : "var(--text-secondary)",
                      padding: "2px 8px", borderRadius: 6,
                      background: urgent ? "var(--red-bg)" : "var(--bg-elevated)",
                    }}>
                      {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d left`}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Active Ads List */}
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Your Ads</div>
            {activeAds.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>No ads assigned to you yet.</div>
            ) : (
              activeAds.map(a => {
                const stg = STAGES.find(s => s.id === a.stage);
                return (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.color || "#888", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{stg?.label} · {a.drafts?.length || 0} drafts</div>
                      </div>
                    </div>
                    <span className="badge" style={{ background: stg?.color + "18", color: stg?.color, fontSize: 10 }}>{stg?.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Activity Feed */}
        <div className="card" style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Activity</div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{activityFeed.length} items</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", marginRight: -8, paddingRight: 8 }}>
            {activityFeed.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>No activity yet.</div>
            ) : (
              activityFeed.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < activityFeed.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                    background: item.type === "points" ? "#f59e0b15" : item.type === "revision" ? "var(--red-bg)" : item.type === "message" ? "var(--accent-bg)" : "var(--bg-elevated)",
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: item.type === "points" ? "#f59e0b" : item.type === "revision" ? "var(--red)" : "var(--text-primary)" }}>
                        {item.title}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0, fontFamily: "var(--fm)" }}>{item.ts}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.text}
                    </div>
                    {item.adName && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>on {item.adName}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "var(--fm)" }}>{value}</span>
      </div>
    </div>
  );
}

function parseTs(ts) {
  if (!ts) return 0;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
