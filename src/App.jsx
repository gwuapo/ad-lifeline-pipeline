import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import { isTripleWhaleConfigured, setTripleWhaleConfig, getTripleWhaleConfig, validateApiKey, fetchAdSetMetrics, matchMetricsToAds } from "./tripleWhale.js";
import { getApiKey, isConfigured, getAnalysisPrompt, getSelectedModel, isProxyConfigured } from "./apiKeys.js";
import { isApifyConfigured, scrapeTikTokComments } from "./apify.js";
import { isGeminiConfigured, prepareVideoFile, analyzeAdWithVideo, analyzeAdTextOnly } from "./gemini.js";
import Sidebar from "./Sidebar.jsx";
import SettingsPage from "./SettingsPage.jsx";
import { getAllEditorProfiles, saveEditorProfile } from "./editorProfiles.js";

// ════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════

const STAGES = [
  { id: "pre", label: "Pre-Production", icon: "✎", color: "#8b5cf6", desc: "Script + brief finalized", exitLabel: "Brief approved + editor assigned" },
  { id: "in", label: "In-Production", icon: "⚡", color: "#d97706", desc: "Editor working on deliverable", exitLabel: "Draft submitted for review" },
  { id: "post", label: "Post-Production", icon: "◎", color: "#3b82f6", desc: "Review, revisions, approve", exitLabel: "Final version approved" },
  { id: "live", label: "Live", icon: "▶", color: "#10b981", desc: "Running — tracking metrics", exitLabel: "CPA verdict" },
  { id: "killed", label: "Killed", icon: "✕", color: "#ef4444", desc: "Archived", exitLabel: "" },
];
const SO = ["pre", "in", "post", "live"];
const AD_TYPES = ["VSL", "Video Ad", "UGC", "Image Ad", "Advertorial", "Listicle"];
const DEFAULT_EDITORS = ["Noor", "Faisal", "Omar"];
function getEditorsList() {
  try { const s = localStorage.getItem("al_editors"); return s ? JSON.parse(s) : DEFAULT_EDITORS; } catch { return DEFAULT_EDITORS; }
}
function saveEditorsList(list) { localStorage.setItem("al_editors", JSON.stringify(list)); }

const LT = ["hook_pattern", "proof_structure", "angle_theme", "pacing", "visual_style", "objection_handling"];
const VT = [
  { id: "hook", label: "Hook Test", desc: "Same body, different opening" },
  { id: "lead", label: "Lead Test", desc: "Different lead section" },
  { id: "prelander", label: "Pre-Lander vs Direct", desc: "Listicle/quiz before VSL" },
  { id: "format", label: "Format Test", desc: "Advertorial vs quiz vs PDP" },
  { id: "pacing", label: "Pacing Test", desc: "Different editing rhythm" },
  { id: "proof", label: "Proof Block", desc: "Different proof arrangement" },
];

const DT = { green: 15, yellow: 25 };
const CL = (v, t) => v == null ? "none" : v <= t.green ? "green" : v <= t.yellow ? "yellow" : "red";
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
const gd = (a, t) => { let c = 0; for (let i = a.metrics.length - 1; i >= 0; i--) { if (a.metrics[i].cpa <= t.green) c++; else break; } return c; };
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
    if (!last || !last.cpa) continue;
    if (!best || last.cpa < best.cpa) best = { ch: ch.id, label: ch.label, color: ch.color, cpa: last.cpa, roas: last.roas || 0, metric: last };
  }
  return best;
};
const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// ════════════════════════════════════════════════
// SEED DATA
// ════════════════════════════════════════════════

