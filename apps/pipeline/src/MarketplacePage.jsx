import { useState, useEffect, useMemo } from "react";
import { getPointTransactions, issuePoints, getMarketplaceRewards, createReward, updateReward, deleteReward, createRedemptionRequest, getRedemptionRequests, handleRedemptionRequest, getEditorPointBalance } from "./supabaseData.js";

const CUR = "SAR";

const POINT_CATEGORIES = [
  { id: "speed_25", label: "25%+ faster delivery", points: 5, group: "Speed" },
  { id: "speed_50", label: "50%+ faster delivery", points: 10, group: "Speed" },
  { id: "speed_75", label: "Same-day turnaround", points: 15, group: "Speed" },
  { id: "quality_5", label: "Quality 5/5 — exceptional", points: 10, group: "Quality" },
  { id: "quality_4", label: "Quality 4/5 — strong", points: 5, group: "Quality" },
  { id: "clean_submission", label: "Clean first submission", points: 5, group: "Process" },
  { id: "rush_job", label: "Rush job accepted + quality 4+", points: 10, group: "Process" },
  { id: "proactive_flag", label: "Proactively flagged delay", points: 3, group: "Process" },
  { id: "pipeline_week", label: "Pipeline followed all week", points: 5, group: "Streaks" },
  { id: "streak_5", label: "5 consecutive on-time 4+", points: 20, group: "Streaks" },
  { id: "streak_10", label: "10 consecutive on-time 4+", points: 50, group: "Streaks" },
  { id: "perfect_week", label: "Perfect week", points: 25, group: "Streaks" },
  { id: "perfect_month", label: "Perfect month", points: 100, group: "Streaks" },
  { id: "custom", label: "Custom amount", points: 0, group: "Custom" },
];

const DEFAULT_REWARDS = [
  { name: "Streaming subscription (1 month)", cost: 200, tier: 1, icon: "📺" },
  { name: "$25 gift card", cost: 300, tier: 1, icon: "🎁" },
  { name: "Creative Cloud (1 month)", cost: 400, tier: 1, icon: "🎨" },
  { name: "$50 cash bonus", cost: 500, tier: 1, icon: "💵" },
  { name: "Mouse or keyboard", cost: 750, tier: 2, icon: "🖱️" },
  { name: "$100 cash bonus", cost: 800, tier: 2, icon: "💰" },
  { name: "Headphones (~$150)", cost: 1000, tier: 2, icon: "🎧" },
  { name: "Monitor upgrade", cost: 2500, tier: 3, icon: "🖥️" },
  { name: "$500 cash bonus", cost: 3000, tier: 3, icon: "💎" },
  { name: "Graphics card", cost: 3500, tier: 3, icon: "⚡" },
  { name: "$1,000 cash bonus", cost: 5000, tier: 4, icon: "🏆" },
  { name: "MacBook Pro", cost: 7000, tier: 4, icon: "💻" },
];

const TIER_LABELS = { 1: "Quick Wins", 2: "Mid-Range", 3: "Premium", 4: "Aspirational" };
const TIER_COLORS = { 1: "var(--green)", 2: "var(--yellow)", 3: "var(--accent)", 4: "#f59e0b" };

