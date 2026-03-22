import { useState, useEffect } from "react";
import { useTheme } from "./ThemeContext.jsx";
import { getTripleWhaleConfig, setTripleWhaleConfig, validateApiKey } from "./tripleWhale.js";
import { getTikTokConfig, setTikTokConfig, isTikTokConfigured } from "./tiktokComments.js";
import { getMetaConfig, setMetaConfig, isMetaConfigured } from "./metaComments.js";
import { getApiKey, setApiKey, isConfigured, getAnalysisPrompt, setAnalysisPrompt, resetAnalysisPrompt, DEFAULT_ANALYSIS_PROMPT, getSelectedModel, setSelectedModel, GEMINI_MODELS, CLAUDE_MODELS, OPENAI_MODELS, getProxyUrl, setProxyUrl, getResearchModelAssignment, setResearchModelAssignment } from "./apiKeys.js";
import { RESEARCH_STEPS } from "./researchEngine.js";
import { supabase } from "./supabase.js";
import { addMemberToWorkspace, getWorkspaceMembers, removeMemberFromWorkspace, getWorkspaceInvites, sendInvite, revokeInvite } from "./supabaseData.js";

const SETTINGS_TABS = [
  { id: "profile", icon: "👤", label: "Profile" },
  { id: "team", icon: "👥", label: "Team" },
  { id: "integrations", icon: "🔌", label: "Integrations" },
  { id: "pipeline", icon: "⚙", label: "Pipeline" },
];

const ROLE_LABELS = { founder: "Founder", strategist: "Creative Strategist", editor: "Editor" };
const ROLE_COLORS = { founder: "var(--accent-light)", strategist: "var(--green)", editor: "var(--yellow)" };
const ROLE_BG = { founder: "var(--accent-bg)", strategist: "var(--green-bg)", editor: "var(--yellow-bg)" };

export default function SettingsPage({ thresholds, setThresholds, activeWorkspaceId, workspaces, session, userName }) {
  const [tab, setTab] = useState("profile");

  return (
    <div className="animate-fade" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Settings</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
        {SETTINGS_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer",
              background: "none", border: "none", borderBottom: tab === t.id ? "2px solid var(--accent-light)" : "2px solid transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              display: "flex", alignItems: "center", gap: 6, transition: "all var(--transition)",
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab session={session} userName={userName} />}
      {tab === "team" && <TeamTab activeWorkspaceId={activeWorkspaceId} workspaces={workspaces} session={session} />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "pipeline" && <PipelineTab thresholds={thresholds} setThresholds={setThresholds} />}
    </div>
  );
}

// ════════════════════════════════════════════════
// PROFILE TAB
// ════════════════════════════════════════════════

