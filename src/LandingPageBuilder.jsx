import { useState, useRef, useEffect } from "react";
import { getApiKey, getSelectedModel } from "./apiKeys.js";
import { supabase } from "./supabase.js";
import { isManusConfigured, submitBuildJob, getJobStatus, sendBuildFeedback } from "./manusApi.js";

// ── Preset Definitions ──

const PRESET_TYPES = [
  { id: "pdp", name: "PDP", label: "Product Detail Page", icon: "🛒", description: "Features, benefits, social proof, strong CTA sections" },
  { id: "advertorial", name: "Advertorial", label: "Advertorial", icon: "📰", description: "Editorial-style article that sells — story-driven, native feel" },
  { id: "listicle", name: "Listicle", label: "Listicle", icon: "📝", description: "\"Top X reasons...\" format — numbered, scannable, persuasive" },
];

const AWARENESS_LEVELS = ["Unaware", "Problem-Aware", "Solution-Aware", "Product-Aware", "Most Aware"];
const SOPHISTICATION_LEVELS = ["1 — First to market", "2 — Enlarged claim", "3 — Unique mechanism", "4 — Proof / specifics", "5 — Identification"];

// ── Prompt Templates ──

const IDEA_PROMPT = (presetType, context) => `You are an elite direct-response copywriter and landing page strategist.

Given the ad context below, generate 5 unique landing page IDEAS for a ${presetType.label}.

For each idea, provide:
- angle: The persuasion angle / approach (1 sentence)
- writer_voice: Who the copy is coming from — e.g. "Authority doctor", "Relatable customer", "Investigative journalist", "Brand founder", etc.
- hook: The opening hook concept (1 sentence)
- big_promise: The main promise or transformation (1 sentence)
- tone: The overall tone (e.g. "urgent + scientific", "casual + story-driven", "edgy + controversial")

AD CONTEXT:
${context}

CRITICAL: If the ad context is in Arabic, generate ideas in Saudi-dialect Arabic (اللهجة السعودية) with English translations.

Respond with ONLY valid JSON, no markdown fences:
{"ideas": [{"angle": "...", "writer_voice": "...", "hook": "...", "big_promise": "...", "tone": "..."}, ...]}`;

const STRUCTURE_PROMPT = (presetType, context, idea) => `You are an elite direct-response copywriter.

Given the ad context and chosen idea below, generate a detailed STRUCTURE / OUTLINE for a ${presetType.label} landing page.

Break it into numbered sections. For each section provide:
- section_name: e.g. "Hero / Headline", "Problem Agitation", "Social Proof Block", etc.
- purpose: What this section accomplishes (1 sentence)
- key_elements: Bullet list of what goes in this section
- estimated_word_count: Approximate words for this section

AD CONTEXT:
${context}

CHOSEN IDEA:
Angle: ${idea.angle}
Writer Voice: ${idea.writer_voice}
Hook: ${idea.hook}
Big Promise: ${idea.big_promise}
Tone: ${idea.tone}

CRITICAL: If the ad context is in Arabic, write the structure in Saudi-dialect Arabic (اللهجة السعودية) with English translations for each section name and purpose.

Respond with ONLY valid JSON, no markdown fences:
{"sections": [{"section_name": "...", "purpose": "...", "key_elements": ["...", ...], "estimated_word_count": 150}, ...], "total_estimated_words": 2000}`;

