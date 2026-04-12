import { useState, useEffect } from "react";
import { RESEARCH_STEPS, runResearchStep, parseKnowledgeBase } from "./researchEngine.js";
import { fetchResearchDocs, upsertResearchDoc, fetchKnowledgeBase, upsertKnowledgeBase, getWorkspaceProductDetails, updateWorkspaceProductDetails } from "./supabaseData.js";
import { isConfigured, getResearchModelAssignment } from "./apiKeys.js";

const PRODUCT_FIELDS = [
  { key: "name", label: "Product Name", placeholder: "e.g. Toothpick X" },
  { key: "description", label: "Product Description", placeholder: "What does this product do?" },
  { key: "niche", label: "Niche / Category", placeholder: "e.g. Health & Wellness, Beauty, Tech" },
  { key: "targetAudience", label: "Target Audience", placeholder: "Who is this for?" },
  { key: "keyClaims", label: "Key Claims / Benefits", placeholder: "What are the main selling points?" },
  { key: "pricePoint", label: "Price Point", placeholder: "e.g. $49.99" },
  { key: "url", label: "Product URL", placeholder: "https://..." },
];

function StepCard({ step, doc, isActive, isLocked, onRun, running }) {
  const status = doc?.status || "pending";
  const statusColors = {
    pending: "var(--text-muted)",
    running: "var(--accent-light)",
    completed: "var(--green)",
    error: "var(--red)",
  };
  const statusLabels = { pending: "Not started", running: "Running...", completed: "Completed", error: "Error" };
  const modelService = getResearchModelAssignment(step.id);

  return (
    <div className="card-flat" style={{
      marginBottom: 8, opacity: isLocked ? 0.5 : 1,
      border: isActive ? "1px solid var(--accent)" : undefined,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{step.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{step.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 9, padding: "2px 8px", borderRadius: 10,
            background: "var(--bg-elevated)", color: "var(--text-muted)",
            textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5,
          }}>{modelService}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: statusColors[status],
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {status === "running" && <span className="loading-dot" style={{ width: 8, height: 8 }} />}
            {status === "completed" && "✓"} {statusLabels[status]}
          </span>
        </div>
      </div>

      {doc?.error_message && (
        <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 6, padding: "4px 8px", borderRadius: 4, background: "rgba(239,68,68,0.1)" }}>
          {doc.error_message}
        </div>
      )}

      {doc?.output && status === "completed" && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: "var(--accent-light)", cursor: "pointer", fontWeight: 500 }}>
            View output ({doc.output.length > 1000 ? (doc.output.length / 1000).toFixed(1) + "k chars" : doc.output.length + " chars"})
          </summary>
          <pre style={{
            marginTop: 6, padding: 10, borderRadius: 6,
            background: "var(--bg-elevated)", fontSize: 11,
            lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 300, overflow: "auto", color: "var(--text-secondary)",
          }}>{doc.output}</pre>
        </details>
      )}

      {!isLocked && (
        <button
          onClick={onRun}
          disabled={running}
          className="btn btn-primary btn-sm"
          style={{ marginTop: 8 }}
        >
          {running ? "Running..." : status === "completed" ? "Re-run" : "Run Step"}
        </button>
      )}
    </div>
  );
}