function ProfileTab({ session, userName }) {
  const { isDark, setTheme: setThemeMode } = useTheme();
  const meta = session?.user?.user_metadata || {};
  const [displayName, setDisplayName] = useState(meta.display_name || userName || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error("Save profile:", e); }
    setSaving(false);
  };

  return (
    <div>
      {/* Profile photo + info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "var(--radius-full)",
            background: "var(--accent-bg)", border: "2px solid var(--accent-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "var(--accent-light)", flexShrink: 0,
          }}>
            {(displayName || "U")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{displayName || "User"}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{session?.user?.email || ""}</div>
            <div style={{ fontSize: 11, color: ROLE_COLORS[meta.role] || "var(--text-muted)", marginTop: 2, fontWeight: 600 }}>
              {ROLE_LABELS[meta.role] || meta.role || "Founder"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="label" style={{ marginTop: 0 }}>Display Name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="input" placeholder="Your name" />
          </div>
          <div>
            <label className="label" style={{ marginTop: 0 }}>Email</label>
            <input value={session?.user?.email || ""} disabled className="input" style={{ opacity: 0.6 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          <button onClick={saveProfile} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* Appearance */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Appearance</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["light", "dark"].map(m => (
            <button key={m} onClick={() => setThemeMode(m)} className="btn btn-ghost" style={{
              flex: 1, padding: "14px 16px",
              background: (isDark ? "dark" : "light") === m ? "var(--accent-bg)" : "var(--bg-elevated)",
              borderColor: (isDark ? "dark" : "light") === m ? "var(--accent-border)" : "var(--border)",
              color: (isDark ? "dark" : "light") === m ? "var(--accent-light)" : "var(--text-secondary)",
              justifyContent: "flex-start",
            }}>
              <span style={{ fontSize: 18, marginRight: 4 }}>{m === "light" ? "☀️" : "🌙"}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m === "light" ? "Light" : "Dark"}</div>
                <div style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 400 }}>{m === "light" ? "Clean and bright" : "Easy on the eyes"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Account actions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Account Actions</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => supabase.auth.resetPasswordForEmail(session?.user?.email)} className="btn btn-ghost btn-sm">Reset Password</button>
          <button onClick={() => supabase.auth.signOut()} className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// TEAM TAB
// ════════════════════════════════════════════════

function TeamTab({ activeWorkspaceId, workspaces, session }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const activeWs = workspaces?.find(w => w.id === activeWorkspaceId);
  const currentUserId = session?.user?.id;

  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadTeam();
  }, [activeWorkspaceId]);

  const loadTeam = async () => {
    setLoading(true);
    try {
      const [membersData, invitesData] = await Promise.all([
        getWorkspaceMembers(activeWorkspaceId),
        getWorkspaceInvites(activeWorkspaceId).catch(() => []),
      ]);
      const enriched = await Promise.all(membersData.map(async (m) => {
        let name = m.editor_name || "";
        if (!name) {
          try {
            const { data: profile } = await supabase.from("editor_profiles").select("display_name").eq("user_id", m.user_id).maybeSingle();
            name = profile?.display_name || "";
          } catch {}
        }
        if (!name) {
          try {
            const { data: rpcName } = await supabase.rpc("get_display_name_by_user_id", { uid: m.user_id });
            name = rpcName || "";
          } catch {}
        }
        if (!name && m.user_id === currentUserId) {
          name = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0] || "";
        }
        return { ...m, display_name: name || m.user_id?.slice(0, 8) + "..." };
      }));
      setMembers(enriched);
      // Only show pending invites (not ones already accepted)
      setInvites(invitesData.filter(i => i.status === "pending"));
    } catch (e) { console.error("Load team:", e); }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!email.trim() || !activeWorkspaceId) return;
    setInviting(true); setResult(null);
    try {
      const data = await sendInvite(activeWorkspaceId, email.trim(), inviteRole);
      setResult({ ok: true, msg: data.message || "Invite sent!" });
      setEmail("");
      loadTeam();
    } catch (e) {
      const msg = e.message || "Failed to send invite";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setResult({ ok: false, msg: "This email already has a pending invite. Try revoking the old invite first, then re-invite." });
      } else {
        setResult({ ok: false, msg });
      }
    }
    setInviting(false);
    setTimeout(() => setResult(null), 6000);
  };

  const handleRemove = async (member) => {
    if (member.user_id === currentUserId) return;
    setRemoving(member.user_id);
    try {
      await removeMemberFromWorkspace(activeWorkspaceId, member.user_id);
      setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
    } catch (e) { console.error("Remove member:", e); }
    setRemoving(null);
  };

  const handleRevoke = async (invite) => {
    setRevoking(invite.id);
    try {
      await revokeInvite(invite.id);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (e) { console.error("Revoke invite:", e); }
    setRevoking(null);
  };

  const totalCount = members.length + invites.length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>Team Members</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {totalCount} member{totalCount !== 1 ? "s" : ""}{invites.length > 0 ? ` (${invites.length} pending)` : ""} in <strong style={{ color: "var(--text-secondary)" }}>{activeWs?.name || "workspace"}</strong>
            </div>
          </div>
          <button onClick={loadTeam} className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading team...</div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {/* Active members */}
            {members.map(m => (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "var(--radius-full)",
                  background: ROLE_BG[m.role] || "var(--bg-elevated)", border: `1.5px solid ${ROLE_COLORS[m.role] || "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: ROLE_COLORS[m.role] || "var(--text-muted)", flexShrink: 0,
                }}>
                  {(m.display_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    {m.display_name}
                    {m.user_id === currentUserId && <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>(you)</span>}
                  </div>
                </div>
                <span className="badge" style={{ background: ROLE_BG[m.role], color: ROLE_COLORS[m.role], fontWeight: 600 }}>
                  {ROLE_LABELS[m.role] || m.role}
                </span>
                {m.user_id !== currentUserId && (
                  <button onClick={() => handleRemove(m)} disabled={removing === m.user_id}
                    className="btn btn-ghost btn-xs" style={{ color: "var(--red)", fontSize: 11, padding: "4px 8px" }}>
                    {removing === m.user_id ? "..." : "Remove"}
                  </button>
                )}
              </div>
            ))}

            {/* Pending invites */}
            {invites.map(inv => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-light)", opacity: 0.7 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "var(--radius-full)",
                  background: "var(--bg-elevated)", border: "1.5px dashed var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: "var(--text-muted)", flexShrink: 0,
                }}>
                  {inv.email[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{inv.email}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Invited {new Date(inv.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}>
                  Pending -- {ROLE_LABELS[inv.role] || inv.role}
                </span>
                <button onClick={() => handleRevoke(inv)} disabled={revoking === inv.id}
                  className="btn btn-ghost btn-xs" style={{ color: "var(--red)", fontSize: 11, padding: "4px 8px" }}>
                  {revoking === inv.id ? "..." : "Revoke"}
                </button>
              </div>
            ))}

            {members.length === 0 && invites.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No members yet</div>
            )}
          </div>
        )}

        {/* Invite form */}
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Invite new member</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="label" style={{ marginTop: 0 }}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleInvite()} className="input" placeholder="name@company.com" />
            </div>
            <div>
              <label className="label" style={{ marginTop: 0 }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="input" style={{ cursor: "pointer" }}>
                <option value="founder">Founder</option>
                <option value="strategist">Creative Strategist</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <button onClick={handleInvite} disabled={inviting || !email.trim()} className="btn btn-primary btn-sm" style={{ marginBottom: 1 }}>
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </div>
          {result && (
            <div style={{
              padding: "8px 12px", borderRadius: "var(--radius-md)", marginTop: 10, fontSize: 12.5, fontWeight: 500,
              background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
              border: `1px solid ${result.ok ? "var(--green-border)" : "var(--red-border)"}`,
              color: result.ok ? "var(--green-light)" : "var(--red-light)",
            }}>
              {result.ok ? "✓" : "!"} {result.msg}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            If they don't have an account yet, they'll receive a signup email and be added to your workspace automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// INTEGRATIONS TAB
// ════════════════════════════════════════════════

function IntegrationsTab() {
  const twConf = getTripleWhaleConfig();
  const [twKey, setTwKey] = useState(twConf.apiKey);
  const [twShop, setTwShop] = useState(twConf.shopDomain);
  const [twStatus, setTwStatus] = useState(null);
  const [twLoading, setTwLoading] = useState(false);

  const ttConf = getTikTokConfig();
  const [ttToken, setTtToken] = useState(ttConf.accessToken);
  const [ttAdvId, setTtAdvId] = useState(ttConf.advertiserId);
  const [ttSaved, setTtSaved] = useState(false);

  const metaConf = getMetaConfig();
  const [metaToken, setMetaToken] = useState(metaConf.accessToken);
  const [metaAdAcct, setMetaAdAcct] = useState(metaConf.adAccountId);
  const [metaSaved, setMetaSaved] = useState(false);

  const [manusKey, setManusKey] = useState(localStorage.getItem("al_manus_key") || "");
  const [manusSaved, setManusSaved] = useState(false);

  const [claudeKey, setClaudeKey] = useState(getApiKey("claude"));
  const [geminiKey, setGeminiKey] = useState(getApiKey("gemini"));
  const [openaiKey, setOpenaiKey] = useState(getApiKey("openai"));
  const [apifyKey, setApifyKey] = useState(getApiKey("apify"));
  const [keySaved, setKeySaved] = useState(null);
  const [claudeModel, setClaudeModel] = useState(getSelectedModel("claude"));
  const [geminiModel, setGeminiModel] = useState(getSelectedModel("gemini"));
  const [openaiModel, setOpenaiModel] = useState(getSelectedModel("openai"));
  const [proxyUrl, setProxyUrlState] = useState(getProxyUrl());

  const saveKey = (service, value) => { setApiKey(service, value.trim()); setKeySaved(service); setTimeout(() => setKeySaved(null), 2000); };
  const keyStatus = (service) => isConfigured(service);

  const saveTw = async () => {
    setTripleWhaleConfig(twKey.trim(), twShop.trim()); setTwStatus(null);
    if (twKey.trim()) {
      setTwLoading(true);
      try { await validateApiKey(); setTwStatus({ ok: true, msg: "Connected" }); } catch (e) { setTwStatus({ ok: false, msg: e.message }); }
      setTwLoading(false);
    }
  };

  const IntCard = ({ title, status, statusOk, children }) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>{title}</div>
        <span className={`badge ${statusOk ? "badge-green" : "badge-red"}`}>{status}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <IntCard title="Triple Whale (Metrics)" statusOk={!!twConf.apiKey} status={twConf.apiKey ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Pull ad-level ROAS, CPA, spend, conversions from Triple Whale.</p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={twKey} onChange={e => setTwKey(e.target.value)} className="input" placeholder="tw_api_..." />
        <label className="label">Shop Domain</label>
        <input value={twShop} onChange={e => setTwShop(e.target.value)} className="input" placeholder="your-store.myshopify.com" />
        {twStatus && <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", marginTop: 10, fontSize: 12.5, background: twStatus.ok ? "var(--green-bg)" : "var(--red-bg)", border: `1px solid ${twStatus.ok ? "var(--green-border)" : "var(--red-border)"}`, color: twStatus.ok ? "var(--green-light)" : "var(--red-light)" }}>{twStatus.ok ? "✓" : "✕"} {twStatus.msg}</div>}
        <button onClick={saveTw} disabled={twLoading} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>{twLoading ? "Validating..." : "Save & Test"}</button>
      </IntCard>

      <IntCard title="Gemini (Google AI)" statusOk={keyStatus("gemini")} status={keyStatus("gemini") ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Multimodal video analysis. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Get key</a></p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="input" placeholder="AIza..." />
        <label className="label">Model</label>
        <select value={geminiModel} onChange={e => { setGeminiModel(e.target.value); setSelectedModel("gemini", e.target.value); }} className="input" style={{ cursor: "pointer" }}>{GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("gemini", geminiKey)} className="btn btn-ghost btn-sm">Save Key</button>
          {keySaved === "gemini" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
        <div style={{ borderTop: "1px solid var(--border-light)", marginTop: 14, paddingTop: 14 }}>
          <label className="label" style={{ marginTop: 0 }}>Upload Proxy URL <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(videos over 20MB)</span></label>
          <input value={proxyUrl} onChange={e => { setProxyUrlState(e.target.value); setProxyUrl(e.target.value.trim()); }} className="input" placeholder="https://gemini-upload-proxy.workers.dev" />
        </div>
      </IntCard>

      <IntCard title="Claude (Anthropic)" statusOk={keyStatus("claude")} status={keyStatus("claude") ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Text-based ad analysis. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Get key</a></p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)} className="input" placeholder="sk-ant-..." />
        <label className="label">Model</label>
        <select value={claudeModel} onChange={e => { setClaudeModel(e.target.value); setSelectedModel("claude", e.target.value); }} className="input" style={{ cursor: "pointer" }}>{CLAUDE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("claude", claudeKey)} className="btn btn-ghost btn-sm">Save Key</button>
          {keySaved === "claude" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>

      <IntCard title="OpenAI (GPT-4o)" statusOk={keyStatus("openai")} status={keyStatus("openai") ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Psychographic research. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Get key</a></p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} className="input" placeholder="sk-..." />
        <label className="label">Model</label>
        <select value={openaiModel} onChange={e => { setOpenaiModel(e.target.value); setSelectedModel("openai", e.target.value); }} className="input" style={{ cursor: "pointer" }}>{OPENAI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("openai", openaiKey)} className="btn btn-ghost btn-sm">Save Key</button>
          {keySaved === "openai" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>

      <IntCard title="TikTok Business API (Ad Comments)" statusOk={isTikTokConfigured()} status={isTikTokConfigured() ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Pulls ad comments including hidden ones. <a href="https://business-api.tiktok.com/portal" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Setup</a></p>
        <label className="label" style={{ marginTop: 0 }}>Access Token</label>
        <input type="password" value={ttToken} onChange={e => setTtToken(e.target.value)} className="input" placeholder="Long-lived access token" />
        <label className="label">Advertiser ID</label>
        <input value={ttAdvId} onChange={e => setTtAdvId(e.target.value)} className="input" placeholder="e.g. 7123456789012345678" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => { setTikTokConfig(ttToken.trim(), ttAdvId.trim()); setTtSaved(true); setTimeout(() => setTtSaved(false), 2000); }} className="btn btn-ghost btn-sm">Save</button>
          {ttSaved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>

      <IntCard title="Meta Graph API (FB/IG Comments)" statusOk={isMetaConfigured()} status={isMetaConfigured() ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Facebook/Instagram ad comments. <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Graph Explorer</a></p>
        <label className="label" style={{ marginTop: 0 }}>Access Token</label>
        <input type="password" value={metaToken} onChange={e => setMetaToken(e.target.value)} className="input" placeholder="Page or User access token" />
        <label className="label">Ad Account ID</label>
        <input value={metaAdAcct} onChange={e => setMetaAdAcct(e.target.value)} className="input" placeholder="e.g. act_123456789" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => { setMetaConfig(metaToken.trim(), metaAdAcct.trim()); setMetaSaved(true); setTimeout(() => setMetaSaved(false), 2000); }} className="btn btn-ghost btn-sm">Save</button>
          {metaSaved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>

      <IntCard title="Apify" statusOk={keyStatus("apify")} status={keyStatus("apify") ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Legacy fallback for public TikTok comments.</p>
        <label className="label" style={{ marginTop: 0 }}>API Token</label>
        <input type="password" value={apifyKey} onChange={e => setApifyKey(e.target.value)} className="input" placeholder="apify_api_..." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("apify", apifyKey)} className="btn btn-ghost btn-sm">Save Token</button>
          {keySaved === "apify" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>

      <IntCard title="Manus (Page Builder)" statusOk={!!manusKey.trim()} status={manusKey.trim() ? "Connected" : "Not configured"}>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Build landing pages from approved copy in the Landing Page Builder.</p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={manusKey} onChange={e => setManusKey(e.target.value)} className="input" placeholder="manus_..." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => { localStorage.setItem("al_manus_key", manusKey.trim()); setManusSaved(true); setTimeout(() => setManusSaved(false), 2000); }} className="btn btn-ghost btn-sm">Save Key</button>
          {manusSaved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </IntCard>
    </div>
  );
}

// ════════════════════════════════════════════════
// PIPELINE TAB
// ════════════════════════════════════════════════

function PipelineTab({ thresholds, setThresholds }) {
  const [g, setG] = useState(thresholds.green);
  const [y, setY] = useState(thresholds.yellow);
  const [saved, setSaved] = useState(false);
  const [prompt, setPrompt] = useState(getAnalysisPrompt());
  const [promptSaved, setPromptSaved] = useState(false);

  const saveThresholds = () => { setThresholds({ green: g, yellow: y }); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div>
      {/* ROAS Thresholds */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">ROAS Thresholds</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 14px" }}>Ads auto-classify based on latest ROAS from Triple Whale data. Higher ROAS = better.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="label" style={{ marginTop: 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green)", marginRight: 5 }} />Green (Winner) &ge;
            </label>
            <input type="number" step="0.1" value={g} onChange={e => setG(+e.target.value)} className="input" placeholder="e.g. 2.0" />
          </div>
          <div>
            <label className="label" style={{ marginTop: 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--yellow)", marginRight: 5 }} />Yellow (Medium) &ge;
            </label>
            <input type="number" step="0.1" value={y} onChange={e => setY(+e.target.value)} className="input" placeholder="e.g. 1.0" />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: "8px 0 14px" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)", marginRight: 5 }} />Red (Losing) = below yellow
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={saveThresholds} className="btn btn-primary btn-sm">Save Thresholds</button>
          {saved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* Research Pipeline Models */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Research Pipeline -- Model Assignment</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>Assign which AI model runs each research step.</p>
        {RESEARCH_STEPS.filter(s => !s.id.startsWith("psychographic_") || s.id === "psychographic_summary").map(step => (
          <div key={step.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-light)" }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{step.label}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>{step.description}</span>
            </div>
            <select value={getResearchModelAssignment(step.id)} onChange={e => setResearchModelAssignment(step.id, e.target.value)} className="input" style={{ width: 140, cursor: "pointer", fontSize: 11 }}>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
              <option value="openai">GPT-4o</option>
            </select>
          </div>
        ))}
      </div>

      {/* Analysis Prompt */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Analysis Prompt</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Customize the AI analysis prompt. Use <code style={{ background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: 4, fontSize: 11.5, color: "var(--accent-light)" }}>{"{{AD_DATA}}"}</code> as placeholder.
        </p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="input" rows={10} style={{ fontFamily: "var(--fm)", fontSize: 11.5, lineHeight: 1.6 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <button onClick={() => { setAnalysisPrompt(prompt); setPromptSaved(true); setTimeout(() => setPromptSaved(false), 2000); }} className="btn btn-primary btn-sm">Save Prompt</button>
          <button onClick={() => { const d = resetAnalysisPrompt(); setPrompt(d); setPromptSaved(true); setTimeout(() => setPromptSaved(false), 2000); }} className="btn btn-ghost btn-sm">Reset to Default</button>
          {promptSaved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}
