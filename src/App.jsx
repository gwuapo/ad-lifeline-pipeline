import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import { isTripleWhaleConfigured, setTripleWhaleConfig, getTripleWhaleConfig, validateApiKey, fetchAdSetMetrics, matchMetricsToAds, startAutoSync, stopAutoSync, isAutoSyncRunning, getAutoSyncIntervalMinutes } from "./tripleWhale.js";
import { getApiKey, isConfigured, getAnalysisPrompt, getSelectedModel, isProxyConfigured } from "./apiKeys.js";
import { isApifyConfigured, scrapeTikTokComments } from "./apify.js";
import { isTikTokConfigured, fetchAllAdComments, classifyCommentSentiment, startCommentAutoSync, stopCommentAutoSync } from "./tiktokComments.js";
import { isMetaConfigured, fetchAllMetaAdComments, classifyMetaCommentSentiment } from "./metaComments.js";
import { analyzeWinner, formatLearningsForContext } from "./flywheel.js";
import { fetchWorkspaceLearnings, saveWorkspaceLearningsBatch, fetchStrategyData } from "./supabaseData.js";
import { isGeminiConfigured, prepareVideoFile, analyzeAdWithVideo, analyzeAdTextOnly } from "./gemini.js";
import Sidebar from "./Sidebar.jsx";
import SettingsPage from "./SettingsPage.jsx";
import NotificationBell from "./NotificationBell.jsx";
import StrategyPage from "./StrategyPage.jsx";
import CommissionDashboard from "./CommissionDashboard.jsx";
import SplitTestPage from "./SplitTestPage.jsx";
import AudioRecordingPage from "./AudioRecordingPage.jsx";
import AdCopyPage from "./AdCopyPage.jsx";
import LandingPageBuilder from "./LandingPageBuilder.jsx";
import { fetchAds, createAd as dbCreateAd, updateAd as dbUpdateAd, subscribeToAds, getWorkspaceSettings, saveWorkspaceSettings, getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace, fetchAllEditorProfiles, fetchEditorProfile, upsertEditorProfile, createNotification, resolveUserIdByName, getWorkspaceMemberNames, createPresenceChannel } from "./supabaseData.js";

// ════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════

const STAGES = [
  { id: "pre", label: "Pre-Production", icon: "✎", color: "#8b5cf6", desc: "Script + brief finalized", exitLabel: "Complete all checklist items" },
  { id: "in", label: "In-Production", icon: "⚡", color: "#d97706", desc: "Editor working on deliverable", exitLabel: "Complete all checklist items" },
  { id: "post", label: "Post-Production", icon: "◎", color: "#3b82f6", desc: "Review, revisions, approve", exitLabel: "Complete all checklist items" },
  { id: "live", label: "Live", icon: "▶", color: "#10b981", desc: "Running — tracking metrics", exitLabel: "CPA verdict" },
  { id: "killed", label: "Killed", icon: "✕", color: "#ef4444", desc: "Archived", exitLabel: "" },
];

const STAGE_CHECKLIST = {
  pre: [
    { key: "idea", label: "Idea finalized", role: "strategist" },
    { key: "hooks", label: "Hooks written", role: "strategist" },
    { key: "leads", label: "Leads written", role: "strategist" },
    { key: "script", label: "Script completed", role: "strategist" },
    { key: "ad_brief", label: "Ad brief finalized", role: "strategist" },
    { key: "vo_brief", label: "Voice over brief ready", role: "strategist" },
  ],
  in: [
    { key: "vo_submitted", label: "Voice over submitted", role: "editor" },
    { key: "video_submitted", label: "Video submitted", role: "editor" },
    { key: "hook_visuals", label: "Hook visuals done", role: "editor" },
  ],
  post: [
    { key: "vo_approved", label: "Voice over approved", role: "founder" },
    { key: "video_approved", label: "Video approved", role: "founder" },
    { key: "final_greenlit", label: "Final greenlit for launch", role: "founder" },
  ],
  live: [
    { key: "ad_ids_matched", label: "Ad IDs auto-matched with Triple Whale", role: "system" },
    { key: "data_tracking", label: "Data tracking confirmed", role: "system" },
  ],
};

function getChecklistProgress(ad, stage) {
  const items = STAGE_CHECKLIST[stage] || [];
  if (items.length === 0) return { total: 0, done: 0, pct: 100 };
  const done = items.filter(i => ad.checklist?.[i.key]?.done).length;
  return { total: items.length, done, pct: Math.round((done / items.length) * 100) };
}

function getStaleItems(ad, stage) {
  const items = STAGE_CHECKLIST[stage] || [];
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  const staleItems = [];
  const stageEnteredAt = ad.stageEnteredAt || now;
  for (const item of items) {
    if (ad.checklist?.[item.key]?.done) continue;
    const elapsed = now - stageEnteredAt;
    if (elapsed > TWO_DAYS) {
      const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
      staleItems.push({ ...item, daysOverdue: days });
    }
  }
  return staleItems;
}
const SO = ["pre", "in", "post", "live"];
const AD_TYPES = ["VSL", "Video Ad", "UGC", "Image Ad", "Advertorial", "Listicle"];
const DEFAULT_EDITORS = [];

const LT = ["hook_pattern", "proof_structure", "angle_theme", "pacing", "visual_style", "objection_handling"];
const VT = [
  { id: "hook", label: "Hook Test", desc: "Same body, different opening" },
  { id: "lead", label: "Lead Test", desc: "Different lead section" },
  { id: "prelander", label: "Pre-Lander vs Direct", desc: "Listicle/quiz before VSL" },
  { id: "format", label: "Format Test", desc: "Advertorial vs quiz vs PDP" },
  { id: "pacing", label: "Pacing Test", desc: "Different editing rhythm" },
  { id: "proof", label: "Proof Block", desc: "Different proof arrangement" },
];

const DT = { green: 2.0, yellow: 1.0 }; // ROAS thresholds: >= green = winner, >= yellow = medium, < yellow = losing
const CL = (roas, t) => roas == null ? "none" : roas >= t.green ? "green" : roas >= t.yellow ? "yellow" : "red";
const CS = {
  green: { l: "Winner", c: "var(--green)", bg: "var(--green-bg)" },
  yellow: { l: "Medium", c: "var(--yellow)", bg: "var(--yellow-bg)" },
  red: { l: "Losing", c: "var(--red)", bg: "var(--red-bg)" },
  none: { l: "—", c: "var(--text-tertiary)", bg: "transparent" },
};

const CUR = "SAR";

const CHANNELS = [
  { id: "meta", label: "Meta", color: "#3b82f6", twId: "facebook-ads" },
  { id: "tiktok", label: "TikTok", color: "#e2e8f0", twId: "tiktok-ads" },
  { id: "snapchat", label: "Snapchat", color: "#facc15", twId: "snapchat-ads" },
  { id: "applovin", label: "AppLovin", color: "#f97316", twId: "applovin" },
];
const emptyChIds = () => ({ meta: "", tiktok: "", snapchat: "", applovin: "" });
const emptyChMetrics = () => ({ meta: [], tiktok: [], snapchat: [], applovin: [] });
const hasAnyChId = (ch) => ch && Object.values(ch).some(v => v && v.trim());

let _id = 50;
const uid = () => ++_id;
const lm = (a) => a.metrics?.length ? a.metrics[a.metrics.length - 1] : null;
const fd = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const od = (d) => d ? new Date(d) < new Date("2026-02-12") : false;
const gd = (a, t) => { let c = 0; for (let i = a.metrics.length - 1; i >= 0; i--) { const r = a.metrics[i].roas ?? 0; if (r >= t.green) c++; else break; } return c; };
const tm = (a) => {
  const m = a.metrics; if (!m.length) return null;
  return { spend: m.reduce((s, x) => s + x.spend, 0), conv: m.reduce((s, x) => s + x.conv, 0),
    ac: +(m.reduce((s, x) => s + x.cpa, 0) / m.length).toFixed(2), lc: m[m.length - 1].cpa,
    at: +(m.reduce((s, x) => s + x.ctr, 0) / m.length).toFixed(1), am: +(m.reduce((s, x) => s + x.cpm, 0) / m.length).toFixed(2),
    roas: m.reduce((s, x) => s + x.conv, 0) > 0 ? +((m.reduce((s, x) => s + x.conv, 0) * 45) / m.reduce((s, x) => s + x.spend, 0)).toFixed(1) : 0 };
};
const tmCh = (metrics) => {
  if (!metrics?.length) return null;
  const m = metrics;
  return { spend: m.reduce((s, x) => s + x.spend, 0), conv: m.reduce((s, x) => s + x.conv, 0),
    ac: +(m.reduce((s, x) => s + x.cpa, 0) / m.length).toFixed(2), lc: m[m.length - 1].cpa,
    at: +(m.reduce((s, x) => s + x.ctr, 0) / m.length).toFixed(1), am: +(m.reduce((s, x) => s + x.cpm, 0) / m.length).toFixed(2),
    roas: m[m.length - 1].roas || 0, lr: m[m.length - 1].revenue || 0 };
};
const bestChannel = (ad, th) => {
  const cm = ad.channelMetrics || {};
  let best = null;
  for (const ch of CHANNELS) {
    const m = cm[ch.id];
    if (!m?.length) continue;
    const last = m[m.length - 1];
    if (!last) continue;
    const roas = last.roas ?? 0;
    if (!best || roas > best.roas) best = { ch: ch.id, label: ch.label, color: ch.color, cpa: last.cpa, roas, metric: last };
  }
  return best;
};
const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// No seed data — ads are loaded from Supabase per workspace

// ════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════

function Modal({ title, onClose, children, w }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: w || 580 }}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
            <button onClick={onClose} className="btn btn-ghost btn-xs" style={{ fontSize: 14 }}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// AI ANALYSIS
// ════════════════════════════════════════════════

async function runAI(ad, t, onStatus, videoFile) {
  const geminiReady = isGeminiConfigured();
  const claudeReady = isConfigured("claude");
  const geminiModel = getSelectedModel("gemini");
  const claudeModel = getSelectedModel("claude");

  try {
    if (geminiReady && videoFile) {
      const videoData = await prepareVideoFile(videoFile, onStatus);
      if (onStatus) onStatus("Gemini is watching your ad...");
      const result = await analyzeAdWithVideo(ad, t, videoData);
      return { ...result, _engine: geminiModel, _mode: "video" };
    } else if (geminiReady) {
      if (onStatus) onStatus("Running Gemini text analysis...");
      const result = await analyzeAdTextOnly(ad, t);
      return { ...result, _engine: geminiModel, _mode: "text" };
    } else if (claudeReady) {
      if (onStatus) onStatus("Running Claude analysis...");
      const result = await runClaude(ad, t);
      return { ...result, _engine: claudeModel, _mode: "text" };
    } else {
      return { summary: "No AI configured. Add a Gemini or Claude API key in Settings.", findings: [], nextIterationPlan: null, suggestedLearnings: [], _engine: null, _mode: null };
    }
  } catch (e) {
    return { summary: "Error: " + e.message, findings: [], nextIterationPlan: null, suggestedLearnings: [], _engine: null, _mode: null, _error: true };
  }
}


async function runClaude(ad, t) {
  const key = getApiKey("claude").trim();
  const la = lm(ad), tot = tm(ad), sn = { positive: 0, negative: 0, neutral: 0 };
  ad.comments.forEach(c => sn[c.sentiment]++);

  const adData = `AD: "${ad.name}" (${ad.type})
BRIEF: ${ad.brief}
METRICS (latest day): CPA $${la?.cpa || "N/A"} | Spend $${la?.spend || 0} | Conv ${la?.conv || 0} | CTR ${la?.ctr || 0}% | CPM $${la?.cpm || 0}
Thresholds: Green <=$${t.green}, Yellow <=$${t.yellow}, Red >$${t.yellow}
CPA TREND: ${ad.metrics.map(m => "$" + m.cpa).join(" → ")}
TOTALS: $${tot?.spend || 0} spent, ${tot?.conv || 0} conversions, avg CPA $${tot?.ac || "N/A"}

COMMENTS (${ad.comments.length} total — ${sn.positive} positive, ${sn.negative} negative, ${sn.neutral} neutral):
${ad.comments.map(c => `"${c.text}" [${c.sentiment}]${c.hidden ? " [HIDDEN BY TIKTOK]" : ""}`).join("\n")}

ITERATION HISTORY: ${ad.iterations > 0 ? ad.iterHistory.map(h => "Iter " + h.iter + ": " + h.reason).join("; ") : "None"}`;

  const prompt = getAnalysisPrompt().replace("{AD_DATA}", adData);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: getSelectedModel("claude"), max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  const tx = d.content?.map(b => b.text || "").join("") || "";
  return JSON.parse(tx.replace(/```json|```/g, "").trim());
}

// ════════════════════════════════════════════════
// STAGE GATE CHECK
// ════════════════════════════════════════════════

function checkGate(ad, fromStage, toStage) {
  const idx = SO.indexOf(toStage);
  const fromIdx = SO.indexOf(fromStage);
  if (idx < 0 || fromIdx < 0) return null;
  if (idx < fromIdx) return null; // allow moving backwards

  // Check all checklist items for the current stage are completed
  const items = STAGE_CHECKLIST[fromStage] || [];
  const incomplete = items.filter(i => !ad.checklist?.[i.key]?.done);
  if (incomplete.length > 0) {
    return `Complete all checklist items before moving: ${incomplete.map(i => i.label).join(", ")}`;
  }

  // Additional hard requirements
  if (fromStage === "pre" && toStage === "in") {
    if (!ad.editor) return "Editor must be assigned before moving to In-Production";
  }
  if (fromStage === "post" && toStage === "live") {
    if (ad.revisionRequests.some(r => !r.resolved)) return "Unresolved revision requests -- resolve before going Live";
  }
  return null;
}

// ════════════════════════════════════════════════
// NEW AD FORM
// ════════════════════════════════════════════════

const PAGE_LABELS = { pipeline: "Pipeline", strategy: "Strategy", editors: "Editors", earnings: "Earnings", learnings: "Learnings", settings: "Settings" };
const PRESENCE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