function KnowledgeBaseView({ kb }) {
  if (!kb) return <div className="empty-state">Run the full research pipeline to generate the knowledge base.</div>;

  const sections = [
    { title: "Avatars", data: kb.avatars, render: (a) => (
      <div key={a.name} className="card-flat" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-light)", marginBottom: 4 }}>{a.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{a.description}</div>
        {a.desires?.length > 0 && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)" }}>Desires:</span> <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.desires.join(", ")}</span></div>}
        {a.fears?.length > 0 && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 600, color: "var(--red)" }}>Fears:</span> <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.fears.join(", ")}</span></div>}
        {a.objections?.length > 0 && <div><span style={{ fontSize: 10, fontWeight: 600, color: "var(--yellow)" }}>Objections:</span> <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.objections.join(", ")}</span></div>}
      </div>
    )},
    { title: "Winning Angles", data: kb.winning_angles, render: (a, i) => (
      <div key={i} className="card-flat" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{a.angle}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.rationale}</div>
        </div>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
          background: a.predicted_strength === "high" ? "rgba(34,197,94,0.15)" : a.predicted_strength === "medium" ? "rgba(234,179,8,0.15)" : "rgba(239,68,68,0.15)",
          color: a.predicted_strength === "high" ? "var(--green)" : a.predicted_strength === "medium" ? "var(--yellow)" : "var(--red)",
        }}>{a.predicted_strength}</span>
      </div>
    )},
    { title: "Objections", data: kb.objections, render: (o, i) => (
      <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)" }}>"{o.objection}"</div>
        <div style={{ fontSize: 11, color: "var(--green)", marginTop: 3 }}>→ {o.counter}</div>
      </div>
    )},
    { title: "Competitors", data: kb.competitors, render: (c, i) => (
      <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.positioning}</div>
        {c.weakness && <div style={{ fontSize: 11, color: "var(--accent-light)", marginTop: 2 }}>Weakness: {c.weakness}</div>}
      </div>
    )},
    { title: "Unique Mechanisms", data: kb.unique_mechanisms, render: (m, i) => (
      <div key={i} className="card-flat" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-light)" }}>{m.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.description}</div>
      </div>
    )},
  ];

  return (
    <div>
      {kb.awareness_level?.level && (
        <div className="card-flat" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ margin: "0 0 6px" }}>Market Position</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Awareness:</span> <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-light)" }}>{kb.awareness_level.level}</span></div>
            <div><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Sophistication:</span> <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-light)" }}>{kb.awareness_level.sophistication}</span></div>
          </div>
          {kb.awareness_level.strategy && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{kb.awareness_level.strategy}</div>}
        </div>
      )}

      {sections.map(s => s.data?.length > 0 && (
        <div key={s.title} style={{ marginBottom: 16 }}>
          <div className="section-title">{s.title}</div>
          {s.data.map(s.render)}
        </div>
      ))}

      {kb.full_document && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: "var(--accent-light)", cursor: "pointer", fontWeight: 600 }}>
            View Full Document
          </summary>
          <pre style={{
            marginTop: 8, padding: 12, borderRadius: 8,
            background: "var(--bg-elevated)", fontSize: 11.5,
            lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 500, overflow: "auto", color: "var(--text-secondary)",
          }}>{kb.full_document}</pre>
        </details>
      )}
    </div>
  );
}