const SEED = [
  { id: 1, name: "Hair Growth VSL v1", type: "VSL", stage: "live", editor: "Noor", deadline: "",
    brief: "Documentary-style VSL, 2:30. Shocking stat opener. Investigative tone. Slow 15s → rapid cuts. 3-step CTA.",
    notes: "Top performer — 15M TikTok views.", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: true, draftSubmitted: true, finalApproved: true,
    drafts: [{ id: 1, name: "vsl_v1_final.mp4", version: 3, ts: "Feb 5", status: "approved" }],
    revisionRequests: [],
    metrics: [
      { date: "2026-02-05", cpa: 14.1, spend: 600, conv: 43, ctr: 2.4, cpm: 7.8 },
      { date: "2026-02-06", cpa: 13.2, spend: 820, conv: 62, ctr: 2.6, cpm: 8.0 },
      { date: "2026-02-07", cpa: 12.8, spend: 950, conv: 74, ctr: 2.7, cpm: 8.1 },
      { date: "2026-02-08", cpa: 12.4, spend: 1100, conv: 89, ctr: 2.8, cpm: 8.2 },
      { date: "2026-02-09", cpa: 12.4, spend: 730, conv: 59, ctr: 2.9, cpm: 8.0 },
    ],
    comments: [
      { id: 1, text: "This actually works, baby hairs after 3 weeks", sentiment: "positive", hidden: false },
      { id: 2, text: "Where can I buy? Link?", sentiment: "positive", hidden: false },
      { id: 3, text: "My friend tried it, hair coming back", sentiment: "positive", hidden: false },
      { id: 4, text: "Scam product don't waste money", sentiment: "negative", hidden: true },
      { id: 5, text: "Available in Riyadh?", sentiment: "neutral", hidden: false },
      { id: 6, text: "How is this different from minoxidil?", sentiment: "neutral", hidden: false },
      { id: 7, text: "Paid actors lol", sentiment: "negative", hidden: true },
      { id: 8, text: "Ordered 3 bottles", sentiment: "positive", hidden: false },
    ],
    analyses: [{ id: 1, ts: "Feb 9", summary: "Strong performer. Investigative hook resonates. Before/after in first 10s reduces drop-off. Hidden negatives show 'scam' objection.", findings: [{ type: "positive", text: "Documentary tone builds credibility" }, { type: "positive", text: "Before/after first 10s = strong retention" }, { type: "warning", text: "Hidden 'scam' comments → needs clinical proof" }, { type: "action", text: "3 hook variations + listicle pre-lander" }], nextIterationPlan: null, suggestedLearnings: [] }],
    learnings: [
      { id: 1, type: "hook_pattern", text: "Investigative documentary hooks outperform testimonial 3x on TikTok Saudi" },
      { id: 2, type: "proof_structure", text: "Before/after in first 10s reduces drop-off 40%" },
      { id: 3, type: "pacing", text: "Slow build 15s → rapid cuts holds 2:30+ attention" },
    ],
    thread: [
      { from: "Adolf", text: "Best performer. 3 hook variations ASAP.", ts: "Feb 7, 10:30 AM" },
      { from: "Noor", text: "On it. Briefs by tomorrow.", ts: "Feb 7, 11:15 AM" },
    ],
    parentId: null, childIds: [5], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
  { id: 2, name: "Investigative Doc Hook", type: "Video Ad", stage: "in", editor: "Faisal", deadline: "2026-02-15",
    brief: "3-min investigative piece. Hidden camera aesthetic. Expose pharma pricing. Arabic VO.",
    notes: "Pharma villain angle. Based on VSL v1.", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: true, draftSubmitted: false, finalApproved: false,
    drafts: [{ id: 1, name: "doc_hook_draft1.mp4", version: 1, ts: "Feb 12", status: "in-review" }],
    revisionRequests: [],
    metrics: [], comments: [], analyses: [], learnings: [],
    thread: [
      { from: "Adolf", text: "Reference VSL v1 style but harder on pharma angle.", ts: "Feb 9, 2:00 PM" },
      { from: "Faisal", text: "First draft ETA Feb 14.", ts: "Feb 9, 3:20 PM" },
    ],
    parentId: null, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
  { id: 3, name: "UGC Testimonial #4", type: "UGC", stage: "pre", editor: "", deadline: "",
    brief: "Ahmad from Jeddah, 28. 90-day journey. Phone-shot. Unboxing + routine.",
    notes: "Script approved. Needs editor.", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: false, draftSubmitted: false, finalApproved: false,
    drafts: [], revisionRequests: [],
    metrics: [], comments: [], analyses: [], learnings: [], thread: [],
    parentId: null, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
  { id: 4, name: "Listicle Pre-Lander", type: "Advertorial", stage: "post", editor: "Noor", deadline: "2026-02-13",
    brief: "'5 Reasons Your Hair Is Thinning' — editorial mobile-first. Each reason = objection. CTA → VSL v1.",
    notes: "Rev 2 — tighten proof.", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: true, draftSubmitted: true, finalApproved: false,
    drafts: [
      { id: 1, name: "listicle_v1.html", version: 1, ts: "Feb 9", status: "revision-requested" },
      { id: 2, name: "listicle_v2.html", version: 2, ts: "Feb 11", status: "in-review" },
    ],
    revisionRequests: [
      { id: 1, from: "Adolf", text: "Reason #2 headline weak — more tension. Add before/after between 3 and 4.", ts: "Feb 11, 10:30 AM", resolved: false },
    ],
    metrics: [], comments: [], analyses: [], learnings: [],
    thread: [
      { from: "Noor", text: "Draft 2 uploaded.", ts: "Feb 11, 9:00 AM" },
      { from: "Adolf", text: "Headline #2 weak. Add before/after photo.", ts: "Feb 11, 10:30 AM" },
    ],
    parentId: null, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
  { id: 5, name: "Hook Variation A (Urgency)", type: "VSL", stage: "pre", editor: "", deadline: "",
    brief: "Same body as VSL v1. NEW HOOK: 'You have 6 months before it's irreversible.'",
    notes: "Variation of VSL v1 — urgency hook", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: true, draftSubmitted: false, finalApproved: false,
    drafts: [], revisionRequests: [],
    metrics: [], comments: [], analyses: [], learnings: [], thread: [],
    parentId: 1, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
  { id: 6, name: "Ingredient Breakdown", type: "Video Ad", stage: "live", editor: "Faisal", deadline: "",
    brief: "Educational ingredient breakdown. Clean modern. Text overlay + benefit. 60s fast.",
    notes: "CPA too high — confusion in comments.", iterations: 1, maxIter: 3,
    iterHistory: [{ iter: 1, reason: "CPA $34 → added clinical study + testimonial", date: "Feb 8" }],
    briefApproved: true, draftSubmitted: true, finalApproved: true,
    drafts: [{ id: 1, name: "ingredient_v2.mp4", version: 2, ts: "Feb 8", status: "approved" }],
    revisionRequests: [],
    metrics: [
      { date: "2026-02-07", cpa: 34, spend: 340, conv: 10, ctr: 1.5, cpm: 10.2 },
      { date: "2026-02-08", cpa: 31.2, spend: 410, conv: 13, ctr: 1.7, cpm: 10.8 },
      { date: "2026-02-09", cpa: 28.5, spend: 380, conv: 13, ctr: 1.9, cpm: 11 },
      { date: "2026-02-10", cpa: 28.5, spend: 290, conv: 10, ctr: 1.8, cpm: 11.4 },
    ],
    comments: [
      { id: 1, text: "What are the actual ingredients?", sentiment: "neutral", hidden: false },
      { id: 2, text: "Looks like snake oil", sentiment: "negative", hidden: true },
      { id: 3, text: "How different from minoxidil?", sentiment: "neutral", hidden: false },
      { id: 4, text: "Price?", sentiment: "neutral", hidden: false },
      { id: 5, text: "Another fake product", sentiment: "negative", hidden: true },
    ],
    analyses: [{ id: 1, ts: "Feb 10", summary: "CPA $34→$28.50 after iter 1 still red. Educational format lacks emotional hook.", findings: [{ type: "negative", text: "Trust deficit — 'snake oil' + 'fake'" }, { type: "warning", text: "'vs minoxidil' repeated" }, { type: "action", text: "Personal story hook + clinical proof first 10s" }, { type: "action", text: "Listicle pre-lander for trust" }], nextIterationPlan: "Rebuild hook with personal story + clinical proof first 10s. Listicle pre-lander for scam/minoxidil objections.", suggestedLearnings: [] }],
    learnings: [],
    thread: [{ from: "Adolf", text: "CPA 34→28 still red. One more iteration.", ts: "Feb 10, 4:00 PM" }],
    parentId: null, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics(),
  },
];

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
  if (idx < fromIdx) return null;
  if (fromStage === "pre" && toStage === "in") {
    if (!ad.briefApproved) return "Brief must be approved before moving to In-Production";
    if (!ad.editor) return "Editor must be assigned before moving to In-Production";
  }
  if (fromStage === "in" && toStage === "post") {
    if (!ad.draftSubmitted && ad.drafts.length === 0) return "Editor must submit a draft before moving to Post-Production";
  }
  if (fromStage === "post" && toStage === "live") {
    if (!ad.finalApproved) return "Final version must be approved before going Live";
    if (ad.revisionRequests.some(r => !r.resolved)) return "Unresolved revision requests — resolve before going Live";
  }
  return null;
}

// ════════════════════════════════════════════════
// NEW AD FORM
// ════════════════════════════════════════════════

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

      <label className="label">Ad Set IDs <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-tertiary)" }}>(Triple Whale -- per channel)</span></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {CHANNELS.map(ch => (
          <div key={ch.id}>
            <div style={{ fontSize: 10, color: ch.color, fontWeight: 600, marginBottom: 2 }}>{ch.label}</div>
            <input value={f.channelIds[ch.id]} onChange={e => setChId(ch.id, e.target.value)} className="input" placeholder="Ad Set ID" />
          </div>
        ))}
      </div>

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