function PresenceBubbles({ presenceState, currentUserId, currentPage }) {
  // Parse presence state into list of online users
  const users = [];
  for (const [key, presences] of Object.entries(presenceState || {})) {
    const p = presences?.[0];
    if (p && p.user_id !== currentUserId) {
      users.push({ id: p.user_id, name: p.user_name || "User", page: p.page || "pipeline" });
    }
  }

  if (users.length === 0) return null;

  // Group by page
  const byPage = {};
  users.forEach(u => {
    if (!byPage[u.page]) byPage[u.page] = [];
    byPage[u.page].push(u);
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {users.map((u, i) => {
        const color = PRESENCE_COLORS[i % PRESENCE_COLORS.length];
        const initials = u.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
        const pageLabel = PAGE_LABELS[u.page] || u.page;
        return (
          <div key={u.id} style={{ position: "relative", cursor: "default" }} title={`${u.name} is viewing ${pageLabel}`}>
            <div style={{
              width: 30, height: 30, borderRadius: "var(--radius-full)",
              background: color, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#fff",
              border: "2px solid var(--bg-root)",
              boxShadow: `0 0 0 2px ${color}40`,
            }}>
              {initials}
            </div>
            {/* Page badge */}
            <div style={{
              position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)",
              fontSize: 7, fontWeight: 700, color: "#fff", background: color,
              padding: "1px 4px", borderRadius: 4, whiteSpace: "nowrap",
              lineHeight: 1.2, letterSpacing: 0.3,
            }}>
              {pageLabel}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
        {users.length} online
      </div>
    </div>
  );
}

function NewAdForm({ onClose, dispatch, editors }) {
  const [f, setF] = useState({ name: "", type: "VSL", editor: "", deadline: "", brief: "", notes: "", channelIds: emptyChIds() });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setChId = (ch, v) => setF(p => ({ ...p, channelIds: { ...p.channelIds, [ch]: v } }));

  return (
    <Modal title="New Ad" onClose={onClose} w={500}>
      <label className="label" style={{ marginTop: 0 }}>Ad Name</label>
      <input value={f.name} onChange={e => set("name", e.target.value)} className="input" placeholder="e.g. Hair Growth VSL v2" />

      <label className="label">Type</label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {AD_TYPES.map(t => (
          <button key={t} onClick={() => set("type", t)} className={`btn btn-xs ${f.type === t ? "" : "btn-ghost"}`}
            style={f.type === t ? { background: "var(--accent-bg)", color: "var(--accent-light)", border: "1px solid var(--accent-border)" } : {}}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="label">Editor</label>
          <select value={f.editor} onChange={e => set("editor", e.target.value)} className="input">
            <option value="">Unassigned</option>
            {editors.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Deadline</label>
          <input type="date" value={f.deadline} onChange={e => set("deadline", e.target.value)} className="input" />
        </div>
      </div>

      <details style={{ marginBottom: 6 }}>
        <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>
          Ad Set IDs <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(optional -- auto-matched by name if blank)</span>
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
          {CHANNELS.map(ch => (
            <div key={ch.id}>
              <div style={{ fontSize: 10, color: ch.color, fontWeight: 600, marginBottom: 2 }}>{ch.label}</div>
              <input value={f.channelIds[ch.id]} onChange={e => setChId(ch.id, e.target.value)} className="input" placeholder="Auto-matched by name" />
            </div>
          ))}
        </div>
      </details>

      <label className="label">Brief</label>
      <textarea value={f.brief} onChange={e => set("brief", e.target.value)} rows={3} className="input" placeholder="Look/feel, hooks, pacing, references..." />

      <label className="label">Notes</label>
      <input value={f.notes} onChange={e => set("notes", e.target.value)} className="input" placeholder="Quick notes..." />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={() => { if (f.name.trim()) { dispatch({ type: "ADD_AD", ad: f }); onClose(); } }}
          className="btn btn-primary" style={{ opacity: f.name.trim() ? 1 : 0.4 }}>Add to Pipeline</button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════
// AD DETAIL PANEL
// ════════════════════════════════════════════════

function AdPanel({ ad, onClose, dispatch, th, allAds, role, editors, userName, activeWorkspaceId, session, initialTab, strategyData }) {
  const [tab, setTab] = useState(initialTab || "overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeErr, setScrapeErr] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const videoInputRef = useRef(null);
  const [tiktokUrl, setTiktokUrl] = useState(ad.tiktokUrl || "");
  const [saveToast, setSaveToast] = useState(false);
  const [nc, setNc] = useState({ text: "", sentiment: "neutral", hidden: false });
  const [nm, setNm] = useState({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" });
  const [nl, setNl] = useState({ type: "hook_pattern", text: "" });
  const [vm, setVm] = useState(null);
  const [vf, setVf] = useState({ name: "", brief: "" });
  const [eName, setEName] = useState(ad.name);
  const [editingName, setEditingName] = useState(false);
  const [eb, setEb] = useState(ad.brief);
  const [en, setEn] = useState(ad.notes);
  const [ee, setEe] = useState(ad.editor || "");
  const [eDl, setEDl] = useState(ad.deadline || "");
  const [eChIds, setEChIds] = useState(ad.channelIds || emptyChIds());
  // Keep eChIds in sync when auto-match fills in IDs
  useEffect(() => {
    const ids = ad.channelIds || {};
    setEChIds(prev => {
      const next = { ...prev };
      let changed = false;
      for (const ch of Object.keys(ids)) {
        if (ids[ch]?.trim() && !prev[ch]?.trim()) { next[ch] = ids[ch]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [ad.channelIds]);
  const [revText, setRevText] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftType, setDraftType] = useState("video"); // "script" or "video"
  const [scriptDraftName, setScriptDraftName] = useState("");
  const [scriptDraftUrl, setScriptDraftUrl] = useState("");
  const [gateErr, setGateErr] = useState(null);
  const [mDateFrom, setMDateFrom] = useState("");
  const [mDateTo, setMDateTo] = useState("");
  const filterByDate = (metrics) => {
    if (!metrics?.length) return metrics || [];
    return metrics.filter(m => {
      if (mDateFrom && m.date < mDateFrom) return false;
      if (mDateTo && m.date > mDateTo) return false;
      return true;
    });
  };

  const la = lm(ad), tot = tm(ad);
  const adRoas = la?.roas ?? 0;
  const cl = ad.stage === "live" ? CL(adRoas || null, th) : "none";
  const cs = CS[cl];
  const stg = STAGES.find(s => s.id === ad.stage);
  const over = od(ad.deadline);
  const gdays = gd(ad, th);
  const winner = cl === "green" && gdays >= 5;
  const kids = allAds.filter(a => a.parentId === ad.id);
  const isEditor = role === "editor";
  const isStrategist = role === "strategist";
  const isRestricted = isEditor || isStrategist; // both see only assigned ads
  const canEditAd = !isEditor || isStrategist; // strategists can edit assigned ads, editors can only submit drafts

  const analyze = async () => {
    setBusy(true); setAiStatus(null);
    const r = await runAI(ad, th, setAiStatus, videoFile);
    const engine = r._engine; const mode = r._mode; const hasError = r._error;
    delete r._engine; delete r._mode; delete r._error;
    dispatch({ type: "ADD_ANALYSIS", id: ad.id, analysis: { id: uid(), ts: now(), engine, mode, ...r } });
    if (r.suggestedLearnings?.length) r.suggestedLearnings.forEach(l => dispatch({ type: "ADD_LEARNING", id: ad.id, learning: { id: uid(), type: l.type, text: l.text } }));
    setBusy(false);
    if (engine && !hasError) {
      const modeLabel = mode === "video" ? "video + text" : "text only";
      setAiStatus(`Analysis complete -- ${engine} (${modeLabel})`);
      setTimeout(() => setAiStatus(null), 5000);
    } else {
      setAiStatus(null);
    }
    setTab("analysis");
  };

  const scrapeComments = async (source = "auto") => {
    setScraping(true); setScrapeErr(null);
    try {
      let comments = [];

      // TikTok Business API (includes hidden comments)
      if ((source === "auto" || source === "tiktok_api") && isTikTokConfigured()) {
        const ttAdId = (ad.channelIds || {}).tiktok?.trim();
        if (!ttAdId) { throw new Error("No TikTok ad set ID found -- sync from Triple Whale first or enter manually"); }
        const raw = await fetchAllAdComments(ttAdId, 500);
        comments = await classifyCommentSentiment(raw);
        const hiddenCount = comments.filter(c => c.hidden).length;
        dispatch({ type: "ADD_NOTIF", id: ad.id, notif: { ts: now(), text: `Pulled ${comments.length} comments via TikTok API (${hiddenCount} hidden)` } });
      }
      // Meta Graph API (includes hidden comments)
      else if ((source === "auto" || source === "meta_api") && isMetaConfigured()) {
        const metaAdId = (ad.channelIds || {}).meta?.trim();
        if (!metaAdId) { throw new Error("No Meta ad set ID found -- sync from Triple Whale first or enter manually"); }
        const raw = await fetchAllMetaAdComments(metaAdId, 500);
        comments = await classifyMetaCommentSentiment(raw);
        const hiddenCount = comments.filter(c => c.hidden).length;
        dispatch({ type: "ADD_NOTIF", id: ad.id, notif: { ts: now(), text: `Pulled ${comments.length} comments via Meta API (${hiddenCount} hidden)` } });
      }
      // Fallback to Apify (public TikTok comments only)
      else if ((source === "auto" || source === "apify") && isApifyConfigured()) {
        const url = tiktokUrl.trim() || ad.tiktokUrl;
        if (!url) { throw new Error("Add a TikTok URL first"); }
        if (tiktokUrl.trim()) dispatch({ type: "UPDATE", id: ad.id, data: { tiktokUrl: tiktokUrl.trim() } });
        comments = await scrapeTikTokComments(url, 100);
        dispatch({ type: "ADD_NOTIF", id: ad.id, notif: { ts: now(), text: `Scraped ${comments.length} comments via Apify (public only)` } });
      } else {
        throw new Error("Configure TikTok Business API, Meta Graph API, or Apify in Settings");
      }

      // Deduplicate against existing comments by text
      const existingTexts = new Set(ad.comments.map(c => c.text.trim().toLowerCase()));
      let added = 0;
      for (const c of comments) {
        if (!existingTexts.has(c.text.trim().toLowerCase())) {
          dispatch({ type: "ADD_COMMENT", id: ad.id, comment: { id: uid(), text: c.text, sentiment: c.sentiment, hidden: c.hidden || false, platform: c.platform || "" } });
          added++;
        }
      }
      if (added < comments.length) {
        setScrapeErr(`Added ${added} new comments (${comments.length - added} duplicates skipped)`);
        setTimeout(() => setScrapeErr(null), 4000);
      }
    } catch (e) {
      setScrapeErr(e.message);
      setTimeout(() => setScrapeErr(null), 5000);
    }
    setScraping(false);
  };

  const addMetric = () => { const m = { date: nm.date, cpa: +nm.cpa, spend: +nm.spend, conv: +nm.conv, ctr: +nm.ctr, cpm: +nm.cpm }; if (!m.cpa || !m.spend) return; dispatch({ type: "ADD_METRIC", id: ad.id, metric: m }); setNm({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" }); };
  const addComment = () => { if (!nc.text.trim()) return; dispatch({ type: "ADD_COMMENT", id: ad.id, comment: { id: uid(), ...nc, text: nc.text.trim() } }); setNc({ text: "", sentiment: "neutral", hidden: false }); };
  const save = () => { dispatch({ type: "UPDATE", id: ad.id, data: { name: eName.trim() || ad.name, brief: eb, notes: en, editor: ee, deadline: eDl, channelIds: eChIds, tiktokUrl: tiktokUrl.trim() } }); setSaveToast(true); setTimeout(() => setSaveToast(false), 2200); };
  const saveName = () => {
    const newName = eName.trim();
    if (!newName || newName === ad.name) { setEditingName(false); setEName(ad.name); return; }
    // Clear auto-matched IDs for channels so they re-match to the new name
    const clearedIds = { ...eChIds };
    const clearedNames = { ...(ad.channelMatchedNames || {}) };
    for (const ch of Object.keys(clearedIds)) {
      if ((ad.channelMatchedNames || {})[ch]) { clearedIds[ch] = ""; delete clearedNames[ch]; }
    }
    setEChIds(clearedIds);
    dispatch({ type: "UPDATE", id: ad.id, data: { name: newName, channelIds: clearedIds, channelMatchedNames: clearedNames } });
    setEditingName(false);
    // Trigger a TW re-sync after a short delay to re-match with the new name
    setTimeout(() => { if (window.__twResync) window.__twResync(); }, 500);
  };
  const [memberNames, setMemberNames] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  useEffect(() => {
    if (activeWorkspaceId) {
      getWorkspaceMemberNames(activeWorkspaceId).then(members => {
        console.log("[mentions] loaded workspace members:", members);
        setMemberNames(members.filter(m => m.name !== userName));
      }).catch(e => console.error("[mentions] failed to load members:", e));
    }
  }, [activeWorkspaceId]);

  const sendMsg = async () => {
    if (!msg.trim()) return;
    const text = msg.trim();
    const senderName = userName || (isEditor ? ad.editor || "Editor" : "Unknown");
    dispatch({ type: "ADD_MSG", id: ad.id, msg: { from: senderName, text, ts: now() } });

    // Detect @mentions
    if (text.includes("@") && activeWorkspaceId) {
      let members = memberNames;
      if (members.length === 0) {
        try {
          members = await getWorkspaceMemberNames(activeWorkspaceId);
          members = members.filter(m => m.name !== userName);
          setMemberNames(members);
        } catch {}
      }

      const atParts = text.split("@").slice(1).map(p => p.trim().toLowerCase());
      for (const member of members) {
        if (atParts.some(p => p.startsWith(member.name.toLowerCase()))) {
          try {
            await createNotification({
              workspaceId: activeWorkspaceId,
              recipientId: member.userId,
              senderName,
              adId: String(ad.id),
              adName: ad.name,
              message: text,
            });
          } catch (e) { console.error("Notification error:", e); }
        }
      }
    }
    setMsg("");
  };

  const handleMsgChange = (e) => {
    const val = e.target.value;
    setMsg(val);
    // Check if user is typing @
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
      const partial = val.slice(lastAt + 1);
      if (!partial.includes(" ") || partial.length < 20) {
        setMentionFilter(partial.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name) => {
    const lastAt = msg.lastIndexOf("@");
    const before = msg.slice(0, lastAt);
    setMsg(before + "@" + name + " ");
    setShowMentions(false);
  };

  const renderMentions = (text) => {
    const parts = text.split(/(@\w[\w\s]*?)(?=\s|$|,|\.)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? <span key={i} style={{ color: "var(--accent-light)", fontWeight: 600 }}>{part}</span> : part
    );
  };

  const addLearning = () => { if (!nl.text.trim()) return; dispatch({ type: "ADD_LEARNING", id: ad.id, learning: { id: uid(), ...nl, text: nl.text.trim() } }); setNl({ type: "hook_pattern", text: "" }); };
  const createVar = () => { if (!vf.name.trim()) return; dispatch({ type: "CREATE_VAR", pid: ad.id, name: vf.name.trim(), brief: vf.brief.trim(), type: ad.type, vt: vm.id }); setVm(null); setVf({ name: "", brief: "" }); };
  const doIter = () => { const last = ad.analyses[ad.analyses.length - 1]; dispatch({ type: "ITERATE", id: ad.id, reason: last?.nextIterationPlan || last?.summary || "Based on metrics" }); };
  const doKill = () => dispatch({ type: "KILL", id: ad.id });
  const submitDraft = (type, name, url) => {
    if (!name.trim()) return;
    dispatch({ type: "SUBMIT_DRAFT", id: ad.id, draft: { id: uid(), name: name.trim(), url: url.trim() || null, draftType: type, version: ad.drafts.filter(d => d.draftType === type || (!d.draftType && type === "video")).length + 1, ts: now(), status: "in-review" } });
    if (type === "video") { setDraftName(""); setDraftUrl(""); }
    else { setScriptDraftName(""); setScriptDraftUrl(""); }
  };
  const requestRevision = () => { if (!revText.trim()) return; dispatch({ type: "ADD_REVISION", id: ad.id, rev: { id: uid(), from: "Adolf", text: revText.trim(), ts: now(), resolved: false } }); setRevText(""); };
  const resolveRevision = (rid) => dispatch({ type: "RESOLVE_REVISION", id: ad.id, rid });
  const approveDraft = (did) => dispatch({ type: "APPROVE_DRAFT", id: ad.id, did });

  const tryMove = (stage) => {
    const err = checkGate(ad, ad.stage, stage);
    if (err) { setGateErr(err); setTimeout(() => setGateErr(null), 3000); return; }
    dispatch({ type: "MOVE", id: ad.id, stage });
  };

  const [commentFilter, setCommentFilter] = useState("all");

  const tabs = [
    { id: "overview", l: "Overview" },
    { id: "drafts", l: `Drafts (${ad.drafts.length})` },
    { id: "metrics", l: `Metrics (${ad.metrics.length})` },
    { id: "comments", l: `Comments (${ad.comments.length})` },
    { id: "analysis", l: `Analysis (${ad.analyses.length})` },
    { id: "learnings", l: `Learnings (${ad.learnings.length})` },
  ];

  const filteredComments = commentFilter === "all" ? ad.comments : ad.comments.filter(c => c.sentiment === commentFilter);

  const findingStyle = (type) => {
    const map = {
      positive: { c: "var(--green-light)", bg: "var(--green-bg)", bc: "var(--green-border)", ic: "✓" },
      negative: { c: "var(--red-light)", bg: "var(--red-bg)", bc: "var(--red-border)", ic: "✕" },
      warning: { c: "var(--yellow-light)", bg: "var(--yellow-bg)", bc: "var(--yellow-border)", ic: "⚠" },
      action: { c: "var(--accent-light)", bg: "var(--accent-bg)", bc: "var(--accent-border)", ic: "→" },
    };
    return map[type] || map.action;
  };

  const [editingEditor, setEditingEditor] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingVA, setEditingVA] = useState(false);
  const [editingCost, setEditingCost] = useState(false);
  const [eType, setEType] = useState(ad.type || "");
  const TYPE_OPTIONS = ["UGC", "Image", "Carousel", "VSL", "Talking Head", "B-Roll", "Mashup", "Other"];

  const metaRows = [
    { label: "Status", val: stg.label, badge: true, badgeColor: stg.color },
    ...(ad.iterations > 0 ? [{ label: "Iteration", val: `${ad.iterations} / ${ad.maxIter}` }] : []),
    ...(ad.stage === "live" && la ? [{ label: "ROAS", val: `${adRoas}x`, color: cs.c }, { label: "CPA", val: `${CUR} ${la.cpa}` }] : []),
    ...(winner ? [{ label: "Verdict", val: `Winner (${gdays}d)`, color: "var(--green)" }] : []),
  ];

  return (
    <div className="animate-fade" style={{ maxWidth: 1100 }}>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 360, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Delete this ad?</div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20, lineHeight: 1.5 }}>
              "{ad.name}" will be permanently removed. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={() => { dispatch({ type: "DELETE", id: ad.id }); onClose(); }} className="btn btn-sm" style={{ background: "var(--red)", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar: breadcrumb + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-tertiary)" }}>
          <span style={{ cursor: "pointer", color: "var(--accent-light)" }} onClick={onClose}>Pipeline</span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>›</span>
          <span style={{ color: stg.color }}>{stg.label}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {ad.stage !== "killed" && role === "founder" && SO.filter(s => s !== ad.stage).map(s => {
            const st = STAGES.find(x => x.id === s);
            return <button key={s} onClick={() => tryMove(s)} className="btn btn-ghost btn-xs" style={{ color: st.color, borderColor: st.color + "22", fontSize: 11 }}>{st.icon} {st.label}</button>;
          })}
          {ad.iterations >= ad.maxIter && ad.stage === "live" && cl === "red" && (
            <button onClick={doKill} className="btn btn-danger btn-xs">Kill</button>
          )}
          {role === "founder" && (
            <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)", fontSize: 14 }} title="Delete ad">🗑</button>
          )}
        </div>
      </div>

      {/* Title row */}
      <div style={{ marginBottom: 12 }}>
        {editingName ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={eName} onChange={e => setEName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setEName(ad.name); } }}
              className="input" autoFocus style={{ fontSize: 22, fontWeight: 600, padding: "4px 8px", flex: 1 }} />
            <button onClick={saveName} className="btn btn-primary btn-sm">Save</button>
            <button onClick={() => { setEditingName(false); setEName(ad.name); }} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        ) : (
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2, letterSpacing: "-0.02em", margin: 0, cursor: role === "founder" ? "pointer" : "default" }}
            onClick={() => { if (role === "founder") setEditingName(true); }}>
            {ad.name}
          </h1>
        )}
      </div>

      {/* Tabs -- directly under title */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? "active" : ""}`}>{t.l}</button>)}
      </div>

      {/* Alert banners */}
      {gateErr && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", borderLeft: "3px solid var(--red)", marginBottom: 12, fontSize: 12, color: "var(--red)" }}>{gateErr}</div>}
      {ad.stage === "live" && cl === "green" && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--green-bg)", borderLeft: "3px solid var(--green)", marginBottom: 12, fontSize: 12, color: "var(--green)" }}>
          {winner ? "Confirmed winner (5+ days). Scale aggressively." : `${gdays}/5 green days to confirm.`}
        </div>
      )}
      {ad.stage === "live" && cl === "red" && role === "founder" && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", borderLeft: "3px solid var(--red)", marginBottom: 12, fontSize: 12, color: "var(--red)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Below threshold. Iter {ad.iterations}/{ad.maxIter}.</span>
          {ad.iterations < ad.maxIter && <>
            <button onClick={analyze} disabled={busy} className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}>{busy ? "Analyzing..." : "Analyze"}</button>
            <button onClick={doIter} className="btn btn-danger btn-xs">Iterate</button>
          </>}
        </div>
      )}
      {ad.stage === "killed" && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", borderLeft: "3px solid var(--red)", marginBottom: 12, fontSize: 12, color: "var(--red)" }}>
          Archived after {ad.iterations} iteration{ad.iterations !== 1 ? "s" : ""}.
        </div>
      )}

      {/* Two-column: Left = content, Right = discussion */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
      <div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="animate-fade">
          {/* Highlights -- Attio-style card grid */}
          {(() => {
            const hCardS = { background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "12px 14px" };
            const hLabelS = { fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 };
            const hValS = { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" };
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {/* Editor */}
                <div style={hCardS} onClick={() => !isEditor && setEditingEditor(true)}>
                  <div style={hLabelS}><span style={{ fontSize: 13 }}>👤</span> Editor</div>
                  {editingEditor ? (
                    <select value={ee} onChange={e => { setEe(e.target.value); setEditingEditor(false); dispatch({ type: "UPDATE", id: ad.id, data: { editor: e.target.value } }); setSaveToast(true); setTimeout(() => setSaveToast(false), 2200); }} onBlur={() => setEditingEditor(false)} autoFocus className="input" style={{ fontSize: 12, padding: "4px 8px", border: "none", background: "transparent" }}>
                      <option value="">Unassigned</option>{editors.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  ) : (
                    <div style={{ ...hValS, cursor: !isEditor ? "pointer" : "default" }}>{ad.editor || <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Unassigned</span>}</div>
                  )}
                </div>
                {/* Deadline */}
                <div style={hCardS} onClick={() => !isEditor && setEditingDeadline(true)}>
                  <div style={hLabelS}><span style={{ fontSize: 13 }}>📅</span> Deadline</div>
                  {editingDeadline ? (
                    <input type="date" value={eDl} onChange={e => { setEDl(e.target.value); setEditingDeadline(false); dispatch({ type: "UPDATE", id: ad.id, data: { deadline: e.target.value } }); setSaveToast(true); setTimeout(() => setSaveToast(false), 2200); }} onBlur={() => setEditingDeadline(false)} autoFocus className="input" style={{ fontSize: 12, padding: "4px 8px", border: "none", background: "transparent" }} />
                  ) : (
                    <div style={{ ...hValS, color: over ? "var(--red)" : "var(--text-primary)", cursor: !isEditor ? "pointer" : "default" }}>{ad.deadline ? fd(ad.deadline) : <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Not set</span>}</div>
                  )}
                </div>
                {/* Stage */}
                <div style={hCardS}>
                  <div style={hLabelS}><span style={{ fontSize: 13 }}>📊</span> Stage</div>
                  <div><span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: stg.color + "15", color: stg.color, fontWeight: 600 }}>{stg.label}</span></div>
                </div>
                {/* Voice Actor */}
                <div style={hCardS} onClick={() => !editingVA && setEditingVA(true)}>
                  <div style={hLabelS}><span style={{ fontSize: 13 }}>🎙️</span> Voice Actor</div>
                  {editingVA ? (
                    <div><input list="va-list-hl" value={ad.strategy?.voice_actor || ""} onChange={e => dispatch({ type: "UPDATE", id: ad.id, data: { strategy: { ...(ad.strategy || {}), voice_actor: e.target.value } } })} onBlur={() => { setEditingVA(false); setSaveToast(true); setTimeout(() => setSaveToast(false), 2200); }} autoFocus className="input" placeholder="Select or type..." style={{ fontSize: 12, padding: "4px 8px", border: "none", background: "transparent", width: "100%" }} />
                    <datalist id="va-list-hl">{[...new Set(allAds.map(a => a.strategy?.voice_actor).filter(Boolean))].map(v => <option key={v} value={v} />)}</datalist></div>
                  ) : (
                    <div style={{ ...hValS, cursor: "pointer" }}>{ad.strategy?.voice_actor || <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Unassigned</span>}</div>
                  )}
                </div>
                {/* Type */}
                <div style={hCardS} onClick={() => !isEditor && setEditingType(true)}>
                  <div style={hLabelS}><span style={{ fontSize: 13 }}>🎬</span> Type</div>
                  {editingType ? (
                    <select value={eType} onChange={e => { setEType(e.target.value); setEditingType(false); dispatch({ type: "UPDATE", id: ad.id, data: { type: e.target.value } }); setSaveToast(true); setTimeout(() => setSaveToast(false), 2200); }} onBlur={() => setEditingType(false)} autoFocus className="input" style={{ fontSize: 12, padding: "4px 8px", border: "none", background: "transparent" }}>
                      {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <div style={{ ...hValS, cursor: !isEditor ? "pointer" : "default" }}>{ad.type || "—"}</div>
                  )}
                </div>
                {/* ROAS / CPA / Winner / Status */}
                {winner ? (
                  <div style={{ ...hCardS, borderColor: "var(--green-border)" }}>
                    <div style={hLabelS}><span style={{ fontSize: 13 }}>🏆</span> Verdict</div>
                    <div style={{ ...hValS, color: "var(--green)" }}>Winner ({gdays}d)</div>
                  </div>
                ) : ad.stage === "live" && la ? (
                  <div style={hCardS}>
                    <div style={hLabelS}><span style={{ fontSize: 13 }}>📈</span> ROAS</div>
                    <div style={{ ...hValS, color: cs.c }}>{adRoas}x · {CUR} {la.cpa} CPA</div>
                  </div>
                ) : (
                  <div style={hCardS}>
                    <div style={hLabelS}><span style={{ fontSize: 13 }}>🏷️</span> Status</div>
                    <div style={hValS}>{ad.stage === "killed" ? "Killed" : "In progress"}</div>
                  </div>
                )}
                {/* Production Cost */}
                {!isEditor && (
                  <div style={hCardS} onClick={() => setEditingCost(true)}>
                    <div style={hLabelS}><span style={{ fontSize: 13 }}>💵</span> Production Cost</div>
                    {editingCost ? (
                      <input type="number" step="0.01" value={ad.production_cost ?? ""} onChange={e => { dispatch({ type: "UPDATE", id: ad.id, data: { production_cost: parseFloat(e.target.value) || 0 } }); }} onBlur={() => setEditingCost(false)} autoFocus className="input" placeholder="0.00" style={{ fontSize: 12, padding: "4px 8px", border: "none", background: "transparent", width: "100%" }} />
                    ) : (
                      <div style={{ ...hValS, cursor: "pointer" }}>{ad.production_cost ? `$${Number(ad.production_cost).toFixed(2)}` : <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Not set</span>}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {/* Checklist */}
          {(() => {
            const items = STAGE_CHECKLIST[ad.stage] || [];
            const stale = getStaleItems(ad, ad.stage);
            const cp = getChecklistProgress(ad, ad.stage);
            if (items.length === 0) return null;
            return (
              <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Checklist</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {stale.length > 0 && <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 500 }}>{stale.length} overdue</span>}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{cp.done}/{cp.total}</span>
                    <div style={{ width: 48, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: cp.pct + "%", background: cp.pct === 100 ? "var(--green)" : stale.length > 0 ? "var(--red)" : "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                </div>
                {items.map(item => {
                  const checked = ad.checklist?.[item.key]?.done;
                  return (
                    <div key={item.key}
                      onClick={() => dispatch({ type: "TOGGLE_CHECKLIST", id: ad.id, key: item.key })}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: checked ? "none" : "1.5px solid var(--border)",
                        background: checked ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                      }}>
                        {checked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: checked ? "var(--text-muted)" : "var(--text-primary)", textDecoration: checked ? "line-through" : "none" }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Strategy -- Attio-style property rows */}
          {(() => {
            const s = ad.strategy || {};
            const avatarNames = (strategyData?.avatars || []).map(a => a.name).filter(Boolean);
            const desireList = (strategyData?.desires || []).map(d => d.want).filter(Boolean);
            const updateS = (key, value) => dispatch({ type: "UPDATE", id: ad.id, data: { strategy: { ...s, [key]: value } } });
            const AD_FORMAT_OPTS = ["Single Static", "Video", "Carousel"];
            const VARIABLE_OPTS = ["Hook", "Lead", "Unique Mechanism", "Body", "Close"];
            const rowS = { display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" };
            const labelS = { width: 130, flexShrink: 0, fontSize: 12, color: "var(--text-muted)", fontWeight: 450 };
            const inputS = { flex: 1, fontSize: 12.5, padding: "4px 8px", border: "none", background: "transparent", color: "var(--text-primary)" };
            return (
              <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "6px 16px", marginBottom: 16 }}>
                <div style={rowS}>
                  <div style={labelS}>Avatar</div>
                  <select value={s.avatar || ""} onChange={e => updateS("avatar", e.target.value)} className="input" style={inputS}>
                    <option value="">—</option>
                    {avatarNames.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={rowS}>
                  <div style={labelS}>Ad Concept</div>
                  <input value={s.concept || ""} onChange={e => updateS("concept", e.target.value)} className="input" placeholder="Describe the concept..." style={inputS} />
                </div>
                <div style={rowS}>
                  <div style={labelS}>Desire</div>
                  <select value={s.desire || ""} onChange={e => updateS("desire", e.target.value)} className="input" style={inputS}>
                    <option value="">—</option>
                    {desireList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={rowS}>
                  <div style={labelS}>Ad Angle</div>
                  <input value={s.angle || ""} onChange={e => updateS("angle", e.target.value)} className="input" placeholder="e.g. Fear-based, aspirational..." style={inputS} />
                </div>
                <div style={rowS}>
                  <div style={labelS}>Ad Format</div>
                  <select value={s.ad_format || ""} onChange={e => updateS("ad_format", e.target.value)} className="input" style={inputS}>
                    <option value="">—</option>
                    {AD_FORMAT_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={rowS}>
                  <div style={labelS}>Variable Tested</div>
                  <select value={s.variable_tested || ""} onChange={e => updateS("variable_tested", e.target.value)} className="input" style={inputS}>
                    <option value="">—</option>
                    {VARIABLE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={rowS}>
                  <div style={labelS}>Big Idea</div>
                  <input value={s.big_idea || ""} onChange={e => updateS("big_idea", e.target.value)} className="input" placeholder="The one big idea..." style={inputS} />
                </div>
                <div style={{ ...rowS, borderBottom: "none" }}>
                  <div style={labelS}>Awareness Level</div>
                  <select value={s.awareness_level || ""} onChange={e => updateS("awareness_level", e.target.value)} className="input" style={inputS}>
                    <option value="">—</option>
                    <option value="Unaware">Unaware</option>
                    <option value="Problem-Aware">Problem-Aware</option>
                    <option value="Solution-Aware">Solution-Aware</option>
                    <option value="Product-Aware">Product-Aware</option>
                    <option value="Most Aware">Most Aware</option>
                  </select>
                </div>

              </div>
            );
          })()}

          {/* Brief */}
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Brief</div>
            <textarea disabled={isEditor} value={eb} onChange={e => setEb(e.target.value)} rows={3} className="input" placeholder="Ad brief..." style={{ border: "none", background: "transparent", padding: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, resize: "vertical" }} />
          </div>

          {/* Ad Script */}
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Ad Script</div>
            <textarea value={ad.strategy?.ad_script || ""} onChange={e => dispatch({ type: "UPDATE", id: ad.id, data: { strategy: { ...(ad.strategy || {}), ad_script: e.target.value } } })} rows={6} className="input" placeholder="Paste your ad script / VSL script here..." style={{ border: "none", background: "transparent", padding: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, resize: "vertical" }} />
          </div>

          {/* Notes */}
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Notes</div>
            <textarea value={en} onChange={e => setEn(e.target.value)} rows={2} className="input" placeholder="Internal notes..." style={{ border: "none", background: "transparent", padding: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, resize: "vertical" }} />
          </div>



          {/* Integrations */}
          {!isEditor && (
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "6px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: "var(--text-muted)", fontWeight: 450 }}>TikTok URL</div>
                <input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} className="input" placeholder="https://tiktok.com/..." style={{ flex: 1, fontSize: 12.5, padding: "4px 8px", border: "none", background: "transparent", color: "var(--text-primary)" }} />
              </div>
              {CHANNELS.map((ch, ci) => {
                const hasId = eChIds[ch.id]?.trim();
                const chm = (ad.channelMetrics || {})[ch.id] || [];
                const matchedName = (ad.channelMatchedNames || {})[ch.id];
                const wasAutoMatched = hasId && matchedName;
                const status = hasId ? (chm.length > 0 ? (wasAutoMatched ? "auto_synced" : "synced") : "linked") : (chm.length > 0 ? "auto" : null);
                return (
                  <div key={ch.id} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: ci < CHANNELS.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                    <div style={{ width: 130, flexShrink: 0, fontSize: 12, fontWeight: 450, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: ch.color }}>{ch.label}</span>
                      {(status === "synced" || status === "auto_synced" || status === "auto") && <span style={{ fontSize: 8, color: "var(--green)" }}>●</span>}
                      {status === "linked" && <span style={{ fontSize: 8, color: "var(--yellow)" }}>●</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input value={eChIds[ch.id]} onChange={e => setEChIds(p => ({ ...p, [ch.id]: e.target.value }))} className="input" placeholder="Auto-matched" style={{ fontSize: 12.5, padding: "4px 8px", border: "none", background: "transparent", color: "var(--text-primary)", width: "100%" }} />
                      {wasAutoMatched && <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 8 }}>Matched: <span style={{ color: "var(--accent-light)" }}>{matchedName}</span></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={save} className="btn btn-primary btn-sm" style={{ marginBottom: 16 }}>Save Changes</button>

          {saveToast && (
            <div style={{
              position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
              background: "var(--green)", color: "#fff", padding: "10px 24px",
              borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 99999,
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              animation: "toastIn 0.3s ease-out",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 15 }}>&#10003;</span> Changes saved
            </div>
          )}

          {ad.iterHistory.length > 0 && <div style={{ marginTop: 24 }}>
            <div className="section-title">Iteration History</div>
            {ad.iterHistory.map((h, i) => <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span className="badge badge-yellow">Iter {h.iter}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{h.date}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{h.reason}</div>
            </div>)}
          </div>}

          {ad.stage === "live" && cl === "green" && role === "founder" && <div style={{ marginTop: 18 }}>
            <div className="section-title">Create Variations</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {VT.map(v => <div key={v.id} onClick={() => { setVm(v); setVf({ name: ad.name + " — " + v.label, brief: "" }); }}
                className="card-flat" style={{ cursor: "pointer", transition: "all var(--transition)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--green-border)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-light)"}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: "var(--text-primary)" }}>{v.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{v.desc}</div>
              </div>)}
            </div>
            {kids.length > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>Variations: {kids.map(c => <span key={c.id} className="badge badge-accent" style={{ marginRight: 3 }}>{c.name}</span>)}</div>}
            {vm && <div className="card" style={{ marginTop: 10, borderColor: "var(--green-border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New: {vm.label}</div>
              <label className="label" style={{ marginTop: 0 }}>Name</label>
              <input value={vf.name} onChange={e => setVf(p => ({ ...p, name: e.target.value }))} className="input" />
              <label className="label">Brief</label>
              <textarea value={vf.brief} onChange={e => setVf(p => ({ ...p, brief: e.target.value }))} className="input" placeholder={vm.desc} />
              <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setVm(null)} className="btn btn-ghost btn-sm">Cancel</button>
                <button onClick={createVar} className="btn btn-success btn-sm">Create</button>
              </div>
            </div>}
          </div>}
        </div>
      )}

      {/* ── DRAFTS ── */}
      {tab === "drafts" && (
        <div className="animate-fade">
          {/* Approval workflow buttons */}
          {!isEditor && (
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {[["briefApproved", "Approve Brief", "var(--accent)"], ["draftSubmitted", "Mark Draft Submitted", "var(--yellow)"], ["finalApproved", "Approve Final", "var(--green)"]].map(([k, label, col]) => (
                <button key={k} onClick={() => dispatch({ type: "UPDATE", id: ad.id, data: { [k]: !ad[k] } })}
                  className={`btn btn-sm ${ad[k] ? "" : "btn-ghost"}`}
                  style={ad[k] ? { background: col + "10", borderColor: col + "30", color: col } : {}}>
                  {ad[k] ? "✓ " : ""}{label}
                </button>
              ))}
            </div>
          )}

          {/* ── SCRIPT DRAFTS (hidden from editors) ── */}
          {!isEditor && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-title">Script / Copy Drafts</div>
              {(() => {
                const scriptDrafts = ad.drafts.filter(d => d.draftType === "script");
                return scriptDrafts.length === 0 ? (
                  <div className="empty-state" style={{ marginBottom: 10 }}>No script drafts yet</div>
                ) : scriptDrafts.map(d => (
                  <div key={d.id} className="card-flat" style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13 }}>📝</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{d.name}</span>
                        <span className="badge">v{d.version}</span>
                        <span className={`badge ${d.status === "approved" ? "badge-green" : "badge-accent"}`}>{d.status}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{d.ts}</span>
                        {d.status === "in-review" && role === "founder" && <button onClick={() => approveDraft(d.id)} className="btn btn-success btn-xs">Approve</button>}
                      </div>
                    </div>
                    {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", marginTop: 4, display: "inline-block" }}>🔗 View</a>}
                  </div>
                ));
              })()}
              <div className="card-flat" style={{ marginTop: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={scriptDraftName} onChange={e => setScriptDraftName(e.target.value)} className="input" placeholder="Script name, e.g. Whistleblower_v2_script.doc" />
                  <input value={scriptDraftUrl} onChange={e => setScriptDraftUrl(e.target.value)} className="input" placeholder="URL (Google Docs, Dropbox, etc.)" />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => submitDraft("script", scriptDraftName, scriptDraftUrl)} className="btn btn-primary btn-sm" style={{ opacity: scriptDraftName.trim() ? 1 : 0.4 }}>Submit Script Draft</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── VIDEO / EDIT DRAFTS (visible to everyone) ── */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-title">Video / Edit Drafts</div>
            {(() => {
              const videoDrafts = ad.drafts.filter(d => d.draftType === "video" || !d.draftType);
              return videoDrafts.length === 0 ? (
                <div className="empty-state" style={{ marginBottom: 10 }}>No video drafts yet</div>
              ) : videoDrafts.map(d => (
                <div key={d.id} className="card-flat" style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>🎬</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{d.name}</span>
                      <span className="badge">v{d.version}</span>
                      <span className={`badge ${d.status === "approved" ? "badge-green" : d.status === "revision-requested" ? "badge-yellow" : "badge-accent"}`}>{d.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{d.ts}</span>
                      {d.status === "in-review" && role === "founder" && <button onClick={() => approveDraft(d.id)} className="btn btn-success btn-xs">Approve</button>}
                    </div>
                  </div>
                  {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", marginTop: 4, display: "inline-block" }}>🔗 View</a>}
                </div>
              ));
            })()}
            <div className="card-flat" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={draftName} onChange={e => setDraftName(e.target.value)} className="input" placeholder="File name, e.g. whistleblower_edit_v2.mp4" />
                <input value={draftUrl} onChange={e => setDraftUrl(e.target.value)} className="input" placeholder="URL (Google Drive, Dropbox, Frame.io, etc.)" />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => submitDraft("video", draftName, draftUrl)} className="btn btn-primary btn-sm" style={{ opacity: draftName.trim() ? 1 : 0.4 }}>Submit Video Draft</button>
                </div>
              </div>
            </div>
          </div>

          {/* ── REVISION REQUESTS ── */}
          <div>
            <div className="section-title">Revision Requests</div>
            {ad.revisionRequests.length === 0 && <div className="empty-state">No revision requests</div>}
            {ad.revisionRequests.map(r => (
              <div key={r.id} className="card-flat" style={{ marginBottom: 6, borderLeft: r.resolved ? "3px solid var(--green)" : "3px solid var(--yellow)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{r.from}</span>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{r.ts}</span>
                    <span className={`badge ${r.resolved ? "badge-green" : "badge-yellow"}`}>{r.resolved ? "Resolved" : "Open"}</span>
                    {!r.resolved && <button onClick={() => resolveRevision(r.id)} className="btn btn-success btn-xs">✓</button>}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{r.text}</div>
              </div>
            ))}
            {!isEditor && <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input value={revText} onChange={e => setRevText(e.target.value)} className="input" style={{ flex: 1 }} placeholder="Describe revision needed..." />
              <button onClick={requestRevision} className="btn btn-ghost btn-sm" style={{ opacity: revText.trim() ? 1 : 0.4, color: "var(--yellow)" }}>Request</button>
            </div>}
          </div>
        </div>
      )}

      {/* ── METRICS ── */}
      {tab === "metrics" && (
        <div className="animate-fade">
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>Date Range:</span>
            <input type="date" value={mDateFrom} onChange={e => setMDateFrom(e.target.value)} className="input" style={{ width: "auto", padding: "5px 9px", fontSize: 11.5 }} />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>to</span>
            <input type="date" value={mDateTo} onChange={e => setMDateTo(e.target.value)} className="input" style={{ width: "auto", padding: "5px 9px", fontSize: 11.5 }} />
            {(mDateFrom || mDateTo) && <button onClick={() => { setMDateFrom(""); setMDateTo(""); }} className="btn btn-ghost btn-xs">Clear</button>}
          </div>

          {CHANNELS.map(ch => {
            const chmRaw = (ad.channelMetrics || {})[ch.id] || [];
            const chm = filterByDate(chmRaw);
            const chId = (ad.channelIds || {})[ch.id];
            const chTot = tmCh(chm);
            const chLast = chm.length ? chm[chm.length - 1] : null;
            const chCl = chLast ? CL(chLast.roas ?? 0, th) : "none";
            const chCs = CS[chCl];
            if (!chId?.trim() && !chmRaw.length) return null;
            return (
              <div key={ch.id} className="card" style={{ marginBottom: 10, borderColor: chm.length ? ch.color + "30" : "var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: ch.color }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: ch.color }}>{ch.label}</span>
                    {chLast && <span className="badge" style={{ background: chCs.bg, color: chCs.c }}>{chCs.l}</span>}
                  </div>
                  {chId && !chmRaw.length && <span className="badge badge-yellow">No data synced</span>}
                </div>
                {chTot && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                  {[["CPA", CUR + " " + chTot.lc, chCs.c], ["Spend", CUR + " " + chTot.spend.toLocaleString(), "var(--text-primary)"], ["Conv", chTot.conv, "var(--green-light)"], ["CTR", chTot.at + "%", "var(--accent-light)"], ["CPM", CUR + " " + chTot.am, "var(--text-primary)"], ["ROAS", (chLast?.roas || 0) + "x", (chLast?.roas || 0) >= 2 ? "var(--green)" : "var(--yellow)"]].map(([l, v, c]) => (
                    <div key={l} className="stat-box">
                      <div className="stat-value" style={{ color: c }}>{v}</div>
                      <div className="stat-label">{l}</div>
                    </div>
                  ))}</div>}
                {chm.length > 0 && <div>
                  <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>ROAS Trend</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 55 }}>
                    {chm.map((m, i) => { const r = m.roas ?? 0; const mx = Math.max(...chm.map(x => x.roas ?? 0), 0.01); const h = Math.max(8, (r / mx) * 45); const lv = CL(r, th); const col = CS[lv].c;
                      return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                        <span style={{ fontSize: 8.5, color: col, fontFamily: "var(--fm)", fontWeight: 600 }}>{r}x</span>
                        <div style={{ width: "100%", height: h, background: col, opacity: 0.2, borderRadius: "3px 3px 0 0" }} />
                        <span style={{ fontSize: 7.5, color: "var(--text-muted)" }}>{fd(m.date)}</span>
                      </div>; })}
                  </div></div>}
                {chm.length > 0 && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>Daily Breakdown</div>
                  <div style={{ fontSize: 10.5, fontFamily: "var(--fm)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 3, padding: "5px 0", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)", fontWeight: 600 }}>
                      <span>Date</span><span>CPA</span><span>Spend</span><span>Conv</span><span>CTR</span><span>CPM</span><span>ROAS</span>
                    </div>
                    {[...chm].reverse().map((m, i) => { const lv = CL(m.roas ?? 0, th); const col = CS[lv].c; return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 3, padding: "4px 0", borderBottom: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                        <span style={{ color: "var(--text-tertiary)" }}>{fd(m.date)}</span>
                        <span style={{ color: col, fontWeight: 600 }}>{CUR} {m.cpa}</span>
                        <span>{CUR} {m.spend}</span><span>{m.conv}</span><span>{m.ctr}%</span><span>{CUR} {m.cpm}</span>
                        <span style={{ color: m.roas >= 2 ? "var(--green)" : "var(--yellow)" }}>{m.roas}x</span>
                      </div>
                    ); })}
                  </div>
                </div>}
              </div>
            );
          })}

          {tot && <div style={{ marginTop: 8 }}>
            <div className="section-title">Combined / Manual Metrics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
              {[["Latest CPA", CUR + " " + tot.lc, cs.c], ["Spend", CUR + " " + tot.spend.toLocaleString(), "var(--text-primary)"], ["Conv", tot.conv, "var(--green-light)"], ["Avg CTR", tot.at + "%", "var(--accent-light)"], ["Avg CPM", CUR + " " + tot.am, "var(--text-primary)"], ["ROAS", tot.roas + "x", tot.roas >= 2 ? "var(--green)" : "var(--yellow)"]].map(([l, v, c]) => (
                <div key={l} className="stat-box">
                  <div className="stat-value" style={{ color: c }}>{v}</div>
                  <div className="stat-label">{l}</div>
                </div>
              ))}</div></div>}

          {!isEditor && <div>
            <div className="section-title">Log Metrics Manually</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
              {[["date", "Date", "date"], ["cpa", "CPA ($)", "number"], ["spend", "Spend ($)", "number"], ["conv", "Conv", "number"], ["ctr", "CTR (%)", "number"], ["cpm", "CPM ($)", "number"]].map(([k, l, t]) => (
                <div key={k}><label className="label" style={{ marginTop: 0 }}>{l}</label><input type={t} step="any" value={nm[k]} onChange={e => setNm(p => ({ ...p, [k]: e.target.value }))} className="input" /></div>
              ))}
            </div>
            <button onClick={addMetric} className="btn btn-primary btn-sm" style={{ marginTop: 10, opacity: nm.cpa && nm.spend ? 1 : 0.4 }}>+ Log</button>
          </div>}
        </div>
      )}

      {/* ── COMMENTS (scraped ad comments) ── */}
      {tab === "comments" && (
        <div className="animate-fade">
          {/* Scrape controls */}
          {!isEditor && <div className="card-flat" style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ margin: "0 0 8px" }}>Pull Ad Comments</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {isTikTokConfigured() && (
                <button onClick={() => scrapeComments("tiktok_api")} disabled={scraping} className="btn btn-sm" style={{ whiteSpace: "nowrap", background: "#e2e8f020", border: "1px solid #e2e8f040", color: "#e2e8f0" }}>
                  {scraping ? "Pulling..." : "TikTok"}
                </button>
              )}
              {isMetaConfigured() && (
                <button onClick={() => scrapeComments("meta_api")} disabled={scraping} className="btn btn-sm" style={{ whiteSpace: "nowrap", background: "#3b82f620", border: "1px solid #3b82f640", color: "#3b82f6" }}>
                  {scraping ? "Pulling..." : "Meta / IG"}
                </button>
              )}
              {!isTikTokConfigured() && !isMetaConfigured() && isApifyConfigured() && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flex: 1 }}>
                  <input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} className="input" placeholder="https://www.tiktok.com/@user/video/123..." style={{ fontSize: 12, flex: 1 }} />
                  <button onClick={() => scrapeComments("apify")} disabled={scraping || !tiktokUrl.trim()} className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }}>
                    {scraping ? "Scraping..." : "Scrape"}
                  </button>
                </div>
              )}
              {(isTikTokConfigured() || isMetaConfigured()) && <span style={{ fontSize: 10.5, color: "var(--green)" }}>● Includes hidden comments</span>}
            </div>
            {isTikTokConfigured() && !(ad.channelIds || {}).tiktok?.trim() && <div style={{ marginTop: 6, fontSize: 11, color: "var(--yellow)" }}>TikTok: ad set ID needed -- auto-matched on next TW sync</div>}
            {isMetaConfigured() && !(ad.channelIds || {}).meta?.trim() && <div style={{ marginTop: 6, fontSize: 11, color: "var(--yellow)" }}>Meta: ad set ID needed -- auto-matched on next TW sync</div>}
            {!isTikTokConfigured() && !isMetaConfigured() && !isApifyConfigured() && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                <span style={{ color: "var(--accent-light)" }}>Configure TikTok or Meta API in Settings to pull comments</span>
              </div>
            )}
            {scrapeErr && <div style={{ marginTop: 6, fontSize: 12, color: scrapeErr.includes("new comments") ? "var(--green-light)" : "var(--red-light)" }}>{scrapeErr}</div>}
          </div>}

          {/* Sentiment filters */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${ad.comments.length})`, color: "var(--text-secondary)" },
              { id: "positive", label: `Positive (${ad.comments.filter(c => c.sentiment === "positive").length})`, color: "var(--green)" },
              { id: "neutral", label: `Neutral (${ad.comments.filter(c => c.sentiment === "neutral").length})`, color: "var(--text-tertiary)" },
              { id: "negative", label: `Negative (${ad.comments.filter(c => c.sentiment === "negative").length})`, color: "var(--red)" },
            ].map(f => (
              <button key={f.id} onClick={() => setCommentFilter(f.id)}
                className={`btn btn-xs ${commentFilter === f.id ? "" : "btn-ghost"}`}
                style={commentFilter === f.id ? { background: f.color + "15", borderColor: f.color + "40", color: f.color } : {}}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: f.color, marginRight: 4 }} />
                {f.label}
              </button>
            ))}
          </div>

          {ad.comments.filter(c => c.hidden).length > 0 && <div className="card-flat" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 12, fontSize: 12.5, color: "var(--red-light)" }}>
            {ad.comments.filter(c => c.hidden).length} hidden negatives — critical market intel.
          </div>}

          <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 12 }}>
            {filteredComments.length === 0 && <div className="empty-state">{ad.comments.length === 0 ? "No comments scraped yet" : "No comments match this filter"}</div>}
            <div className="stagger">
              {filteredComments.map(c => <div key={c.id} className="card-flat" style={{ marginBottom: 6, borderColor: c.hidden ? "var(--red-border)" : "var(--border-light)", background: c.hidden ? "var(--red-bg)" : "var(--bg-card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.sentiment === "positive" ? "var(--green)" : c.sentiment === "negative" ? "var(--red)" : "var(--text-muted)" }} />
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{c.sentiment}</span>
                  {c.hidden && <span className="badge badge-red">Hidden</span>}
                  {!isEditor && <button onClick={() => dispatch({ type: "RM_COMMENT", aid: ad.id, cid: c.id })} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>✕</button>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>"{c.text}"</div>
              </div>)}
            </div>
          </div>
        </div>
      )}

      {/* ── THREAD (team discussion) ── */}
      {/* ── ANALYSIS ── */}
      {tab === "analysis" && (
        <div className="animate-fade">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="section-title" style={{ margin: 0 }}>AI Analysis</div>
            {ad.stage === "live" && ad.metrics.length > 0 && !isEditor && <button onClick={analyze} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Running..." : "Run Analysis"}</button>}
          </div>
          {/* Video upload + engine info */}
          {!isEditor && isGeminiConfigured() && !busy && <div className="card-flat" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>Ad Creative Video</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {videoFile
                    ? <span style={{ color: videoFile.size > 100 * 1024 * 1024 ? "var(--red-light)" : videoFile.size > 20 * 1024 * 1024 && !isProxyConfigured() ? "var(--yellow-light)" : "var(--green-light)" }}>
                        {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
                        {videoFile.size > 100 * 1024 * 1024 ? " -- too large, compress to under 100MB first" : videoFile.size > 20 * 1024 * 1024 && !isProxyConfigured() ? " -- over 20MB, add upload proxy in Settings" : ""}
                      </span>
                    : "Upload your ad video for Gemini to watch and analyze (under 20MB direct, up to 100MB with proxy)"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={videoInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) setVideoFile(e.target.files[0]); }} />
                <button onClick={() => videoInputRef.current?.click()} className="btn btn-ghost btn-sm">{videoFile ? "Change" : "Upload Video"}</button>
                {videoFile && <button onClick={() => { setVideoFile(null); if (videoInputRef.current) videoInputRef.current.value = ""; }} className="btn btn-ghost btn-sm" style={{ color: "var(--red-light)" }}>Remove</button>}
              </div>
            </div>
          </div>}
          {!busy && !isGeminiConfigured() && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
            {isConfigured("claude") ? "Claude text analysis (add Gemini key for video analysis)" : "No AI configured -- add a Gemini or Claude key in Settings"}
          </div>}
          {/* Success banner */}
          {!busy && aiStatus && <div className="card-flat" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)", marginBottom: 12, fontSize: 12.5, color: "var(--green-light)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>&#10003;</span> {aiStatus}
          </div>}
          {ad.analyses.length === 0 && !busy && <div className="empty-state">{ad.stage === "live" && ad.metrics.length > 0 ? "Click 'Run Analysis' to get AI insights." : "Needs live metrics + comments first."}</div>}
          {busy && <div className="empty-state"><div style={{ color: "var(--accent-light)" }}>{aiStatus || `Analyzing ${ad.comments.length} comments + ${ad.metrics.length} days of data...`}</div></div>}
          <div className="stagger">
            {[...ad.analyses].reverse().map(a => <div key={a.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="badge badge-accent">Analysis</span>
                  {a.engine && <span className="badge" style={{ background: a.mode === "video" ? "var(--green-bg)" : "var(--bg-elevated)", border: "1px solid " + (a.mode === "video" ? "var(--green-border)" : "var(--border)"), color: a.mode === "video" ? "var(--green-light)" : "var(--text-tertiary)", fontSize: 10 }}>
                    {a.mode === "video" ? "Video" : "Text"} -- {a.engine}
                  </span>}
                </div>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{a.ts}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>{a.summary}</div>
              {a.findings?.map((f, i) => { const st = findingStyle(f.type);
                return <div key={i} style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: st.bg, border: "1px solid " + st.bc, marginBottom: 5 }}>
                  <span style={{ color: st.c, fontWeight: 700, fontSize: 12, marginRight: 7 }}>{st.ic}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{f.text}</span>
                </div>; })}
              {a.nextIterationPlan && a.nextIterationPlan !== "null" && <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--red-bg)", border: "1px solid var(--red-border)", marginTop: 8 }}>
                <div style={{ fontSize: 10.5, color: "var(--red)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Next Iteration Plan</div>
                <div style={{ fontSize: 12.5, color: "var(--red-light)", lineHeight: 1.5 }}>{a.nextIterationPlan}</div>
              </div>}
              {a.suggestedLearnings?.length > 0 && <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 4 }}>Auto-extracted learnings:</div>
                {a.suggestedLearnings.map((l, j) => <div key={j} style={{ fontSize: 11.5, color: "var(--text-secondary)", padding: "2px 0" }}>
                  <span className="badge badge-accent" style={{ marginRight: 5 }}>{l.type.replace(/_/g, " ")}</span>{l.text}
                </div>)}
              </div>}
            </div>)}
          </div>
        </div>
      )}

      {/* ── LEARNINGS ── */}
      {tab === "learnings" && (
        <div className="animate-fade">
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 12 }}>Learnings feed back into product workspace, VSL generator, angle generator.</div>
          <div className="stagger">
            {ad.learnings.map(l => <div key={l.id} className="card-flat" style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="badge badge-accent">{l.type.replace(/_/g, " ")}</span>
                {!isEditor && <button onClick={() => dispatch({ type: "RM_LEARNING", aid: ad.id, lid: l.id })} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>✕</button>}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 4 }}>{l.text}</div>
            </div>)}
          </div>
          {!isEditor && <div className="card-flat" style={{ marginTop: 14 }}>
            <div className="section-title">Capture Learning</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {LT.map(t => <button key={t} onClick={() => setNl(p => ({ ...p, type: t }))}
                className={`btn btn-xs ${nl.type === t ? "" : "btn-ghost"}`}
                style={nl.type === t ? { background: "var(--accent-bg)", color: "var(--accent-light)", borderColor: "var(--accent-border)" } : {}}>
                {t.replace(/_/g, " ")}
              </button>)}
            </div>
            <textarea value={nl.text} onChange={e => setNl(p => ({ ...p, text: e.target.value }))} rows={2} className="input" placeholder="What did we learn?" />
            <button onClick={addLearning} className="btn btn-primary btn-sm" style={{ marginTop: 8, opacity: nl.text.trim() ? 1 : 0.4 }}>+ Save</button>
          </div>}
        </div>
      )}
      </div>{/* end left column */}

      {/* Right column: Discussion */}
      <div style={{ position: "sticky", top: 20 }}>
        <div style={{ background: "var(--bg-elevated)", borderRadius: 10, border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 320 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Discussion</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{ad.thread.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            {ad.thread.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "30px 0" }}>No messages yet</div>}
            {ad.thread.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, padding: "8px 10px", background: m.from === userName ? "var(--accent-bg)" : "var(--bg-card)", borderRadius: 8, border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: m.from === userName ? "var(--accent)" : "var(--text-primary)" }}>{m.from}</span>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{m.ts}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{renderMentions(m.text)}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-light)", position: "relative" }}>
            {showMentions && memberNames.filter(m => m.name.toLowerCase().includes(mentionFilter)).length > 0 && (
              <div style={{ position: "absolute", bottom: "100%", left: 14, right: 14, marginBottom: 4, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-lg)", maxHeight: 120, overflow: "auto", zIndex: 10 }}>
                {memberNames.filter(m => m.name.toLowerCase().includes(mentionFilter)).map(m => (
                  <div key={m.userId} onClick={() => insertMention(m.name)} style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border-light)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{m.name}</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "capitalize" }}>{m.role}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={msg} onChange={handleMsgChange} onKeyDown={e => { if (e.key === "Enter") { sendMsg(); setShowMentions(false); } if (e.key === "Escape") setShowMentions(false); }} placeholder="Message... @ to mention" className="input" style={{ flex: 1, fontSize: 12, padding: "7px 10px", borderRadius: 8 }} />
              <button onClick={sendMsg} className="btn btn-primary btn-xs" style={{ borderRadius: 8, padding: "7px 14px" }}>Send</button>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end grid */}
    </div>
  );
}

// ════════════════════════════════════════════════
// PIPELINE CARD
// ════════════════════════════════════════════════
// PIPELINE SHEET VIEW
// ════════════════════════════════════════════════

const SHEET_STATUS_OPTIONS = ["Concept", "Scripted", "In Production", "Ready to Launch", "Live", "Winner", "Killed"];
const SHEET_FORMAT_OPTIONS = ["UGC", "Image", "Carousel", "VSL", "Talking Head", "B-Roll", "Mashup", "Other"];
const SHEET_GRABS_OPTIONS = ["Yes - Strong Hook", "Somewhat", "No - Weak", "Untested"];
const SHEET_AD_FORMAT_OPTIONS = ["Single Static", "Video", "Carousel"];
const SHEET_VARIABLE_OPTIONS = ["Hook", "Lead", "Unique Mechanism", "Body", "Close"];

function PipelineSheet({ ads, dispatch, th, onOpenAd, strategyData }) {
  const avatarNames = (strategyData?.avatars || []).map(a => a.name).filter(Boolean);
  const desireList = (strategyData?.desires || []).map(d => d.want).filter(Boolean);
  const triggerList = (strategyData?.emotional_triggers || []).map(t => t.trigger).filter(Boolean);

  const updateStrategy = (adId, key, value) => {
    dispatch({ type: "UPDATE", id: adId, data: { strategy: { ...((ads.find(a => a.id === adId) || {}).strategy || {}), [key]: value } } });
  };

  const cellS = { fontSize: 10, padding: "3px 6px", border: "none", background: "transparent" };
  const selS = { fontSize: 10, padding: "3px 4px", border: "none", background: "transparent" };
  const roS = { padding: "0 6px", fontSize: 10, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  const COLS = "150px 90px 70px 60px 1fr 80px 110px 1fr 110px 100px 110px 120px 100px 1fr 70px 1fr 100px 100px 80px 80px 80px 70px 90px 100px";
  const HEADERS = ["Ad Name", "Stage", "Editor", "Batch", "Concept", "Format", "Avatar", "Hook / Headline", "Ad Angle", "Grabs Attn?", "Desire", "Trigger", "Objections?", "Why Not?", "Confidence", "Why It Should Work", "Ad Format", "Variable Tested", "Deadline", "Checklist", "ROAS", "Results", "Key Learnings", "Status"];
  const MW = 2600;

  return (
    <div>
      <div className="ads-lab-scroll" style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-lg)" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 0, padding: "8px 0", borderBottom: "2px solid var(--border)", minWidth: MW, background: "var(--bg-elevated)" }}>
          {HEADERS.map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, padding: "0 6px" }}>{h}</div>
          ))}
        </div>

        {ads.map((ad, i) => {
          const s = ad.strategy || {};
          const stg = STAGES.find(x => x.id === ad.stage);
          const cp = getChecklistProgress(ad, ad.stage);
          const bc = bestChannel(ad, th);
          const la = bc ? bc.metric : lm(ad);
          const roas = bc?.roas ?? la?.roas ?? 0;
          const cl = ad.stage === "live" ? CL(roas || null, th) : "none";
          const bg = i % 2 === 0 ? "transparent" : "var(--bg-elevated)";
          return (
            <div key={ad.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 0, padding: "3px 0", borderBottom: "1px solid var(--border-light)", alignItems: "center", minWidth: MW, background: bg }}>
              {/* Ad Name */}
              <div onClick={() => onOpenAd(ad)} style={{ padding: "0 6px", fontSize: 11, fontWeight: 600, color: "var(--accent)", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ad.name}>{ad.name}</div>
              {/* Stage */}
              <div style={{ padding: "0 6px" }}>
                <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: "var(--radius-full)", background: stg.color + "15", color: stg.color, fontWeight: 500 }}>{stg.label}</span>
              </div>
              {/* Editor */}
              <div style={{ ...roS, fontSize: 11, color: "var(--text-secondary)" }}>{ad.editor || "—"}</div>
              {/* Batch */}
              <input className="input" value={s.batch || ""} onChange={e => updateStrategy(ad.id, "batch", e.target.value)} placeholder="#" style={cellS} />
              {/* Concept */}
              <input className="input" value={s.concept || ""} onChange={e => updateStrategy(ad.id, "concept", e.target.value)} placeholder="Concept..." style={cellS} />
              {/* Format */}
              <select className="input" value={s.format || ad.type || ""} onChange={e => updateStrategy(ad.id, "format", e.target.value)} style={selS}>
                <option value="">...</option>
                {SHEET_FORMAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {/* Avatar */}
              <select className="input" value={s.avatar || ""} onChange={e => updateStrategy(ad.id, "avatar", e.target.value)} style={selS}>
                <option value="">...</option>
                {avatarNames.map(a => <option key={a} value={a}>{a.length > 30 ? a.slice(0, 30) + "..." : a}</option>)}
              </select>
              {/* Hook / Headline */}
              <input className="input" value={s.hook || ""} onChange={e => updateStrategy(ad.id, "hook", e.target.value)} placeholder="Hook..." style={cellS} />
              {/* Ad Angle */}
              <input className="input" value={s.angle || ""} onChange={e => updateStrategy(ad.id, "angle", e.target.value)} placeholder="Angle..." style={cellS} />
              {/* Grabs Attn? */}
              <select className="input" value={s.grabs_attention || ""} onChange={e => updateStrategy(ad.id, "grabs_attention", e.target.value)} style={selS}>
                <option value="">...</option>
                {SHEET_GRABS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {/* Desire */}
              <select className="input" value={s.desire || ""} onChange={e => updateStrategy(ad.id, "desire", e.target.value)} style={selS}>
                <option value="">...</option>
                {desireList.map(d => <option key={d} value={d}>{d.length > 30 ? d.slice(0, 30) + "..." : d}</option>)}
              </select>
              {/* Trigger */}
              <select className="input" value={s.trigger || ""} onChange={e => updateStrategy(ad.id, "trigger", e.target.value)} style={selS}>
                <option value="">...</option>
                {triggerList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {/* Objections? */}
              <select className="input" value={s.handles_objections || ""} onChange={e => updateStrategy(ad.id, "handles_objections", e.target.value)} style={selS}>
                <option value="">...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Partially">Partially</option>
              </select>
              {/* Why Not? */}
              <input className="input" value={s.why_not || ""} onChange={e => updateStrategy(ad.id, "why_not", e.target.value)} placeholder="If no, why..." style={cellS} />
              {/* Confidence */}
              <input className="input" type="number" min="1" max="10" value={s.confidence || ""} onChange={e => updateStrategy(ad.id, "confidence", e.target.value)} placeholder="1-10" style={cellS} />
              {/* Why It Should Work */}
              <input className="input" value={s.why_work || ""} onChange={e => updateStrategy(ad.id, "why_work", e.target.value)} placeholder="Why it should work..." style={cellS} />
              {/* Ad Format */}
              <select className="input" value={s.ad_format || ""} onChange={e => updateStrategy(ad.id, "ad_format", e.target.value)} style={selS}>
                <option value="">...</option>
                {SHEET_AD_FORMAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {/* Variable Tested */}
              <select className="input" value={s.variable_tested || ""} onChange={e => updateStrategy(ad.id, "variable_tested", e.target.value)} style={selS}>
                <option value="">...</option>
                {SHEET_VARIABLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {/* Deadline */}
              <div style={{ padding: "0 6px", fontSize: 10, color: od(ad.deadline) ? "var(--red)" : "var(--text-secondary)" }}>{ad.deadline ? fd(ad.deadline) : "—"}</div>
              {/* Checklist */}
              <div style={{ padding: "0 6px" }}>
                {cp.total > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: cp.pct + "%", background: cp.pct === 100 ? "var(--green)" : "var(--accent)", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{cp.done}/{cp.total}</span>
                  </div>
                ) : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>}
              </div>
              {/* ROAS */}
              <div style={{ padding: "0 6px", fontSize: 11, fontWeight: 600, fontFamily: "var(--fm)", color: cl !== "none" ? CS[cl].c : "var(--text-muted)" }}>
                {ad.stage === "live" && roas > 0 ? `${roas}x` : "—"}
              </div>
              {/* Results */}
              <input className="input" value={s.results || ""} onChange={e => updateStrategy(ad.id, "results", e.target.value)} placeholder="Results..." style={cellS} />
              {/* Key Learnings */}
              <input className="input" value={s.learnings || ""} onChange={e => updateStrategy(ad.id, "learnings", e.target.value)} placeholder="Learnings..." style={cellS} />
              {/* Status */}
              <select className="input" value={s.ad_status || ""} onChange={e => updateStrategy(ad.id, "ad_status", e.target.value)} style={selS}>
                <option value="">...</option>
                {SHEET_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          );
        })}

        {ads.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No ads in pipeline</div>}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>{ads.length} ad{ads.length !== 1 ? "s" : ""} in lab · Click ad name to open</div>
    </div>
  );
}

// ════════════════════════════════════════════════

function PCard({ ad, th, onClick, onMove, onIterate }) {
  const bc = bestChannel(ad, th);
  const la = bc ? bc.metric : lm(ad);
  const adRoas = bc?.roas ?? la?.roas ?? 0;
  const cl = ad.stage === "live" ? CL(adRoas || null, th) : "none", cs = CS[cl];
  const ix = SO.indexOf(ad.stage), ov = od(ad.deadline), gdays = gd(ad, th);
  const unresolvedRevs = ad.revisionRequests?.filter(r => !r.resolved).length || 0;
  const hasIds = hasAnyChId(ad.channelIds);
  const hasChData = ad.channelMetrics && Object.values(ad.channelMetrics).some(m => m?.length > 0);
  const noDataYet = !hasChData && ad.stage === "live";

  return (
    <div className="pipeline-card" onClick={() => onClick(ad)}>
      {ad.stage === "live" && cl !== "none" && <div className="status-bar" style={{ background: cs.c }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3, flex: 1 }}>{ad.name}</div>
        {ad.deadline && <span style={{ fontSize: 10, color: ov ? "var(--red)" : "var(--text-tertiary)", fontFamily: "var(--fm)", flexShrink: 0, marginLeft: 8 }}>{fd(ad.deadline)}</span>}
      </div>
      <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
        <span className="badge" style={{ fontSize: 10 }}>{ad.type}</span>
        {ad.editor && <span className="badge" style={{ fontSize: 10 }}>@ {ad.editor}</span>}
        {ad.iterations > 0 && <span className="badge badge-yellow" style={{ fontSize: 10 }}>iter {ad.iterations}</span>}
        {ov && <span className="badge badge-red" style={{ fontSize: 10 }}>Overdue</span>}
        {ad.parentId && <span className="badge badge-green" style={{ fontSize: 10 }}>var</span>}
        {unresolvedRevs > 0 && <span className="badge badge-yellow" style={{ fontSize: 10 }}>{unresolvedRevs} rev</span>}
      </div>

      {/* Checklist progress */}
      {(() => { const cp = getChecklistProgress(ad, ad.stage); const stale = getStaleItems(ad, ad.stage); return cp.total > 0 ? (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: cp.pct === 100 ? "var(--green)" : "var(--text-tertiary)" }}>{cp.done}/{cp.total} tasks</span>
            {stale.length > 0 && <span style={{ fontSize: 9, color: "var(--red)" }}>{stale.length} overdue</span>}
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, width: cp.pct + "%", background: cp.pct === 100 ? "var(--green)" : stale.length > 0 ? "var(--red)" : "var(--accent)", transition: "width 0.3s ease" }} />
          </div>
        </div>
      ) : null; })()}

      {ad.notes && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.notes}</div>}

      {ad.stage === "live" && la && bc && <div style={{ fontSize: 11, marginBottom: 6, fontFamily: "var(--fm)" }}>
        <span style={{ color: bc.color, fontSize: 9.5, fontWeight: 600 }}>{bc.label} </span>
        <span style={{ color: "var(--text-tertiary)" }}>ROAS: </span>
        <span style={{ color: cs.c, fontWeight: 700 }}>{adRoas}x</span>
        {la.cpa > 0 && <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>CPA: {CUR} {la.cpa}</span>}
        <span className="badge" style={{ background: cs.bg, color: cs.c, marginLeft: 6, fontSize: 9 }}>{cs.l}</span>
      </div>}
      {ad.stage === "live" && la && !bc && <div style={{ fontSize: 11, marginBottom: 6, fontFamily: "var(--fm)" }}>
        <span style={{ color: "var(--text-tertiary)" }}>ROAS: </span><span style={{ color: cs.c, fontWeight: 700 }}>{adRoas}x</span>
        {la.cpa > 0 && <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>CPA: {CUR} {la.cpa}</span>}
        <span className="badge" style={{ background: cs.bg, color: cs.c, marginLeft: 6, fontSize: 9 }}>{cs.l}</span>
      </div>}

      {noDataYet && <div style={{ fontSize: 10, color: "var(--yellow)", marginBottom: 5 }}>Awaiting sync</div>}
      {ad.stage === "live" && cl === "green" && <div style={{ fontSize: 10, color: "var(--green)", marginBottom: 5 }}>Scale</div>}
      {ad.stage === "live" && cl === "red" && <div style={{ fontSize: 10, color: "var(--red)", marginBottom: 5 }}>Iter {ad.iterations}/{ad.maxIter}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 3 }}>
          {ix > 0 && <button onClick={() => onMove(ad.id, SO[ix - 1])} className="btn btn-ghost btn-xs" style={{ padding: "2px 6px", minWidth: 22 }}>←</button>}
          {ix < 3 && <button onClick={() => onMove(ad.id, SO[ix + 1])} className="btn btn-ghost btn-xs" style={{ padding: "2px 6px", minWidth: 22 }}>→</button>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {ad.thread.length > 0 && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>💬 {ad.thread.length}</span>}
          {ad.learnings.length > 0 && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>🔄 {ad.learnings.length}</span>}
          {ad.comments.length > 0 && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>💭 {ad.comments.length}</span>}
          {ad.stage === "live" && cl === "red" && ad.iterations < ad.maxIter && <button onClick={() => onIterate(ad.id)} className="btn btn-danger btn-xs">Iterate</button>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// EDITOR PANEL
// ════════════════════════════════════════════════

function EditorPanel({ ads, th, editors, addEditor, removeEditor, workspaces, activeWorkspaceId }) {
  const [editorTab, setEditorTab] = useState("performance");
  const [showAdd, setShowAdd] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const [allProfiles, setAllProfiles] = useState({});
  const [commissionEditor, setCommissionEditor] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetchAllEditorProfiles(activeWorkspaceId).then(profiles => {
      const map = {};
      profiles.forEach(p => { map[p.display_name || p.editor_name] = p; });
      setAllProfiles(map);
    }).catch(() => {});
  }, [activeWorkspaceId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeWorkspaceId) return;
    setInviteLoading(true);
    setInviteResult(null);
    try {
      const { data: userId } = await supabase.rpc("get_user_id_by_email", { lookup_email: inviteEmail.trim() });
      if (!userId) {
        setInviteResult({ ok: false, msg: "User not found. They must sign up first." });
        setInviteLoading(false);
        setTimeout(() => setInviteResult(null), 4000);
        return;
      }
      // Get their display name from profile or email
      const profile = await fetchEditorProfile(userId);
      const editorName = profile?.display_name || inviteEmail.split("@")[0];
      await addMemberToWorkspace(activeWorkspaceId, userId, "editor", editorName);
      addEditor(editorName);
      setInviteResult({ ok: true, msg: `Added ${editorName} to workspace` });
      setInviteEmail("");
      setShowAdd(false);
    } catch (e) {
      setInviteResult({ ok: false, msg: e.message || "Failed to add editor" });
    }
    setInviteLoading(false);
    setTimeout(() => setInviteResult(null), 4000);
  };

  const findProfile = (name) => {
    return allProfiles[name] || null;
  };

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Editors</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Performance, commissions, and team management.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm">{showAdd ? "Cancel" : "+ Add Editor"}</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <button onClick={() => setEditorTab("performance")} className={`btn btn-sm ${editorTab === "performance" ? "btn-primary" : "btn-ghost"}`}>Performance</button>
        <button onClick={() => setEditorTab("commission")} className={`btn btn-sm ${editorTab === "commission" ? "btn-primary" : "btn-ghost"}`}>Commission</button>
      </div>
      {showAdd && <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label" style={{ marginTop: 0 }}>Editor Email</label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleInvite()} className="input" placeholder="editor@email.com" autoFocus />
          </div>
          <button onClick={handleInvite} disabled={inviteLoading || !inviteEmail.trim()} className="btn btn-primary btn-sm">
            {inviteLoading ? "Adding..." : "Invite to Workspace"}
          </button>
        </div>
        {inviteResult && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-md)", marginTop: 8, fontSize: 12.5,
            background: inviteResult.ok ? "var(--green-bg)" : "var(--red-bg)",
            border: `1px solid ${inviteResult.ok ? "var(--green-border)" : "var(--red-border)"}`,
            color: inviteResult.ok ? "var(--green-light)" : "var(--red-light)",
          }}>
            {inviteResult.ok ? "✓" : "!"} {inviteResult.msg}
          </div>
        )}
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>The editor must have an Ad Lifeline account first.</p>
      </div>}
      {/* ── COMMISSION TAB ── */}
      {editorTab === "commission" && (
        <div>
          {commissionEditor ? (
            <div>
              <button onClick={() => setCommissionEditor(null)} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← All Editors</button>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>{commissionEditor.name} — Commission</div>
              <CommissionDashboard ads={ads} editorName={commissionEditor.name} commissionPct={commissionEditor.commissionPct} />
            </div>
          ) : (
            <div>
              <div className="section-title">Editor Commissions</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Click an editor to see their detailed commission breakdown. Set commission % in each editor's profile.</div>
              {editors.map(name => {
                const profile = findProfile(name);
                const commPct = profile?.commission_pct ?? profile?.commissionPct ?? 0;
                const edAds = ads.filter(a => a.editor === name && a.stage !== "killed");
                const totalSpend = edAds.reduce((s, a) => {
                  let sp = (a.metrics || []).reduce((ss, m) => ss + (m.spend || 0), 0);
                  const chm = a.channelMetrics || {};
                  Object.values(chm).forEach(metrics => { sp += (metrics || []).reduce((ss, m) => ss + (m.spend || 0), 0); });
                  return s + sp;
                }, 0);
                const commission = totalSpend * (commPct / 100);
                return (
                  <div key={name} className="card-flat" style={{ marginBottom: 8, padding: "12px 14px", cursor: "pointer" }} onClick={() => setCommissionEditor({ name, commissionPct: commPct })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--accent-light)" }}>{name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{commPct}% commission · {edAds.length} ads</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>Spend: {CUR} {totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>{CUR} {commission.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PERFORMANCE TAB ── */}
      {editorTab === "performance" && <><div style={{ display: "grid", gridTemplateColumns: editors.length < 3 ? `repeat(${Math.max(1, editors.length)},1fr)` : "repeat(3,1fr)", gap: 12 }}>
        {editors.map(name => {
          const all = ads.filter(a => a.editor === name && a.stage !== "killed");
          const live = all.filter(a => a.stage === "live");
          const winners = live.filter(a => { const l = lm(a); return l && CL(l.roas ?? 0, th) === "green" && gd(a, th) >= 5; });
          const overdueN = all.filter(a => od(a.deadline)).length;
          const completed = all.filter(a => a.stage === "live" || a.finalApproved);
          const winRate = completed.length > 0 ? Math.round((winners.length / completed.length) * 100) : 0;
          const revCount = all.reduce((s, a) => s + (a.revisionRequests?.length || 0), 0);
          const qualScore = Math.max(0, Math.min(100, 100 - revCount * 8));
          const onTime = all.length > 0 ? Math.round(((all.length - overdueN) / all.length) * 100) : 100;
          const bonus = winners.length * 75;
          const health = winRate >= 25 && onTime >= 85 && qualScore >= 75 ? "green" : winRate >= 10 || onTime >= 70 ? "yellow" : "red";
          const hc = health === "green" ? "var(--green)" : health === "yellow" ? "var(--yellow)" : "var(--red)";
          const profile = findProfile(name);
          const totalProdCost = all.reduce((s, a) => s + (parseFloat(a.production_cost) || 0), 0);
          const costPerWinner = winners.length > 0 ? totalProdCost / winners.length : 0;
          const adSpendOf = (a) => [...(a.metrics || [])].reduce((s, m) => s + (m.spend || 0), 0);
          const totalAdSpend = all.reduce((s, a) => s + adSpendOf(a), 0);
          const roasProfit = all.reduce((s, a) => { const r = lm(a)?.roas || 0; return s + (adSpendOf(a) * Math.max(0, r - 1)); }, 0);
          const recouped = totalProdCost > 0 && roasProfit >= totalProdCost;

          return (
            <div key={name} className="card" onClick={() => setSelectedEditor({ name, profile, stats: { winRate, onTime, qualScore, bonus, all: all.length, overdueN, health } })} style={{ cursor: "pointer", transition: "all var(--transition)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(profile?.photo_url || profile?.photoUrl)
                    ? <img src={profile.photo_url || profile.photoUrl} style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", border: "2px solid " + hc, objectFit: "cover" }} />
                    : <div style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", background: "var(--accent-bg)", border: "2px solid " + hc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: hc }}>{name[0]}</div>}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                    <span className={`badge ${health === "green" ? "badge-green" : health === "yellow" ? "badge-yellow" : "badge-red"}`}>{health}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green-light)", fontFamily: "var(--fm)" }}>{CUR} {bonus}</div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Bonus</div>
                </div>
              </div>
              {(profile?.weekly_minutes || profile?.weeklyMinutes) && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Capacity: {profile.weekly_minutes || profile.weeklyMinutes} min/week</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                {[[winRate + "%", "Win Rate", winRate >= 25 ? "var(--green)" : "var(--yellow)"], [onTime + "%", "On-Time", onTime >= 85 ? "var(--green)" : "var(--yellow)"], [qualScore, "Quality", qualScore >= 75 ? "var(--green)" : "var(--yellow)"], [all.length, "Assigned", "var(--accent-light)"]].map(([v, l, c]) => (
                  <div key={l} className="stat-box">
                    <div className="stat-value" style={{ fontSize: 14, color: c }}>{v}</div>
                    <div className="stat-label">{l}</div>
                  </div>
                ))}
              </div>
              {totalProdCost > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-light)" }}>
                  <div className="stat-box">
                    <div className="stat-value" style={{ fontSize: 12 }}>${totalProdCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                    <div className="stat-label">Total Cost</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value" style={{ fontSize: 12 }}>{costPerWinner > 0 ? "$" + costPerWinner.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}</div>
                    <div className="stat-label">Cost/Winner</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value" style={{ fontSize: 12, color: recouped ? "var(--green)" : "var(--yellow)" }}>{recouped ? "Yes" : totalProdCost > 0 ? `${Math.round((roasProfit / totalProdCost) * 100)}%` : "—"}</div>
                    <div className="stat-label">Recouped</div>
                  </div>
                </div>
              )}
              {overdueN > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--red-light)" }}>{overdueN} overdue</div>}
              {all.length === 0 && <button onClick={(e) => { e.stopPropagation(); removeEditor(name); }} className="btn btn-ghost btn-xs" style={{ marginTop: 8, color: "var(--red-light)", fontSize: 10.5 }}>Remove Editor</button>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>Win bonus: <span style={{ color: "var(--green-light)" }}>SAR 75</span>/winner (green CPA 5+ days) · Quality = 100 - (revisions x 8) · Health = composite</div>
      </>}

      {/* Editor Detail Modal */}
      {selectedEditor && <EditorDetailModal editor={selectedEditor} onClose={() => setSelectedEditor(null)} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />}
    </div>
  );
}

function WorkspaceAssignment({ editorName, editorUserId, workspaces }) {
  const [assigned, setAssigned] = useState({});
  const [loading, setLoading] = useState({});

  useEffect(() => {
    if (!editorUserId) return;
    // Fetch which workspaces this editor is a member of
    const load = async () => {
      try {
        const { data } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", editorUserId);
        const map = {};
        (data || []).forEach(m => { map[m.workspace_id] = true; });
        setAssigned(map);
      } catch (e) { console.error("Load assignments:", e); }
    };
    load();
  }, [editorUserId]);

  const toggle = async (wsId) => {
    if (!editorUserId) return;
    setLoading(prev => ({ ...prev, [wsId]: true }));
    try {
      if (assigned[wsId]) {
        await removeMemberFromWorkspace(wsId, editorUserId);
        setAssigned(prev => { const n = { ...prev }; delete n[wsId]; return n; });
      } else {
        await addMemberToWorkspace(wsId, editorUserId, "editor", editorName);
        setAssigned(prev => ({ ...prev, [wsId]: true }));
      }
    } catch (e) {
      console.error("Toggle workspace:", e);
      alert("Error: " + e.message);
    }
    setLoading(prev => ({ ...prev, [wsId]: false }));
  };

  if (!editorUserId) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="section-title">Workspace Access</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>This editor hasn't signed up yet. They need an account before you can assign workspaces.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title">Workspace Access</div>
      <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>Toggle which workspaces this editor can access.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {workspaces.map(ws => (
          <div key={ws.id} onClick={() => !loading[ws.id] && toggle(ws.id)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: "var(--radius-md)",
            background: assigned[ws.id] ? "var(--accent-bg)" : "var(--bg-elevated)",
            border: `1px solid ${assigned[ws.id] ? "var(--accent-border)" : "var(--border-light)"}`,
            cursor: loading[ws.id] ? "wait" : "pointer",
            transition: "all var(--transition)",
            opacity: loading[ws.id] ? 0.6 : 1,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              border: `2px solid ${assigned[ws.id] ? "var(--accent)" : "var(--border)"}`,
              background: assigned[ws.id] ? "var(--accent)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all var(--transition)",
            }}>
              {assigned[ws.id] && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: assigned[ws.id] ? "var(--accent-light)" : "var(--text-secondary)" }}>{ws.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorDetailModal({ editor, onClose, workspaces, activeWorkspaceId }) {
  const { name, profile, stats } = editor;
  const [pName, setPName] = useState(profile?.displayName || name);
  const [pPhoto, setPPhoto] = useState(profile?.photo_url || profile?.photoUrl || null);
  const [pPortfolio, setPPortfolio] = useState(profile?.portfolio_url || profile?.portfolioUrl || "");
  const [pRate, setPRate] = useState(profile?.compensation_rate || profile?.compensationRate || "");
  const [pMinutes, setPMinutes] = useState(profile?.weekly_minutes || profile?.weeklyMinutes || "");
  const [pCommission, setPCommission] = useState(profile?.commission_pct ?? profile?.commissionPct ?? 0);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (profile?.user_id) {
      try {
        await upsertEditorProfile(profile.user_id, {
          display_name: pName.trim(),
          photo_url: pPhoto,
          portfolio_url: pPortfolio.trim(),
          compensation_rate: pRate.trim(),
          weekly_minutes: parseInt(pMinutes) || 0,
          commission_pct: parseFloat(pCommission) || 0,
        });
      } catch (e) { console.error("Save profile error:", e); }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hc = stats.health === "green" ? "var(--green)" : stats.health === "yellow" ? "var(--yellow)" : "var(--red)";

  return (
    <Modal onClose={onClose}>
      <div style={{ maxWidth: 500 }}>
        {/* Header with photo */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <div style={{ position: "relative" }}>
            {pPhoto
              ? <img src={pPhoto} style={{ width: 64, height: 64, borderRadius: "var(--radius-full)", border: "3px solid " + hc, objectFit: "cover" }} />
              : <div style={{ width: 64, height: 64, borderRadius: "var(--radius-full)", background: "var(--accent-bg)", border: "3px solid " + hc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: hc }}>{name[0]}</div>}
            <button onClick={() => fileRef.current?.click()} style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✎</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>{name}</h3>
            <span className={`badge ${stats.health === "green" ? "badge-green" : stats.health === "yellow" ? "badge-yellow" : "badge-red"}`}>{stats.health}</span>
            {(profile?.onboarded_at || profile?.onboardedAt) && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>Joined {new Date(profile.onboarded_at || profile.onboardedAt).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 20 }}>
          {[[stats.winRate + "%", "Win Rate"], [stats.onTime + "%", "On-Time"], [stats.qualScore, "Quality"], [CUR + " " + stats.bonus, "Bonus"]].map(([v, l]) => (
            <div key={l} className="stat-box">
              <div className="stat-value" style={{ fontSize: 14 }}>{v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>

        {/* Editable profile fields */}
        <div className="section-title">Profile Details</div>
        <label className="label" style={{ marginTop: 8 }}>Full Name</label>
        <input value={pName} onChange={e => setPName(e.target.value)} className="input" />
        <label className="label">Portfolio URL</label>
        <input value={pPortfolio} onChange={e => setPPortfolio(e.target.value)} className="input" placeholder="https://..." />
        {pPortfolio && <a href={pPortfolio} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent-light)", display: "inline-block", marginTop: 4 }}>Open portfolio</a>}
        <label className="label">Rate Per Minute (USD)</label>
        <input type="number" step="0.01" value={pRate} onChange={e => setPRate(e.target.value)} className="input" placeholder="e.g. 20" />
        <label className="label">Weekly Capacity (minutes of video)</label>
        <input type="number" value={pMinutes} onChange={e => setPMinutes(e.target.value)} className="input" placeholder="e.g. 60" min="1" />
        <label className="label">Commission on Ad Spend (%)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" value={pCommission} onChange={e => setPCommission(e.target.value)} className="input" placeholder="0" min="0" max="100" step="0.1" style={{ width: 100 }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>% of total ad spend on their ads</span>
        </div>

        {/* Workspace assignment */}
        {workspaces && workspaces.length > 0 && (
          <WorkspaceAssignment editorName={name} editorUserId={profile?.user_id} workspaces={workspaces} />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <button onClick={handleSave} className="btn btn-primary btn-sm">Save Changes</button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
          {saved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════
// LEARNINGS PAGE
// ════════════════════════════════════════════════

function LearningsPage({ ads, workspaceLearnings, th }) {
  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Combine workspace learnings + ad-level learnings (deduped)
  const adLearnings = ads.flatMap(a => (a.learnings || []).map(l => ({ ...l, adName: a.name, adId: a.id, source: l.source || "manual" })));
  const wsTexts = new Set((workspaceLearnings || []).map(l => l.text));
  const combined = [...(workspaceLearnings || []), ...adLearnings.filter(l => !wsTexts.has(l.text))];

  // Apply filters
  const filtered = combined.filter(l => {
    if (filter !== "all" && l.type !== filter) return false;
    if (sourceFilter === "auto" && l.source !== "auto") return false;
    if (sourceFilter === "manual" && l.source === "auto") return false;
    if (search && !l.text.toLowerCase().includes(search.toLowerCase()) && !(l.adName || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by type
  const grouped = {};
  filtered.forEach(l => { const t = l.type || "general"; if (!grouped[t]) grouped[t] = []; grouped[t].push(l); });
  const types = Object.keys(grouped).sort();

  // Stats
  const totalAds = ads.filter(a => a.learnings?.length > 0).length;
  const winners = ads.filter(a => {
    const bc = bestChannel(a, th);
    const la = bc ? bc.metric : lm(a);
    const r = bc?.roas ?? la?.roas ?? 0;
    return r > 0 && CL(r, th) === "green";
  });
  const autoCount = combined.filter(l => l.source === "auto").length;
  const manualCount = combined.filter(l => l.source !== "auto").length;

  // Pattern detection: find the most common learning types
  const typeCounts = {};
  combined.forEach(l => { const t = l.type || "general"; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const topPatterns = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // High confidence learnings
  const highConf = combined.filter(l => l.confidence === "high");

  return (
    <div className="animate-fade">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Intelligence Flywheel</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          Every winning ad makes future ads smarter. Learnings are auto-injected into research and generation prompts.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Learnings", value: combined.length, color: "var(--accent-light)" },
          { label: "Auto-Captured", value: autoCount, color: "var(--green)" },
          { label: "Manual", value: manualCount, color: "var(--text-secondary)" },
          { label: "Active Winners", value: winners.length, color: "var(--green-light)" },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top patterns */}
      {topPatterns.length > 0 && <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent-border)" }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Top Intelligence Patterns</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topPatterns.map(([type, count]) => (
            <div key={type} onClick={() => setFilter(type)} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: "var(--radius-md)", background: filter === type ? "var(--accent-bg)" : "var(--bg-elevated)", border: `1px solid ${filter === type ? "var(--accent-border)" : "var(--border-light)"}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: filter === type ? "var(--accent-light)" : "var(--text-primary)" }}>{type.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* High confidence insights */}
      {highConf.length > 0 && <div className="card" style={{ marginBottom: 16, borderColor: "var(--green)" + "40" }}>
        <div className="section-title" style={{ marginBottom: 8, color: "var(--green)" }}>High-Confidence Insights ({highConf.length})</div>
        <div className="stagger">
          {highConf.slice(0, 5).map((l, i) => (
            <div key={i} className="card-flat" style={{ marginBottom: 6, borderColor: "var(--green)" + "20" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span className="badge badge-green">{(l.type || "general").replace(/_/g, " ")}</span>
                {l.adName && <span className="badge">{l.adName}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{l.text}</div>
              {l.evidence && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>Evidence: {l.evidence}</div>}
            </div>
          ))}
        </div>
      </div>}

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} className="input" placeholder="Search learnings..." style={{ width: 200, fontSize: 12 }} />
        <button onClick={() => setFilter("all")} className={`btn btn-xs ${filter === "all" ? "" : "btn-ghost"}`}
          style={filter === "all" ? { background: "var(--accent-bg)", color: "var(--accent-light)" } : {}}>All Types</button>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`btn btn-xs ${filter === t ? "" : "btn-ghost"}`}
            style={filter === t ? { background: "var(--accent-bg)", color: "var(--accent-light)" } : {}}>
            {t.replace(/_/g, " ")} ({grouped[t].length})
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[{ id: "all", l: "All" }, { id: "auto", l: "Auto" }, { id: "manual", l: "Manual" }].map(s => (
            <button key={s.id} onClick={() => setSourceFilter(s.id)} className={`btn btn-xs ${sourceFilter === s.id ? "" : "btn-ghost"}`}
              style={sourceFilter === s.id ? { background: s.id === "auto" ? "var(--green-bg)" : "var(--bg-elevated)", color: s.id === "auto" ? "var(--green)" : "var(--text-primary)", borderColor: s.id === "auto" ? "var(--green)" : "var(--border)" } : {}}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* Learnings list grouped by type */}
      {combined.length === 0 && <div className="empty-state">No learnings captured yet. When ads hit green CPA, the flywheel automatically analyzes them and extracts learnings.</div>}
      {filtered.length === 0 && combined.length > 0 && <div className="empty-state">No learnings match the current filters.</div>}
      {types.map(type => (
        <div key={type} style={{ marginBottom: 18 }}>
          <div className="section-title">{type.replace(/_/g, " ")} ({grouped[type].length})</div>
          <div className="stagger">
            {grouped[type].map((l, i) => (
              <div key={(l.id || i) + "-" + (l.adId || "")} className="card-flat" style={{ marginBottom: 6, borderColor: l.source === "auto" ? "var(--green)" + "20" : "var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {l.adName && <span className="badge badge-accent">{l.adName}</span>}
                    {l.source === "auto" && <span className="badge badge-green" style={{ fontSize: 9 }}>auto-captured</span>}
                    {l.confidence === "high" && <span style={{ fontSize: 9, color: "var(--green)", fontWeight: 600 }}>HIGH</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{l.text}</div>
                {l.evidence && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, fontStyle: "italic" }}>Evidence: {l.evidence}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════

export default function App({ session, userRole, userName, workspaces, activeWorkspaceId, onSelectWorkspace, onCreateWorkspace, onWorkspacesChange }) {
  const [ads, setAds] = useState([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [openAd, setOpenAd] = useState(null);
  const [openAdTab, setOpenAdTab] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [page, setPageRaw] = useState("pipeline");
  const [presenceState, setPresenceState] = useState({});
  const presenceRef = useRef(null);
  const [th, setTh] = useState(DT);
  const [role, setRole] = useState(userRole || "founder");
  const [editors, setEditors] = useState(DEFAULT_EDITORS);
  const [editorName, setEditorName] = useState(userRole === "editor" ? (userName || "") : "");
  const [myEditorProfile, setMyEditorProfile] = useState(null);
  const [earningsEditor, setEarningsEditor] = useState(null);
  const [editorProfiles, setEditorProfiles] = useState({});
  const setPage = (p) => { setPageRaw(p); if (presenceRef.current) presenceRef.current.updatePage(p); };
  const handleSignOut = () => supabase.auth.signOut();
  const [pipelineView, setPipelineView] = useState("kanban"); // "kanban" or "sheet"
  const [dragOver, setDragOver] = useState(null);
  const [gateMsg, setGateMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [strategyData, setStrategyData] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => localStorage.getItem("al_auto_sync") !== "false");
  const [lastAutoSync, setLastAutoSync] = useState(null);
  const [workspaceLearnings, setWorkspaceLearnings] = useState([]);
  const [flywheelStatus, setFlywheelStatus] = useState(null);
  const analyzedWinnersRef = useRef(new Set());
  const did = useRef(null);

  // Load ads + settings + editors from Supabase when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    setAdsLoading(true);

    const load = async () => {
      try {
        const [adsData, settings, members, stratData] = await Promise.all([
          fetchAds(activeWorkspaceId),
          getWorkspaceSettings(activeWorkspaceId),
          getWorkspaceMembers(activeWorkspaceId),
          fetchStrategyData(activeWorkspaceId),
        ]);
        if (cancelled) return;
        setAds(adsData);
        if (stratData) setStrategyData(stratData);
        setTh(settings);
        // Derive editor names from workspace members with editor role
        const editorNames = members.filter(m => m.role === "editor").map(m => m.editor_name || "Editor");
        // Also include unique editor names referenced in ads that may not be members yet
        const adEditors = [...new Set(adsData.map(a => a.editor).filter(Boolean))];
        const allEditors = [...new Set([...editorNames, ...adEditors])];
        setEditors(allEditors.length > 0 ? allEditors : DEFAULT_EDITORS);
        // Fix editor name matching: resolve from workspace_members or editor_profiles
        if (session?.user?.id && (userRole === "editor" || userRole === "strategist")) {
          const myMembership = members.find(m => m.user_id === session.user.id);
          const resolvedName = myMembership?.editor_name;
          if (resolvedName) {
            setEditorName(resolvedName);
          } else {
            // Fallback: check editor_profiles for display_name
            fetchEditorProfile(session.user.id).then(p => {
              if (p?.display_name) {
                setEditorName(p.display_name);
                // Backfill workspace_members.editor_name
                supabase.from("workspace_members").update({ editor_name: p.display_name }).eq("user_id", session.user.id).then(() => {});
              }
            }).catch(() => {});
          }
        }
        // Load editor profiles (for commission display)
        if (session?.user?.id) {
          fetchEditorProfile(session.user.id).then(p => { if (p) setMyEditorProfile(p); }).catch(() => {});
        }
        fetchAllEditorProfiles(activeWorkspaceId).then(profiles => {
          const map = {};
          profiles.forEach(p => { map[p.display_name || p.editor_name] = p; });
          setEditorProfiles(map);
        }).catch(() => {});
      } catch (e) {
        console.error("Failed to load workspace data:", e);
      }
      if (!cancelled) setAdsLoading(false);
    };
    load();

    // Subscribe to realtime changes (skip if triggered by our own write)
    const unsub = subscribeToAds(activeWorkspaceId, async () => {
      if (Date.now() - lastWriteRef.current < 2000) return; // ignore own writes
      try {
        const fresh = await fetchAds(activeWorkspaceId);
        if (!cancelled) setAds(fresh);
      } catch (e) { console.error("Realtime refresh error:", e); }
    });

    // Presence channel
    if (session?.user?.id) {
      const presence = createPresenceChannel(activeWorkspaceId, session.user.id, userName || "User");
      presenceRef.current = presence;
      presence.subscribe((state) => setPresenceState(state));
    }

    return () => { cancelled = true; unsub(); if (presenceRef.current) { presenceRef.current.unsubscribe(); presenceRef.current = null; } };
  }, [activeWorkspaceId]);

  const addEditor = (name) => { const n = name.trim(); if (!n || editors.includes(n)) return; setEditors(prev => [...prev, n]); };
  const removeEditor = async (name) => {
    // Remove from local state
    setEditors(prev => prev.filter(e => e !== name));
    // Also remove from workspace in Supabase
    if (activeWorkspaceId) {
      try {
        const members = await getWorkspaceMembers(activeWorkspaceId);
        const member = members.find(m => m.editor_name === name && m.role === "editor");
        if (member) {
          await removeMemberFromWorkspace(activeWorkspaceId, member.user_id);
        }
      } catch (e) { console.error("Remove editor from workspace:", e); }
    }
  };

  const syncTripleWhale = async (silent = false) => {
    if (!isTripleWhaleConfigured()) { if (!silent) { setSyncMsg({ ok: false, text: "Configure Triple Whale in Settings first" }); setTimeout(() => setSyncMsg(null), 3000); } return; }
    setSyncing(true); if (!silent) setSyncMsg(null);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const rows = await fetchAdSetMetrics(start, end);
      const matches = matchMetricsToAds(rows, ads);
      let synced = 0, chCount = 0, autoMatched = 0;
      for (const m of matches) {
        for (const [ch, data] of Object.entries(m.channels)) {
          if (data.metrics.length > 0) {
            dispatch({ type: "SET_CH_METRICS", id: m.adId, channel: ch, metrics: data.metrics });
            synced += data.metrics.length; chCount++;
          }
          // Auto-save matched adset IDs + names so future syncs are instant
          if (data.matchType === "auto" && data.matchedAdsetId) {
            const ad = ads.find(a => a.id === m.adId);
            const currentIds = ad?.channelIds || {};
            if (!currentIds[ch]?.trim()) {
              const currentNames = ad?.channelMatchedNames || {};
              dispatch({ type: "UPDATE", id: m.adId, data: {
                channelIds: { ...currentIds, [ch]: data.matchedAdsetId },
                channelMatchedNames: { ...currentNames, [ch]: data.matchedAdsetName || "" },
              }});
              autoMatched++;
            }
          }
        }
      }
      setLastAutoSync(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      const liveAds = ads.filter(a => a.stage !== "killed");
      const unmatchedAds = liveAds.filter(a => !matches.find(m => m.adId === a.id));
      let msg = `Synced ${synced} data points across ${chCount} channel(s) for ${matches.length}/${liveAds.length} ad(s)`;
      if (autoMatched > 0) msg += ` · Auto-matched ${autoMatched} new ad set(s)`;
      if (unmatchedAds.length > 0 && !silent) {
        const names = unmatchedAds.slice(0, 3).map(a => `"${a.name}"`).join(", ");
        const twNames = [...new Set(rows.map(r => r.adset_name))].slice(0, 5).join(", ");
        msg += ` · ${unmatchedAds.length} ad(s) not matched: ${names}${unmatchedAds.length > 3 ? "..." : ""}`;
        if (rows.length > 0) msg += ` · TW adset names found: ${twNames}`;
        else msg += ` · No data returned from Triple Whale for the last 30 days`;
      }
      if (rows.length === 0 && !silent) msg = "Triple Whale returned 0 rows. Check your API key, shop domain, and that you have active ads with spend.";
      if (!silent) { setSyncMsg({ ok: synced > 0, text: msg }); }
    } catch (e) { if (!silent) setSyncMsg({ ok: false, text: e.message }); }
    setSyncing(false);
    if (!silent) setTimeout(() => setSyncMsg(null), 5000);
  };

  // Auto-sync lifecycle: start/stop 30-min polling when TW is configured
  const syncRef = useRef(syncTripleWhale);
  syncRef.current = syncTripleWhale;
  useEffect(() => {
    if (autoSyncEnabled && isTripleWhaleConfigured() && ads.length > 0 && role === "founder") {
      startAutoSync(() => syncRef.current(true));
      return () => stopAutoSync();
    } else {
      stopAutoSync();
    }
  }, [autoSyncEnabled, activeWorkspaceId, ads.length, role]);

  const toggleAutoSync = () => {
    const next = !autoSyncEnabled;
    setAutoSyncEnabled(next);
    localStorage.setItem("al_auto_sync", next ? "true" : "false");
  };

  // Expose resync so ad rename can trigger it
  useEffect(() => { window.__twResync = () => syncTripleWhale(false); return () => { delete window.__twResync; }; }, [ads]);

  // Load workspace learnings
  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetchWorkspaceLearnings(activeWorkspaceId).then(data => {
      if (data) setWorkspaceLearnings(data);
      else {
        // Fallback: gather learnings from ad data
        const fromAds = ads.flatMap(a => (a.learnings || []).map(l => ({ ...l, adId: a.id, adName: a.name, source: "manual" })));
        setWorkspaceLearnings(fromAds);
      }
    });
  }, [activeWorkspaceId, ads.length]);

  // Intelligence Flywheel: auto-analyze winners
  useEffect(() => {
    if (role !== "founder" || !activeWorkspaceId) return;
    const winners = ads.filter(a => {
      if (a.stage !== "live") return false;
      const bc = bestChannel(a, th);
      const la = bc ? bc.metric : lm(a);
      const r = bc?.roas ?? la?.roas ?? 0;
      if (!r) return false;
      return CL(r, th) === "green" && !analyzedWinnersRef.current.has(a.id);
    });
    if (winners.length === 0) return;

    const geminiReady = !!getApiKey("gemini").trim();
    const claudeReady = !!getApiKey("claude").trim();
    if (!geminiReady && !claudeReady) return;

    // Analyze one winner at a time to avoid rate limits
    const winner = winners[0];
    analyzedWinnersRef.current.add(winner.id);

    // Check if already has flywheel analysis
    const hasFlywheelAnalysis = (winner.analyses || []).some(a => a.flywheel);
    if (hasFlywheelAnalysis) return;

    setFlywheelStatus(`Analyzing winner: ${winner.name}...`);
    const existingLearnings = ads.flatMap(a => (a.learnings || []).map(l => ({ type: l.type, text: l.text })));

    analyzeWinner(winner, th, existingLearnings).then(result => {
      if (!result) { setFlywheelStatus(null); return; }
      // Save analysis to the ad
      dispatch({ type: "ADD_ANALYSIS", id: winner.id, analysis: { id: uid(), ts: now(), engine: result.engine, mode: "flywheel", flywheel: true, ...result } });
      // Extract and save learnings
      if (result.learnings?.length) {
        const newLearnings = result.learnings.map(l => ({
          id: uid(), type: l.type, text: l.text, confidence: l.confidence, evidence: l.evidence,
          adId: winner.id, adName: winner.name, source: "auto",
        }));
        newLearnings.forEach(l => dispatch({ type: "ADD_LEARNING", id: winner.id, learning: l }));
        saveWorkspaceLearningsBatch(activeWorkspaceId, newLearnings.map(l => ({ ...l, adId: winner.id, adName: winner.name }))).catch(console.error);
        setWorkspaceLearnings(prev => [...newLearnings, ...prev]);
      }
      setFlywheelStatus(`Captured ${result.learnings?.length || 0} learnings from "${winner.name}"`);
      setTimeout(() => setFlywheelStatus(null), 5000);
    }).catch(e => {
      console.error("Flywheel analysis error:", e);
      setFlywheelStatus(null);
    });
  }, [ads, th, role, activeWorkspaceId]);

  // Sync a single ad to Supabase by reading current state
  const lastWriteRef = useRef(0);
  const syncAdToDb = useCallback((adId, updatedAds) => {
    if (!activeWorkspaceId) return;
    const ad = updatedAds.find(x => x.id === adId);
    if (!ad) return;
    lastWriteRef.current = Date.now();
    dbUpdateAd(adId, ad, activeWorkspaceId).catch(e => console.error("Sync error:", e));
  }, [activeWorkspaceId]);

  const dispatch = useCallback((a) => {
    setAds(p => {
      let next;
      switch (a.type) {
        case "MOVE": next = p.map(x => x.id === a.id ? { ...x, stage: a.stage, stageEnteredAt: Date.now() } : x); break;
        case "UPDATE": next = p.map(x => x.id === a.id ? { ...x, ...a.data } : x); break;
        case "TOGGLE_CHECKLIST": next = p.map(x => {
          if (x.id !== a.id) return x;
          const cl = { ...(x.checklist || {}) };
          cl[a.key] = cl[a.key]?.done ? { done: false, doneAt: null } : { done: true, doneAt: Date.now() };
          return { ...x, checklist: cl };
        }); break;
        case "ADD_METRIC": next = p.map(x => x.id === a.id ? { ...x, metrics: [...x.metrics, a.metric] } : x); break;
        case "SET_CH_METRICS": next = p.map(x => x.id === a.id ? { ...x, channelMetrics: { ...(x.channelMetrics || emptyChMetrics()), [a.channel]: a.metrics } } : x); break;
        case "ADD_COMMENT": next = p.map(x => x.id === a.id ? { ...x, comments: [...x.comments, a.comment] } : x); break;
        case "RM_COMMENT": next = p.map(x => x.id === a.aid ? { ...x, comments: x.comments.filter(c => c.id !== a.cid) } : x); break;
        case "ADD_ANALYSIS": next = p.map(x => x.id === a.id ? { ...x, analyses: [...x.analyses, a.analysis] } : x); break;
        case "ADD_LEARNING": next = p.map(x => x.id === a.id ? { ...x, learnings: [...x.learnings, a.learning] } : x); break;
        case "RM_LEARNING": next = p.map(x => x.id === a.aid ? { ...x, learnings: x.learnings.filter(l => l.id !== a.lid) } : x); break;
        case "ADD_MSG": next = p.map(x => x.id === a.id ? { ...x, thread: [...x.thread, a.msg] } : x); break;
        case "ADD_NOTIF": next = p.map(x => x.id === a.id ? { ...x, notifications: [...(x.notifications || []), a.notif] } : x); break;
        case "SUBMIT_DRAFT": next = p.map(x => x.id === a.id ? { ...x, drafts: [...x.drafts, a.draft], draftSubmitted: true } : x); break;
        case "ADD_REVISION": next = p.map(x => x.id === a.id ? { ...x, revisionRequests: [...x.revisionRequests, a.rev] } : x); break;
        case "RESOLVE_REVISION": next = p.map(x => x.id === a.id ? { ...x, revisionRequests: x.revisionRequests.map(r => r.id === a.rid ? { ...r, resolved: true } : r) } : x); break;
        case "APPROVE_DRAFT": next = p.map(x => x.id === a.id ? { ...x, drafts: x.drafts.map(d => d.id === a.did ? { ...d, status: "approved" } : d), finalApproved: true } : x); break;
        case "ITERATE": next = p.map(x => { if (x.id !== a.id) return x; const n = x.iterations + 1; return { ...x, iterations: n, stage: "pre", briefApproved: false, draftSubmitted: false, finalApproved: false, checklist: {}, stageEnteredAt: Date.now(), notes: "Iter " + n + " — " + a.reason, iterHistory: [...x.iterHistory, { iter: n, reason: a.reason, date: now() }] }; }); break;
        case "KILL": next = p.map(x => x.id === a.id ? { ...x, stage: "killed" } : x); break;
        case "DELETE": next = p.filter(x => x.id !== a.id); break;
        case "ADD_AD": {
          // Create in Supabase and add to local state
          const newAd = { name: a.ad.name, type: a.ad.type, stage: "pre", editor: a.ad.editor || "", deadline: a.ad.deadline || "", brief: a.ad.brief || "", notes: a.ad.notes || "", iterations: 0, maxIter: 3, iterHistory: [], briefApproved: false, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: null, childIds: [], notifications: [], channelIds: a.ad.channelIds || emptyChIds(), channelMetrics: emptyChMetrics(), checklist: {}, stageEnteredAt: Date.now() };
          if (activeWorkspaceId) {
            dbCreateAd(newAd, activeWorkspaceId).then(saved => {
              setAds(curr => [...curr, saved]);
            }).catch(e => console.error("Create ad error:", e));
          }
          return p; // don't add locally yet — wait for Supabase response
        }
        case "CREATE_VAR": {
          const varAd = { name: a.name, type: a.type, stage: "pre", editor: "", deadline: "", brief: a.brief || a.vt + " variation", notes: "Variation of #" + a.pid, iterations: 0, maxIter: 3, iterHistory: [], briefApproved: true, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: a.pid, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(), checklist: {}, stageEnteredAt: Date.now() };
          if (activeWorkspaceId) {
            dbCreateAd(varAd, activeWorkspaceId).then(saved => {
              setAds(curr => [...curr.map(x => x.id === a.pid ? { ...x, childIds: [...(x.childIds || []), saved.id] } : x), saved]);
              syncAdToDb(a.pid, [...p.map(x => x.id === a.pid ? { ...x, childIds: [...(x.childIds || []), saved.id] } : x), saved]);
            }).catch(e => console.error("Create var error:", e));
          }
          return p;
        }
        default: return p;
      }

      // Persist the changed ad to Supabase
      if (a.type === "DELETE" && a.id && activeWorkspaceId) {
        supabase.from("ads").delete().eq("id", a.id).then(({ error }) => { if (error) console.error("Delete ad error:", error); });
      } else {
        const changedId = a.id || a.aid;
        if (changedId && activeWorkspaceId) {
          syncAdToDb(changedId, next);
        }
      }
      return next;
    });
  }, [activeWorkspaceId, syncAdToDb]);

  const tryMove = (id, stage) => {
    const ad = ads.find(a => a.id === id);
    if (!ad) return;
    const err = checkGate(ad, ad.stage, stage);
    if (err) { setGateMsg(err); setTimeout(() => setGateMsg(null), 3000); return; }
    dispatch({ type: "MOVE", id, stage });
  };

  const iterateAd = (id) => {
    const ad = ads.find(a => a.id === id);
    const last = ad?.analyses[ad.analyses.length - 1];
    dispatch({ type: "ITERATE", id, reason: last?.nextIterationPlan || last?.summary || "Based on metrics" });
  };

  useEffect(() => { if (openAd) { const f = ads.find(a => a.id === openAd.id); if (f) setOpenAd(f); } }, [ads]);

  // Escape key closes expanded ad view
  useEffect(() => {
    if (!openAd) return;
    const handler = (e) => { if (e.key === "Escape") { setOpenAd(null); setOpenAdTab(null); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openAd]);

  const visibleAds = (role === "editor" || role === "strategist") ? ads.filter(a => a.editor === editorName && a.stage !== "killed") : ads.filter(a => a.stage !== "killed");
  const live = visibleAds.filter(a => a.stage === "live");
  const win = live.filter(a => { const l = lm(a); return CL(l?.roas ?? 0, th) === "green"; }).length;
  const lose = live.filter(a => { const l = lm(a); return CL(l?.roas ?? 0, th) === "red"; }).length;
  const spend = visibleAds.reduce((s, a) => s + a.metrics.reduce((ss, m) => ss + m.spend, 0), 0);
  const learns = visibleAds.reduce((s, a) => s + a.learnings.length, 0);
  const killed = ads.filter(a => a.stage === "killed").length;

  return (
    <div className="app-layout">
      <Sidebar
        page={page}
        setPage={setPage}
        role={role}
        userName={userName}
        onSignOut={handleSignOut}
        stats={{ live: live.length, win, lose, learns }}
        workspaces={workspaces || []}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={onSelectWorkspace}
        onCreateWorkspace={onCreateWorkspace}
      />

      <div className="main-content">
        {/* Top bar with presence + notifications */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "12px 0 8px", gap: 12 }}>
          <PresenceBubbles presenceState={presenceState} currentUserId={session?.user?.id} currentPage={page} />
          <NotificationBell userId={session?.user?.id} onOpenAd={(adId) => { const ad = ads.find(a => a.id === adId); if (ad) { setOpenAdTab("thread"); setOpenAd(ad); setPage("pipeline"); } }} />
        </div>
        {/* Toasts */}
        {gateMsg && <div className="toast toast-error">🚫 {gateMsg}</div>}
        {syncMsg && <div className={`toast ${syncMsg.ok ? "toast-success" : "toast-error"}`}>{syncMsg.ok ? "🐳" : "⚠"} {syncMsg.text}</div>}
        {flywheelStatus && <div className="toast toast-success">🧠 {flywheelStatus}</div>}

        {/* ── AD EXPANDED VIEW ── */}
        {page === "pipeline" && openAd && (
          <AdPanel ad={ads.find(a => a.id === openAd.id) || openAd} onClose={() => { setOpenAd(null); setOpenAdTab(null); }} dispatch={dispatch} th={th} allAds={ads} role={role} editors={editors} userName={userName} activeWorkspaceId={activeWorkspaceId} session={session} initialTab={openAdTab} strategyData={strategyData} />
        )}

        {/* ── PIPELINE PAGE ── */}
        {page === "pipeline" && !openAd && (
          <div className="animate-fade" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 40px)", overflow: "hidden" }}>
            {adsLoading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}><div className="loading-dot" style={{ margin: "0 auto 12px" }} />Loading pipeline...</div>}
            {!adsLoading && <>
            {/* Fixed header section */}
            <div style={{ flexShrink: 0, overflow: "hidden" }}>
            {/* Needs attention */}
            {(() => {
              const adsNeedingAttention = ads.filter(a => a.stage !== "killed").filter(a => {
                const overdue = getStaleItems(a, a.stage);
                const deadlineOverdue = od(a.deadline);
                return overdue.length > 0 || deadlineOverdue;
              });
              if (adsNeedingAttention.length === 0) return null;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "6px 0", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600, flexShrink: 0 }}>Needs attention:</span>
                  {adsNeedingAttention.slice(0, 8).map(a => {
                    const overdue = getStaleItems(a, a.stage);
                    const deadlineOverdue = od(a.deadline);
                    const reason = overdue.length > 0 ? `${overdue.length}` : "!";
                    return (
                      <button key={a.id} onClick={() => setOpenAd(a)}
                        className="btn btn-xs" style={{ background: "var(--red-bg)", color: "var(--red)", border: "1px solid var(--red-border)", fontSize: 10, padding: "2px 8px" }}>
                        {a.name.length > 18 ? a.name.slice(0, 18) + "..." : a.name} <span style={{ opacity: 0.6 }}>{reason}</span>
                      </button>
                    );
                  })}
                  {adsNeedingAttention.length > 8 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{adsNeedingAttention.length - 8}</span>}
                </div>
              );
            })()}

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 3 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>Pipeline</h2>
                  <div className="tabs" style={{ marginBottom: 0, display: "inline-flex" }}>
                    <button onClick={() => setPipelineView("kanban")} className={`tab-btn ${pipelineView === "kanban" ? "active" : ""}`}>Kanban</button>
                    <button onClick={() => setPipelineView("sheet")} className={`tab-btn ${pipelineView === "sheet" ? "active" : ""}`}>Sheet</button>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
                  {visibleAds.length} ads · {CUR} {spend.toLocaleString()} total spend
                  {killed > 0 && <span> · {killed} killed</span>}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {userRole === "founder" && <>
                  <div style={{ display: "flex", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                    <button onClick={() => setRole("founder")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: role === "founder" ? "var(--accent-bg)" : "transparent", color: role === "founder" ? "var(--accent-light)" : "var(--text-muted)" }}>Founder</button>
                    <button onClick={() => setRole("strategist")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: role === "strategist" ? "var(--green-bg)" : "transparent", color: role === "strategist" ? "var(--green)" : "var(--text-muted)" }}>Strategist</button>
                    <button onClick={() => setRole("editor")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: role === "editor" ? "var(--yellow-bg)" : "transparent", color: role === "editor" ? "var(--yellow)" : "var(--text-muted)" }}>Editor</button>
                  </div>
                  {(role === "editor" || role === "strategist") && <select value={editorName} onChange={e => setEditorName(e.target.value)} className="input" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}>{editors.map(e => <option key={e} value={e}>{e}</option>)}</select>}
                </>}
                {role === "founder" && <>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => syncTripleWhale(false)} disabled={syncing} className={`btn btn-sm ${isTripleWhaleConfigured() ? "btn-success" : "btn-ghost"}`}>
                      {syncing ? "Syncing..." : "Sync TW"}
                    </button>
                    {isTripleWhaleConfigured() && <button onClick={toggleAutoSync} className={`btn btn-xs ${autoSyncEnabled ? "" : "btn-ghost"}`}
                      style={autoSyncEnabled ? { background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green)", fontSize: 10 } : { fontSize: 10 }}
                      title={`Auto-sync every ${getAutoSyncIntervalMinutes()} min`}>
                      {autoSyncEnabled ? "Auto" : "Manual"}
                    </button>}
                    {lastAutoSync && autoSyncEnabled && <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>Last: {lastAutoSync}</span>}
                  </div>
                  <button onClick={() => setNewOpen(true)} className="btn btn-primary btn-sm">+ New Ad</button>
                </>}
              </div>
            </div>
            </div>{/* end fixed header */}

            {/* Scrollable content area */}
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>

            {/* Stage flow bar -- kanban only */}
            {pipelineView === "kanban" && (
            <div style={{ display: "flex", alignItems: "center", marginBottom: 16, padding: "8px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
              {STAGES.filter(s => s.id !== "killed").map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{s.icon}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 600 }}>{s.label}</span>
                    <span className="badge" style={{ background: s.color + "18", color: s.color, fontWeight: 700 }}>
                      {visibleAds.filter(a => a.stage === s.id).length}
                    </span>
                  </div>
                  {i < 3 && <div style={{ flex: 1, textAlign: "center" }}><span style={{ color: "var(--text-muted)", fontSize: 10 }}>→</span></div>}
                </div>
              ))}
            </div>
            )}

            {/* Kanban View */}
            {pipelineView === "kanban" && <>
            <div className="kanban-grid">
              {STAGES.filter(s => s.id !== "killed").map(stage => {
                const stageAds = visibleAds.filter(a => a.stage === stage.id);
                const isOver = dragOver === stage.id;
                return (
                  <div key={stage.id}
                    className={`kanban-col ${isOver ? "drag-over" : ""}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => { e.preventDefault(); if (did.current != null) tryMove(did.current, stage.id); did.current = null; setDragOver(null); }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "2px 4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{stage.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-badge)", padding: "0 7px", borderRadius: "var(--radius-full)", fontFamily: "var(--fm)" }}>{stageAds.length}</span>
                      </div>
                    </div>
                    {stageAds.length === 0 && <div className="empty-state">Drop ads here</div>}
                    <div className="stagger">
                      {stageAds.map(ad => (
                        <div key={ad.id} draggable onDragStart={() => { did.current = ad.id; }} onDragEnd={() => { did.current = null; }}>
                          <PCard ad={ad} th={th} onClick={setOpenAd} onMove={tryMove} onIterate={iterateAd} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span><span style={{ color: "var(--green)" }}>●</span> ROAS &ge; {th.green}x Scale</span>
              <span><span style={{ color: "var(--yellow)" }}>●</span> ROAS &ge; {th.yellow}x Monitor</span>
              <span><span style={{ color: "var(--red)" }}>●</span> ROAS &lt; {th.yellow}x Iterate/Kill</span>
            </div>
            </>}

            {/* Sheet View */}
            {pipelineView === "sheet" && (
              <PipelineSheet ads={visibleAds} dispatch={dispatch} th={th} onOpenAd={setOpenAd} strategyData={strategyData} />
            )}

            </div>{/* end scrollable content */}
            </>}
          </div>
        )}

        {/* ── EDITORS PAGE ── */}
        {page === "editors" && <EditorPanel ads={ads} th={th} editors={editors} addEditor={addEditor} removeEditor={removeEditor} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />}

        {/* ── RESEARCH PAGE ── */}
        {page === "strategy" && <StrategyPage activeWorkspaceId={activeWorkspaceId} ads={ads} dispatch={dispatch} role={role} />}

        {/* ── SPLIT TESTS PAGE ── */}
        {page === "splittests" && <SplitTestPage activeWorkspaceId={activeWorkspaceId} />}

        {/* ── EARNINGS PAGE ── */}
        {page === "earnings" && (
          <div className="animate-fade">
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              {role === "editor" ? "My Earnings" : "Editor Earnings"}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 16px" }}>
              {role === "editor" ? "Your commission on ad spend from your assigned ads." : "Commission breakdown for all editors."}
            </p>
            {role === "editor" ? (
              <CommissionDashboard
                ads={ads}
                editorName={userName}
                commissionPct={myEditorProfile?.commission_pct ?? 0}
                isEditorView
              />
            ) : earningsEditor ? (
              <div>
                <button onClick={() => setEarningsEditor(null)} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← All Editors</button>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>{earningsEditor.name} — Earnings</div>
                <CommissionDashboard ads={ads} editorName={earningsEditor.name} commissionPct={earningsEditor.commissionPct} />
              </div>
            ) : (
              <div>
                {editors.map(name => {
                  const profile = editorProfiles[name];
                  const commPct = profile?.commission_pct ?? 0;
                  const edAds = ads.filter(a => a.editor === name && a.stage !== "killed");
                  const totalSpend = edAds.reduce((s, a) => {
                    let sp = (a.metrics || []).reduce((ss, m) => ss + (m.spend || 0), 0);
                    const chm = a.channelMetrics || {};
                    Object.values(chm).forEach(metrics => { sp += (metrics || []).reduce((ss, m) => ss + (m.spend || 0), 0); });
                    return s + sp;
                  }, 0);
                  const commission = totalSpend * (commPct / 100);
                  return (
                    <div key={name} className="card-flat" style={{ marginBottom: 8, padding: "12px 14px", cursor: "pointer" }} onClick={() => setEarningsEditor({ name, commissionPct: commPct })}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--accent-light)" }}>{name[0]}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{commPct}% commission · {edAds.length} ads</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>Spend: {CUR} {totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>{CUR} {commission.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Click an editor to see their full earnings dashboard. Set commission % in the Editors tab.</div>
              </div>
            )}
          </div>
        )}

        {/* ── LEARNINGS PAGE ── */}
        {page === "learnings" && <LearningsPage ads={ads} workspaceLearnings={workspaceLearnings} th={th} />}

        {/* ── AUDIO RECORDING PAGE ── */}
        {page === "audio" && <AudioRecordingPage activeWorkspaceId={activeWorkspaceId} session={session} />}

        {/* ── AD COPY PAGE ── */}
        {page === "adcopy" && <AdCopyPage ads={ads} />}

        {/* ── LANDING PAGE BUILDER ── */}
        {page === "landingpages" && <LandingPageBuilder ads={ads} activeWorkspaceId={activeWorkspaceId} strategyData={strategyData} />}

        {/* ── SETTINGS PAGE ── */}
        {page === "settings" && <SettingsPage thresholds={th} setThresholds={(t) => { setTh(t); if (activeWorkspaceId) saveWorkspaceSettings(activeWorkspaceId, t).catch(e => console.error("Save settings:", e)); }} activeWorkspaceId={activeWorkspaceId} workspaces={workspaces} session={session} userName={userName} />}

        {/* Modals (only NewAdForm stays as modal) */}
        {newOpen && <NewAdForm onClose={() => setNewOpen(false)} dispatch={dispatch} editors={editors} />}
      </div>
    </div>
  );
}
