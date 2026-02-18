import { useState, useRef, useEffect, useCallback } from "react";

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
const EDITORS_LIST = ["Noor", "Faisal", "Omar"];
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
  green: { l: "Winner", c: "#10b981", bg: "rgba(16,185,129,0.1)" },
  yellow: { l: "Medium", c: "#d97706", bg: "rgba(217,119,6,0.1)" },
  red: { l: "Losing", c: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  none: { l: "—", c: "#475569", bg: "transparent" },
};

const ff = "'Outfit', system-ui, sans-serif";
const fm = "'IBM Plex Mono', monospace";

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
    parentId: null, childIds: [5], notifications: [],
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
    parentId: null, childIds: [], notifications: [],
  },
  { id: 3, name: "UGC Testimonial #4", type: "UGC", stage: "pre", editor: "", deadline: "",
    brief: "Ahmad from Jeddah, 28. 90-day journey. Phone-shot. Unboxing + routine.",
    notes: "Script approved. Needs editor.", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: false, draftSubmitted: false, finalApproved: false,
    drafts: [], revisionRequests: [],
    metrics: [], comments: [], analyses: [], learnings: [], thread: [],
    parentId: null, childIds: [], notifications: [],
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
    parentId: null, childIds: [], notifications: [],
  },
  { id: 5, name: "Hook Variation A (Urgency)", type: "VSL", stage: "pre", editor: "", deadline: "",
    brief: "Same body as VSL v1. NEW HOOK: 'You have 6 months before it's irreversible.'",
    notes: "Variation of VSL v1 — urgency hook", iterations: 0, maxIter: 3, iterHistory: [],
    briefApproved: true, draftSubmitted: false, finalApproved: false,
    drafts: [], revisionRequests: [],
    metrics: [], comments: [], analyses: [], learnings: [], thread: [],
    parentId: 1, childIds: [], notifications: [],
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
    parentId: null, childIds: [], notifications: [],
  },
];

// ════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════