function AdPanel({ ad, onClose, dispatch, th, allAds, role, editors }) {
  const [tab, setTab] = useState("overview");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeErr, setScrapeErr] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const videoInputRef = useRef(null);
  const [tiktokUrl, setTiktokUrl] = useState(ad.tiktokUrl || "");
  const [nc, setNc] = useState({ text: "", sentiment: "neutral", hidden: false });
  const [nm, setNm] = useState({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" });
  const [nl, setNl] = useState({ type: "hook_pattern", text: "" });
  const [vm, setVm] = useState(null);
  const [vf, setVf] = useState({ name: "", brief: "" });
  const [eb, setEb] = useState(ad.brief);
  const [en, setEn] = useState(ad.notes);
  const [ee, setEe] = useState(ad.editor || "");
  const [eDl, setEDl] = useState(ad.deadline || "");
  const [eChIds, setEChIds] = useState(ad.channelIds || emptyChIds());
  const [revText, setRevText] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
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
  const cl = ad.stage === "live" ? CL(la?.cpa, th) : "none";
  const cs = CS[cl];
  const stg = STAGES.find(s => s.id === ad.stage);
  const over = od(ad.deadline);
  const gdays = gd(ad, th);
  const winner = cl === "green" && gdays >= 5;
  const kids = allAds.filter(a => a.parentId === ad.id);
  const isEditor = role === "editor";

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

  const scrapeComments = async () => {
    const url = tiktokUrl.trim() || ad.tiktokUrl;
    if (!url) { setScrapeErr("Add a TikTok URL first"); setTimeout(() => setScrapeErr(null), 3000); return; }
    if (!isApifyConfigured()) { setScrapeErr("Configure Apify API key in Settings"); setTimeout(() => setScrapeErr(null), 3000); return; }
    setScraping(true); setScrapeErr(null);
    try {
      // Save the TikTok URL to the ad
      if (tiktokUrl.trim()) dispatch({ type: "UPDATE", id: ad.id, data: { tiktokUrl: tiktokUrl.trim() } });
      const comments = await scrapeTikTokComments(url, 100);
      comments.forEach(c => dispatch({ type: "ADD_COMMENT", id: ad.id, comment: { id: uid(), text: c.text, sentiment: c.sentiment, hidden: c.hidden } }));
      dispatch({ type: "ADD_NOTIF", id: ad.id, notif: { ts: now(), text: `Scraped ${comments.length} comments from TikTok` } });
    } catch (e) {
      setScrapeErr(e.message);
      setTimeout(() => setScrapeErr(null), 5000);
    }
    setScraping(false);
  };

  const addMetric = () => { const m = { date: nm.date, cpa: +nm.cpa, spend: +nm.spend, conv: +nm.conv, ctr: +nm.ctr, cpm: +nm.cpm }; if (!m.cpa || !m.spend) return; dispatch({ type: "ADD_METRIC", id: ad.id, metric: m }); setNm({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" }); };
  const addComment = () => { if (!nc.text.trim()) return; dispatch({ type: "ADD_COMMENT", id: ad.id, comment: { id: uid(), ...nc, text: nc.text.trim() } }); setNc({ text: "", sentiment: "neutral", hidden: false }); };
  const save = () => dispatch({ type: "UPDATE", id: ad.id, data: { brief: eb, notes: en, editor: ee, deadline: eDl, channelIds: eChIds, tiktokUrl: tiktokUrl.trim() } });
  const sendMsg = () => { if (!msg.trim()) return; dispatch({ type: "ADD_MSG", id: ad.id, msg: { from: isEditor ? ad.editor || "Editor" : "You", text: msg.trim(), ts: now() } }); setMsg(""); };
  const addLearning = () => { if (!nl.text.trim()) return; dispatch({ type: "ADD_LEARNING", id: ad.id, learning: { id: uid(), ...nl, text: nl.text.trim() } }); setNl({ type: "hook_pattern", text: "" }); };
  const createVar = () => { if (!vf.name.trim()) return; dispatch({ type: "CREATE_VAR", pid: ad.id, name: vf.name.trim(), brief: vf.brief.trim(), type: ad.type, vt: vm.id }); setVm(null); setVf({ name: "", brief: "" }); };
  const doIter = () => { const last = ad.analyses[ad.analyses.length - 1]; dispatch({ type: "ITERATE", id: ad.id, reason: last?.nextIterationPlan || last?.summary || "Based on metrics" }); };
  const doKill = () => dispatch({ type: "KILL", id: ad.id });
  const submitDraft = () => { if (!draftName.trim()) return; dispatch({ type: "SUBMIT_DRAFT", id: ad.id, draft: { id: uid(), name: draftName.trim(), url: draftUrl.trim() || null, version: ad.drafts.length + 1, ts: now(), status: "in-review" } }); setDraftName(""); setDraftUrl(""); };
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
    { id: "thread", l: `Thread (${ad.thread.length})` },
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

  return (
    <Modal title="" onClose={onClose} w={720}>
      {/* Header */}
      <div style={{ marginTop: -4, marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{ad.name}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge" style={{ background: stg.color + "18", color: stg.color }}>{stg.label}</span>
          <span className="badge">{ad.type}</span>
          {ad.editor && <span className="badge">⚙ {ad.editor}</span>}
          {ad.stage === "live" && la && <span className="badge" style={{ background: cs.bg, color: cs.c, fontWeight: 700 }}>{cs.l} {CUR} {la.cpa}</span>}
          {ad.iterations > 0 && <span className="badge badge-yellow">Iter {ad.iterations}/{ad.maxIter}</span>}
          {over && <span className="badge badge-red">OVERDUE</span>}
          {ad.deadline && !over && <span className="badge">Due {fd(ad.deadline)}</span>}
          {winner && <span className="badge badge-green">WINNER ({gdays}d)</span>}
          {ad.parentId && <span className="badge badge-green">variation</span>}
          {ad.briefApproved && <span className="badge badge-green">Brief</span>}
          {ad.draftSubmitted && <span className="badge badge-accent">Draft</span>}
          {ad.finalApproved && <span className="badge badge-green">Final</span>}
        </div>
      </div>

      {/* Gate error */}
      {gateErr && <div className="card-flat" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 10, fontSize: 12.5, color: "var(--red-light)" }}>🚫 {gateErr}</div>}

      {/* Stage movement */}
      {ad.stage !== "killed" && !isEditor && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginRight: 4 }}>Move to:</span>
          {SO.filter(s => s !== ad.stage).map(s => {
            const st = STAGES.find(x => x.id === s);
            return <button key={s} onClick={() => tryMove(s)} className="btn btn-ghost btn-xs" style={{ color: st.color }}>{st.icon} {st.label}</button>;
          })}
          {ad.iterations >= ad.maxIter && ad.stage === "live" && CL(la?.cpa, th) === "red" && (
            <button onClick={doKill} className="btn btn-danger btn-xs">Kill Ad</button>
          )}
        </div>
      )}

      {/* Alerts */}
      {ad.stage === "live" && cl === "green" && (
        <div className="card-flat" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)", marginBottom: 10, fontSize: 12.5, color: "var(--green-light)" }}>
          {winner ? "Confirmed winner (5+ days). Scale aggressively via variations." : `${gdays}/5 green days to confirm winner.`}
        </div>
      )}
      {ad.stage === "live" && cl === "red" && !isEditor && (
        <div className="card-flat" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 10, fontSize: 12.5, color: "var(--red-light)" }}>
          <div>Above red threshold. Iteration {ad.iterations}/{ad.maxIter}. {ad.iterations >= ad.maxIter ? "Max reached — kill or pivot." : "Run analysis then iterate."}</div>
          {ad.iterations < ad.maxIter && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={analyze} disabled={busy} className="btn btn-ghost btn-sm">{busy ? "Analyzing..." : "Run AI Analysis"}</button>
            <button onClick={doIter} className="btn btn-danger btn-sm">Iterate</button>
          </div>}
        </div>
      )}
      {ad.stage === "killed" && (
        <div className="card-flat" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 10, fontSize: 12.5, color: "var(--red-light)" }}>
          Killed — ad archived after {ad.iterations} iterations. Learnings preserved.
        </div>
      )}
      {ad.revisionRequests.filter(r => !r.resolved).length > 0 && (
        <div className="card-flat" style={{ background: "var(--yellow-bg)", border: "1px solid var(--yellow-border)", marginBottom: 10, fontSize: 12.5, color: "var(--yellow-light)" }}>
          {ad.revisionRequests.filter(r => !r.resolved).length} unresolved revision request(s)
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ flexWrap: "wrap" }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? "active" : ""}`}>{t.l}</button>)}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="animate-fade">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label className="label" style={{ marginTop: 0 }}>Editor</label>
              <select disabled={isEditor} value={ee} onChange={e => setEe(e.target.value)} className="input">
                <option value="">Unassigned</option>{editors.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="label" style={{ marginTop: 0 }}>Deadline</label>
              <input disabled={isEditor} type="date" value={eDl} onChange={e => setEDl(e.target.value)} className="input" />
            </div>
          </div>

          {!isEditor && <div style={{ marginBottom: 14 }}>
            <label className="label">Ad Set IDs <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-tertiary)" }}>(Triple Whale -- per channel)</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {CHANNELS.map(ch => {
                const hasId = eChIds[ch.id]?.trim();
                const chm = (ad.channelMetrics || {})[ch.id] || [];
                const status = hasId ? (chm.length > 0 ? "synced" : "linked") : null;
                return (
                  <div key={ch.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 10.5, color: ch.color, fontWeight: 600 }}>{ch.label}</span>
                      {status === "synced" && <span style={{ fontSize: 9, color: "var(--green)" }}>● synced</span>}
                      {status === "linked" && <span style={{ fontSize: 9, color: "var(--yellow)" }}>● no data yet</span>}
                    </div>
                    <input value={eChIds[ch.id]} onChange={e => setEChIds(p => ({ ...p, [ch.id]: e.target.value }))} className="input" placeholder="Ad Set ID" />
                  </div>
                );
              })}
            </div>
          </div>}

          <label className="label">Brief</label>
          <textarea disabled={isEditor} value={eb} onChange={e => setEb(e.target.value)} rows={3} className="input" />
          <label className="label">Notes</label>
          <textarea value={en} onChange={e => setEn(e.target.value)} rows={2} className="input" />

          {!isEditor && <>
            <label className="label">TikTok Video URL <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(for comment scraping)</span></label>
            <input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} className="input" placeholder="https://www.tiktok.com/@user/video/123..." />
          </>}

          {!isEditor && (
            <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
              {[["briefApproved", "Approve Brief", "var(--accent)"], ["draftSubmitted", "Mark Draft Submitted", "var(--yellow)"], ["finalApproved", "Approve Final", "var(--green)"]].map(([k, label, col]) => (
                <button key={k} onClick={() => dispatch({ type: "UPDATE", id: ad.id, data: { [k]: !ad[k] } })}
                  className={`btn btn-sm ${ad[k] ? "" : "btn-ghost"}`}
                  style={ad[k] ? { background: col + "15", borderColor: col + "40", color: col } : {}}>
                  {ad[k] ? "✓ " : ""}{label}
                </button>
              ))}
            </div>
          )}

          <button onClick={save} className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>Save Changes</button>

          {ad.iterHistory.length > 0 && <div style={{ marginTop: 18 }}>
            <div className="section-title">Iteration History</div>
            {ad.iterHistory.map((h, i) => <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span className="badge badge-yellow">Iter {h.iter}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{h.date}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{h.reason}</div>
            </div>)}
          </div>}

          {ad.stage === "live" && cl === "green" && !isEditor && <div style={{ marginTop: 18 }}>
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
          <div className="section-title">Draft Versions</div>
          {ad.drafts.length === 0 && <div className="empty-state">No drafts submitted yet</div>}
          {ad.drafts.map(d => (
            <div key={d.id} className="card-flat" style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</span>
                  <span className="badge">v{d.version}</span>
                  <span className={`badge ${d.status === "approved" ? "badge-green" : d.status === "revision-requested" ? "badge-yellow" : "badge-accent"}`}>{d.status}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{d.ts}</span>
                  {d.status === "in-review" && !isEditor && <button onClick={() => approveDraft(d.id)} className="btn btn-success btn-xs">Approve</button>}
                </div>
              </div>
              {d.url && <div style={{ marginTop: 5 }}>
                <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-light)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                  🔗 {d.url.length > 60 ? d.url.slice(0, 60) + "..." : d.url}
                </a>
              </div>}
            </div>
          ))}
          <div className="card-flat" style={{ marginTop: 14 }}>
            <div className="section-title">Submit Draft</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label className="label" style={{ marginTop: 0 }}>File Name</label>
                <input value={draftName} onChange={e => setDraftName(e.target.value)} className="input" placeholder="e.g. ad_draft_v2.mp4" />
              </div>
              <div>
                <label className="label" style={{ marginTop: 0 }}>File URL <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(Google Drive, Dropbox, etc.)</span></label>
                <input value={draftUrl} onChange={e => setDraftUrl(e.target.value)} className="input" placeholder="https://drive.google.com/file/d/..." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={submitDraft} className="btn btn-primary btn-sm" style={{ opacity: draftName.trim() ? 1 : 0.4 }}>Submit Draft</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="section-title">Revision Requests</div>
            {ad.revisionRequests.length === 0 && <div className="empty-state">No revision requests</div>}
            {ad.revisionRequests.map(r => (
              <div key={r.id} className="card-flat" style={{ marginBottom: 6, borderColor: r.resolved ? "var(--green-border)" : "var(--yellow-border)", background: r.resolved ? "var(--green-bg)" : "var(--yellow-bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{r.from}</span>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{r.ts}</span>
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
            const chCl = chLast ? CL(chLast.cpa, th) : "none";
            const chCs = CS[chCl];
            if (!chId && !chmRaw.length) return null;
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
                  <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>CPA Trend</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 55 }}>
                    {chm.map((m, i) => { const mx = Math.max(...chm.map(x => x.cpa)); const h = mx > 0 ? Math.max(8, (m.cpa / mx) * 45) : 8; const lv = CL(m.cpa, th); const col = CS[lv].c;
                      return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                        <span style={{ fontSize: 8.5, color: col, fontFamily: "var(--fm)", fontWeight: 600 }}>{CUR} {m.cpa}</span>
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
                    {[...chm].reverse().map((m, i) => { const lv = CL(m.cpa, th); const col = CS[lv].c; return (
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
            <div className="section-title" style={{ margin: "0 0 8px" }}>Scrape from TikTok</div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <input value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} className="input" placeholder="https://www.tiktok.com/@user/video/123..." style={{ fontSize: 12 }} />
              </div>
              <button onClick={scrapeComments} disabled={scraping || !tiktokUrl.trim()} className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }}>
                {scraping ? "Scraping..." : "Scrape Comments"}
              </button>
            </div>
            {scrapeErr && <div style={{ marginTop: 6, fontSize: 12, color: "var(--red-light)" }}>{scrapeErr}</div>}
            {!isApifyConfigured() && <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>Requires Apify API key -- configure in Settings</div>}
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
      {tab === "thread" && (
        <div className="animate-fade">
          <div style={{ maxHeight: 360, overflow: "auto", marginBottom: 12 }}>
            {ad.thread.length === 0 && <div className="empty-state">No messages yet. Start a discussion about this ad.</div>}
            <div className="stagger">
              {ad.thread.map((m, i) => <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: m.from === "You" || m.from === "Adolf" ? "var(--accent-light)" : "var(--text-primary)" }}>{m.from}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{m.ts}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{m.text}</div>
              </div>)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} placeholder="Write a message..." className="input" style={{ flex: 1 }} />
            <button onClick={sendMsg} className="btn btn-primary btn-sm">Send</button>
          </div>
        </div>
      )}

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
    </Modal>
  );
}

// ════════════════════════════════════════════════
// PIPELINE CARD
// ════════════════════════════════════════════════

function PCard({ ad, th, onClick, onMove, onIterate }) {
  const bc = bestChannel(ad, th);
  const la = bc ? bc.metric : lm(ad);
  const cl = ad.stage === "live" ? CL(la?.cpa, th) : "none", cs = CS[cl];
  const ix = SO.indexOf(ad.stage), ov = od(ad.deadline), gdays = gd(ad, th);
  const unresolvedRevs = ad.revisionRequests?.filter(r => !r.resolved).length || 0;
  const hasIds = hasAnyChId(ad.channelIds);
  const hasChData = ad.channelMetrics && Object.values(ad.channelMetrics).some(m => m?.length > 0);
  const idsButNoData = hasIds && !hasChData && ad.stage === "live";

  return (
    <div className="pipeline-card" onClick={() => onClick(ad)}>
      {ad.stage === "live" && cl !== "none" && <div className="status-bar" style={{ background: cs.c }} />}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{ad.name}</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        <span className="badge badge-accent" style={{ fontSize: 9.5 }}>{ad.type}</span>
        {ad.editor && <span className="badge" style={{ fontSize: 9.5 }}>⚙ {ad.editor}</span>}
        {ad.iterations > 0 && <span className="badge badge-yellow" style={{ fontSize: 9.5 }}>iter {ad.iterations}</span>}
        {ov && <span className="badge badge-red" style={{ fontSize: 9.5, fontWeight: 700 }}>OVERDUE</span>}
        {ad.parentId && <span className="badge badge-green" style={{ fontSize: 9.5 }}>var</span>}
        {unresolvedRevs > 0 && <span className="badge badge-yellow" style={{ fontSize: 9.5 }}>📝 {unresolvedRevs}</span>}
      </div>
      {ad.notes && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.notes}</div>}

      {ad.stage === "live" && la && bc && <div style={{ fontSize: 11, marginBottom: 6, fontFamily: "var(--fm)" }}>
        <span style={{ color: bc.color, fontSize: 9.5, fontWeight: 600 }}>{bc.label} </span>
        <span style={{ color: "var(--text-tertiary)" }}>CPA: </span>
        <span style={{ color: cs.c, fontWeight: 700 }}>{CUR} {la.cpa}</span>
        {la.roas > 0 && <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>ROAS: <span style={{ color: la.roas >= 2 ? "var(--green)" : "var(--yellow)", fontWeight: 700 }}>{la.roas}x</span></span>}
        <span className="badge" style={{ background: cs.bg, color: cs.c, marginLeft: 6, fontSize: 9 }}>{cs.l}</span>
      </div>}
      {ad.stage === "live" && la && !bc && <div style={{ fontSize: 11, marginBottom: 6, fontFamily: "var(--fm)" }}>
        <span style={{ color: "var(--text-tertiary)" }}>CPA: </span><span style={{ color: cs.c, fontWeight: 700 }}>{CUR} {la.cpa}</span>
        <span className="badge" style={{ background: cs.bg, color: cs.c, marginLeft: 6, fontSize: 9 }}>{cs.l}</span>
      </div>}

      {idsButNoData && <div style={{ fontSize: 10.5, color: "var(--yellow)", background: "var(--yellow-bg)", padding: "3px 8px", borderRadius: "var(--radius-sm)", marginBottom: 5 }}>Sync to pull data</div>}
      {ad.stage === "live" && cl === "green" && <div style={{ fontSize: 10.5, color: "var(--green-light)", background: "var(--green-bg)", padding: "3px 8px", borderRadius: "var(--radius-sm)", marginBottom: 5 }}>Scale</div>}
      {ad.stage === "live" && cl === "red" && <div style={{ fontSize: 10.5, color: "var(--red-light)", background: "var(--red-bg)", padding: "3px 8px", borderRadius: "var(--radius-sm)", marginBottom: 5 }}>Iter {ad.iterations}/{ad.maxIter}</div>}

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

function EditorPanel({ ads, th, editors, addEditor, removeEditor }) {
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const allProfiles = getAllEditorProfiles();

  const handleAdd = () => {
    if (newName.trim()) { addEditor(newName); setNewName(""); setShowAdd(false); }
  };

  const findProfile = (name) => {
    // Match by displayName across all profiles
    return Object.values(allProfiles).find(p => p.displayName === name) || null;
  };

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Editor Performance</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Win rate, quality scores, and bonus tracking for each editor.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm">{showAdd ? "Cancel" : "+ Add Editor"}</button>
      </div>
      {showAdd && <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label className="label" style={{ marginTop: 0 }}>Editor Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} className="input" placeholder="Enter name..." autoFocus />
        </div>
        <button onClick={handleAdd} disabled={!newName.trim() || editors.includes(newName.trim())} className="btn btn-primary btn-sm">Add</button>
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: editors.length < 3 ? `repeat(${Math.max(1, editors.length)},1fr)` : "repeat(3,1fr)", gap: 12 }}>
        {editors.map(name => {
          const all = ads.filter(a => a.editor === name && a.stage !== "killed");
          const live = all.filter(a => a.stage === "live");
          const winners = live.filter(a => { const l = lm(a); return l && CL(l.cpa, th) === "green" && gd(a, th) >= 5; });
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

          return (
            <div key={name} className="card" onClick={() => setSelectedEditor({ name, profile, stats: { winRate, onTime, qualScore, bonus, all: all.length, overdueN, health } })} style={{ cursor: "pointer", transition: "all var(--transition)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {profile?.photoUrl
                    ? <img src={profile.photoUrl} style={{ width: 32, height: 32, borderRadius: "var(--radius-full)", border: "2px solid " + hc, objectFit: "cover" }} />
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
              {profile?.weeklyMinutes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Capacity: {profile.weeklyMinutes} min/week</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                {[[winRate + "%", "Win Rate", winRate >= 25 ? "var(--green)" : "var(--yellow)"], [onTime + "%", "On-Time", onTime >= 85 ? "var(--green)" : "var(--yellow)"], [qualScore, "Quality", qualScore >= 75 ? "var(--green)" : "var(--yellow)"], [all.length, "Assigned", "var(--accent-light)"]].map(([v, l, c]) => (
                  <div key={l} className="stat-box">
                    <div className="stat-value" style={{ fontSize: 14, color: c }}>{v}</div>
                    <div className="stat-label">{l}</div>
                  </div>
                ))}
              </div>
              {overdueN > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--red-light)" }}>{overdueN} overdue</div>}
              {all.length === 0 && <button onClick={(e) => { e.stopPropagation(); removeEditor(name); }} className="btn btn-ghost btn-xs" style={{ marginTop: 8, color: "var(--red-light)", fontSize: 10.5 }}>Remove Editor</button>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>Win bonus: <span style={{ color: "var(--green-light)" }}>SAR 75</span>/winner (green CPA 5+ days) · Quality = 100 - (revisions x 8) · Health = composite</div>

      {/* Editor Detail Modal */}
      {selectedEditor && <EditorDetailModal editor={selectedEditor} onClose={() => setSelectedEditor(null)} />}
    </div>
  );
}

function EditorDetailModal({ editor, onClose }) {
  const { name, profile, stats } = editor;
  const [pName, setPName] = useState(profile?.displayName || name);
  const [pPhoto, setPPhoto] = useState(profile?.photoUrl || null);
  const [pPortfolio, setPPortfolio] = useState(profile?.portfolioUrl || "");
  const [pRate, setPRate] = useState(profile?.compensationRate || "");
  const [pMinutes, setPMinutes] = useState(profile?.weeklyMinutes || "");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const email = profile?.email || name.toLowerCase().replace(/\s+/g, ".") + "@team";
    saveEditorProfile(email, {
      displayName: pName.trim(),
      photoUrl: pPhoto,
      portfolioUrl: pPortfolio.trim(),
      compensationRate: pRate.trim(),
      weeklyMinutes: parseInt(pMinutes) || 0,
    });
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
            {profile?.onboardedAt && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>Joined {new Date(profile.onboardedAt).toLocaleDateString()}</span>}
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
        <label className="label">Compensation Rate</label>
        <input value={pRate} onChange={e => setPRate(e.target.value)} className="input" placeholder="e.g. $20/minute edited" />
        <label className="label">Weekly Capacity (minutes of video)</label>
        <input type="number" value={pMinutes} onChange={e => setPMinutes(e.target.value)} className="input" placeholder="e.g. 60" min="1" />

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

function LearningsPage({ ads }) {
  const allLearnings = ads.flatMap(a => a.learnings.map(l => ({ ...l, adName: a.name, adId: a.id })));
  const grouped = {};
  allLearnings.forEach(l => { if (!grouped[l.type]) grouped[l.type] = []; grouped[l.type].push(l); });

  return (
    <div className="animate-fade">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Learnings Flywheel</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          {allLearnings.length} learnings captured across all ads. These feed back into generators.
        </p>
      </div>
      {allLearnings.length === 0 && <div className="empty-state">No learnings captured yet. Run ads and capture insights from winners.</div>}
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} style={{ marginBottom: 18 }}>
          <div className="section-title">{type.replace(/_/g, " ")} ({items.length})</div>
          <div className="stagger">
            {items.map(l => (
              <div key={l.id + "-" + l.adId} className="card-flat" style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span className="badge badge-accent">{l.adName}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{l.text}</div>
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

export default function App({ session, userRole, userName }) {
  const [ads, setAds] = useState(SEED);
  const [openAd, setOpenAd] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [page, setPage] = useState("pipeline");
  const [th, setTh] = useState(DT);
  const [role, setRole] = useState(userRole || "founder");
  const [editors, setEditors] = useState(getEditorsList);
  const addEditor = (name) => { const n = name.trim(); if (!n || editors.includes(n)) return; const u = [...editors, n]; setEditors(u); saveEditorsList(u); };
  const removeEditor = (name) => { const u = editors.filter(e => e !== name); setEditors(u); saveEditorsList(u); };
  const [editorName, setEditorName] = useState(userRole === "editor" ? (userName || "Noor") : "Noor");
  const handleSignOut = () => supabase.auth.signOut();
  const [dragOver, setDragOver] = useState(null);
  const [gateMsg, setGateMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const did = useRef(null);

  const syncTripleWhale = async () => {
    if (!isTripleWhaleConfigured()) { setSyncMsg({ ok: false, text: "Configure Triple Whale in Settings first" }); setTimeout(() => setSyncMsg(null), 3000); return; }
    setSyncing(true); setSyncMsg(null);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const rows = await fetchAdSetMetrics(start, end);
      const matches = matchMetricsToAds(rows, ads);
      let synced = 0, chCount = 0;
      for (const m of matches) {
        for (const [ch, data] of Object.entries(m.channels)) {
          if (data.metrics.length > 0) { dispatch({ type: "SET_CH_METRICS", id: m.adId, channel: ch, metrics: data.metrics }); synced += data.metrics.length; chCount++; }
        }
      }
      const adsWithIds = ads.filter(a => hasAnyChId(a.channelIds) && a.stage !== "killed").length;
      const noDataAds = adsWithIds - matches.length;
      let msg = `Synced ${synced} data points across ${chCount} channel(s) for ${matches.length} ad(s)`;
      if (noDataAds > 0) msg += ` · ${noDataAds} ad(s) had IDs but no data found`;
      setSyncMsg({ ok: synced > 0, text: msg });
    } catch (e) { setSyncMsg({ ok: false, text: e.message }); }
    setSyncing(false);
    setTimeout(() => setSyncMsg(null), 4000);
  };

  const dispatch = useCallback((a) => {
    setAds(p => {
      switch (a.type) {
        case "MOVE": return p.map(x => x.id === a.id ? { ...x, stage: a.stage } : x);
        case "UPDATE": return p.map(x => x.id === a.id ? { ...x, ...a.data } : x);
        case "ADD_METRIC": return p.map(x => x.id === a.id ? { ...x, metrics: [...x.metrics, a.metric] } : x);
        case "SET_CH_METRICS": return p.map(x => x.id === a.id ? { ...x, channelMetrics: { ...(x.channelMetrics || emptyChMetrics()), [a.channel]: a.metrics } } : x);
        case "ADD_COMMENT": return p.map(x => x.id === a.id ? { ...x, comments: [...x.comments, a.comment] } : x);
        case "RM_COMMENT": return p.map(x => x.id === a.aid ? { ...x, comments: x.comments.filter(c => c.id !== a.cid) } : x);
        case "ADD_ANALYSIS": return p.map(x => x.id === a.id ? { ...x, analyses: [...x.analyses, a.analysis] } : x);
        case "ADD_LEARNING": return p.map(x => x.id === a.id ? { ...x, learnings: [...x.learnings, a.learning] } : x);
        case "RM_LEARNING": return p.map(x => x.id === a.aid ? { ...x, learnings: x.learnings.filter(l => l.id !== a.lid) } : x);
        case "ADD_MSG": return p.map(x => x.id === a.id ? { ...x, thread: [...x.thread, a.msg] } : x);
        case "ADD_NOTIF": return p.map(x => x.id === a.id ? { ...x, notifications: [...(x.notifications || []), a.notif] } : x);
        case "SUBMIT_DRAFT": return p.map(x => x.id === a.id ? { ...x, drafts: [...x.drafts, a.draft], draftSubmitted: true } : x);
        case "ADD_REVISION": return p.map(x => x.id === a.id ? { ...x, revisionRequests: [...x.revisionRequests, a.rev] } : x);
        case "RESOLVE_REVISION": return p.map(x => x.id === a.id ? { ...x, revisionRequests: x.revisionRequests.map(r => r.id === a.rid ? { ...r, resolved: true } : r) } : x);
        case "APPROVE_DRAFT": return p.map(x => x.id === a.id ? { ...x, drafts: x.drafts.map(d => d.id === a.did ? { ...d, status: "approved" } : d), finalApproved: true } : x);
        case "ITERATE": return p.map(x => { if (x.id !== a.id) return x; const n = x.iterations + 1; return { ...x, iterations: n, stage: "pre", briefApproved: false, draftSubmitted: false, finalApproved: false, notes: "Iter " + n + " — " + a.reason, iterHistory: [...x.iterHistory, { iter: n, reason: a.reason, date: now() }] }; });
        case "KILL": return p.map(x => x.id === a.id ? { ...x, stage: "killed" } : x);
        case "ADD_AD": { const id = uid(); return [...p, { id, name: a.ad.name, type: a.ad.type, stage: "pre", editor: a.ad.editor || "", deadline: a.ad.deadline || "", brief: a.ad.brief || "", notes: a.ad.notes || "", iterations: 0, maxIter: 3, iterHistory: [], briefApproved: false, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: null, childIds: [], notifications: [], channelIds: a.ad.channelIds || emptyChIds(), channelMetrics: emptyChMetrics() }]; }
        case "CREATE_VAR": { const vid = uid(); return [...p.map(x => x.id === a.pid ? { ...x, childIds: [...(x.childIds || []), vid] } : x), { id: vid, name: a.name, type: a.type, stage: "pre", editor: "", deadline: "", brief: a.brief || a.vt + " variation", notes: "Variation of #" + a.pid, iterations: 0, maxIter: 3, iterHistory: [], briefApproved: true, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: a.pid, childIds: [], notifications: [], channelIds: emptyChIds(), channelMetrics: emptyChMetrics() }]; }
        default: return p;
      }
    });
  }, []);

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

  const visibleAds = role === "editor" ? ads.filter(a => a.editor === editorName && a.stage !== "killed") : ads.filter(a => a.stage !== "killed");
  const live = visibleAds.filter(a => a.stage === "live");
  const win = live.filter(a => CL(lm(a)?.cpa, th) === "green").length;
  const lose = live.filter(a => CL(lm(a)?.cpa, th) === "red").length;
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
      />

      <div className="main-content">
        {/* Toasts */}
        {gateMsg && <div className="toast toast-error">🚫 {gateMsg}</div>}
        {syncMsg && <div className={`toast ${syncMsg.ok ? "toast-success" : "toast-error"}`}>{syncMsg.ok ? "🐳" : "⚠"} {syncMsg.text}</div>}

        {/* ── PIPELINE PAGE ── */}
        {page === "pipeline" && (
          <div className="animate-fade">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, marginBottom: 4 }}>Pipeline</h2>
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
                  {visibleAds.length} ads · {CUR} {spend.toLocaleString()} total spend
                  {killed > 0 && <span> · {killed} killed</span>}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {/* Role switch */}
                <div style={{ display: "flex", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <button onClick={() => setRole("founder")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: role === "founder" ? "var(--accent-bg)" : "transparent", color: role === "founder" ? "var(--accent-light)" : "var(--text-muted)" }}>Founder</button>
                  <button onClick={() => setRole("editor")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: role === "editor" ? "var(--yellow-bg)" : "transparent", color: role === "editor" ? "var(--yellow)" : "var(--text-muted)" }}>Editor</button>
                </div>
                {role === "editor" && <select value={editorName} onChange={e => setEditorName(e.target.value)} className="input" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}>{editors.map(e => <option key={e} value={e}>{e}</option>)}</select>}

                {role === "founder" && <>
                  <button onClick={syncTripleWhale} disabled={syncing} className={`btn btn-sm ${isTripleWhaleConfigured() ? "btn-success" : "btn-ghost"}`}>
                    {syncing ? "Syncing..." : "Sync TW"}
                  </button>
                  <button onClick={() => setNewOpen(true)} className="btn btn-primary btn-sm">+ New Ad</button>
                </>}
              </div>
            </div>

            {/* Stage flow bar */}
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

            {/* Kanban */}
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border-light)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: stage.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{stage.label}</span>
                      </div>
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{stageAds.length}</span>
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

            {/* Threshold rules */}
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span><span style={{ color: "var(--green)" }}>●</span> {"<="} ${th.green} Scale</span>
              <span><span style={{ color: "var(--yellow)" }}>●</span> {"<="} ${th.yellow} Monitor</span>
              <span><span style={{ color: "var(--red)" }}>●</span> {">"} ${th.yellow} Iterate/Kill</span>
            </div>
          </div>
        )}

        {/* ── EDITORS PAGE ── */}
        {page === "editors" && <EditorPanel ads={ads} th={th} editors={editors} addEditor={addEditor} removeEditor={removeEditor} />}

        {/* ── LEARNINGS PAGE ── */}
        {page === "learnings" && <LearningsPage ads={ads} />}

        {/* ── SETTINGS PAGE ── */}
        {page === "settings" && <SettingsPage thresholds={th} setThresholds={setTh} />}

        {/* Modals */}
        {openAd && <AdPanel ad={ads.find(a => a.id === openAd.id) || openAd} onClose={() => setOpenAd(null)} dispatch={dispatch} th={th} allAds={ads} role={role} editors={editors} />}
        {newOpen && <NewAdForm onClose={() => setNewOpen(false)} dispatch={dispatch} editors={editors} />}
      </div>
    </div>
  );
}