export default function ProductIntelligence({ activeWorkspaceId }) {
  const [tab, setTab] = useState("setup");
  const [details, setDetails] = useState({});
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [docs, setDocs] = useState({});
  const [kb, setKb] = useState(null);
  const [runningStep, setRunningStep] = useState(null);
  const [runAllMode, setRunAllMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    getWorkspaceProductDetails(activeWorkspaceId).then(d => setDetails(d || {}));
    fetchResearchDocs(activeWorkspaceId).then(docList => {
      const map = {};
      docList.forEach(d => { map[d.step] = d; });
      setDocs(map);
    });
    fetchKnowledgeBase(activeWorkspaceId).then(k => setKb(k));
  }, [activeWorkspaceId]);

  const saveDetails = async () => {
    try {
      await updateWorkspaceProductDetails(activeWorkspaceId, details);
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 2000);
    } catch (e) { console.error("Save details error:", e); }
  };

  const getCompletedOutputs = () => {
    const out = {};
    for (const [step, doc] of Object.entries(docs)) {
      if (doc.status === "completed") out[step] = doc.output;
    }
    return out;
  };

  const runStep = async (step) => {
    if (!details.name?.trim()) {
      setStatusMsg("Please fill in the product name first");
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    setRunningStep(step.id);
    setDocs(prev => ({ ...prev, [step.id]: { ...prev[step.id], status: "running", error_message: null } }));

    try {
      await upsertResearchDoc(activeWorkspaceId, step.id, { status: "running", error_message: null });
      const result = await runResearchStep(step.id, details, getCompletedOutputs(), setStatusMsg);

      const doc = { output: result.output, model_used: result.model, prompt_used: result.prompt, status: "completed", error_message: null };
      await upsertResearchDoc(activeWorkspaceId, step.id, doc);
      setDocs(prev => ({ ...prev, [step.id]: { ...prev[step.id], ...doc } }));

      // If this is the unified document step, parse and save knowledge base
      if (step.id === "unified_document") {
        const parsed = parseKnowledgeBase(result.output);
        await upsertKnowledgeBase(activeWorkspaceId, parsed);
        setKb(parsed);
      }

      setStatusMsg(null);
    } catch (e) {
      const errorDoc = { status: "error", error_message: e.message };
      await upsertResearchDoc(activeWorkspaceId, step.id, errorDoc).catch(() => {});
      setDocs(prev => ({ ...prev, [step.id]: { ...prev[step.id], ...errorDoc } }));
      setStatusMsg(null);
    }
    setRunningStep(null);
  };

  const runAll = async () => {
    if (!details.name?.trim()) {
      setStatusMsg("Please fill in the product name first");
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    setRunAllMode(true);
    for (const step of RESEARCH_STEPS) {
      // Skip psychographic steps 3-5 can run after step 2 (they don't depend on each other)
      // But we run them sequentially for simplicity
      if (docs[step.id]?.status === "completed" && step.id !== "unified_document") continue;
      await runStep(step);
      if (docs[step.id]?.status === "error") break;
    }
    setRunAllMode(false);
  };

  const completedCount = RESEARCH_STEPS.filter(s => docs[s.id]?.status === "completed").length;
  const progress = Math.round((completedCount / RESEARCH_STEPS.length) * 100);

  const isStepLocked = (step, index) => {
    if (index === 0) return false;
    // Psychographic steps (2,3,4) require step 1 (competitor_research)
    if (step.id.startsWith("psychographic_") && step.id !== "psychographic_summary") {
      return docs["competitor_research"]?.status !== "completed";
    }
    // Summary requires all 3 psychographic steps
    if (step.id === "psychographic_summary") {
      return !["psychographic_gemini", "psychographic_claude", "psychographic_openai"].every(s => docs[s]?.status === "completed");
    }
    // Unified requires summary
    if (step.id === "unified_document") {
      return docs["psychographic_summary"]?.status !== "completed";
    }
    // Default: previous step must be completed
    const prevStep = RESEARCH_STEPS[index - 1];
    return prevStep && docs[prevStep.id]?.status !== "completed";
  };

  const tabs = [
    { id: "setup", label: "Product Setup" },
    { id: "pipeline", label: "Research Pipeline" },
    { id: "knowledge", label: "Knowledge Base" },
  ];

  const missingKeys = [];
  if (!isConfigured("gemini")) missingKeys.push("Gemini");
  if (!isConfigured("claude")) missingKeys.push("Claude");
  if (!isConfigured("openai")) missingKeys.push("OpenAI");

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Product Intelligence</h2>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Deep market research pipeline — builds your product's knowledge base
          </div>
        </div>
        {tab === "pipeline" && (
          <button onClick={runAll} disabled={!!runningStep || runAllMode} className="btn btn-primary">
            {runAllMode ? "Running pipeline..." : "Run Full Pipeline"}
          </button>
        )}
      </div>

      {missingKeys.length > 0 && (
        <div className="card-flat" style={{ marginBottom: 12, padding: "10px 14px", borderLeft: "3px solid var(--yellow)" }}>
          <span style={{ fontSize: 12, color: "var(--yellow)" }}>Missing API keys: {missingKeys.join(", ")}. Configure them in Settings to run all research steps.</span>
        </div>
      )}

      {statusMsg && (
        <div className="card-flat" style={{ marginBottom: 10, padding: "8px 12px" }}>
          <span style={{ fontSize: 12, color: "var(--accent-light)", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="loading-dot" style={{ width: 8, height: 8 }} /> {statusMsg}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-ghost"}`}>
            {t.label}
            {t.id === "pipeline" && completedCount > 0 && (
              <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>{completedCount}/{RESEARCH_STEPS.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── PRODUCT SETUP TAB ── */}
      {tab === "setup" && (
        <div>
          <div className="section-title">Product Details</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
            Fill in your product information. This data feeds into every research step.
          </div>
          {PRODUCT_FIELDS.map(f => (
            <div key={f.key} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>{f.label}</label>
              {f.key === "description" || f.key === "keyClaims" || f.key === "targetAudience" ? (
                <textarea
                  value={details[f.key] || ""}
                  onChange={e => setDetails(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="input"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              ) : (
                <input
                  value={details[f.key] || ""}
                  onChange={e => setDetails(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="input"
                />
              )}
            </div>
          ))}
          <button onClick={saveDetails} className="btn btn-primary" style={{ marginTop: 4 }}>
            {detailsSaved ? "✓ Saved" : "Save Product Details"}
          </button>
        </div>
      )}

      {/* ── RESEARCH PIPELINE TAB ── */}
      {tab === "pipeline" && (
        <div>
          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Research Progress</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-light)" }}>{progress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, width: progress + "%",
                background: progress === 100 ? "var(--green)" : "var(--accent)",
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>

          {!details.name?.trim() && (
            <div className="card-flat" style={{ marginBottom: 12, padding: "12px 14px", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Fill in product details in the "Product Setup" tab first
              </span>
            </div>
          )}

          {RESEARCH_STEPS.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              doc={docs[step.id]}
              isActive={runningStep === step.id}
              isLocked={isStepLocked(step, i)}
              running={runningStep === step.id}
              onRun={() => runStep(step)}
            />
          ))}
        </div>
      )}

      {/* ── KNOWLEDGE BASE TAB ── */}
      {tab === "knowledge" && (
        <div>
          <div className="section-title">Knowledge Base</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
            Auto-generated from the research pipeline. This is your product's permanent truth source.
          </div>
          <KnowledgeBaseView kb={kb} />
        </div>
      )}
    </div>
  );
}
