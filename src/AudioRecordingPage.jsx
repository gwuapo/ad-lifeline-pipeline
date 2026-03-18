import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import WaveSurfer from "wavesurfer.js";

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
  const previewWaveformRef = useRef(null);
  const wsRef = useRef(null);
  const previewWsRef = useRef(null);
  const timelineRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedClip, setSelectedClip] = useState(null); // index into clips
  const [selectedSection, setSelectedSection] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [dragging, setDragging] = useState(null); // { clipIdx, edge: "left"|"right", startX, origStart, origEnd }
  const [snap, setSnap] = useState(true);
  const [viewMode, setViewMode] = useState("edit"); // "edit" | "preview"
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const playIntervalRef = useRef(null);
  const SNAP_THRESHOLD = 0.15; // seconds
  const PX_PER_SEC = 12; // pixels per second in clip timeline

  const sectionMappings = analysis?.section_mappings || [];
  const formatTs = (s) => s != null ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}` : "0:00.0";

  // Build clips: ordered selected takes
  const clips = useMemo(() => {
    const c = [];
    sectionMappings.forEach((sm, si) => {
      const sel = sm.takes?.find(t => t.is_selected);
      if (sel) c.push({ ...sel, sectionIdx: si, sectionLabel: sm.section_label || sections[si]?.label || `Section ${si + 1}` });
    });
    return c;
  }, [analysis, sectionMappings, sections]);

  // Build skip regions (fillers + pauses marked for removal)
  const skipRegions = useMemo(() => {
    const regions = [];
    (analysis.filler_words || []).forEach(f => { if (f.removed !== false) regions.push({ start: f.start, end: f.end, type: "filler", word: f.word }); });
    (analysis.pauses || []).forEach(p => { if (p.removed !== false) regions.push({ start: p.start, end: p.end, type: "pause" }); });
    (analysis.off_script_segments || []).forEach(s => regions.push({ start: s.start, end: s.end, type: "off_script" }));
    return regions.sort((a, b) => a.start - b.start);
  }, [analysis]);

  // Init WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !recording?.url) return;
    const ws = WaveSurfer.create({
      container: waveformRef.current, waveColor: "rgba(99,102,241,0.3)", progressColor: "rgba(99,102,241,0.7)",
      cursorColor: "#fff", cursorWidth: 2, height: 64, barWidth: 2, barGap: 1, barRadius: 1, normalize: true,
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

  // Undo
  const pushUndo = () => setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]);
  const undo = () => { if (!undoStack.length) return; setAnalysis(undoStack[undoStack.length - 1]); setUndoStack(prev => prev.slice(0, -1)); };

  // Trim handles (drag left/right edge of a clip)
  const handleTrimStart = (e, clipIdx, edge) => {
    e.preventDefault();
    const clip = clips[clipIdx];
    setDragging({ clipIdx, edge, startX: e.clientX, origStart: clip.start, origEnd: clip.end });
    pushUndo();
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = e.clientX - dragging.startX;
      const dt = dx / PX_PER_SEC;
      const next = JSON.parse(JSON.stringify(analysis));
      const clip = clips[dragging.clipIdx];
      const sm = next.section_mappings[clip.sectionIdx];
      const take = sm.takes.find(t => t.take_number === clip.take_number);
      if (!take) return;

      if (dragging.edge === "left") {
        let newStart = dragging.origStart + dt;
        if (snap) newStart = snapToNearby(newStart, dragging.clipIdx, "start");
        take.start = parseFloat(Math.max(0, Math.min(newStart, take.end - 0.1)).toFixed(2));
      } else {
        let newEnd = dragging.origEnd + dt;
        if (snap) newEnd = snapToNearby(newEnd, dragging.clipIdx, "end");
        take.end = parseFloat(Math.max(take.start + 0.1, Math.min(newEnd, duration)).toFixed(2));
      }
      take.is_selected = true;
      setAnalysis(next);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  // Snap: find nearby clip edges to snap to
  const snapToNearby = (time, excludeIdx, edge) => {
    for (let i = 0; i < clips.length; i++) {
      if (i === excludeIdx) continue;
      if (Math.abs(clips[i].end - time) < SNAP_THRESHOLD) return clips[i].end;
      if (Math.abs(clips[i].start - time) < SNAP_THRESHOLD) return clips[i].start;
    }
    return time;
  };

  // Split clip at cursor
  const splitAtCursor = () => {
    if (selectedClip == null) return;
    const clip = clips[selectedClip];
    if (currentTime <= clip.start || currentTime >= clip.end) return;
    pushUndo();
    const next = JSON.parse(JSON.stringify(analysis));
    const sm = next.section_mappings[clip.sectionIdx];
    const takeIdx = sm.takes.findIndex(t => t.take_number === clip.take_number);
    const take = sm.takes[takeIdx];
    const newTake = { ...take, take_number: sm.takes.length + 1, start: parseFloat(currentTime.toFixed(2)), is_selected: true };
    take.end = parseFloat(currentTime.toFixed(2));
    sm.takes.push(newTake);
    setAnalysis(next);
  };

  // Delete clip
  const deleteClip = () => {
    if (selectedClip == null) return;
    pushUndo();
    const clip = clips[selectedClip];
    const next = JSON.parse(JSON.stringify(analysis));
    const sm = next.section_mappings[clip.sectionIdx];
    const take = sm.takes.find(t => t.take_number === clip.take_number);
    if (take) take.is_selected = false;
    setSelectedClip(null);
    setAnalysis(next);
  };

  // Toggle take for section
  const toggleTake = (sectionIdx, takeNum) => {
    pushUndo();
    const next = JSON.parse(JSON.stringify(analysis));
    next.section_mappings[sectionIdx].takes.forEach(t => { t.is_selected = t.take_number === takeNum; });
    setAnalysis(next);
  };

  // Play only good takes (preview mode)
  const playPreview = () => {
    const ws = wsRef.current;
    if (!ws || clips.length === 0) return;
    if (previewPlaying) { ws.pause(); setPreviewPlaying(false); clearInterval(playIntervalRef.current); return; }

    let clipQueue = clips.map(c => ({ start: c.start, end: c.end }));
    // Remove skip regions within each clip
    const keepRegions = [];
    for (const clip of clipQueue) {
      const overlaps = skipRegions.filter(r => r.start < clip.end && r.end > clip.start);
      let cursor = clip.start;
      for (const r of overlaps) {
        if (r.start > cursor) keepRegions.push({ start: cursor, end: r.start });
        cursor = Math.max(cursor, r.end);
      }
      if (cursor < clip.end) keepRegions.push({ start: cursor, end: clip.end });
    }
    if (keepRegions.length === 0) return;

    let regionIdx = 0;
    const playNext = () => {
      if (regionIdx >= keepRegions.length) { setPreviewPlaying(false); ws.pause(); return; }
      const r = keepRegions[regionIdx];
      ws.seekTo(r.start / ws.getDuration());
      ws.play();
      playIntervalRef.current = setInterval(() => {
        if (ws.getCurrentTime() >= r.end - 0.05) {
          clearInterval(playIntervalRef.current);
          ws.pause();
          regionIdx++;
          setTimeout(playNext, 30);
        }
      }, 50);
    };
    setPreviewPlaying(true);
    playNext();
  };

  useEffect(() => () => clearInterval(playIntervalRef.current), []);

  // Seek on timeline click
  const handleTimelineClick = (e) => {
    const ws = wsRef.current;
    if (!ws || !timelineRef.current || dragging) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const time = x / PX_PER_SEC;
    ws.seekTo(Math.min(time / ws.getDuration(), 1));
  };

  const SECTION_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
  const totalWidth = duration * PX_PER_SEC;

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", width: "fit-content" }}>
        <button onClick={() => setViewMode("edit")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: viewMode === "edit" ? "var(--accent-bg)" : "transparent", color: viewMode === "edit" ? "var(--accent-light)" : "var(--text-muted)" }}>Edit Timeline</button>
        <button onClick={() => setViewMode("preview")} className="btn btn-xs" style={{ borderRadius: 0, border: "none", background: viewMode === "preview" ? "var(--green-bg)" : "transparent", color: viewMode === "preview" ? "var(--green-light)" : "var(--text-muted)" }}>Final Preview</button>
      </div>

      {/* Waveform + controls */}
      <div className="card" style={{ marginBottom: 12, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {viewMode === "edit" ? (
              <button onClick={() => { const ws = wsRef.current; if (ws) { isPlaying ? ws.pause() : ws.play(); } }}
                className="btn btn-primary btn-sm" style={{ borderRadius: "var(--radius-full)", width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                {isPlaying ? "⏸" : "▶"}
              </button>
            ) : (
              <button onClick={playPreview}
                className="btn btn-success btn-sm" style={{ borderRadius: "var(--radius-full)", width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                {previewPlaying ? "⏸" : "▶"}
              </button>
            )}
            <span style={{ fontSize: 12, fontFamily: "var(--fm)", color: "var(--text-secondary)" }}>{formatTs(currentTime)} / {formatTs(duration)}</span>
            {viewMode === "preview" && <span style={{ fontSize: 10, color: "var(--green-light)", fontWeight: 600 }}>Plays only good takes, skips bad parts</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {viewMode === "edit" && <>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap
              </label>
              <button onClick={undo} disabled={!undoStack.length} className="btn btn-ghost btn-xs">Undo</button>
            </>}
          </div>
        </div>
        <div ref={waveformRef} style={{ borderRadius: "var(--radius-sm)", overflow: "hidden" }} />
      </div>

      {/* Clip timeline (CapCut-style) */}
      {viewMode === "edit" && (
        <div className="card" style={{ marginBottom: 12, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0, fontSize: 11 }}>Clip Timeline</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={splitAtCursor} disabled={selectedClip == null} className="btn btn-ghost btn-xs">✂ Split</button>
              <button onClick={deleteClip} disabled={selectedClip == null} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>✕ Delete</button>
            </div>
          </div>

          {/* Timecode ruler */}
          <div ref={timelineRef} onClick={handleTimelineClick} style={{ overflowX: "auto", position: "relative", cursor: "crosshair" }}>
            <div style={{ width: totalWidth, minHeight: 80, position: "relative" }}>
              {/* Ruler marks */}
              <div style={{ height: 18, position: "relative", borderBottom: "1px solid var(--border-light)" }}>
                {Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, i) => (
                  <span key={i} style={{ position: "absolute", left: i * 5 * PX_PER_SEC, fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)", top: 2 }}>
                    {Math.floor(i * 5 / 60)}:{((i * 5) % 60).toString().padStart(2, "0")}
                  </span>
                ))}
              </div>

              {/* Skip regions (dimmed background) */}
              {skipRegions.map((r, i) => (
                <div key={`skip_${i}`} style={{
                  position: "absolute", top: 18, left: r.start * PX_PER_SEC, width: (r.end - r.start) * PX_PER_SEC,
                  height: 56, background: r.type === "filler" ? "rgba(239,68,68,0.15)" : r.type === "pause" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                  borderLeft: `1px dashed ${r.type === "filler" ? "var(--red-border)" : "var(--yellow-border)"}`,
                  pointerEvents: "none",
                }} />
              ))}

              {/* Clips */}
              {clips.map((clip, ci) => {
                const color = SECTION_COLORS[clip.sectionIdx % SECTION_COLORS.length];
                const isSelected = selectedClip === ci;
                const w = (clip.end - clip.start) * PX_PER_SEC;
                return (
                  <div key={ci} onClick={(e) => { e.stopPropagation(); setSelectedClip(ci); setSelectedSection(clip.sectionIdx); }}
                    style={{
                      position: "absolute", top: 22, left: clip.start * PX_PER_SEC, width: w, height: 48,
                      background: `${color}22`, border: `2px solid ${isSelected ? "#fff" : color}`,
                      borderRadius: 6, cursor: "pointer", overflow: "hidden", transition: "border-color 0.1s",
                      boxShadow: isSelected ? `0 0 0 1px ${color}, 0 2px 8px rgba(0,0,0,0.3)` : "none",
                    }}>
                    {/* Left trim handle */}
                    <div onMouseDown={(e) => handleTrimStart(e, ci, "left")}
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: `${color}88`, borderRadius: "6px 0 0 6px" }}>
                      <div style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", width: 2, height: 16, background: "#fff", borderRadius: 1, opacity: 0.7 }} />
                    </div>
                    {/* Right trim handle */}
                    <div onMouseDown={(e) => handleTrimStart(e, ci, "right")}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: `${color}88`, borderRadius: "0 6px 6px 0" }}>
                      <div style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: 2, height: 16, background: "#fff", borderRadius: 1, opacity: 0.7 }} />
                    </div>
                    {/* Label */}
                    <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {clip.sectionLabel}
                    </div>
                    <div style={{ padding: "0 12px", fontSize: 9, color: "rgba(255,255,255,0.6)", fontFamily: "var(--fm)" }}>
                      {formatTs(clip.start)} - {formatTs(clip.end)}
                    </div>
                  </div>
                );
              })}

              {/* Playhead */}
              <div style={{ position: "absolute", top: 0, left: currentTime * PX_PER_SEC, width: 2, height: "100%", background: "#fff", zIndex: 10, pointerEvents: "none" }}>
                <div style={{ width: 8, height: 8, background: "#fff", borderRadius: "50%", position: "absolute", top: 0, left: -3 }} />
              </div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
            <span>Drag clip edges to trim</span>
            <span style={{ color: "var(--red-light)" }}>Red = fillers</span>
            <span style={{ color: "var(--yellow)" }}>Yellow = pauses</span>
          </div>
        </div>
      )}

      {/* Final Preview timeline */}
      {viewMode === "preview" && (
        <div className="card" style={{ marginBottom: 12, padding: "12px 16px" }}>
          <div className="section-title" style={{ margin: "0 0 8px", fontSize: 11 }}>Final Audio Preview</div>
          <div style={{ overflowX: "auto", position: "relative" }}>
            <div style={{ width: totalWidth, minHeight: 60, position: "relative" }}>
              {/* Full audio background (dimmed) */}
              <div style={{ position: "absolute", top: 0, left: 0, width: totalWidth, height: 48, background: "var(--bg-elevated)", borderRadius: 6, opacity: 0.3 }} />
              {/* Good regions (bright) */}
              {clips.map((clip, ci) => {
                const color = SECTION_COLORS[clip.sectionIdx % SECTION_COLORS.length];
                // Build keep-regions within this clip
                const overlaps = skipRegions.filter(r => r.start < clip.end && r.end > clip.start);
                const keepParts = [];
                let cursor = clip.start;
                for (const r of overlaps) {
                  if (r.start > cursor) keepParts.push({ start: cursor, end: r.start });
                  cursor = Math.max(cursor, r.end);
                }
                if (cursor < clip.end) keepParts.push({ start: cursor, end: clip.end });

                return keepParts.map((kp, ki) => (
                  <div key={`keep_${ci}_${ki}`} style={{
                    position: "absolute", top: 4, left: kp.start * PX_PER_SEC, width: (kp.end - kp.start) * PX_PER_SEC,
                    height: 40, background: `${color}44`, border: `1px solid ${color}`, borderRadius: 4,
                  }}>
                    {ki === 0 && <div style={{ padding: "2px 6px", fontSize: 9, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>{clip.sectionLabel}</div>}
                  </div>
                ));
              })}
              {/* Skip regions (red/yellow strikethrough) */}
              {skipRegions.map((r, i) => {
                const inClip = clips.some(c => r.start < c.end && r.end > c.start);
                if (!inClip) return null;
                return (
                  <div key={`ps_${i}`} style={{
                    position: "absolute", top: 22, left: r.start * PX_PER_SEC, width: Math.max((r.end - r.start) * PX_PER_SEC, 2),
                    height: 4, background: r.type === "filler" ? "var(--red)" : "var(--yellow)", borderRadius: 2, opacity: 0.8,
                  }} />
                );
              })}
              {/* Playhead */}
              <div style={{ position: "absolute", top: 0, left: currentTime * PX_PER_SEC, width: 2, height: 48, background: "var(--green)", zIndex: 10, pointerEvents: "none" }} />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
            Bright regions = what plays in the final export. Dim/striped regions = skipped (bad takes, fillers, pauses).
          </div>
        </div>
      )}

      {/* Section sidebar + take picker */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}>
        <div>
          <div className="section-title" style={{ fontSize: 11, marginBottom: 8 }}>Sections</div>
          {sectionMappings.map((sm, i) => {
            const sel = sm.takes?.find(t => t.is_selected);
            return (
              <div key={i} onClick={() => { setSelectedSection(i); const ci = clips.findIndex(c => c.sectionIdx === i); if (ci >= 0) setSelectedClip(ci); }}
                className="card" style={{ marginBottom: 6, padding: "8px 10px", cursor: "pointer",
                  borderColor: selectedSection === i ? "var(--accent-border)" : "var(--border-light)",
                  background: selectedSection === i ? "var(--accent-bg)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{sm.section_label || sections[i]?.label || `Section ${i + 1}`}</span>
                  <button onClick={(e) => { e.stopPropagation(); const ws = wsRef.current; if (ws && sel) { ws.seekTo(sel.start / ws.getDuration()); ws.play(); } }} className="btn btn-ghost btn-xs" style={{ fontSize: 12, padding: "2px 6px" }}>▶</button>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {sm.takes?.length || 0} takes -- #{sel?.take_number || "none"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Takes for selected section */}
        <div>
          {sectionMappings[selectedSection] && (
            <div>
              <div dir="auto" style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10, padding: "6px 10px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", lineHeight: 1.5 }}>
                {sections[selectedSection]?.script_text}
              </div>
              {sectionMappings[selectedSection].takes?.map(take => (
                <div key={take.take_number} className="card" style={{
                  marginBottom: 6, padding: "10px 12px",
                  borderColor: take.is_selected ? "var(--green-border)" : "var(--border-light)",
                  background: take.is_selected ? "var(--green-bg)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: take.is_selected ? "var(--green-light)" : "var(--text-secondary)" }}>Take {take.take_number}</span>
                      {(take.rank === 1 || take.overall_rank === 1) && <span className="badge badge-green" style={{ fontSize: 8 }}>Best</span>}
                      {take.is_selected && <span className="badge badge-accent" style={{ fontSize: 8 }}>Using</span>}
                      {take.mess_ups?.length > 0 && <span className="badge badge-red" style={{ fontSize: 8 }}>{take.mess_ups.length} issues</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{formatTs(take.start)}-{formatTs(take.end)}</span>
                      <button onClick={() => { const ws = wsRef.current; if (ws) { ws.seekTo(take.start / ws.getDuration()); ws.play(); } }} className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}>▶</button>
                      <button onClick={() => toggleTake(selectedSection, take.take_number)} className={`btn btn-xs ${take.is_selected ? "btn-success" : "btn-ghost"}`} style={{ fontSize: 10 }}>
                        {take.is_selected ? "✓" : "Use"}
                      </button>
                    </div>
                  </div>
                  {(take.completeness_score != null || take.cleanliness_score != null || take.flow_score != null) && (
                    <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 9 }}>
                      {take.completeness_score != null && <span style={{ color: "var(--text-muted)" }}>Complete: <strong style={{ color: take.completeness_score >= 0.9 ? "var(--green-light)" : "var(--yellow)" }}>{(take.completeness_score * 100).toFixed(0)}%</strong></span>}
                      {take.cleanliness_score != null && <span style={{ color: "var(--text-muted)" }}>Clean: <strong style={{ color: take.cleanliness_score >= 0.9 ? "var(--green-light)" : "var(--yellow)" }}>{(take.cleanliness_score * 100).toFixed(0)}%</strong></span>}
                      {take.flow_score != null && <span style={{ color: "var(--text-muted)" }}>Flow: <strong style={{ color: take.flow_score >= 0.9 ? "var(--green-light)" : "var(--yellow)" }}>{(take.flow_score * 100).toFixed(0)}%</strong></span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button onClick={onNext} className="btn btn-primary" style={{ marginTop: 20, width: "100%" }}>Continue to Export →</button>
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