const FULL_COPY_PROMPT = (presetType, context, idea, structure, knowledgeBase, feedback) => `You are an elite direct-response copywriter writing a complete ${presetType.label} landing page.

Write the FULL COPY for every section of the approved structure below. This must be production-ready copy.

Rules:
- Follow the structure EXACTLY — write each section in order
- Match the chosen angle, voice, and tone precisely
- Use direct-response principles: hooks, open loops, future pacing, social proof, urgency
- Every headline and subhead must earn attention
- CTAs must be specific and action-oriented
- Include placeholder markers for images: [IMAGE: description]
- Write naturally, not robotically

AD CONTEXT:
${context}

CHOSEN IDEA:
Angle: ${idea.angle}
Writer Voice: ${idea.writer_voice}  
Hook: ${idea.hook}
Big Promise: ${idea.big_promise}
Tone: ${idea.tone}

APPROVED STRUCTURE:
${JSON.stringify(structure.sections, null, 2)}

${knowledgeBase ? `REFERENCE KNOWLEDGE BASE (use principles and patterns from this material):\n${knowledgeBase}\n` : ""}

${feedback ? `USER FEEDBACK ON PREVIOUS VERSION (address ALL of these):\n${feedback}\n` : ""}

CRITICAL LANGUAGE RULE: If the ad context is in Arabic, write ALL copy in Saudi-dialect Arabic (اللهجة السعودية). Natural Saudi expressions. NOT formal Arabic or Egyptian dialect.

Respond with ONLY valid JSON, no markdown fences:
{"sections": [{"section_name": "...", "copy": "full copy text for this section..."}, ...]}`;

// ── Knowledge Base Helpers ──

// ── Knowledge Base (localStorage) ──
// Stores file name + extracted text content per workspace/preset

const KB_STORAGE_KEY = "al_lp_kb";

function getKBStore() {
  try { return JSON.parse(localStorage.getItem(KB_STORAGE_KEY) || "{}"); } catch { return {}; }
}

function setKBStore(store) {
  localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(store));
}

function kbKey(workspaceId, presetId) { return `${workspaceId}/${presetId}`; }

function listKBFiles(workspaceId, presetId) {
  const store = getKBStore();
  return store[kbKey(workspaceId, presetId)] || [];
}

async function uploadKBFile(workspaceId, presetId, file) {
  const text = await file.text();
  const entry = { id: Date.now() + "_" + Math.random().toString(36).slice(2, 8), name: file.name, content: text.slice(0, 50000) };
  const store = getKBStore();
  const key = kbKey(workspaceId, presetId);
  store[key] = [...(store[key] || []), entry];
  setKBStore(store);
  return entry.id;
}

function deleteKBFile(workspaceId, presetId, fileId) {
  const store = getKBStore();
  const key = kbKey(workspaceId, presetId);
  store[key] = (store[key] || []).filter(f => f.id !== fileId);
  setKBStore(store);
}

function getKBContent(workspaceId, presetId) {
  const files = listKBFiles(workspaceId, presetId);
  return files.map(f => `--- ${f.name} ---\n${f.content}`).join("\n\n");
}

// ── Claude API Call ──

async function callClaude(prompt) {
  const key = getApiKey("claude");
  if (!key) throw new Error("Claude API key not configured in Settings");
  const model = getSelectedModel("claude");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude error (${res.status}): ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  if (!text.trim()) throw new Error("Claude returned empty response");
  let jsonStr = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[LPBuilder] Raw Claude response:", text);
    throw new Error("Claude didn't return valid JSON. Check console.");
  }
  return JSON.parse(match[0]);
}

// ── Styles ──

const cardS = { background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "16px 18px", marginBottom: 16 };
const labelS = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-tertiary)", marginBottom: 8 };
const stepLabelS = { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 };
const stepNumS = (active) => ({ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: active ? "var(--accent)" : "var(--border)", color: active ? "#fff" : "var(--text-muted)" });

// ── Project CRUD ──

// Project storage -- tries Supabase first, falls back to localStorage
const LS_KEY = "al_lp_projects";
let _useLocal = false;

function getLocalProjects(workspaceId) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return all.filter(p => p.workspace_id === workspaceId);
  } catch { return []; }
}
function setLocalProjects(projects) {
  localStorage.setItem(LS_KEY, JSON.stringify(projects));
}