export default function MarketplacePage({ activeWorkspaceId, role, session, userName, editors, editorProfiles }) {
  const [tab, setTab] = useState("store");
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issueModal, setIssueModal] = useState(null);
  const [rewardModal, setRewardModal] = useState(null);

  const isFounderOrAdmin = role === "founder" || role === "admin";
  const isManager = role === "manager";
  const canIssue = isFounderOrAdmin || isManager;
  const isEditor = role === "editor";

  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadData();
  }, [activeWorkspaceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, t, rd] = await Promise.all([
        getMarketplaceRewards(activeWorkspaceId),
        getPointTransactions(activeWorkspaceId),
        canIssue ? getRedemptionRequests(activeWorkspaceId) : Promise.resolve([]),
      ]);
      setRewards(r);
      setTransactions(t);
      setRedemptions(rd);
    } catch (e) { console.error("Load marketplace:", e); }
    setLoading(false);
  };

  const editorBalances = useMemo(() => {
    const balances = {};
    transactions.forEach(t => {
      if (!balances[t.editor_name]) balances[t.editor_name] = 0;
      balances[t.editor_name] += t.type === "earn" ? t.amount : -t.amount;
    });
    return balances;
  }, [transactions]);

  const myBalance = isEditor ? (editorBalances[userName] || 0) : 0;
  const myTransactions = isEditor ? transactions.filter(t => t.editor_name === userName) : transactions;

  const handleIssue = async (editorName, editorUserId, category, customAmount, customReason, adId) => {
    const cat = POINT_CATEGORIES.find(c => c.id === category);
    const amount = category === "custom" ? (parseInt(customAmount) || 0) : (cat?.points || 0);
    const reason = category === "custom" ? (customReason || "Custom points") : (cat?.label || category);
    if (amount <= 0) return;
    try {
      await issuePoints(activeWorkspaceId, {
        editorUserId, editorName, amount, category, reason,
        adId: adId || null, issuedBy: session?.user?.id, issuedByName: userName,
      });
      setIssueModal(null);
      loadData();
    } catch (e) { alert("Error issuing points: " + e.message); }
  };

  const handleRedeem = async (reward) => {
    if (myBalance < reward.cost) { alert("Not enough points"); return; }
    if (!confirm(`Redeem "${reward.name}" for ${reward.cost} points?`)) return;
    try {
      const members = await import("./supabaseData.js").then(m => m.getWorkspaceMembers(activeWorkspaceId));
      const me = members.find(m => m.user_id === session?.user?.id);
      await createRedemptionRequest(activeWorkspaceId, {
        editorUserId: session.user.id, editorName: userName,
        rewardId: reward.id, rewardName: reward.name, cost: reward.cost,
      });
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleRedemptionAction = async (req, status) => {
    try {
      await handleRedemptionRequest(req.id, status, session?.user?.id, null);
      loadData();
    } catch (e) { alert("Error: " + e.message); }
  };

  const seedRewards = async () => {
    for (const r of DEFAULT_REWARDS) {
      await createReward(activeWorkspaceId, r);
    }
    loadData();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading marketplace...</div>;

  const tabs = isEditor
    ? [["store", "🏪 Store"], ["points", "⭐ My Points"]]
    : [["store", "🏪 Store"], ["leaderboard", "🏆 Leaderboard"], ["issue", "➕ Issue Points"], ["requests", "📋 Requests"], ["manage", "⚙️ Manage"]];

  return (
    <div className="animate-fade" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Marketplace</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          {isEditor ? `Your balance: ⭐ ${myBalance} points` : "Points, rewards, and editor performance incentives."}
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-ghost"}`}>{label}</button>
        ))}
      </div>

      {/* ── STORE ── */}
      {tab === "store" && (
        <div>
          {isEditor && (
            <div className="card" style={{ marginBottom: 16, background: "linear-gradient(135deg, var(--accent-bg), var(--bg-card))", borderColor: "var(--accent-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-light)", textTransform: "uppercase", letterSpacing: 0.8 }}>Your Balance</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "var(--accent-light)", fontFamily: "var(--fm)" }}>⭐ {myBalance}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                  <div>Earn points for exceptional work</div>
                  <div>Speed, quality, and consistency</div>
                </div>
              </div>
            </div>
          )}
          {rewards.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏪</div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>No rewards in the store yet.</div>
              {canIssue && <button onClick={seedRewards} className="btn btn-primary btn-sm">Load Default Rewards</button>}
            </div>
          ) : (
            Object.entries(TIER_LABELS).map(([tier, label]) => {
              const tierRewards = rewards.filter(r => r.tier === parseInt(tier));
              if (tierRewards.length === 0) return null;
              return (
                <div key={tier} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TIER_COLORS[tier], marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Tier {tier} — {label}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                    {tierRewards.map(r => {
                      const canAfford = isEditor && myBalance >= r.cost;
                      return (
                        <div key={r.id} className="card" style={{ padding: "16px 14px", borderColor: canAfford ? TIER_COLORS[tier] + "40" : "var(--border-light)" }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>{r.icon || "🎁"}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{r.name}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: TIER_COLORS[tier], fontFamily: "var(--fm)", marginBottom: 8 }}>⭐ {r.cost}</div>
                          {isEditor && (
                            <button onClick={() => handleRedeem(r)} disabled={!canAfford} className={`btn btn-sm ${canAfford ? "btn-primary" : "btn-ghost"}`} style={{ width: "100%", opacity: canAfford ? 1 : 0.5 }}>
                              {canAfford ? "Redeem" : `Need ${r.cost - myBalance} more`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── EDITOR POINTS HISTORY ── */}
      {tab === "points" && isEditor && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Points History</div>
            {myTransactions.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No points earned yet. Keep delivering great work!</div>
            ) : (
              myTransactions.map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{t.reason}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{new Date(t.created_at).toLocaleDateString()} · {t.issued_by_name || "System"}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.type === "earn" ? "var(--green)" : "var(--red)", fontFamily: "var(--fm)" }}>
                    {t.type === "earn" ? "+" : "-"}{t.amount}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {tab === "leaderboard" && canIssue && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Editor Leaderboard</div>
          {Object.entries(editorBalances).sort(([,a], [,b]) => b - a).map(([name, bal], i) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i < 3 ? "#fff" : "var(--text-muted)" }}>{i + 1}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--accent-light)", fontFamily: "var(--fm)" }}>⭐ {bal}</span>
                <button onClick={() => setIssueModal({ editorName: name, editorUserId: null })} className="btn btn-ghost btn-xs">+ Issue</button>
              </div>
            </div>
          ))}
          {Object.keys(editorBalances).length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 20, textAlign: "center" }}>No points issued yet.</div>
          )}
        </div>
      )}

      {/* ── ISSUE POINTS ── */}
      {tab === "issue" && canIssue && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Issue Points to Editor</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {editors.map(name => (
                <button key={name} onClick={() => setIssueModal({ editorName: name, editorUserId: null })} className="card-flat" style={{ padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                  <div style={{ fontSize: 12, color: "var(--accent-light)", fontFamily: "var(--fm)" }}>⭐ {editorBalances[name] || 0}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Recent Transactions</div>
            {transactions.slice(0, 20).map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.editor_name}</span>
                  <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{t.reason}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: t.type === "earn" ? "var(--green)" : "var(--red)", fontWeight: 700, fontFamily: "var(--fm)" }}>
                    {t.type === "earn" ? "+" : "-"}{t.amount}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No transactions yet.</div>}
          </div>
        </div>
      )}

      {/* ── REDEMPTION REQUESTS ── */}
      {tab === "requests" && canIssue && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Redemption Requests</div>
          {redemptions.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 20, textAlign: "center" }}>No redemption requests yet.</div>
          ) : (
            redemptions.map(req => {
              const statusColor = { pending: "var(--yellow)", approved: "var(--accent)", fulfilled: "var(--green)", denied: "var(--red)" };
              return (
                <div key={req.id} className="card-flat" style={{ padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{req.editor_name} — {req.reward_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>⭐ {req.cost} points · {new Date(req.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="badge" style={{ background: statusColor[req.status] + "15", color: statusColor[req.status] }}>{req.status}</span>
                      {req.status === "pending" && (
                        <>
                          <button onClick={() => handleRedemptionAction(req, "approved")} className="btn btn-xs" style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)" }}>Approve</button>
                          <button onClick={() => handleRedemptionAction(req, "fulfilled")} className="btn btn-xs" style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>Fulfill</button>
                          <button onClick={() => handleRedemptionAction(req, "denied")} className="btn btn-xs" style={{ color: "var(--red)", border: "1px solid var(--red-border)" }}>Deny</button>
                        </>
                      )}
                      {req.status === "approved" && (
                        <button onClick={() => handleRedemptionAction(req, "fulfilled")} className="btn btn-xs" style={{ background: "var(--green-bg)", color: "var(--green)" }}>Mark Fulfilled</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MANAGE REWARDS ── */}
      {tab === "manage" && canIssue && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Reward Catalog</div>
              <div style={{ display: "flex", gap: 6 }}>
                {rewards.length === 0 && <button onClick={seedRewards} className="btn btn-ghost btn-sm">Load Defaults</button>}
                <button onClick={() => setRewardModal({ name: "", cost: "", tier: 1, icon: "🎁", description: "" })} className="btn btn-primary btn-sm">+ Add Reward</button>
              </div>
            </div>
            {rewards.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{r.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tier {r.tier} · ⭐ {r.cost}</div>
                  </div>
                </div>
                <button onClick={async () => { if (confirm("Delete this reward?")) { await deleteReward(r.id); loadData(); }}} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ISSUE MODAL ── */}
      {issueModal && (
        <IssuePointsModal
          editorName={issueModal.editorName}
          onClose={() => setIssueModal(null)}
          onIssue={handleIssue}
          editorProfiles={editorProfiles}
          activeWorkspaceId={activeWorkspaceId}
        />
      )}

      {/* ── ADD REWARD MODAL ── */}
      {rewardModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setRewardModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, background: "var(--bg-modal)", border: "1px solid var(--border)", borderRadius: 14, padding: "24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Add Reward</div>
            <label className="label" style={{ marginTop: 0 }}>Name</label>
            <input value={rewardModal.name} onChange={e => setRewardModal(p => ({ ...p, name: e.target.value }))} className="input" placeholder="e.g. $50 cash bonus" />
            <label className="label">Cost (points)</label>
            <input type="number" value={rewardModal.cost} onChange={e => setRewardModal(p => ({ ...p, cost: e.target.value }))} className="input" placeholder="500" />
            <label className="label">Tier</label>
            <select value={rewardModal.tier} onChange={e => setRewardModal(p => ({ ...p, tier: parseInt(e.target.value) }))} className="input">
              {Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>Tier {k} — {v}</option>)}
            </select>
            <label className="label">Icon (emoji)</label>
            <input value={rewardModal.icon} onChange={e => setRewardModal(p => ({ ...p, icon: e.target.value }))} className="input" placeholder="🎁" />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={async () => {
                if (!rewardModal.name || !rewardModal.cost) return;
                await createReward(activeWorkspaceId, { name: rewardModal.name, cost: parseInt(rewardModal.cost), tier: rewardModal.tier, icon: rewardModal.icon });
                setRewardModal(null); loadData();
              }} className="btn btn-primary btn-sm">Save</button>
              <button onClick={() => setRewardModal(null)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IssuePointsModal({ editorName, onClose, onIssue, editorProfiles, activeWorkspaceId }) {
  const [category, setCategory] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [issuing, setIssuing] = useState(false);

  const resolveUserId = async () => {
    const profile = editorProfiles?.[editorName];
    if (profile?.user_id) return profile.user_id;
    try {
      const { getWorkspaceMembers } = await import("./supabaseData.js");
      const members = await getWorkspaceMembers(activeWorkspaceId);
      const member = members.find(m => m.editor_name === editorName);
      return member?.user_id || null;
    } catch { return null; }
  };

  const handleSubmit = async () => {
    if (!category) return;
    setIssuing(true);
    const userId = await resolveUserId();
    if (!userId) { alert("Could not resolve editor's user ID"); setIssuing(false); return; }
    await onIssue(editorName, userId, category, customAmount, customReason, null);
    setIssuing(false);
  };

  const groups = {};
  POINT_CATEGORIES.forEach(c => { if (!groups[c.group]) groups[c.group] = []; groups[c.group].push(c); });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "40px 20px", overflow: "auto" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxHeight: "calc(100vh - 80px)", overflowY: "auto", background: "var(--bg-modal)", border: "1px solid var(--border)", borderRadius: 14, padding: "24px 28px", margin: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Issue Points to {editorName}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Select a reason and the points will be awarded automatically.</div>

        {Object.entries(groups).map(([group, cats]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{group}</div>
            {cats.map(c => (
              <div key={c.id} onClick={() => setCategory(c.id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                  background: category === c.id ? "var(--accent-bg)" : "transparent", border: category === c.id ? "1px solid var(--accent-border)" : "1px solid transparent" }}>
                <span style={{ fontSize: 13, color: category === c.id ? "var(--accent-light)" : "var(--text-secondary)" }}>{c.label}</span>
                {c.points > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>+{c.points}</span>}
              </div>
            ))}
          </div>
        ))}

        {category === "custom" && (
          <div style={{ marginTop: 8 }}>
            <label className="label">Points amount</label>
            <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} className="input" placeholder="e.g. 15" min="1" />
            <label className="label">Reason</label>
            <input value={customReason} onChange={e => setCustomReason(e.target.value)} className="input" placeholder="Why are you awarding these points?" />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={handleSubmit} disabled={!category || issuing} className="btn btn-primary btn-sm">
            {issuing ? "Issuing..." : "Issue Points"}
          </button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