const si = (w) => ({ width: w || "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: ff });
const sBtn = (bg, c, bd) => ({ padding: "8px 16px", borderRadius: 8, border: bd || "none", background: bg || "#6366f1", color: c || "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ff, transition: "all 0.12s" });
const sCard = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 12, padding: 14 };
const sBadge = (c, bg) => ({ display: "inline-block", fontSize: 10, padding: "2px 8px", borderRadius: 14, background: bg || c + "18", color: c, fontWeight: 600, fontFamily: fm });
const sLabel = { display: "block", fontSize: 10.5, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, marginTop: 12 };
const sSec = { fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 };

// ════════════════════════════════════════════════
// MODAL (shared)
// ════════════════════════════════════════════════

function Modal({ title, onClose, children, w }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0c0f16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "22px 26px", width: w || 580, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// AI ANALYSIS
// ════════════════════════════════════════════════

async function runAI(ad, t) {
  const la = lm(ad), tot = tm(ad), sn = { positive: 0, negative: 0, neutral: 0 };
  ad.comments.forEach(c => sn[c.sentiment]++);
  const prompt = `You are an expert direct response advertising analyst for TikTok ads targeting the Saudi Arabian market. Analyze this ad's performance data + audience comments (including hidden negatives TikTok auto-hid which contain critical market intelligence).

AD: "${ad.name}" (${ad.type})
BRIEF: ${ad.brief}
METRICS (latest day): CPA $${la?.cpa || "N/A"} | Spend $${la?.spend || 0} | Conv ${la?.conv || 0} | CTR ${la?.ctr || 0}% | CPM $${la?.cpm || 0}
Thresholds: Green ≤$${t.green}, Yellow ≤$${t.yellow}, Red >$${t.yellow}
CPA TREND: ${ad.metrics.map(m => "$" + m.cpa).join(" → ")}
TOTALS: $${tot?.spend || 0} spent, ${tot?.conv || 0} conversions, avg CPA $${tot?.ac || "N/A"}

COMMENTS (${ad.comments.length} total — ${sn.positive} positive, ${sn.negative} negative, ${sn.neutral} neutral):
${ad.comments.map(c => `"${c.text}" [${c.sentiment}]${c.hidden ? " [HIDDEN BY TIKTOK]" : ""}`).join("\n")}

ITERATION HISTORY: ${ad.iterations > 0 ? ad.iterHistory.map(h => "Iter " + h.iter + ": " + h.reason).join("; ") : "None"}

Respond ONLY in JSON, no markdown fences or backticks:
{"summary":"2-3 sentence assessment","findings":[{"type":"positive|negative|warning|action","text":"specific finding"}],"nextIterationPlan":"specific plan if losing, or null if winning","suggestedLearnings":[{"type":"hook_pattern|proof_structure|angle_theme|pacing|visual_style|objection_handling","text":"learning to capture"}]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-5-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) });
    const d = await r.json();
    const tx = d.content?.map(b => b.text || "").join("") || "";
    return JSON.parse(tx.replace(/```json|```/g, "").trim());
  } catch (e) {
    return { summary: "Error: " + e.message, findings: [], nextIterationPlan: null, suggestedLearnings: [] };
  }
}

// ════════════════════════════════════════════════
// NEW AD FORM (proper component)
// ════════════════════════════════════════════════

function NewAdForm({ onClose, dispatch }) {
  const [f, setF] = useState({ name: "", type: "VSL", editor: "", deadline: "", brief: "", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal title="New Ad → Pre-Production" onClose={onClose} w={480}>
      <span style={sLabel}>Ad Name</span>
      <input value={f.name} onChange={e => set("name", e.target.value)} style={si()} placeholder="e.g. Hair Growth VSL v2" />
      <span style={sLabel}>Type</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {AD_TYPES.map(t => <button key={t} onClick={() => set("type", t)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 12, cursor: "pointer", fontFamily: ff, background: f.type === t ? "rgba(99,102,241,0.1)" : "transparent", border: f.type === t ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.06)", color: f.type === t ? "#a5b4fc" : "#64748b" }}>{t}</button>)}
      </div>
      <span style={sLabel}>Editor</span>
      <select value={f.editor} onChange={e => set("editor", e.target.value)} style={si()}>
        <option value="">Unassigned</option>
        {EDITORS_LIST.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      <span style={sLabel}>Deadline</span>
      <input type="date" value={f.deadline} onChange={e => set("deadline", e.target.value)} style={si()} />
      <span style={sLabel}>Brief</span>
      <textarea value={f.brief} onChange={e => set("brief", e.target.value)} rows={3} style={{ ...si(), resize: "vertical" }} placeholder="Look/feel, hooks, pacing, references..." />
      <span style={sLabel}>Notes</span>
      <input value={f.notes} onChange={e => set("notes", e.target.value)} style={si()} placeholder="Quick notes..." />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={sBtn("transparent", "#64748b", "1px solid rgba(255,255,255,0.08)")}>Cancel</button>
        <button onClick={() => { if (f.name.trim()) { dispatch({ type: "ADD_AD", ad: f }); onClose(); } }} style={{ ...sBtn("#6366f1"), opacity: f.name.trim() ? 1 : 0.4 }}>Add to Pipeline</button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════
// SETTINGS (proper component)
// ════════════════════════════════════════════════

function SettingsModal({ onClose, thresholds, setThresholds }) {
  const [g, setG] = useState(thresholds.green);
  const [y, setY] = useState(thresholds.yellow);
  return (
    <Modal title="CPA Thresholds" onClose={onClose} w={380}>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>Ads auto-classify based on latest CPA against these thresholds. All live ads reclassify instantly when you change them.</div>
      <span style={sLabel}>🟢 Green (Winner) — CPA ≤</span>
      <input type="number" step="0.01" value={g} onChange={e => setG(+e.target.value)} style={si()} />
      <span style={sLabel}>🟡 Yellow (Medium) — CPA ≤</span>
      <input type="number" step="0.01" value={y} onChange={e => setY(+e.target.value)} style={si()} />
      <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>🔴 Red (Losing) = anything above yellow</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={sBtn("transparent", "#64748b", "1px solid rgba(255,255,255,0.08)")}>Cancel</button>
        <button onClick={() => { setThresholds({ green: g, yellow: y }); onClose(); }} style={sBtn("#6366f1")}>Save</button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════
// STAGE GATE CHECK
// ════════════════════════════════════════════════

function checkGate(ad, fromStage, toStage) {
  const idx = SO.indexOf(toStage);
  const fromIdx = SO.indexOf(fromStage);
  if (idx < 0 || fromIdx < 0) return null;

  // Moving backward is always allowed
  if (idx < fromIdx) return null;

  // Pre → In: brief approved + editor assigned
  if (fromStage === "pre" && toStage === "in") {
    if (!ad.briefApproved) return "Brief must be approved before moving to In-Production";
    if (!ad.editor) return "Editor must be assigned before moving to In-Production";
  }
  // In → Post: draft submitted
  if (fromStage === "in" && toStage === "post") {
    if (!ad.draftSubmitted && ad.drafts.length === 0) return "Editor must submit a draft before moving to Post-Production";
  }
  // Post → Live: final approved
  if (fromStage === "post" && toStage === "live") {
    if (!ad.finalApproved) return "Final version must be approved before going Live";
    if (ad.revisionRequests.some(r => !r.resolved)) return "Unresolved revision requests — resolve before going Live";
  }
  return null;
}

// ════════════════════════════════════════════════
// AD DETAIL PANEL
// ════════════════════════════════════════════════

function AdPanel({ ad, onClose, dispatch, th, allAds, role }) {
  const [tab, setTab] = useState("overview");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [nc, setNc] = useState({ text: "", sentiment: "neutral", hidden: false });
  const [nm, setNm] = useState({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" });
  const [nl, setNl] = useState({ type: "hook_pattern", text: "" });
  const [vm, setVm] = useState(null);
  const [vf, setVf] = useState({ name: "", brief: "" });
  const [eb, setEb] = useState(ad.brief);
  const [en, setEn] = useState(ad.notes);
  const [ee, setEe] = useState(ad.editor || "");
  const [eDl, setEDl] = useState(ad.deadline || "");
  const [revText, setRevText] = useState("");
  const [draftName, setDraftName] = useState("");
  const [gateErr, setGateErr] = useState(null);

  const la = lm(ad), tot = tm(ad);
  const cl = ad.stage === "live" ? CL(la?.cpa, th) : "none";
  const cs = CS[cl];
  const stg = STAGES.find(s => s.id === ad.stage);
  const over = od(ad.deadline);
  const gdays = gd(ad, th);
  const winner = cl === "green" && gdays >= 5;
  const kids = allAds.filter(a => a.parentId === ad.id);
  const isEditor = role === "editor";

  const analyze = async () => { setBusy(true); const r = await runAI(ad, th); dispatch({ type: "ADD_ANALYSIS", id: ad.id, analysis: { id: uid(), ts: now(), ...r } }); if (r.suggestedLearnings?.length) r.suggestedLearnings.forEach(l => dispatch({ type: "ADD_LEARNING", id: ad.id, learning: { id: uid(), type: l.type, text: l.text } })); setBusy(false); setTab("analysis"); };

  const scrapeComments = () => { setScraping(true); setTimeout(() => { const fakeComments = [
    { id: uid(), text: "Does this actually work for receding hairline?", sentiment: "neutral", hidden: false },
    { id: uid(), text: "I've been using it for 2 months, definitely seeing results", sentiment: "positive", hidden: false },
    { id: uid(), text: "Overpriced trash", sentiment: "negative", hidden: true },
  ]; fakeComments.forEach(c => dispatch({ type: "ADD_COMMENT", id: ad.id, comment: c })); dispatch({ type: "ADD_NOTIF", id: ad.id, notif: { ts: now(), text: `Scraped ${fakeComments.length} new comments (${fakeComments.filter(c=>c.hidden).length} hidden)` } }); setScraping(false); }, 1500); };

  const addMetric = () => { const m = { date: nm.date, cpa: +nm.cpa, spend: +nm.spend, conv: +nm.conv, ctr: +nm.ctr, cpm: +nm.cpm }; if (!m.cpa || !m.spend) return; dispatch({ type: "ADD_METRIC", id: ad.id, metric: m }); setNm({ date: "2026-02-12", cpa: "", spend: "", conv: "", ctr: "", cpm: "" }); };
  const addComment = () => { if (!nc.text.trim()) return; dispatch({ type: "ADD_COMMENT", id: ad.id, comment: { id: uid(), ...nc, text: nc.text.trim() } }); setNc({ text: "", sentiment: "neutral", hidden: false }); };
  const save = () => dispatch({ type: "UPDATE", id: ad.id, data: { brief: eb, notes: en, editor: ee, deadline: eDl } });
  const sendMsg = () => { if (!msg.trim()) return; dispatch({ type: "ADD_MSG", id: ad.id, msg: { from: isEditor ? ad.editor || "Editor" : "You", text: msg.trim(), ts: now() } }); setMsg(""); };
  const addLearning = () => { if (!nl.text.trim()) return; dispatch({ type: "ADD_LEARNING", id: ad.id, learning: { id: uid(), ...nl, text: nl.text.trim() } }); setNl({ type: "hook_pattern", text: "" }); };
  const createVar = () => { if (!vf.name.trim()) return; dispatch({ type: "CREATE_VAR", pid: ad.id, name: vf.name.trim(), brief: vf.brief.trim(), type: ad.type, vt: vm.id }); setVm(null); setVf({ name: "", brief: "" }); };
  const doIter = () => { const last = ad.analyses[ad.analyses.length - 1]; dispatch({ type: "ITERATE", id: ad.id, reason: last?.nextIterationPlan || last?.summary || "Based on metrics" }); };
  const doKill = () => dispatch({ type: "KILL", id: ad.id });
  const submitDraft = () => { if (!draftName.trim()) return; dispatch({ type: "SUBMIT_DRAFT", id: ad.id, draft: { id: uid(), name: draftName.trim(), version: ad.drafts.length + 1, ts: now(), status: "in-review" } }); setDraftName(""); };
  const requestRevision = () => { if (!revText.trim()) return; dispatch({ type: "ADD_REVISION", id: ad.id, rev: { id: uid(), from: "Adolf", text: revText.trim(), ts: now(), resolved: false } }); setRevText(""); };
  const resolveRevision = (rid) => dispatch({ type: "RESOLVE_REVISION", id: ad.id, rid });
  const approveDraft = (did) => dispatch({ type: "APPROVE_DRAFT", id: ad.id, did });

  const tryMove = (stage) => {
    const err = checkGate(ad, ad.stage, stage);
    if (err) { setGateErr(err); setTimeout(() => setGateErr(null), 3000); return; }
    dispatch({ type: "MOVE", id: ad.id, stage });
  };

  const tabs = [
    { id: "overview", l: "Overview" },
    { id: "drafts", l: `Drafts (${ad.drafts.length})` },
    { id: "metrics", l: `Metrics (${ad.metrics.length})` },
    { id: "comments", l: `Comments (${ad.comments.length})` },
    { id: "analysis", l: `Analysis (${ad.analyses.length})` },
    { id: "thread", l: `Thread (${ad.thread.length})` },
    { id: "learnings", l: `Learnings (${ad.learnings.length})` },
  ];

  return (
    <Modal title="" onClose={onClose} w={720}>
      {/* Header */}
      <div style={{ marginTop: -8, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 5 }}>{ad.name}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={sBadge(stg.color)}>{stg.label}</span>
          <span style={sBadge("#94a3b8", "rgba(255,255,255,0.04)")}>{ad.type}</span>
          {ad.editor && <span style={sBadge("#94a3b8", "rgba(255,255,255,0.04)")}>⚙ {ad.editor}</span>}
          {ad.stage === "live" && la && <span style={{ ...sBadge(cs.c, cs.bg), fontWeight: 700 }}>{cs.l} ${la.cpa}</span>}
          {ad.iterations > 0 && <span style={sBadge("#d97706")}>Iter {ad.iterations}/{ad.maxIter}</span>}
          {over && <span style={sBadge("#ef4444", "rgba(239,68,68,0.1)")}>⚠ OVERDUE</span>}
          {ad.deadline && !over && <span style={sBadge("#64748b", "rgba(255,255,255,0.04)")}>Due {fd(ad.deadline)}</span>}
          {winner && <span style={sBadge("#10b981", "rgba(16,185,129,0.12)")}>🏆 WINNER ({gdays}d)</span>}
          {ad.parentId && <span style={sBadge("#6ee7b7", "rgba(16,185,129,0.08)")}>variation</span>}
          {ad.briefApproved && <span style={sBadge("#10b981", "rgba(16,185,129,0.06)")}>✓ Brief</span>}
          {ad.draftSubmitted && <span style={sBadge("#3b82f6", "rgba(59,130,246,0.06)")}>✓ Draft</span>}
          {ad.finalApproved && <span style={sBadge("#10b981", "rgba(16,185,129,0.06)")}>✓ Final</span>}
        </div>
      </div>

      {/* Stage gate error */}
      {gateErr && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: 10, fontSize: 12, color: "#fca5a5" }}>🚫 {gateErr}</div>}

      {/* Stage movement */}
      {ad.stage !== "killed" && !isEditor && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#334155", marginRight: 4 }}>Move:</span>
          {SO.filter(s => s !== ad.stage).map(s => {
            const st = STAGES.find(x => x.id === s);
            return <button key={s} onClick={() => tryMove(s)} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 7, cursor: "pointer", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: st.color, fontFamily: ff, fontWeight: 500 }}>{st.icon} {st.label}</button>;
          })}
          {ad.iterations >= ad.maxIter && ad.stage === "live" && CL(la?.cpa, th) === "red" && (
            <button onClick={doKill} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 7, cursor: "pointer", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444", fontFamily: ff, fontWeight: 600 }}>☠ Kill Ad</button>
          )}
        </div>
      )}

      {/* Alerts */}
      {ad.stage === "live" && cl === "green" && (
        <div style={{ padding: "9px 13px", borderRadius: 9, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.12)", marginBottom: 10, fontSize: 12, color: "#6ee7b7" }}>
          🚀 <b>Winner.</b> {winner ? "Confirmed (5+ days). Scale aggressively via variations." : `${gdays}/5 green days to confirm.`}
        </div>
      )}
      {ad.stage === "live" && cl === "red" && !isEditor && (
        <div style={{ padding: "9px 13px", borderRadius: 9, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)", marginBottom: 10, fontSize: 12, color: "#fca5a5" }}>
          🔻 <b>Above red threshold.</b> Iter {ad.iterations}/{ad.maxIter}. {ad.iterations >= ad.maxIter ? "Max reached — kill or pivot." : "Run analysis → iterate."}
          {ad.iterations < ad.maxIter && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={analyze} disabled={busy} style={sBtn("rgba(99,102,241,0.12)", "#a5b4fc", "1px solid rgba(99,102,241,0.2)")}>{busy ? "Analyzing..." : "🔬 Run AI Analysis"}</button>
            <button onClick={doIter} style={sBtn("rgba(239,68,68,0.1)", "#fca5a5", "1px solid rgba(239,68,68,0.2)")}>↻ Iterate → Pre</button>
          </div>}
        </div>
      )}
      {ad.stage === "killed" && (
        <div style={{ padding: "9px 13px", borderRadius: 9, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)", marginBottom: 10, fontSize: 12, color: "#fca5a5" }}>
          ☠ <b>Killed</b> — ad archived after {ad.iterations} iterations. Learnings preserved.
        </div>
      )}

      {/* Unresolved revisions alert */}
      {ad.revisionRequests.filter(r => !r.resolved).length > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)", marginBottom: 10, fontSize: 12, color: "#fbbf24" }}>
          📝 {ad.revisionRequests.filter(r => !r.resolved).length} unresolved revision request(s)
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: ff, background: tab === t.id ? "rgba(99,102,241,0.1)" : "transparent", border: tab === t.id ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.04)", color: tab === t.id ? "#a5b4fc" : "#64748b" }}>{t.l}</button>)}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div><span style={sLabel}>Editor</span><select disabled={isEditor} value={ee} onChange={e => setEe(e.target.value)} style={si()}><option value="">Unassigned</option>{EDITORS_LIST.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
            <div><span style={sLabel}>Deadline</span><input disabled={isEditor} type="date" value={eDl} onChange={e => setEDl(e.target.value)} style={si()} /></div>
          </div>
          <span style={sLabel}>Brief</span>
          <textarea disabled={isEditor} value={eb} onChange={e => setEb(e.target.value)} rows={3} style={{ ...si(), resize: "vertical", minHeight: 55 }} />
          <span style={sLabel}>Notes</span>
          <textarea value={en} onChange={e => setEn(e.target.value)} rows={2} style={{ ...si(), resize: "vertical", minHeight: 35 }} />

          {/* Gate toggles */}
          {!isEditor && (
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {[["briefApproved", "Approve Brief", "#8b5cf6"], ["draftSubmitted", "Mark Draft Submitted", "#d97706"], ["finalApproved", "Approve Final", "#10b981"]].map(([k, label, col]) => (
                <button key={k} onClick={() => dispatch({ type: "UPDATE", id: ad.id, data: { [k]: !ad[k] } })} style={{
                  fontSize: 11, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontWeight: 600,
                  background: ad[k] ? col + "15" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${ad[k] ? col + "40" : "rgba(255,255,255,0.06)"}`,
                  color: ad[k] ? col : "#475569",
                }}>{ad[k] ? "✓ " : ""}{label}</button>
              ))}
            </div>
          )}

          <button onClick={save} style={{ ...sBtn("#6366f1"), marginTop: 12 }}>Save Changes</button>

          {/* Iteration history */}
          {ad.iterHistory.length > 0 && <div style={{ marginTop: 16 }}><div style={sSec}>Iteration History</div>
            {ad.iterHistory.map((h, i) => <div key={i} style={{ ...sCard, padding: "8px 12px", marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={sBadge("#d97706")}>Iter {h.iter}</span><span style={{ fontSize: 10, color: "#475569", fontFamily: fm }}>{h.date}</span></div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{h.reason}</div>
            </div>)}
          </div>}

          {/* Variations for winners */}
          {ad.stage === "live" && cl === "green" && !isEditor && <div style={{ marginTop: 16 }}>
            <div style={sSec}>Create Variations</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {VT.map(v => <div key={v.id} onClick={() => { setVm(v); setVf({ name: ad.name + " — " + v.label, brief: "" }); }} style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(16,185,129,0.2)"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"}>
                <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>{v.label}</div><div style={{ fontSize: 10, color: "#475569" }}>{v.desc}</div>
              </div>)}
            </div>
            {kids.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>Variations: {kids.map(c => <span key={c.id} style={{ ...sBadge("#a5b4fc", "rgba(99,102,241,0.08)"), marginRight: 3 }}>{c.name}</span>)}</div>}
            {vm && <div style={{ ...sCard, marginTop: 10, borderColor: "rgba(16,185,129,0.15)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>New: {vm.label}</div>
              <span style={sLabel}>Name</span><input value={vf.name} onChange={e => setVf(p => ({ ...p, name: e.target.value }))} style={si()} />
              <span style={sLabel}>Brief</span><textarea value={vf.brief} onChange={e => setVf(p => ({ ...p, brief: e.target.value }))} style={{ ...si(), minHeight: 40, resize: "vertical" }} placeholder={vm.desc} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setVm(null)} style={sBtn("transparent", "#64748b", "1px solid rgba(255,255,255,0.08)")}>Cancel</button>
                <button onClick={createVar} style={sBtn("#10b981")}>Create</button>
              </div>
            </div>}
          </div>}
        </div>
      )}

      {/* ── DRAFTS & REVISIONS ── */}
      {tab === "drafts" && (
        <div>
          <div style={sSec}>Draft Versions</div>
          {ad.drafts.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#334155", fontSize: 12 }}>No drafts submitted yet</div>}
          {ad.drafts.map(d => (
            <div key={d.id} style={{ ...sCard, padding: "9px 13px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>📄</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                  <span style={sBadge("#94a3b8", "rgba(255,255,255,0.04)")}>v{d.version}</span>
                  <span style={sBadge(d.status === "approved" ? "#10b981" : d.status === "revision-requested" ? "#d97706" : "#3b82f6", d.status === "approved" ? "rgba(16,185,129,0.1)" : d.status === "revision-requested" ? "rgba(217,119,6,0.1)" : "rgba(59,130,246,0.1)")}>{d.status}</span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#475569", fontFamily: fm }}>{d.ts}</span>
                  {d.status === "in-review" && !isEditor && <button onClick={() => approveDraft(d.id)} style={sBtn("rgba(16,185,129,0.1)", "#6ee7b7", "1px solid rgba(16,185,129,0.2)")}>✓ Approve</button>}
                </div>
              </div>
            </div>
          ))}

          {/* Submit draft (editor action) */}
          <div style={{ ...sCard, marginTop: 12, borderColor: "rgba(255,255,255,0.07)" }}>
            <div style={sSec}>Submit Draft</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={draftName} onChange={e => setDraftName(e.target.value)} style={{ ...si(), flex: 1 }} placeholder="File name (e.g. ad_draft_v2.mp4)" />
              <button onClick={submitDraft} style={{ ...sBtn("#3b82f6"), opacity: draftName.trim() ? 1 : 0.4 }}>Upload Draft</button>
            </div>
          </div>

          {/* Revision requests */}
          <div style={{ marginTop: 16 }}><div style={sSec}>Revision Requests</div>
            {ad.revisionRequests.length === 0 && <div style={{ padding: 12, textAlign: "center", color: "#334155", fontSize: 12 }}>No revision requests</div>}
            {ad.revisionRequests.map(r => (
              <div key={r.id} style={{ ...sCard, padding: "9px 13px", marginBottom: 6, borderColor: r.resolved ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.12)", background: r.resolved ? "rgba(16,185,129,0.02)" : "rgba(245,158,11,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.from}</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#475569", fontFamily: fm }}>{r.ts}</span>
                    {r.resolved ? <span style={sBadge("#10b981", "rgba(16,185,129,0.1)")}>Resolved</span> : <span style={sBadge("#d97706", "rgba(217,119,6,0.1)")}>Open</span>}
                    {!r.resolved && <button onClick={() => resolveRevision(r.id)} style={sBtn("rgba(16,185,129,0.1)", "#6ee7b7", "1px solid rgba(16,185,129,0.2)")}>✓</button>}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.4 }}>{r.text}</div>
              </div>
            ))}

            {!isEditor && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={revText} onChange={e => setRevText(e.target.value)} style={{ ...si(), flex: 1 }} placeholder="Describe revision needed..." />
              <button onClick={requestRevision} style={{ ...sBtn("#d97706"), opacity: revText.trim() ? 1 : 0.4 }}>Request Revision</button>
            </div>}
          </div>
        </div>
      )}

      {/* ── METRICS ── */}
      {tab === "metrics" && (
        <div>
          {tot && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 14 }}>
            {[["Latest CPA", "$" + tot.lc, cs.c], ["Spend", "$" + tot.spend.toLocaleString(), "#e2e8f0"], ["Conv", tot.conv, "#6ee7b7"], ["Avg CTR", tot.at + "%", "#a5b4fc"], ["Avg CPM", "$" + tot.am, "#e2e8f0"], ["ROAS", tot.roas + "x", tot.roas >= 2 ? "#10b981" : "#d97706"]].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center", padding: "9px 5px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: fm }}>{v}</div>
                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>{l}</div>
              </div>
            ))}</div>}

          {ad.metrics.length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={sSec}>CPA Trend</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
              {ad.metrics.map((m, i) => { const mx = Math.max(...ad.metrics.map(x => x.cpa)); const h = Math.max(10, (m.cpa / mx) * 65); const lv = CL(m.cpa, th); const col = CS[lv].c;
                return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 9, color: col, fontFamily: fm, fontWeight: 600 }}>${m.cpa}</span>
                  <div style={{ width: "100%", height: h, background: col + "22", borderRadius: "3px 3px 0 0", border: "1px solid " + col + "30" }} />
                  <span style={{ fontSize: 8, color: "#334155" }}>{fd(m.date)}</span>
                </div>; })}
            </div></div>}

          {!isEditor && <div>
            <div style={sSec}>Log Metrics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
              {[["date", "Date", "date"], ["cpa", "CPA ($)", "number"], ["spend", "Spend ($)", "number"], ["conv", "Conv", "number"], ["ctr", "CTR (%)", "number"], ["cpm", "CPM ($)", "number"]].map(([k, l, t]) => (
                <div key={k}><span style={{ ...sLabel, marginTop: 0 }}>{l}</span><input type={t} step="any" value={nm[k]} onChange={e => setNm(p => ({ ...p, [k]: e.target.value }))} style={si()} /></div>
              ))}
            </div>
            <button onClick={addMetric} style={{ ...sBtn("#6366f1"), marginTop: 8, opacity: nm.cpa && nm.spend ? 1 : 0.4 }}>+ Log</button>
          </div>}
        </div>
      )}

      {/* ── COMMENTS ── */}
      {tab === "comments" && (
        <div>
          {ad.stage === "live" && !isEditor && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={scrapeComments} disabled={scraping} style={sBtn("rgba(99,102,241,0.1)", "#a5b4fc", "1px solid rgba(99,102,241,0.2)")}>{scraping ? "⏳ Scraping..." : "🔍 Scrape Comments"}</button>
          </div>}

          {ad.comments.filter(c => c.hidden).length > 0 && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)", marginBottom: 10, fontSize: 12, color: "#fca5a5" }}>
            ⚠ <b>{ad.comments.filter(c => c.hidden).length} hidden negatives</b> — critical market intel.</div>}

          {ad.comments.map(c => <div key={c.id} style={{ ...sCard, padding: "8px 12px", marginBottom: 5, borderColor: c.hidden ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)", background: c.hidden ? "rgba(239,68,68,0.02)" : "rgba(255,255,255,0.01)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sentiment === "positive" ? "#10b981" : c.sentiment === "negative" ? "#ef4444" : "#64748b" }} />
              <span style={{ fontSize: 10, color: "#475569", fontFamily: fm }}>{c.sentiment}</span>
              {c.hidden && <span style={sBadge("#ef4444", "rgba(239,68,68,0.1)")}>Hidden</span>}
              {!isEditor && <button onClick={() => dispatch({ type: "RM_COMMENT", aid: ad.id, cid: c.id })} style={{ marginLeft: "auto", background: "none", border: "none", color: "#1e293b", cursor: "pointer", fontSize: 10 }}>✕</button>}
            </div>
            <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.4 }}>"{c.text}"</div>
          </div>)}

          {!isEditor && <div style={{ ...sCard, marginTop: 10, borderColor: "rgba(255,255,255,0.07)" }}>
            <div style={sSec}>Add Comment</div>
            <textarea value={nc.text} onChange={e => setNc(p => ({ ...p, text: e.target.value }))} placeholder="Paste or type..." rows={2} style={{ ...si(), resize: "vertical", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              {["positive", "neutral", "negative"].map(s => <button key={s} onClick={() => setNc(p => ({ ...p, sentiment: s }))} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer", fontFamily: ff, background: nc.sentiment === s ? (s === "positive" ? "rgba(16,185,129,0.1)" : s === "negative" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)") : "transparent", border: nc.sentiment === s ? "1px solid " + (s === "positive" ? "#10b981" : s === "negative" ? "#ef4444" : "#64748b") + "40" : "1px solid rgba(255,255,255,0.06)", color: nc.sentiment === s ? (s === "positive" ? "#6ee7b7" : s === "negative" ? "#fca5a5" : "#94a3b8") : "#475569" }}>{s}</button>)}
              <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={nc.hidden} onChange={e => setNc(p => ({ ...p, hidden: e.target.checked }))} /> Hidden</label>
              <button onClick={addComment} style={{ ...sBtn("#6366f1"), marginLeft: "auto", opacity: nc.text.trim() ? 1 : 0.4 }}>+ Add</button>
            </div>
          </div>}
        </div>
      )}

      {/* ── ANALYSIS ── */}
      {tab === "analysis" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={sSec}>AI Analysis</div>
            {ad.stage === "live" && ad.metrics.length > 0 && !isEditor && <button onClick={analyze} disabled={busy} style={sBtn("rgba(99,102,241,0.12)", "#a5b4fc", "1px solid rgba(99,102,241,0.2)")}>{busy ? "⏳ Running..." : "🔬 Run Analysis"}</button>}
          </div>
          {ad.analyses.length === 0 && !busy && <div style={{ padding: 24, textAlign: "center", color: "#334155", fontSize: 13 }}>{ad.stage === "live" && ad.metrics.length > 0 ? "Click 'Run Analysis'." : "Needs live metrics + comments."}</div>}
          {busy && <div style={{ padding: 24, textAlign: "center" }}><div style={{ fontSize: 13, color: "#a5b4fc" }}>⏳ Analyzing {ad.comments.length} comments + {ad.metrics.length} days...</div></div>}
          {[...ad.analyses].reverse().map(a => <div key={a.id} style={{ ...sCard, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={sBadge("#a5b4fc", "rgba(99,102,241,0.08)")}>Analysis</span><span style={{ fontSize: 10, color: "#475569", fontFamily: fm }}>{a.ts}</span></div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>{a.summary}</div>
            {a.findings?.map((f, i) => { const st = { positive: { c: "#6ee7b7", bg: "rgba(16,185,129,0.04)", bc: "rgba(16,185,129,0.08)", ic: "✓" }, negative: { c: "#fca5a5", bg: "rgba(239,68,68,0.04)", bc: "rgba(239,68,68,0.08)", ic: "✕" }, warning: { c: "#fbbf24", bg: "rgba(245,158,11,0.04)", bc: "rgba(245,158,11,0.08)", ic: "⚠" }, action: { c: "#93c5fd", bg: "rgba(59,130,246,0.04)", bc: "rgba(59,130,246,0.08)", ic: "→" } }[f.type] || { c: "#93c5fd", bg: "rgba(59,130,246,0.04)", bc: "rgba(59,130,246,0.08)", ic: "→" };
              return <div key={i} style={{ padding: "7px 11px", borderRadius: 7, background: st.bg, border: "1px solid " + st.bc, marginBottom: 4 }}><span style={{ color: st.c, fontWeight: 700, fontSize: 11, marginRight: 6 }}>{st.ic}</span><span style={{ fontSize: 12, color: "#cbd5e1" }}>{f.text}</span></div>; })}
            {a.nextIterationPlan && a.nextIterationPlan !== "null" && a.nextIterationPlan !== null && <div style={{ padding: "8px 11px", borderRadius: 7, background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.08)", marginTop: 6 }}>
              <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Next Iteration Plan</div>
              <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.4 }}>{a.nextIterationPlan}</div></div>}
            {a.suggestedLearnings?.length > 0 && <div style={{ marginTop: 6 }}><div style={{ fontSize: 10, color: "#475569", fontWeight: 600, marginBottom: 3 }}>Auto-extracted learnings:</div>
              {a.suggestedLearnings.map((l, j) => <div key={j} style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0" }}><span style={sBadge("#c4b5fd", "rgba(99,102,241,0.06)")}>{l.type.replace(/_/g, " ")}</span> {l.text}</div>)}</div>}
          </div>)}
        </div>
      )}

      {/* ── THREAD ── */}
      {tab === "thread" && (
        <div>
          <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 10 }}>
            {ad.thread.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#334155", fontSize: 12 }}>No messages</div>}
            {ad.thread.map((m, i) => <div key={i} style={{ ...sCard, padding: "8px 12px", marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ fontSize: 12, fontWeight: 600, color: m.from === "You" || m.from === "Adolf" ? "#a5b4fc" : "#e2e8f0" }}>{m.from}</span><span style={{ fontSize: 10, color: "#334155", fontFamily: fm }}>{m.ts}</span></div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.4 }}>{m.text}</div>
            </div>)}
          </div>
          <div style={{ display: "flex", gap: 6 }}><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} placeholder="Message..." style={{ ...si(), flex: 1 }} /><button onClick={sendMsg} style={sBtn("#6366f1")}>Send</button></div>
        </div>
      )}

      {/* ── LEARNINGS ── */}
      {tab === "learnings" && (
        <div>
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 10 }}>🔄 Learnings feed back into product workspace, VSL generator, angle generator.</div>
          {ad.learnings.map(l => <div key={l.id} style={{ ...sCard, padding: "8px 12px", marginBottom: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={sBadge("#a5b4fc", "rgba(99,102,241,0.08)")}>{l.type.replace(/_/g, " ")}</span>
              {!isEditor && <button onClick={() => dispatch({ type: "RM_LEARNING", aid: ad.id, lid: l.id })} style={{ background: "none", border: "none", color: "#1e293b", cursor: "pointer", fontSize: 10 }}>✕</button>}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4, marginTop: 3 }}>{l.text}</div>
          </div>)}

          {!isEditor && <div style={{ ...sCard, marginTop: 10, borderColor: "rgba(255,255,255,0.07)" }}>
            <div style={sSec}>Capture Learning</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 5 }}>
              {LT.map(t => <button key={t} onClick={() => setNl(p => ({ ...p, type: t }))} style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 12, cursor: "pointer", fontFamily: ff, background: nl.type === t ? "rgba(99,102,241,0.1)" : "transparent", border: nl.type === t ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.05)", color: nl.type === t ? "#a5b4fc" : "#475569" }}>{t.replace(/_/g, " ")}</button>)}
            </div>
            <textarea value={nl.text} onChange={e => setNl(p => ({ ...p, text: e.target.value }))} rows={2} style={{ ...si(), resize: "vertical" }} placeholder="What did we learn?" />
            <button onClick={addLearning} style={{ ...sBtn("#6366f1"), marginTop: 6, opacity: nl.text.trim() ? 1 : 0.4 }}>+ Save</button>
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
  const la = lm(ad), cl = ad.stage === "live" ? CL(la?.cpa, th) : "none", cs = CS[cl];
  const ix = SO.indexOf(ad.stage), ov = od(ad.deadline), gdays = gd(ad, th);
  const unresolvedRevs = ad.revisionRequests?.filter(r => !r.resolved).length || 0;

  return (
    <div onClick={() => onClick(ad)} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 11, padding: "11px 13px", marginBottom: 7, cursor: "pointer", transition: "all 0.12s", position: "relative", overflow: "hidden" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.background = "rgba(255,255,255,0.032)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.055)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>
      {ad.stage === "live" && cl !== "none" && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: cs.c }} />}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>{ad.name}</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(99,102,241,0.08)", color: "#a5b4fc" }}>{ad.type}</span>
        {ad.editor && <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(255,255,255,0.03)", color: "#64748b" }}>⚙{ad.editor}</span>}
        {ad.iterations > 0 && <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(217,119,6,0.08)", color: "#d97706" }}>iter{ad.iterations}</span>}
        {ov && <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 600 }}>OVERDUE</span>}
        {ad.parentId && <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(16,185,129,0.06)", color: "#6ee7b7" }}>var</span>}
        {unresolvedRevs > 0 && <span style={{ fontSize: 9, padding: "1.5px 5px", borderRadius: 4, background: "rgba(245,158,11,0.08)", color: "#fbbf24" }}>📝{unresolvedRevs}</span>}
      </div>
      {ad.notes && <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 5, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.notes}</div>}
      {ad.stage === "live" && la && <div style={{ fontSize: 10.5, marginBottom: 5, fontFamily: fm }}>
        <span style={{ color: "#475569" }}>CPA: </span><span style={{ color: cs.c, fontWeight: 700 }}>${la.cpa}</span>
        <span style={{ ...sBadge(cs.c, cs.bg), marginLeft: 6, fontSize: 9 }}>{cs.l}</span>
        {cl === "green" && gdays >= 5 && <span style={{ ...sBadge("#10b981", "rgba(16,185,129,0.1)"), marginLeft: 3, fontSize: 9 }}>🏆</span>}
      </div>}
      {ad.stage === "live" && cl === "green" && <div style={{ fontSize: 10, color: "#6ee7b7", background: "rgba(16,185,129,0.04)", padding: "3px 7px", borderRadius: 5, marginBottom: 5 }}>🚀 Scale</div>}
      {ad.stage === "live" && cl === "red" && <div style={{ fontSize: 10, color: "#fca5a5", background: "rgba(239,68,68,0.04)", padding: "3px 7px", borderRadius: 5, marginBottom: 5 }}>⚠ Iter {ad.iterations}/{ad.maxIter}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 2 }}>
          {ix > 0 && <button onClick={() => onMove(ad.id, SO[ix - 1])} style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "#475569", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>}
          {ix < 3 && <button onClick={() => onMove(ad.id, SO[ix + 1])} style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "#475569", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {ad.thread.length > 0 && <span style={{ fontSize: 8.5, color: "#334155" }}>💬{ad.thread.length}</span>}
          {ad.learnings.length > 0 && <span style={{ fontSize: 8.5, color: "#334155" }}>🔄{ad.learnings.length}</span>}
          {ad.comments.length > 0 && <span style={{ fontSize: 8.5, color: "#334155" }}>💭{ad.comments.length}</span>}
          {ad.stage === "live" && cl === "red" && ad.iterations < ad.maxIter && <button onClick={() => onIterate(ad.id)} style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.05)", color: "#fca5a5", cursor: "pointer", fontWeight: 600 }}>Iterate →</button>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// EDITOR STATS + INCENTIVES
// ════════════════════════════════════════════════

function EditorPanel({ ads, th }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>👥 Editor Performance & Incentives</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {EDITORS_LIST.map(name => {
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
          const hc = health === "green" ? "#10b981" : health === "yellow" ? "#d97706" : "#ef4444";

          return (
            <div key={name} style={sCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: hc + "15", border: "2px solid " + hc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: hc }}>{name[0]}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div><span style={sBadge(hc, hc + "15")}>{health}</span></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#6ee7b7", fontFamily: fm }}>${bonus}</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>BONUS</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                {[[winRate + "%", "Win Rate", winRate >= 25 ? "#10b981" : "#d97706"], [onTime + "%", "On-Time", onTime >= 85 ? "#10b981" : "#d97706"], [qualScore, "Quality", qualScore >= 75 ? "#10b981" : "#d97706"], [all.length, "Assigned", "#a5b4fc"]].map(([v, l, c]) => (
                  <div key={l} style={{ textAlign: "center", padding: "5px 0", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fm, color: c }}>{v}</div>
                    <div style={{ fontSize: 8, color: "#475569" }}>{l}</div>
                  </div>
                ))}
              </div>
              {overdueN > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "#fca5a5" }}>⚠ {overdueN} overdue</div>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "#334155", marginTop: 8 }}>Win bonus: <span style={{ color: "#6ee7b7" }}>$75</span>/winner (green CPA 5+ consecutive days) · Quality = 100 − (revisions × 8) · Health = composite of win rate + on-time + quality</div>
    </div>
  );
}