async function fetchProjects(workspaceId) {
  const { data, error } = await supabase.from("landing_page_projects").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) {
    console.warn("LP table not found, using localStorage:", error.message);
    _useLocal = true;
    return getLocalProjects(workspaceId);
  }
  return data || [];
}

async function createProject(workspaceId, name, presetType) {
  if (_useLocal) {
    const proj = { id: crypto.randomUUID(), workspace_id: workspaceId, name, preset_type: presetType, step: "setup", context: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    all.unshift(proj);
    setLocalProjects(all);
    return proj;
  }
  const { data, error } = await supabase.from("landing_page_projects").insert({ workspace_id: workspaceId, name, preset_type: presetType }).select().single();
  if (error) {
    console.warn("LP insert failed, falling back to localStorage:", error.message);
    _useLocal = true;
    return createProject(workspaceId, name, presetType);
  }
  return data;
}

async function saveProject(project) {
  if (_useLocal) {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    const idx = all.findIndex(p => p.id === project.id);
    if (idx >= 0) all[idx] = { ...all[idx], ...project, updated_at: new Date().toISOString() };
    setLocalProjects(all);
    return;
  }
  const { id, ...fields } = project;
  fields.updated_at = new Date().toISOString();
  const { error } = await supabase.from("landing_page_projects").update(fields).eq("id", id);
  if (error) console.error("Save LP project:", error);
}

async function deleteProject(id) {
  if (_useLocal) {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    setLocalProjects(all.filter(p => p.id !== id));
    return;
  }
  const { error } = await supabase.from("landing_page_projects").delete().eq("id", id);
  if (error) throw error;
}

// ── Main Component ──

export default function LandingPageBuilder({ ads, activeWorkspaceId, strategyData }) {
  // Project list vs detail
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editingProjName, setEditingProjName] = useState(false);
  const [editName, setEditName] = useState("");

  // Load projects
  useEffect(() => {
    if (!activeWorkspaceId) { setProjectsLoading(false); return; }
    setProjectsLoading(true);
    fetchProjects(activeWorkspaceId)
      .then(p => { setProjects(p); setProjectsLoading(false); })
      .catch(e => { console.error("Load LP projects:", e); setProjects([]); setProjectsLoading(false); });
  }, [activeWorkspaceId]);

  const openProject = (proj) => {
    setActiveProject(proj);
    setStep(proj.step || "setup");
    setPresetType(proj.preset_type || "advertorial");
    const defaultCtx = { script: "", brief: "", avatar: "", concept: "", angle: "", bigIdea: "", awareness: "Problem-Aware", sophistication: "3 — Unique mechanism", audience: "" };
    setContext({ ...defaultCtx, ...(proj.context || {}) });
    setIdeas(proj.ideas || null);
    setSelectedIdea(proj.selected_idea || null);
    setStructure(proj.structure || null);
    setFullCopy(proj.full_copy || null);
    setCopyVersion(proj.copy_version || 0);
    setBuildLogs(proj.build_logs || []);
    setBuildStatus(proj.build_status || null);
  };

  const persistProject = async (updates) => {
    if (!activeProject) return;
    const updated = { ...activeProject, ...updates };
    setActiveProject(updated);
    await saveProject(updated);
  };

  const handleCreateProject = async () => {
    const name = newName.trim() || "Untitled LP";
    try {
      const proj = await createProject(activeWorkspaceId, name, "advertorial");
      setProjects(prev => [proj, ...prev]);
      openProject(proj);
      setShowNew(false);
      setNewName("");
    } catch (e) {
      console.error("Create LP project:", e);
      setError("Failed to create project: " + e.message);
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (e) { console.error(e); }
  };

  // Step: setup → ideas → structure → copy → build
  const [step, setStep] = useState("setup");

  // Setup state
  const [selectedAd, setSelectedAd] = useState("");
  const [presetType, setPresetType] = useState("advertorial");
  const [context, setContext] = useState({
    script: "", brief: "", avatar: "", concept: "", angle: "", bigIdea: "",
    awareness: "Problem-Aware", sophistication: "3 — Unique mechanism", audience: "",
  });

  // KB state
  const [globalFiles, setGlobalFiles] = useState([]);
  const [presetFiles, setPresetFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ideas
  const [ideas, setIdeas] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);

  // Structure
  const [structure, setStructure] = useState(null);

  // Copy
  const [fullCopy, setFullCopy] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [copyVersion, setCopyVersion] = useState(0);

  // Build
  const [buildLogs, setBuildLogs] = useState([]);
  const [buildStatus, setBuildStatus] = useState(null);
  const [buildFeedback, setBuildFeedback] = useState("");

  const activePreset = PRESET_TYPES.find(p => p.id === presetType) || PRESET_TYPES[1];

  // Load KB files
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setGlobalFiles(listKBFiles(activeWorkspaceId, "global"));
    setPresetFiles(listKBFiles(activeWorkspaceId, presetType));
  }, [activeWorkspaceId, presetType]);

  const handleAdSelect = (adId) => {
    setSelectedAd(adId);
    const ad = ads.find(a => a.id === adId);
    if (!ad) return;
    const s = ad.strategy || {};
    setContext(prev => ({
      ...prev,
      script: s.ad_script || prev.script,
      brief: ad.brief || prev.brief,
      avatar: s.avatar || prev.avatar,
      concept: s.concept || prev.concept,
      angle: s.angle || prev.angle,
      bigIdea: s.big_idea || prev.bigIdea,
      awareness: s.awareness_level || prev.awareness,
    }));
  };

  const buildContextString = () => {
    const c = context;
    return [
      c.script && `Script:\n${c.script}`,
      c.brief && `Brief: ${c.brief}`,
      c.avatar && `Avatar: ${c.avatar}`,
      c.concept && `Concept: ${c.concept}`,
      c.angle && `Angle: ${c.angle}`,
      c.bigIdea && `Big Idea: ${c.bigIdea}`,
      c.awareness && `Awareness Level: ${c.awareness}`,
      c.sophistication && `Sophistication Level: ${c.sophistication}`,
      c.audience && `Target Audience: ${c.audience}`,
    ].filter(Boolean).join("\n");
  };

  const handleUpload = async (target, e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !activeWorkspaceId) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadKBFile(activeWorkspaceId, target, file);
      }
      setGlobalFiles(listKBFiles(activeWorkspaceId, "global"));
      setPresetFiles(listKBFiles(activeWorkspaceId, presetType));
    } catch (err) { setError(err.message); }
    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteFile = (fileId, target) => {
    deleteKBFile(activeWorkspaceId, target, fileId);
    setGlobalFiles(listKBFiles(activeWorkspaceId, "global"));
    setPresetFiles(listKBFiles(activeWorkspaceId, presetType));
  };

  const loadKBContent = () => {
    const global = getKBContent(activeWorkspaceId, "global");
    const preset = getKBContent(activeWorkspaceId, presetType);
    return [global, preset].filter(Boolean).join("\n\n");
  };

  // ── Step Actions ──

  const generateIdeas = async () => {
    setLoading(true); setError(null);
    try {
      const result = await callClaude(IDEA_PROMPT(activePreset, buildContextString()));
      const newIdeas = result.ideas || [];
      setIdeas(newIdeas);
      setSelectedIdea(null);
      setStep("ideas");
      persistProject({ step: "ideas", ideas: newIdeas, selected_idea: null, context, preset_type: presetType });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generateMoreIdeas = async () => {
    setLoading(true); setError(null);
    try {
      const result = await callClaude(IDEA_PROMPT(activePreset, buildContextString()) + "\n\nGenerate 5 DIFFERENT ideas from the previous batch. Be more creative and unconventional.");
      const merged = [...(ideas || []), ...(result.ideas || [])];
      setIdeas(merged);
      persistProject({ ideas: merged });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generateStructure = async () => {
    if (!selectedIdea) return;
    setLoading(true); setError(null);
    try {
      const result = await callClaude(STRUCTURE_PROMPT(activePreset, buildContextString(), selectedIdea));
      setStructure(result);
      setStep("structure");
      persistProject({ step: "structure", structure: result, selected_idea: selectedIdea });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generateCopy = async (feedback) => {
    setLoading(true); setError(null);
    try {
      const kb = loadKBContent();
      const result = await callClaude(FULL_COPY_PROMPT(activePreset, buildContextString(), selectedIdea, structure, kb, feedback));
      const newVersion = copyVersion + 1;
      setFullCopy(result);
      setCopyVersion(newVersion);
      setCopyFeedback("");
      setStep("copy");
      persistProject({ step: "copy", full_copy: result, copy_version: newVersion });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const startBuild = async () => {
    const logs = [{ ts: new Date().toLocaleTimeString(), text: "Submitting to Manus...", status: "loading" }];
    setBuildStatus("starting");
    setBuildLogs(logs);
    setStep("build");
    persistProject({ step: "build", build_status: "starting", build_logs: logs });
    try {
      await submitBuildJob({ copy: fullCopy, swipeFiles: presetFiles, presetType: presetType });
    } catch (e) {
      const errLogs = [...logs, { ts: new Date().toLocaleTimeString(), text: e.message, status: "error" }];
      setBuildLogs(errLogs);
      setBuildStatus("error");
      persistProject({ build_status: "error", build_logs: errLogs });
    }
  };

  // ── Step indicators ──
  const STEPS = [
    { id: "setup", label: "Setup" },
    { id: "ideas", label: "Ideas" },
    { id: "structure", label: "Structure" },
    { id: "copy", label: "Copy" },
    { id: "build", label: "Build" },
  ];
  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="animate-fade" style={{ maxWidth: 960 }}>
      {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", borderLeft: "3px solid var(--red)", marginBottom: 14, fontSize: 12, color: "var(--red)" }}>{error}</div>}

      {/* ── PROJECT LIST ── */}
      {!activeProject && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Landing Pages</h2>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm">+ New Landing Page</button>
          </div>

          {showNew && (
            <div style={cardS}>
              <div style={labelS}>New Project</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreateProject()} className="input" placeholder="Project name..." autoFocus style={{ flex: 1, fontSize: 13 }} />
                <button onClick={handleCreateProject} className="btn btn-primary btn-sm">Create</button>
                <button onClick={() => { setShowNew(false); setNewName(""); }} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {projectsLoading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>Loading projects...</div>}

          {!projectsLoading && projects.length === 0 && !showNew && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No landing pages yet</div>
              <div style={{ fontSize: 12 }}>Create your first project to get started</div>
            </div>
          )}

          {projects.map(proj => {
            const preset = PRESET_TYPES.find(p => p.id === proj.preset_type) || PRESET_TYPES[1];
            const stepInfo = STEPS.find(s => s.id === proj.step) || STEPS[0];
            const stepN = STEPS.findIndex(s => s.id === proj.step) + 1;
            return (
              <div key={proj.id} onClick={() => openProject(proj)} style={{
                ...cardS, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "border-color 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-light)"}>
                <div style={{ fontSize: 24 }}>{preset.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {preset.name} · Step {stepN}/5: {stepInfo.label} · {new Date(proj.updated_at || proj.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteProject(proj.id); }} className="btn btn-ghost btn-xs" style={{ color: "var(--text-muted)", fontSize: 11 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PROJECT DETAIL ── */}
      {activeProject && (
        <div>
      {/* Back + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => { persistProject({ context, preset_type: presetType }); setActiveProject(null); }} className="btn btn-ghost btn-xs" style={{ fontSize: 12 }}>← Back</button>
        {editingProjName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => {
              if (e.key === "Enter") { const n = editName.trim(); if (n) { persistProject({ name: n }); setActiveProject(p => ({ ...p, name: n })); setProjects(ps => ps.map(p => p.id === activeProject.id ? { ...p, name: n } : p)); } setEditingProjName(false); }
              if (e.key === "Escape") setEditingProjName(false);
            }} autoFocus className="input" style={{ fontSize: 18, fontWeight: 700, padding: "2px 8px", width: 260 }} />
            <button onClick={() => { const n = editName.trim(); if (n) { persistProject({ name: n }); setActiveProject(p => ({ ...p, name: n })); setProjects(ps => ps.map(p => p.id === activeProject.id ? { ...p, name: n } : p)); } setEditingProjName(false); }} className="btn btn-primary btn-xs">Save</button>
            <button onClick={() => setEditingProjName(false)} className="btn btn-ghost btn-xs">Cancel</button>
          </div>
        ) : (
          <h2 onClick={() => { setEditName(activeProject.name); setEditingProjName(true); }} style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em", cursor: "pointer", borderBottom: "1px dashed transparent" }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = "var(--text-muted)"} onMouseLeave={e => e.currentTarget.style.borderBottomColor = "transparent"}>{activeProject.name}</h2>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{activePreset.name}</span>
      </div>

      {/* Step progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div onClick={() => i <= stepIdx && setStep(s.id)} style={{ ...stepNumS(i <= stepIdx), cursor: i <= stepIdx ? "pointer" : "default" }}>{i + 1}</div>
            <span style={{ fontSize: 11, color: i <= stepIdx ? "var(--text-primary)" : "var(--text-muted)", fontWeight: i === stepIdx ? 600 : 400 }}>{s.label}</span>
            {i < STEPS.length - 1 && <div style={{ width: 24, height: 1, background: i < stepIdx ? "var(--accent)" : "var(--border)", margin: "0 4px" }} />}
          </div>
        ))}
      </div>

      {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", borderLeft: "3px solid var(--red)", marginBottom: 14, fontSize: 12, color: "var(--red)" }}>{error}</div>}

      {/* ── STEP 1: SETUP ── */}
      {step === "setup" && (
        <div className="animate-fade">
          {/* Preset type */}
          <div style={cardS}>
            <div style={labelS}>Landing Page Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {PRESET_TYPES.map(p => (
                <div key={p.id} onClick={() => { setPresetType(p.id); persistProject({ preset_type: p.id }); }} style={{
                  padding: "12px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  border: presetType === p.id ? "1.5px solid var(--accent)" : "1px solid var(--border-light)",
                  background: presetType === p.id ? "var(--accent-bg)" : "var(--bg-card)",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: presetType === p.id ? "var(--accent)" : "var(--text-primary)" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, marginTop: 2 }}>{p.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Ad context */}
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={labelS}>Ad Context</div>
              {ads?.length > 0 && (
                <select value={selectedAd} onChange={e => handleAdSelect(e.target.value)} className="input" style={{ width: "auto", fontSize: 11, padding: "4px 8px" }}>
                  <option value="">Load from ad...</option>
                  {ads.filter(a => a.stage !== "killed").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Avatar</div>
                <input value={context.avatar} onChange={e => setContext(p => ({ ...p, avatar: e.target.value }))} className="input" placeholder="Target avatar..." style={{ fontSize: 12 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Ad Concept</div>
                <input value={context.concept} onChange={e => setContext(p => ({ ...p, concept: e.target.value }))} className="input" placeholder="Core concept..." style={{ fontSize: 12 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Ad Angle</div>
                <input value={context.angle} onChange={e => setContext(p => ({ ...p, angle: e.target.value }))} className="input" placeholder="Persuasion angle..." style={{ fontSize: 12 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Big Idea</div>
                <input value={context.bigIdea} onChange={e => setContext(p => ({ ...p, bigIdea: e.target.value }))} className="input" placeholder="The one big idea..." style={{ fontSize: 12 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Awareness Level</div>
                <select value={context.awareness} onChange={e => setContext(p => ({ ...p, awareness: e.target.value }))} className="input" style={{ fontSize: 12 }}>
                  {AWARENESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Sophistication Level</div>
                <select value={context.sophistication} onChange={e => setContext(p => ({ ...p, sophistication: e.target.value }))} className="input" style={{ fontSize: 12 }}>
                  {SOPHISTICATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Target Audience Notes</div>
              <textarea value={context.audience} onChange={e => setContext(p => ({ ...p, audience: e.target.value }))} className="input" rows={2} placeholder="Additional audience details..." style={{ fontSize: 12 }} />
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Ad Script / Brief</div>
              <textarea value={context.script} onChange={e => setContext(p => ({ ...p, script: e.target.value }))} className="input" rows={5} placeholder="Paste your ad script or brief here..." style={{ fontSize: 12, lineHeight: 1.5 }} />
            </div>
          </div>

          {/* Knowledge Base */}
          <div style={cardS}>
            <div style={labelS}>Knowledge Base</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Global KB */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Global (DR / Copywriting)</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>Shared across all preset types</div>
                {globalFiles.map(f => (
                  <div key={f.path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                    <button onClick={() => handleDeleteFile(f.id, "global")} className="btn btn-ghost btn-xs" style={{ fontSize: 9, color: "var(--red)" }}>×</button>
                  </div>
                ))}
                <label className="btn btn-ghost btn-xs" style={{ marginTop: 6, cursor: "pointer" }}>
                  {uploading ? "Uploading..." : "+ Upload Files"}
                  <input type="file" multiple hidden onChange={e => handleUpload("global", e)} />
                </label>
              </div>
              {/* Preset KB */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{activePreset.name} Swipes</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>Examples specific to {activePreset.label.toLowerCase()}</div>
                {presetFiles.map(f => (
                  <div key={f.path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                    <button onClick={() => handleDeleteFile(f.id, presetType)} className="btn btn-ghost btn-xs" style={{ fontSize: 9, color: "var(--red)" }}>×</button>
                  </div>
                ))}
                <label className="btn btn-ghost btn-xs" style={{ marginTop: 6, cursor: "pointer" }}>
                  {uploading ? "Uploading..." : "+ Upload Swipes"}
                  <input type="file" multiple hidden onChange={e => handleUpload(presetType, e)} />
                </label>
              </div>
            </div>
          </div>

          <button onClick={generateIdeas} disabled={loading || !context.script.trim()} className="btn btn-primary" style={{ padding: "10px 28px", fontSize: 14 }}>
            {loading ? "Generating Ideas..." : `Generate ${activePreset.name} Ideas`}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 12 }}>Using: Claude ({getSelectedModel("claude")})</span>
        </div>
      )}

      {/* ── STEP 2: IDEAS ── */}
      {step === "ideas" && ideas && (
        <div className="animate-fade">
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={labelS}>{activePreset.name} Ideas ({ideas.length})</div>
              <button onClick={generateMoreIdeas} disabled={loading} className="btn btn-ghost btn-xs">{loading ? "Generating..." : "+ More Ideas"}</button>
            </div>
            {ideas.map((idea, i) => (
              <div key={i} onClick={() => setSelectedIdea(idea)} style={{
                padding: "12px 14px", borderRadius: 8, marginBottom: 8, cursor: "pointer", transition: "all 0.15s",
                border: selectedIdea === idea ? "1.5px solid var(--accent)" : "1px solid var(--border-light)",
                background: selectedIdea === idea ? "var(--accent-bg)" : "var(--bg-card)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: selectedIdea === idea ? "var(--accent)" : "var(--text-primary)" }}>Idea {i + 1}</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--bg-badge)", color: "var(--text-muted)" }}>{idea.tone}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <div><strong>Angle:</strong> {idea.angle}</div>
                  <div><strong>Voice:</strong> {idea.writer_voice}</div>
                  <div><strong>Hook:</strong> {idea.hook}</div>
                  <div><strong>Promise:</strong> {idea.big_promise}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("setup")} className="btn btn-ghost btn-sm">← Back</button>
            <button onClick={generateStructure} disabled={loading || !selectedIdea} className="btn btn-primary" style={{ padding: "10px 28px" }}>
              {loading ? "Generating Structure..." : "Generate Structure →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: STRUCTURE ── */}
      {step === "structure" && structure && (
        <div className="animate-fade">
          <div style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={labelS}>Page Structure ({structure.sections?.length || 0} sections · ~{structure.total_estimated_words || "?"} words)</div>
            </div>
            {(structure.sections || []).map((sec, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: i < structure.sections.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)", width: 20 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{sec.section_name}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>~{sec.estimated_word_count}w</span>
                </div>
                <div style={{ paddingLeft: 28, fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>{sec.purpose}</div>
                <div style={{ paddingLeft: 28 }}>
                  {(sec.key_elements || []).map((el, j) => (
                    <div key={j} style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>• {el}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("ideas")} className="btn btn-ghost btn-sm">← Back</button>
            <button onClick={() => generateCopy(null)} disabled={loading} className="btn btn-primary" style={{ padding: "10px 28px" }}>
              {loading ? "Writing Full Copy..." : "Approve & Write Copy →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: FULL COPY ── */}
      {step === "copy" && fullCopy && (
        <div className="animate-fade">
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Version {copyVersion} · {fullCopy.sections?.length || 0} sections</div>
          <div style={cardS}>
            {(fullCopy.sections || []).map((sec, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", marginBottom: 6, borderBottom: "1px solid var(--border-light)", paddingBottom: 6 }}>{sec.section_name}</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sec.copy}</div>
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div style={cardS}>
            <div style={labelS}>Feedback (optional)</div>
            <textarea value={copyFeedback} onChange={e => setCopyFeedback(e.target.value)} className="input" rows={3} placeholder="What needs to change? Be specific..." style={{ fontSize: 12, lineHeight: 1.5 }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("structure")} className="btn btn-ghost btn-sm">← Back</button>
            {copyFeedback.trim() && (
              <button onClick={() => generateCopy(copyFeedback)} disabled={loading} className="btn btn-ghost btn-sm" style={{ borderColor: "var(--yellow)" }}>
                {loading ? "Rewriting..." : "Regenerate with Feedback"}
              </button>
            )}
            <button onClick={startBuild} disabled={loading} className="btn btn-primary" style={{ padding: "10px 28px" }}>
              Approve & Build Page →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: BUILD ── */}
      {step === "build" && (
        <div className="animate-fade">
          <div style={cardS}>
            <div style={labelS}>Build Status</div>
            <div style={{ minHeight: 200 }}>
              {buildLogs.map((log, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, marginTop: 1,
                    background: log.status === "done" ? "var(--green-bg)" : log.status === "error" ? "var(--red-bg)" : "var(--accent-bg)",
                    color: log.status === "done" ? "var(--green)" : log.status === "error" ? "var(--red)" : "var(--accent)",
                  }}>
                    {log.status === "done" ? "✓" : log.status === "error" ? "✗" : "⋯"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: log.status === "error" ? "var(--red)" : "var(--text-primary)" }}>{log.text}</div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{log.ts}</div>
                  </div>
                </div>
              ))}
              {buildLogs.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "40px 0" }}>Waiting for build to start...</div>}
            </div>
          </div>

          {buildStatus === "error" && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Manus API is not yet connected. Once you provide API credentials, builds will work automatically.
            </div>
          )}

          <button onClick={() => setStep("copy")} className="btn btn-ghost btn-sm">← Back to Copy</button>
        </div>
      )}
      </div>
      )}{/* end activeProject */}
    </div>
  );
}
