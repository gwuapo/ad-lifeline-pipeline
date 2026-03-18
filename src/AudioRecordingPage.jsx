import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { supabase } from "./supabase.js";
import { getApiKey, getSelectedModel } from "./apiKeys.js";

// ════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════

const STEPS = ["script", "record", "processing", "editor", "export"];
const STEP_LABELS = { script: "Script", record: "Record", processing: "Processing", editor: "Timeline Editor", export: "Export" };
const DEFAULT_SECTION_LABELS = ["Hook", "Lead", "Body", "Proof", "CTA", "Close"];
const PAUSE_THRESHOLD = 0.8;

// ════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════

export default function AudioRecordingPage({ activeWorkspaceId, session }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadProjects();
  }, [activeWorkspaceId]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audio_projects")
        .select("*")
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: false });
      if (!error) setProjects(data || []);
    } catch (e) { console.error("Load audio projects:", e); }
    setLoading(false);
  };

  const createProject = async (name) => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("audio_projects")
        .insert({
          workspace_id: activeWorkspaceId,
          name: name || "Untitled Project",
          created_by: session?.user?.id,
          script_sections: [],
        })
        .select()
        .single();
      if (!error && data) {
        setProjects(prev => [data, ...prev]);
        setActiveProject(data);
      }
    } catch (e) { console.error("Create project:", e); }
    setCreating(false);
  };

  const deleteProject = async (id) => {
    await supabase.from("audio_projects").delete().eq("id", id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) setActiveProject(null);
  };

  if (activeProject) {
    return <ProjectEditor
      project={activeProject}
      onBack={() => { setActiveProject(null); loadProjects(); }}
      onUpdate={(p) => setActiveProject(p)}
      session={session}
    />;
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Audio Recording Tool</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Record, auto-edit, and export VSL voiceovers.</p>
        </div>
        <button onClick={() => createProject("Untitled Project")} disabled={creating} className="btn btn-primary btn-sm">
          {creating ? "Creating..." : "+ New Project"}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>No audio projects yet</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Create a project to start recording VSL voiceovers.</p>
          <button onClick={() => createProject("Untitled Project")} className="btn btn-primary btn-sm">Create First Project</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {projects.map(p => (
            <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setActiveProject(p)}>
              <div style={{ fontSize: 28 }}>🎙️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {p.script_sections?.length || 0} sections -- {p.status} -- {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className={`badge ${p.status === "exported" ? "badge-green" : p.status === "editing" ? "badge-accent" : "badge-yellow"}`} style={{ textTransform: "capitalize" }}>
                {p.status}
              </span>
              <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this project?")) deleteProject(p.id); }}
                className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// PROJECT EDITOR (all 5 steps)
// ════════════════════════════════════════════════

const LANGUAGES = [
  { code: "", label: "Auto-detect" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
];

function ProjectEditor({ project, onBack, onUpdate, session }) {
  const [sections, setSections] = useState(project.script_sections || []);
  const [projectName, setProjectName] = useState(project.name);
  const [language, setLanguage] = useState("");
  const [recording, setRecording] = useState(null); // { blob, url, duration }
  const [transcript, setTranscript] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState(true);

  // Determine initial step after loading saved state
  const [step, setStep] = useState("script");

  // Load saved recordings + analyses on mount
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        // Load latest recording
        const { data: recordings } = await supabase
          .from("audio_recordings")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (recordings?.length > 0) {
          const rec = recordings[0];
          setRecording({ url: rec.file_url, duration: rec.duration_seconds, savedId: rec.id });

          // Load latest analysis for this recording
          const { data: analyses } = await supabase
            .from("audio_analyses")
            .select("*")
            .eq("recording_id", rec.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (analyses?.length > 0) {
            setTranscript(analyses[0].transcript);
            setAnalysis(analyses[0].analysis);
            setStep("editor");
          } else if (project.script_sections?.length > 0) {
            setStep("record");
          }
        } else if (project.status === "editing") {
          // Fallback: load any analysis for the project
          const { data: analyses } = await supabase
            .from("audio_analyses")
            .select("*")
            .eq("project_id", project.id)
            .order("created_at", { ascending: false })
            .limit(1);
          if (analyses?.length > 0) {
            setTranscript(analyses[0].transcript);
            setAnalysis(analyses[0].analysis);
            setStep("editor");
          }
        }

        // Set initial step based on project state
        if (!recordings?.length && project.script_sections?.length > 0) {
          setStep("record");
        } else if (!recordings?.length) {
          setStep("script");
        }
      } catch (e) {
        console.error("Load saved state:", e);
      }
      setLoadingState(false);
    };
    loadSavedState();
  }, [project.id]);

  const saveProject = async (updates) => {
    const { data } = await supabase
      .from("audio_projects")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", project.id)
      .select()
      .single();
    if (data) onUpdate(data);
  };

  if (loadingState) {
    return (
      <div className="animate-fade" style={{ maxWidth: 1000, textAlign: "center", padding: 60 }}>
        <div className="loading-dot" style={{ margin: "0 auto 16px" }} />
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading project...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm">← Back</button>
        <input value={projectName} onChange={e => setProjectName(e.target.value)}
          onBlur={() => saveProject({ name: projectName })}
          style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", background: "none", border: "none", outline: "none", flex: 1, padding: 0 }} />
        <select value={language} onChange={e => setLanguage(e.target.value)} className="input" style={{ width: "auto", fontSize: 11, padding: "4px 8px", cursor: "pointer" }}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Step indicator */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border-light)" }}>
        {STEPS.map((s, i) => {
          const isActive = s === step;
          const isDone = STEPS.indexOf(step) > i;
          return (
            <button key={s} onClick={() => {
              if (s === "script" || (s === "record" && sections.length > 0) ||
                (s === "editor" && analysis) || (s === "export" && analysis)) setStep(s);
            }}
              style={{
                padding: "10px 18px", fontSize: 12.5, fontWeight: isActive ? 600 : 400, cursor: "pointer",
                background: "none", border: "none",
                borderBottom: isActive ? "2px solid var(--accent-light)" : "2px solid transparent",
                color: isActive ? "var(--text-primary)" : isDone ? "var(--green-light)" : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              <span style={{ fontSize: 11, width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: isDone ? "var(--green-bg)" : isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                color: isDone ? "var(--green-light)" : isActive ? "var(--accent-light)" : "var(--text-muted)",
                fontWeight: 700, border: `1px solid ${isDone ? "var(--green-border)" : isActive ? "var(--accent-border)" : "var(--border)"}`,
              }}>
                {isDone ? "✓" : i + 1}
              </span>
              {STEP_LABELS[s]}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="card" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 16, padding: "10px 14px", fontSize: 12.5, color: "var(--red-light)" }}>
          {error}
          <button onClick={() => setError(null)} className="btn btn-ghost btn-xs" style={{ marginLeft: 8, color: "var(--red-light)" }}>Dismiss</button>
        </div>
      )}

      {/* Step content */}
      {step === "script" && (
        <ScriptStep sections={sections} setSections={(s) => { setSections(s); saveProject({ script_sections: s }); }}
          onNext={() => setStep("record")} />
      )}
      {step === "record" && (
        <RecordStep sections={sections} recording={recording} setRecording={setRecording}
          onSaveRecording={async (blob, duration) => {
            const filePath = `${project.id}/${Date.now()}.webm`;
            const { error: upErr } = await supabase.storage.from("audio").upload(filePath, blob, { contentType: "audio/webm" });
            if (upErr) throw new Error("Upload failed: " + upErr.message);
            const { data: urlData } = supabase.storage.from("audio").getPublicUrl(filePath);
            const { data: rec } = await supabase.from("audio_recordings").insert({
              project_id: project.id, file_url: urlData.publicUrl, file_path: filePath,
              duration_seconds: duration, file_size_bytes: blob.size,
            }).select().single();
            await saveProject({ status: "recording" });
            setRecording(prev => ({ ...prev, savedId: rec?.id, url: urlData.publicUrl }));
          }}
          onNext={async () => {
            if (!recording?.url) return;
            setStep("processing");
            setProcessing(true);
            setError(null);
            try {
              // Fetch audio blob if we only have a URL (restored from Supabase)
              let audioBlob = recording.blob;
              if (!audioBlob && recording.url) {
                setProcessingStatus("Loading audio...");
                const res = await fetch(recording.url);
                audioBlob = await res.blob();
              }

              // ── STEP 1: Whisper Transcription ──
              setProcessingStatus("Transcribing with Whisper...");
              const openaiKey = getApiKey("openai");
              if (!openaiKey) throw new Error("OpenAI API key required for Whisper transcription. Set it in Settings > Integrations.");

              const whisperFd = new FormData();
              whisperFd.append("file", audioBlob, "recording.webm");
              whisperFd.append("model", "whisper-1");
              whisperFd.append("response_format", "verbose_json");
              whisperFd.append("timestamp_granularities[]", "word");
              if (language) whisperFd.append("language", language);

              const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${openaiKey}` },
                body: whisperFd,
              });
              if (!whisperRes.ok) {
                const err = await whisperRes.text().catch(() => "");
                throw new Error(`Whisper transcription failed (${whisperRes.status}): ${err.slice(0, 200)}`);
              }
              const whisperData = await whisperRes.json();
              setTranscript(whisperData);

              // ── STEP 2: Claude Analysis ──
              setProcessingStatus("Analyzing with Claude...");
              const claudeKey = getApiKey("claude");
              if (!claudeKey) throw new Error("Claude API key required for analysis. Set it in Settings > Integrations.");

              const sectionsText = sections.map((s, i) => `Section ${i + 1} (${s.label}): "${s.script_text}"`).join("\n");
              const wordsJson = JSON.stringify(whisperData.words || []);

              const langLabel = LANGUAGES.find(l => l.code === language)?.label || "the detected language";
              const claudePrompt = `You are an audio editing assistant analyzing a VSL voiceover recording in ${language === "ar" ? "Saudi Arabic" : langLabel}. The user recorded one large continuous audio file containing multiple sections of a script, with multiple takes per section, including mess-ups, false starts, filler words, and off-script chatter between takes.

Here is the original script broken into sections:
${sectionsText}

Here is the full transcript with word-level timestamps from Whisper:
${wordsJson}

Full transcript text: "${whisperData.text || ""}"

Your job is to analyze the transcript against the script and return precise cut points. Follow these steps:

STEP 1 — SECTION MAPPING:
Map each chunk of the transcript to the corresponding script section. The speaker recorded everything in one continuous take, so you need to figure out where one section ends and the next begins by matching transcript content to script content. Use fuzzy text matching — the speaker is reading in Saudi dialect Arabic so some words may be transcribed slightly differently by Whisper than they appear in the script.

STEP 2 — TAKE DETECTION:
Within each section, identify separate takes. A new take is indicated by:
- The same script content repeating (speaker re-read the section)
- A long pause (>2 seconds) followed by the same content restarting
- Off-script speech like "again", "يلا مرة ثانية", "let me redo that", or similar markers
- A false start where the speaker begins, stumbles, and restarts from the beginning of the section
Tag each take with its start and end timestamps.

STEP 3 — MESS-UP DETECTION:
Within each take, identify all mess-ups:
- False starts: speaker begins a sentence, stumbles partway through, restarts. Flag the incomplete first attempt with timestamps.
- Missing words: compare take transcript against script text word by word. Note any skipped or missing words.
- Off-script content: anything the speaker said that doesn't match the script (comments to themselves, "let me try again", breathing/sighing, etc.). Flag with timestamps.
- Repeated words/phrases: speaker said the same word twice due to stumbling. Flag the duplicate.

STEP 4 — FILLER WORD DETECTION:
Flag ALL filler words and sounds with exact start/end timestamps:
- Arabic fillers: يعني, طيب, آه, إيه, هم, والله
- English fillers: um, uh, ah, like, so, okay
- Breathing sounds, sighs, lip smacks (Whisper sometimes transcribes these — flag if present)
- Any word that appears in the transcript but NOT in the corresponding script section

STEP 5 — PAUSE DETECTION:
Using the word-level timestamps, identify all gaps longer than 0.8 seconds between consecutive words WITHIN a take (not between takes). Flag each pause with start, end, and duration.

STEP 6 — TAKE RANKING:
For each section, rank all takes by these criteria (in order of weight):
1. Completeness (highest weight): What percentage of the script words for this section are present in the take? Use fuzzy matching for dialect variations.
2. Cleanliness: How many filler words, false starts, and mid-sentence restarts exist in this take? Fewer = higher score.
3. Flow: Analyze the timestamp gaps between consecutive words. Consistent natural spacing = high flow. Irregular gaps with mid-sentence hesitations = low flow.

Select the highest-ranked take per section as the recommended pick.

Return ONLY the JSON object (no explanation, no markdown, no preamble):
{
  "sections": [
    {
      "section_id": "0",
      "section_label": "string",
      "takes": [
        {
          "take_number": 1,
          "start": 0.0,
          "end": 0.0,
          "completeness_score": 0.0,
          "cleanliness_score": 0.0,
          "flow_score": 0.0,
          "overall_rank": 1,
          "is_recommended": true,
          "mess_ups": [
            {
              "type": "false_start",
              "start": 0.0,
              "end": 0.0,
              "transcript_text": "what was said",
              "expected_text": "what should have been said"
            }
          ]
        }
      ]
    }
  ],
  "filler_words": [
    { "word": "string", "start": 0.0, "end": 0.0, "section_id": "0", "take_number": 1 }
  ],
  "pauses": [
    { "start": 0.0, "end": 0.0, "duration": 0.0, "section_id": "0", "take_number": 1 }
  ],
  "off_script_segments": [
    { "start": 0.0, "end": 0.0, "transcript_text": "string", "context": "between sections" }
  ]
}`;

              const claudeRes = await fetch("/api/analyze-audio", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-claude-key": claudeKey,
                },
                body: JSON.stringify({
                  prompt: claudePrompt,
                  model: getSelectedModel("claude"),
                }),
              });
              if (!claudeRes.ok) {
                const err = await claudeRes.json().catch(() => ({}));
                throw new Error(`Claude analysis failed: ${err.error || claudeRes.status}`);
              }
              const claudeData = await claudeRes.json();
              const analysisRaw = claudeData.text || "";
              let analysisData;
              try {
                analysisData = JSON.parse(analysisRaw.replace(/```json|```/g, "").trim());
              } catch {
                console.warn("Claude analysis JSON parse failed, raw:", analysisRaw.slice(0, 500));
                analysisData = { sections: [], filler_words: [], pauses: [], off_script_segments: [] };
              }

              // Normalize: map new format to what the timeline editor expects
              // Add is_selected to recommended takes
              if (analysisData.sections) {
                analysisData.section_mappings = analysisData.sections.map(s => ({
                  section_id: s.section_id,
                  section_label: s.section_label,
                  takes: s.takes?.map(t => ({
                    ...t,
                    rank: t.overall_rank || t.rank || 99,
                    is_selected: !!t.is_recommended,
                    clarity_notes: t.mess_ups?.length ? `${t.mess_ups.length} issue(s): ${t.mess_ups.map(m => m.type.replace("_", " ")).join(", ")}` : "Clean take",
                  })) || [],
                }));
              }
              setAnalysis(analysisData);

              const recordingId = recording.savedId ||
                (await supabase.from("audio_recordings").select("id").eq("project_id", project.id).order("created_at", { ascending: false }).limit(1).single()).data?.id;
              if (recordingId) {
                await supabase.from("audio_analyses").insert({
                  project_id: project.id,
                  recording_id: recordingId,
                  transcript: whisperData,
                  analysis: analysisData,
                });
              }

              await saveProject({ status: "editing" });
              setProcessingStatus("Done!");
              setStep("editor");
            } catch (e) {
              console.error("Processing error:", e);
              setError(e.message);
              setStep("record");
            }
            setProcessing(false);
          }}
        />
      )}
      {step === "processing" && (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div className="loading-dot" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Processing Audio</div>
          <div style={{ fontSize: 13, color: "var(--accent-light)" }}>{processingStatus}</div>
        </div>
      )}
      {step === "editor" && analysis && (
        <TimelineEditor recording={recording} transcript={transcript} analysis={analysis}
          sections={sections} setAnalysis={setAnalysis} onNext={() => setStep("export")} />
      )}
      {step === "export" && (
        <ExportStep recording={recording} analysis={analysis} sections={sections}
          projectId={project.id} onDone={async (url) => {
            await saveProject({ status: "exported" });
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// STEP 1: SCRIPT
// ════════════════════════════════════════════════

function ScriptStep({ sections, setSections, onNext }) {
  const [rawScript, setRawScript] = useState(sections.map(s => s.script_text).join("\n") || "");
  const [mode, setMode] = useState(sections.length > 0 ? "sections" : "paste");

  const parseScript = () => {
    const lines = rawScript.split("\n").filter(l => l.trim());
    const parsed = lines.map((text, i) => ({
      id: `section_${i}`,
      label: i < DEFAULT_SECTION_LABELS.length ? DEFAULT_SECTION_LABELS[i] : `Section ${i + 1}`,
      script_text: text.trim(),
      order: i,
    }));
    setSections(parsed);
    setMode("sections");
  };

  const updateSection = (idx, updates) => {
    const next = [...sections];
    next[idx] = { ...next[idx], ...updates };
    setSections(next);
  };

  const removeSection = (idx) => {
    setSections(sections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const addSection = () => {
    setSections([...sections, { id: `section_${sections.length}`, label: `Section ${sections.length + 1}`, script_text: "", order: sections.length }]);
  };

  return (
    <div>
      {mode === "paste" ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Paste Your Script</div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
            Paste the full VSL script below. Each line becomes a separate section for recording.
          </p>
          <textarea value={rawScript} onChange={e => setRawScript(e.target.value)}
            className="input" rows={14} placeholder={"Line 1: Hook...\nLine 2: Lead...\nLine 3: Body...\n..."} 
            style={{ fontFamily: "var(--fm)", fontSize: 13, lineHeight: 1.8 }} dir="auto" />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={parseScript} disabled={!rawScript.trim()} className="btn btn-primary btn-sm">
              Split into Sections ({rawScript.split("\n").filter(l => l.trim()).length} lines)
            </button>
            {sections.length > 0 && <button onClick={() => setMode("sections")} className="btn btn-ghost btn-sm">Back to Sections</button>}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>{sections.length} Script Sections</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setMode("paste")} className="btn btn-ghost btn-xs">Edit Raw Script</button>
              <button onClick={addSection} className="btn btn-ghost btn-xs">+ Add Section</button>
            </div>
          </div>
          {sections.map((s, i) => (
            <div key={s.id} className="card" style={{ marginBottom: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-light)", background: "var(--accent-bg)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>
                  {i + 1}
                </span>
                <input value={s.label} onChange={e => updateSection(i, { label: e.target.value })}
                  className="input" style={{ flex: 1, padding: "4px 8px", fontSize: 12, fontWeight: 600 }} />
                <button onClick={() => removeSection(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
              </div>
              <textarea value={s.script_text} onChange={e => updateSection(i, { script_text: e.target.value })}
                className="input" rows={2} style={{ fontSize: 13, lineHeight: 1.6 }} dir="auto" />
            </div>
          ))}
          <button onClick={onNext} disabled={sections.length === 0 || sections.some(s => !s.script_text.trim())}
            className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
            Continue to Recording →
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// STEP 2: RECORD
// ════════════════════════════════════════════════

function RecordStep({ sections, recording, setRecording, onNext, onSaveRecording }) {
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(recording?.url || null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const scriptRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecording({ blob, url, duration: elapsed });
        stream.getTracks().forEach(t => t.stop());
        // Auto-save to Supabase
        if (onSaveRecording) {
          setSaving(true);
          try { await onSaveRecording(blob, elapsed); } catch (e) { console.error("Auto-save recording:", e); }
          setSaving(false);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } catch (e) {
      alert("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div>
      {/* Full script teleprompter */}
      <div className="card" style={{ marginBottom: 16, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="section-title" style={{ margin: 0 }}>Full Script</div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{sections.length} sections</span>
        </div>
        <div ref={scriptRef} style={{
          maxHeight: 340, overflowY: "auto",
          background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)", padding: "20px 20px",
        }}>
          {sections.map((s, i) => (
            <div key={s.id} style={{ marginBottom: i < sections.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-light)", marginBottom: 4, direction: "ltr", textAlign: "left" }}>
                {i + 1}. {s.label}
              </div>
              <div dir="auto" style={{ fontSize: 20, lineHeight: 1.8, color: "var(--text-primary)", fontWeight: 500 }}>
                {s.script_text}
              </div>
              {i < sections.length - 1 && <div style={{ borderBottom: "1px dashed var(--border-light)", marginTop: 12 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Recording controls */}
      <div className="card" style={{ textAlign: "center", padding: "28px 24px" }}>
        <div style={{ fontSize: 42, fontFamily: "var(--fm)", fontWeight: 700, color: isRecording ? "var(--red)" : "var(--text-primary)", marginBottom: 16, letterSpacing: 2 }}>
          {formatTime(elapsed)}
        </div>
        {isRecording && (
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 16 }}>
            {[...Array(16)].map((_, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2, background: "var(--red)",
                height: 8 + Math.random() * 28, transition: "height 0.15s",
                animation: "pulse 0.6s infinite alternate",
                animationDelay: `${i * 0.04}s`,
              }} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          {!isRecording ? (
            <button onClick={startRecording} className="btn btn-danger" style={{ padding: "16px 40px", fontSize: 16, borderRadius: "var(--radius-full)" }}>
              ● Record
            </button>
          ) : (
            <button onClick={stopRecording} className="btn btn-ghost" style={{ padding: "16px 40px", fontSize: 16, borderRadius: "var(--radius-full)", border: "2px solid var(--red)", color: "var(--red)" }}>
              ■ Stop Recording
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14, maxWidth: 420, margin: "14px auto 0" }}>
          Just hit record and read through the full script. Redo any section as many times as you want -- the AI will find the best take for each part and clean everything up.
        </p>
      </div>

      {/* Preview + proceed */}
      {audioUrl && !isRecording && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="section-title" style={{ margin: 0 }}>Recording Preview</div>
            {saving && <span style={{ fontSize: 11, color: "var(--accent-light)" }}>Saving...</span>}
            {!saving && recording?.savedId && <span style={{ fontSize: 11, color: "var(--green-light)" }}>Saved</span>}
          </div>
          <audio src={audioUrl} controls style={{ width: "100%", margin: "10px 0 12px" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onNext} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
              {saving ? "Saving recording..." : "Process Recording -- AI will clean it up →"}
            </button>
            <button onClick={() => { setAudioUrl(null); setRecording(null); }} className="btn btn-ghost btn-sm">
              Re-record
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// STEP 4: TIMELINE EDITOR
// ════════════════════════════════════════════════

function TimelineEditor({ recording, transcript, analysis, sections, setAnalysis, onNext }) {
  const waveformRef = useRef(null);
  const wsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedSection, setSelectedSection] = useState(0);
  const [undoStack, setUndoStack] = useState([]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !recording?.url) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "rgba(99, 102, 241, 0.4)",
      progressColor: "rgba(99, 102, 241, 0.8)",
      cursorColor: "var(--accent-light)",
      cursorWidth: 2,
      height: 128,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      backend: "WebAudio",
      plugins: [RegionsPlugin.create()],
    });

    ws.load(recording.url);
    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("audioprocess", () => setCurrentTime(ws.getCurrentTime()));
    ws.on("seeking", () => setCurrentTime(ws.getCurrentTime()));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));

    wsRef.current = ws;
    return () => ws.destroy();
  }, [recording?.url]);

  // Add regions for takes, fillers, pauses
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !analysis?.section_mappings) return;
    ws.on("ready", () => addRegions(ws));
    if (ws.getDuration() > 0) addRegions(ws);
  }, [analysis]);

  const addRegions = (ws) => {
    const regionsPlugin = ws.plugins?.[0];
    if (!regionsPlugin) return;
    regionsPlugin.clearRegions();

    const colors = ["rgba(99,102,241,0.15)", "rgba(16,185,129,0.15)", "rgba(245,158,11,0.15)", "rgba(239,68,68,0.15)", "rgba(139,92,246,0.15)"];

    analysis.section_mappings?.forEach((sm, si) => {
      sm.takes?.forEach(take => {
        if (take.is_selected) {
          regionsPlugin.addRegion({
            start: take.start,
            end: take.end,
            color: colors[si % colors.length],
            drag: false,
            resize: true,
            id: `take_${sm.section_id}_${take.take_number}`,
          });
        }
      });
    });

    analysis.filler_words?.forEach((f, i) => {
      if (f.removed !== false) {
        regionsPlugin.addRegion({
          start: f.start, end: f.end,
          color: "rgba(239, 68, 68, 0.3)",
          drag: false, resize: false,
          id: `filler_${i}`,
        });
      }
    });
  };

  const toggleTake = (sectionIdx, takeNum) => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = { ...analysis };
    next.section_mappings[sectionIdx].takes = next.section_mappings[sectionIdx].takes.map(t => ({
      ...t, is_selected: t.take_number === takeNum,
    }));
    setAnalysis(next);
  };

  const toggleFiller = (idx) => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = { ...analysis };
    next.filler_words[idx].removed = !next.filler_words[idx].removed;
    setAnalysis(next);
  };

  const togglePause = (idx) => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = { ...analysis };
    next.pauses[idx].removed = !next.pauses[idx].removed;
    setAnalysis(next);
  };

  // Manual trim: adjust start/end of selected take to current cursor
  const trimStart = () => {
    const ws = wsRef.current;
    if (!ws || !sectionMappings[selectedSection]) return;
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = JSON.parse(JSON.stringify(analysis));
    const takes = next.section_mappings[selectedSection].takes;
    const sel = takes.find(t => t.is_selected);
    if (sel && currentTime > sel.start && currentTime < sel.end) {
      sel.start = parseFloat(currentTime.toFixed(2));
    }
    setAnalysis(next);
  };

  const trimEnd = () => {
    const ws = wsRef.current;
    if (!ws || !sectionMappings[selectedSection]) return;
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = JSON.parse(JSON.stringify(analysis));
    const takes = next.section_mappings[selectedSection].takes;
    const sel = takes.find(t => t.is_selected);
    if (sel && currentTime > sel.start && currentTime < sel.end) {
      sel.end = parseFloat(currentTime.toFixed(2));
    }
    setAnalysis(next);
  };

  // Split at cursor: creates a manual cut point (adds a pause region to remove)
  const splitAtCursor = () => {
    if (!currentTime || currentTime <= 0) return;
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = JSON.parse(JSON.stringify(analysis));
    const cutDuration = 0.15; // remove 150ms around the split point
    if (!next.pauses) next.pauses = [];
    next.pauses.push({
      start: parseFloat((currentTime - cutDuration / 2).toFixed(2)),
      end: parseFloat((currentTime + cutDuration / 2).toFixed(2)),
      duration: cutDuration,
      removed: true,
      manual: true,
    });
    setAnalysis(next);
  };

  // Delete: remove the selected take entirely (mark it as not selected, no replacement)
  const deleteSelectedTake = () => {
    if (!sectionMappings[selectedSection]) return;
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
    const next = JSON.parse(JSON.stringify(analysis));
    const takes = next.section_mappings[selectedSection].takes;
    const selIdx = takes.findIndex(t => t.is_selected);
    if (selIdx !== -1) {
      takes[selIdx].is_selected = false;
      // Auto-select next best if available
      const nextBest = takes.filter((_, i) => i !== selIdx).sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
      if (nextBest) nextBest.is_selected = true;
    }
    setAnalysis(next);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    setAnalysis(undoStack[undoStack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const playSection = (sectionIdx) => {
    const ws = wsRef.current;
    if (!ws) return;
    const sm = analysis.section_mappings?.[sectionIdx];
    const selected = sm?.takes?.find(t => t.is_selected);
    if (selected) {
      ws.seekTo(selected.start / ws.getDuration());
      ws.play();
      // Auto-pause at end of take
      const checkEnd = setInterval(() => {
        if (ws.getCurrentTime() >= selected.end) { ws.pause(); clearInterval(checkEnd); }
      }, 100);
    }
  };

  const playAll = () => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.seekTo(0);
    ws.play();
  };

  const formatTs = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

  const sectionMappings = analysis?.section_mappings || [];
  const currentMapping = sectionMappings[selectedSection];

  return (
    <div>
      {/* Waveform */}
      <div className="card" style={{ marginBottom: 16, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => { const ws = wsRef.current; if (ws) { isPlaying ? ws.pause() : ws.play(); } }}
              className="btn btn-primary btn-sm" style={{ borderRadius: "var(--radius-full)", width: 36, height: 36, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <span style={{ fontSize: 12, fontFamily: "var(--fm)", color: "var(--text-secondary)" }}>
              {formatTs(currentTime)} / {formatTs(duration)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={playAll} className="btn btn-ghost btn-xs">Play All</button>
            <button onClick={undo} disabled={undoStack.length === 0} className="btn btn-ghost btn-xs">Undo</button>
          </div>
        </div>
        {/* Edit toolbar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={trimStart} className="btn btn-ghost btn-xs" title="Set the start of the selected take to the current cursor position">Trim Start ◁|</button>
          <button onClick={trimEnd} className="btn btn-ghost btn-xs" title="Set the end of the selected take to the current cursor position">|▷ Trim End</button>
          <button onClick={splitAtCursor} className="btn btn-ghost btn-xs" title="Add a cut at the current cursor position">✂ Split at Cursor</button>
          <button onClick={deleteSelectedTake} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} title="Remove this take and auto-select the next best">✕ Delete Take</button>
          <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", marginLeft: 8 }}>
            Cursor: {formatTs(currentTime)}
          </span>
        </div>
        <div ref={waveformRef} style={{ borderRadius: "var(--radius-md)", overflow: "hidden" }} />
        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(99,102,241,0.4)", marginRight: 4 }} />Selected takes</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(239,68,68,0.3)", marginRight: 4 }} />Fillers to remove</span>
        </div>
      </div>

      {/* Section selector + takes */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* Section list */}
        <div>
          <div className="section-title" style={{ fontSize: 11, marginBottom: 8 }}>Sections</div>
          {sectionMappings.map((sm, i) => {
            const selectedTake = sm.takes?.find(t => t.is_selected);
            return (
              <div key={i} onClick={() => setSelectedSection(i)}
                className="card" style={{
                  marginBottom: 6, padding: "10px 12px", cursor: "pointer",
                  borderColor: selectedSection === i ? "var(--accent-border)" : "var(--border-light)",
                  background: selectedSection === i ? "var(--accent-bg)" : undefined,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                    {sm.section_label || sections[i]?.label || `Section ${i + 1}`}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); playSection(i); }} className="btn btn-ghost btn-xs" style={{ fontSize: 14, padding: "2px 6px" }}>▶</button>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {sm.takes?.length || 0} take{(sm.takes?.length || 0) !== 1 ? "s" : ""} -- using #{selectedTake?.take_number || "?"}
                  {selectedTake?.completeness_score != null && <span> -- {(selectedTake.completeness_score * 100).toFixed(0)}% match</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Take details */}
        <div>
          {currentMapping && (
            <div>
              <div className="section-title" style={{ fontSize: 11, marginBottom: 8 }}>
                Takes for: {currentMapping.section_label || sections[selectedSection]?.label}
              </div>
              <div dir="auto" style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", lineHeight: 1.6 }}>
                {sections[selectedSection]?.script_text}
              </div>
              {currentMapping.takes?.map(take => (
                <div key={take.take_number} className="card" style={{
                  marginBottom: 8, padding: "12px 14px",
                  borderColor: take.is_selected ? "var(--green-border)" : "var(--border-light)",
                  background: take.is_selected ? "var(--green-bg)" : undefined,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: take.is_selected ? "var(--green-light)" : "var(--text-secondary)" }}>
                        Take {take.take_number}
                      </span>
                      {(take.rank === 1 || take.overall_rank === 1) && <span className="badge badge-green" style={{ fontSize: 9 }}>Best</span>}
                      {take.is_selected && <span className="badge badge-accent" style={{ fontSize: 9 }}>Selected</span>}
                      {take.mess_ups?.length > 0 && <span className="badge badge-red" style={{ fontSize: 9 }}>{take.mess_ups.length} issue{take.mess_ups.length > 1 ? "s" : ""}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>
                        {formatTs(take.start)} - {formatTs(take.end)}
                      </span>
                      <button onClick={() => {
                        const ws = wsRef.current; if (ws) { ws.seekTo(take.start / ws.getDuration()); ws.play(); }
                      }} className="btn btn-ghost btn-xs">▶</button>
                      <button onClick={() => toggleTake(selectedSection, take.take_number)}
                        className={`btn btn-xs ${take.is_selected ? "btn-success" : "btn-ghost"}`}>
                        {take.is_selected ? "✓ Using" : "Use This"}
                      </button>
                    </div>
                  </div>
                  {/* Scores */}
                  {(take.completeness_score != null || take.cleanliness_score != null || take.flow_score != null) && (
                    <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10 }}>
                      {take.completeness_score != null && <span style={{ color: "var(--text-muted)" }}>Completeness: <strong style={{ color: take.completeness_score >= 0.9 ? "var(--green-light)" : take.completeness_score >= 0.7 ? "var(--yellow)" : "var(--red-light)" }}>{(take.completeness_score * 100).toFixed(0)}%</strong></span>}
                      {take.cleanliness_score != null && <span style={{ color: "var(--text-muted)" }}>Clean: <strong style={{ color: take.cleanliness_score >= 0.9 ? "var(--green-light)" : take.cleanliness_score >= 0.7 ? "var(--yellow)" : "var(--red-light)" }}>{(take.cleanliness_score * 100).toFixed(0)}%</strong></span>}
                      {take.flow_score != null && <span style={{ color: "var(--text-muted)" }}>Flow: <strong style={{ color: take.flow_score >= 0.9 ? "var(--green-light)" : take.flow_score >= 0.7 ? "var(--yellow)" : "var(--red-light)" }}>{(take.flow_score * 100).toFixed(0)}%</strong></span>}
                    </div>
                  )}
                  {/* Mess-ups */}
                  {take.mess_ups?.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {take.mess_ups.map((m, mi) => (
                        <span key={mi} style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: "var(--radius-sm)",
                          background: m.type === "false_start" ? "var(--red-bg)" : m.type === "off_script" ? "var(--yellow-bg)" : "var(--bg-elevated)",
                          color: m.type === "false_start" ? "var(--red-light)" : m.type === "off_script" ? "var(--yellow)" : "var(--text-muted)",
                          border: `1px solid ${m.type === "false_start" ? "var(--red-border)" : m.type === "off_script" ? "var(--yellow-border)" : "var(--border)"}`,
                        }}>
                          {m.type.replace("_", " ")}{m.transcript_text ? `: "${m.transcript_text.slice(0, 30)}"` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {take.clarity_notes && !take.mess_ups?.length && <div style={{ fontSize: 11, color: "var(--green-light)", marginTop: 4 }}>{take.clarity_notes}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Fillers & Pauses */}
          {(analysis.filler_words?.length > 0 || analysis.pauses?.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div className="section-title" style={{ fontSize: 11, marginBottom: 8 }}>Auto-Detected Cuts</div>
              {analysis.filler_words?.length > 0 && (
                <div className="card" style={{ marginBottom: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Filler Words ({analysis.filler_words.filter(f => f.removed !== false).length}/{analysis.filler_words.length} removed)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {analysis.filler_words.map((f, i) => (
                      <button key={i} onClick={() => toggleFiller(i)}
                        className="btn btn-xs" style={{
                          background: f.removed !== false ? "var(--red-bg)" : "var(--bg-elevated)",
                          color: f.removed !== false ? "var(--red-light)" : "var(--text-muted)",
                          border: `1px solid ${f.removed !== false ? "var(--red-border)" : "var(--border)"}`,
                          textDecoration: f.removed !== false ? "line-through" : "none",
                        }}>
                        "{f.word}" {formatTs(f.start)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {analysis.pauses?.length > 0 && (
                <div className="card" style={{ padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Pauses ({analysis.pauses.filter(p => p.removed !== false).length}/{analysis.pauses.length} removed)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {analysis.pauses.map((p, i) => (
                      <button key={i} onClick={() => togglePause(i)}
                        className="btn btn-xs" style={{
                          background: p.removed !== false ? "var(--yellow-bg)" : "var(--bg-elevated)",
                          color: p.removed !== false ? "var(--yellow)" : "var(--text-muted)",
                          border: `1px solid ${p.removed !== false ? "var(--yellow-border)" : "var(--border)"}`,
                        }}>
                        {p.duration?.toFixed(1)}s pause @ {formatTs(p.start)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Off-script segments */}
          {analysis.off_script_segments?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-title" style={{ fontSize: 11, marginBottom: 8 }}>Off-Script Segments (auto-removed)</div>
              <div className="card" style={{ padding: "10px 14px" }}>
                {analysis.off_script_segments.map((seg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < analysis.off_script_segments.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      <span style={{ color: "var(--red-light)", fontWeight: 600 }}>"{seg.transcript_text?.slice(0, 50)}"</span>
                      <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>{seg.context}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: "var(--fm)", color: "var(--text-muted)" }}>{formatTs(seg.start)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={onNext} className="btn btn-primary" style={{ marginTop: 24, width: "100%" }}>
        Continue to Export →
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════
// STEP 5: EXPORT
// ════════════════════════════════════════════════

function ExportStep({ recording, analysis, sections, projectId, onDone }) {
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState(null);
  const [settings, setSettings] = useState({ normalize: true, noiseGate: false });
  const [progress, setProgress] = useState("");

  const handleExport = async () => {
    if (!recording?.url || !analysis?.section_mappings) return;
    setExporting(true);
    setProgress("Building cut list...");

    try {
      // Build ordered segments from selected takes
      const selectedSegments = [];
      for (const sm of analysis.section_mappings) {
        const selectedTake = sm.takes?.find(t => t.is_selected);
        if (selectedTake) {
          selectedSegments.push({ start: selectedTake.start, end: selectedTake.end, sectionId: sm.section_id });
        }
      }

      if (selectedSegments.length === 0) throw new Error("No takes selected");

      setProgress("Decoding audio...");
      const response = await fetch(recording.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      setProgress("Cutting and stitching...");
      // Calculate total duration
      let totalDuration = 0;
      const cutSegments = [];

      for (const seg of selectedSegments) {
        let { start, end } = seg;
        // Remove fillers within this segment
        const fillers = (analysis.filler_words || []).filter(f => f.removed !== false && f.start >= start && f.end <= end);
        const pauses = (analysis.pauses || []).filter(p => p.removed !== false && p.start >= start && p.end <= end);
        const removals = [...fillers, ...pauses].sort((a, b) => a.start - b.start);

        if (removals.length === 0) {
          cutSegments.push({ start, end });
          totalDuration += end - start;
        } else {
          let cursor = start;
          for (const r of removals) {
            if (r.start > cursor) {
              cutSegments.push({ start: cursor, end: r.start });
              totalDuration += r.start - cursor;
            }
            cursor = r.end;
          }
          if (cursor < end) {
            cutSegments.push({ start: cursor, end });
            totalDuration += end - cursor;
          }
        }
      }

      // Create output buffer
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;
      const outputBuffer = audioCtx.createBuffer(channels, Math.ceil(totalDuration * sampleRate), sampleRate);

      let writeOffset = 0;
      for (const cut of cutSegments) {
        const startSample = Math.floor(cut.start * sampleRate);
        const endSample = Math.floor(cut.end * sampleRate);
        const length = endSample - startSample;

        for (let ch = 0; ch < channels; ch++) {
          const inputData = audioBuffer.getChannelData(ch);
          const outputData = outputBuffer.getChannelData(ch);
          for (let i = 0; i < length && (writeOffset + i) < outputData.length; i++) {
            outputData[writeOffset + i] = inputData[startSample + i] || 0;
          }
        }
        writeOffset += length;
      }

      setProgress("Encoding WAV...");
      // Encode to WAV (client-side, since we can't use FFmpeg on Vercel)
      const wavBlob = encodeWav(outputBuffer);
      const wavUrl = URL.createObjectURL(wavBlob);
      setExportUrl(wavUrl);

      // Upload to Supabase
      setProgress("Uploading export...");
      const exportPath = `${projectId}/export_${Date.now()}.wav`;
      const { error: upErr } = await supabase.storage.from("audio").upload(exportPath, wavBlob, { contentType: "audio/wav" });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("audio").getPublicUrl(exportPath);
        await supabase.from("audio_exports").insert({
          project_id: projectId, file_url: urlData.publicUrl, file_path: exportPath,
          settings: { ...settings, segments: cutSegments.length, duration: totalDuration },
        });
      }

      setProgress("Done!");
      if (onDone) onDone(wavUrl);
    } catch (e) {
      console.error("Export error:", e);
      setProgress("Error: " + e.message);
    }
    setExporting(false);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Export Settings</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={settings.normalize} onChange={e => setSettings(s => ({ ...s, normalize: e.target.checked }))} />
            Normalize volume levels
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={settings.noiseGate} onChange={e => setSettings(s => ({ ...s, noiseGate: e.target.checked }))} />
            Noise gate (remove background hum)
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Selected Sections</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-light)", fontFamily: "var(--fm)" }}>
              {analysis?.section_mappings?.filter(sm => sm.takes?.some(t => t.is_selected)).length || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Fillers Removed</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--red-light)", fontFamily: "var(--fm)" }}>
              {analysis?.filler_words?.filter(f => f.removed !== false).length || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Pauses Cut</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--yellow)", fontFamily: "var(--fm)" }}>
              {analysis?.pauses?.filter(p => p.removed !== false).length || 0}
            </div>
          </div>
        </div>

        <button onClick={handleExport} disabled={exporting} className="btn btn-primary" style={{ width: "100%" }}>
          {exporting ? progress : "Export Stitched Audio"}
        </button>
      </div>

      {exportUrl && (
        <div className="card" style={{ textAlign: "center", padding: "24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--green-light)", marginBottom: 8 }}>Export Complete</div>
          <audio src={exportUrl} controls style={{ width: "100%", marginBottom: 16 }} />
          <a href={exportUrl} download={`export_${Date.now()}.wav`} className="btn btn-primary btn-sm">Download WAV</a>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// WAV ENCODER (client-side)
// ════════════════════════════════════════════════

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const samples = [];
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = audioBuffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      samples.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF);
    }
  }

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