// ════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════

export default function App() {
  const [ads, setAds] = useState(SEED);
  const [openAd, setOpenAd] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [settOpen, setSettOpen] = useState(false);
  const [showEd, setShowEd] = useState(false);
  const [th, setTh] = useState(DT);
  const [role, setRole] = useState("founder");
  const [editorName, setEditorName] = useState("Noor");
  const [dragOver, setDragOver] = useState(null);
  const [gateMsg, setGateMsg] = useState(null);
  const did = useRef(null);

  const dispatch = useCallback((a) => {
    setAds(p => {
      switch (a.type) {
        case "MOVE": return p.map(x => x.id === a.id ? { ...x, stage: a.stage } : x);
        case "UPDATE": return p.map(x => x.id === a.id ? { ...x, ...a.data } : x);
        case "ADD_METRIC": return p.map(x => x.id === a.id ? { ...x, metrics: [...x.metrics, a.metric] } : x);
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
        case "ADD_AD": { const id = uid(); return [...p, { id, name: a.ad.name, type: a.ad.type, stage: "pre", editor: a.ad.editor || "", deadline: a.ad.deadline || "", brief: a.ad.brief || "", notes: a.ad.notes || "", iterations: 0, maxIter: 3, iterHistory: [], briefApproved: false, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: null, childIds: [], notifications: [] }]; }
        case "CREATE_VAR": { const vid = uid(); return [...p.map(x => x.id === a.pid ? { ...x, childIds: [...(x.childIds || []), vid] } : x), { id: vid, name: a.name, type: a.type, stage: "pre", editor: "", deadline: "", brief: a.brief || a.vt + " variation", notes: "Variation of #" + a.pid, iterations: 0, maxIter: 3, iterHistory: [], briefApproved: true, draftSubmitted: false, finalApproved: false, drafts: [], revisionRequests: [], metrics: [], comments: [], analyses: [], learnings: [], thread: [], parentId: a.pid, childIds: [], notifications: [] }]; }
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
    <div style={{ minHeight: "100vh", background: "#070a10", fontFamily: ff, color: "#e2e8f0", padding: "20px 22px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Gate toast */}
      {gateMsg && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 13, fontWeight: 600, zIndex: 1100, backdropFilter: "blur(8px)" }}>🚫 {gateMsg}</div>}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", boxShadow: "0 0 10px rgba(99,102,241,0.4)" }} />
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Ad Lifeline Pipeline</h1>
            {role === "editor" && <span style={sBadge("#d97706", "rgba(217,119,6,0.1)")}>Editor: {editorName}</span>}
          </div>
          <p style={{ fontSize: 11.5, color: "#334155", margin: 0 }}>Stage gates enforced. AI analysis via API. CPA auto-classifies.</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", fontSize: 11, fontFamily: fm }}>
            <span style={{ color: "#475569" }}>Live <span style={{ color: "#10b981", fontWeight: 700 }}>{live.length}</span></span>
            <span style={{ color: "#475569" }}>Win <span style={{ color: "#6ee7b7", fontWeight: 700 }}>{win}</span></span>
            <span style={{ color: "#475569" }}>Lose <span style={{ color: "#ef4444", fontWeight: 700 }}>{lose}</span></span>
            <span style={{ color: "#475569" }}>$<span style={{ color: "#a5b4fc", fontWeight: 700 }}>{spend.toLocaleString()}</span></span>
            <span style={{ color: "#475569" }}>🔄<span style={{ color: "#c4b5fd", fontWeight: 700 }}>{learns}</span></span>
            {killed > 0 && <span style={{ color: "#475569" }}>☠<span style={{ color: "#ef4444", fontWeight: 700 }}>{killed}</span></span>}
          </div>

          {/* Role switch */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={() => setRole("founder")} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: ff, background: role === "founder" ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)", color: role === "founder" ? "#a5b4fc" : "#475569" }}>Founder</button>
            <button onClick={() => setRole("editor")} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: ff, background: role === "editor" ? "rgba(217,119,6,0.12)" : "rgba(255,255,255,0.02)", color: role === "editor" ? "#d97706" : "#475569" }}>Editor</button>
          </div>
          {role === "editor" && <select value={editorName} onChange={e => setEditorName(e.target.value)} style={{ ...si("auto"), padding: "6px 10px", fontSize: 11 }}>{EDITORS_LIST.map(e => <option key={e} value={e}>{e}</option>)}</select>}

          {role === "founder" && <>
            <button onClick={() => setShowEd(!showEd)} style={sBtn(showEd ? "rgba(217,119,6,0.1)" : "rgba(255,255,255,0.03)", showEd ? "#d97706" : "#64748b", "1px solid " + (showEd ? "rgba(217,119,6,0.2)" : "rgba(255,255,255,0.05)"))}>👥</button>
            <button onClick={() => setSettOpen(true)} style={sBtn("rgba(255,255,255,0.03)", "#64748b", "1px solid rgba(255,255,255,0.05)")}>⚙</button>
            <button onClick={() => setNewOpen(true)} style={{ ...sBtn("#6366f1"), boxShadow: "0 0 14px rgba(99,102,241,0.2)" }}>+ New Ad</button>
          </>}
        </div>
      </div>

      {/* Stage flow */}
      <div style={{ display: "flex", alignItems: "center", margin: "0 0 10px", background: "rgba(255,255,255,0.015)", borderRadius: 9, padding: "7px 12px", border: "1px solid rgba(255,255,255,0.03)" }}>
        {STAGES.filter(s => s.id !== "killed").map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11 }}>{s.icon}</span>
              <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 7, background: s.color + "15", color: s.color, fontWeight: 700, fontFamily: fm }}>{visibleAds.filter(a => a.stage === s.id).length}</span>
            </div>
            {i < 3 && <div style={{ flex: 1, textAlign: "center", minWidth: 8 }}><span style={{ color: "#1e293b", fontSize: 9 }}>→</span></div>}
          </div>
        ))}
      </div>

      {/* Stage exit criteria hint */}
      <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
        {STAGES.filter(s => s.id !== "killed").map(s => (
          <div key={s.id} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#1e293b" }}>
            {s.exitLabel && <>Exit: {s.exitLabel}</>}
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, alignItems: "flex-start" }}>
        {STAGES.filter(s => s.id !== "killed").map(stage => {
          const stageAds = visibleAds.filter(a => a.stage === stage.id);
          const isOver = dragOver === stage.id;
          return (
            <div key={stage.id}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); if (did.current != null) tryMove(did.current, stage.id); did.current = null; setDragOver(null); }}
              style={{ background: isOver ? "rgba(99,102,241,0.03)" : "rgba(255,255,255,0.008)", border: isOver ? "1.5px dashed rgba(99,102,241,0.22)" : "1px solid rgba(255,255,255,0.03)", borderRadius: 13, padding: 9, minHeight: 220, transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, paddingBottom: 7, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: stage.color }} /><span style={{ fontSize: 11, fontWeight: 700 }}>{stage.label}</span></div>
                <span style={{ fontSize: 9.5, color: "#334155", fontFamily: fm }}>{stageAds.length}</span>
              </div>
              {stageAds.length === 0 && <div style={{ padding: "18px 6px", textAlign: "center", color: "#1a1a2e", fontSize: 10.5, border: "1px dashed rgba(255,255,255,0.025)", borderRadius: 7 }}>Drop ads here</div>}
              {stageAds.map(ad => (
                <div key={ad.id} draggable onDragStart={() => { did.current = ad.id; }} onDragEnd={() => { did.current = null; }} style={{ cursor: "grab" }}>
                  <PCard ad={ad} th={th} onClick={setOpenAd} onMove={tryMove} onIterate={iterateAd} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Editors */}
      {showEd && role === "founder" && <EditorPanel ads={ads} th={th} />}

      {/* Rules */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "#1e293b", flexWrap: "wrap" }}>
        <span>🟢 ≤${th.green} → Scale</span><span>🟡 ≤${th.yellow} → Monitor</span><span>🔴 >${th.yellow} → 3 iters max → ☠</span><span>🔄 Learnings → generators</span>
        {role === "founder" && <span style={{ marginLeft: "auto", color: "#334155", cursor: "pointer" }} onClick={() => setSettOpen(true)}>⚙ Thresholds</span>}
      </div>

      {/* Modals */}
      {openAd && <AdPanel ad={ads.find(a => a.id === openAd.id) || openAd} onClose={() => setOpenAd(null)} dispatch={dispatch} th={th} allAds={ads} role={role} />}
      {newOpen && <NewAdForm onClose={() => setNewOpen(false)} dispatch={dispatch} />}
      {settOpen && <SettingsModal onClose={() => setSettOpen(false)} thresholds={th} setThresholds={setTh} />}
    </div>
  );
}
