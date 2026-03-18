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

STEP 4 — FILLER WORD AND BREATH DETECTION:
Flag ALL filler words, breaths, and unwanted sounds with exact start/end timestamps:
- Arabic fillers: يعني, طيب, آه, إيه, هم, والله
- English fillers: um, uh, ah, like, so, okay, you know, right
- Breaths and mouth sounds: Any audible inhale/exhale between words. Whisper often transcribes these as "[inaudible]", "(breathing)", short "hh" sounds, or just gaps with very short duration words. If there's a gap of 0.15-0.8 seconds between words and it's not a natural sentence pause, flag it as a breath.
- Lip smacks, tongue clicks, throat clears, sighs
- Any word that appears in the transcript but NOT in the corresponding script section
Be AGGRESSIVE about flagging these. It's better to flag too many than too few — the user can always restore them.

STEP 5 — PAUSE DETECTION:
Using the word-level timestamps, identify all gaps longer than 0.5 seconds between consecutive words WITHIN a take (not between takes). Flag each pause with start, end, and duration. Also flag any gap > 0.3 seconds that occurs mid-sentence (not at a natural comma or period boundary).

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

  const fileInputRef = useRef(null);

  const handleImportAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Get duration from audio element
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", async () => {
      const dur = audio.duration || 0;
      setElapsed(Math.floor(dur));
      setAudioUrl(url);
      setRecording({ blob: file, url, duration: dur });
      if (onSaveRecording) {
        setSaving(true);
        try { await onSaveRecording(file, dur); } catch (err) { console.error("Auto-save imported audio:", err); }
        setSaving(false);
      }
    });
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

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
          {!isRecording ? (<>
            <button onClick={startRecording} className="btn btn-danger" style={{ padding: "16px 40px", fontSize: 16, borderRadius: "var(--radius-full)" }}>
              ● Record
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-ghost" style={{ padding: "16px 24px", fontSize: 14, borderRadius: "var(--radius-full)" }}>
              Import Audio
            </button>
            <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/wav,audio/mp3,audio/x-wav,.mp3,.wav" onChange={handleImportAudio} style={{ display: "none" }} />
          </>) : (
            <button onClick={stopRecording} className="btn btn-ghost" style={{ padding: "16px 40px", fontSize: 16, borderRadius: "var(--radius-full)", border: "2px solid var(--red)", color: "var(--red)" }}>
              ■ Stop Recording
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14, maxWidth: 420, margin: "14px auto 0" }}>
          Record live or import an MP3/WAV file. Redo any section as many times as you want -- the AI will find the best take for each part and clean everything up.
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
  const timelineRef = useRef(null);
  const trackRef = useRef(null); // inner content div for accurate position math
  const waveCanvasRef = useRef(null);
  const wsRef = useRef(null);
  const hiddenWaveRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedClip, setSelectedClip] = useState(null);
  const [selectedSection, setSelectedSection] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [dragging, setDragging] = useState(null); // { type: "trim"|"playhead", ... }
  const [snap, setSnap] = useState(true);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState(null);
  const [zoom, setZoom] = useState(1); // 1x = default, range 0.5 - 6
  const playIntervalRef = useRef(null);
  const SNAP_PX = 6;
  const BASE_PX_PER_SEC = 14;
  const pxPerSec = BASE_PX_PER_SEC * zoom;
  const CLIP_H = 64;
  const RULER_H = 22;
  const HANDLE_W = 10;

  const sectionMappings = analysis?.section_mappings || [];
  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
  const formatTs = (s) => s != null ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}` : "0:00.0";

  // Build clips from selected takes, sorted by start time
  const clips = useMemo(() => {
    const c = [];
    sectionMappings.forEach((sm, si) => {
      sm.takes?.forEach(t => {
        if (t.is_selected) c.push({ ...t, sectionIdx: si, sectionLabel: sm.section_label || sections[si]?.label || `Section ${si + 1}` });
      });
    });
    return c.sort((a, b) => a.start - b.start);
  }, [analysis, sectionMappings, sections]);

  // Build skip regions
  const skipRegions = useMemo(() => {
    const r = [];
    (analysis.filler_words || []).forEach(f => { if (f.removed !== false) r.push({ start: f.start, end: f.end, type: "filler" }); });
    (analysis.pauses || []).forEach(p => { if (p.removed !== false) r.push({ start: p.start, end: p.end, type: "pause" }); });
    (analysis.off_script_segments || []).forEach(s => r.push({ start: s.start, end: s.end, type: "off_script" }));
    return r.sort((a, b) => a.start - b.start);
  }, [analysis]);

  // Build "keep regions" for preview
  const keepRegions = useMemo(() => {
    const regions = [];
    for (const clip of clips) {
      const overlaps = skipRegions.filter(r => r.start < clip.end && r.end > clip.start);
      let cursor = clip.start;
      for (const r of overlaps) {
        if (r.start > cursor) regions.push({ start: cursor, end: r.start, sectionIdx: clip.sectionIdx });
        cursor = Math.max(cursor, r.end);
      }
      if (cursor < clip.end) regions.push({ start: cursor, end: clip.end, sectionIdx: clip.sectionIdx });
    }
    return regions;
  }, [clips, skipRegions]);

  // Load audio + extract waveform peaks
  useEffect(() => {
    if (!recording?.url) return;
    if (!hiddenWaveRef.current) {
      const div = document.createElement("div");
      div.style.display = "none";
      document.body.appendChild(div);
      hiddenWaveRef.current = div;
    }
    const ws = WaveSurfer.create({ container: hiddenWaveRef.current, height: 0, interact: false });
    ws.load(recording.url);
    ws.on("ready", () => {
      setDuration(ws.getDuration());
      try {
        const raw = ws.getDecodedData()?.getChannelData(0);
        if (raw) {
          const samples = 4000;
          const step = Math.floor(raw.length / samples);
          const peaks = new Float32Array(samples);
          for (let i = 0; i < samples; i++) {
            let mx = 0;
            for (let j = i * step; j < (i + 1) * step && j < raw.length; j++) mx = Math.max(mx, Math.abs(raw[j]));
            peaks[i] = mx;
          }
          setWaveformData(peaks);
        }
      } catch (e) {}
    });
    ws.on("audioprocess", () => setCurrentTime(ws.getCurrentTime()));
    ws.on("seeking", () => setCurrentTime(ws.getCurrentTime()));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    wsRef.current = ws;
    return () => ws.destroy();
  }, [recording?.url]);

  // Auto-scroll timeline to keep playhead in view
  useEffect(() => {
    const el = timelineRef.current;
    if (!el || !duration || dragging?.type === "playhead") return;
    const playheadPx = currentTime * pxPerSec;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const margin = el.clientWidth * 0.15; // keep 15% margin from edges
    if (playheadPx < viewLeft + margin) {
      el.scrollLeft = playheadPx - margin;
    } else if (playheadPx > viewRight - margin) {
      el.scrollLeft = playheadPx - el.clientWidth + margin;
    }
  }, [currentTime, pxPerSec]);

  // Draw full-width waveform canvas (entire audio, fixed position)
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !waveformData || !duration) return;
    const w = Math.max(duration * pxPerSec, 200);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = CLIP_H * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${CLIP_H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, CLIP_H);

    const samplesPerPx = waveformData.length / w;
    for (let x = 0; x < w; x++) {
      const si = Math.floor(x * samplesPerPx);
      const sample = waveformData[si] || 0;
      const barH = sample * CLIP_H * 0.8;
      // Check if this pixel's time falls inside a clip
      const t = x / pxPerSec;
      const inClip = clips.find(c => t >= c.start && t < c.end);
      const inSkip = skipRegions.some(r => t >= r.start && t < r.end);
      if (inClip && !inSkip) {
        const color = COLORS[inClip.sectionIdx % COLORS.length];
        ctx.fillStyle = color + "cc";
      } else if (inClip && inSkip) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
      }
      ctx.fillRect(x, (CLIP_H - barH) / 2, 1, barH || 0.5);
    }
  }, [waveformData, duration, clips, skipRegions, zoom, pxPerSec]);

  // Keyboard shortcuts -- refs initialized null, synced after functions are defined below
  const splitRef = useRef(null);
  const deleteRef = useRef(null);
  const undoRef = useRef(null);
  const redoRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); const ws = wsRef.current; if (ws) ws.isPlaying() ? ws.pause() : ws.play(); return; }
      if (e.code === "KeyC" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); splitRef.current?.(); return; }
      if (e.code === "KeyX" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); deleteRef.current?.(); return; }
      if (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && e.shiftKey) { e.preventDefault(); redoRef.current?.(); return; }
      if (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); undoRef.current?.(); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Min zoom: timeline should never be wider than audio length at full zoom out
  const getMinZoom = () => {
    const el = timelineRef.current;
    if (!el || !duration) return 0.5;
    const containerW = el.clientWidth - 24; // minus padding
    return Math.max(0.3, containerW / (duration * BASE_PX_PER_SEC));
  };

  // Apply zoom anchored to playhead: keeps playhead in same visual position
  const applyZoom = (newZoom) => {
    const el = timelineRef.current;
    const minZ = getMinZoom();
    const clamped = Math.max(minZ, Math.min(6, newZoom));
    const newPPS = BASE_PX_PER_SEC * clamped;
    // Keep playhead at same visual offset within the container
    const playheadViewX = currentTime * pxPerSec - el.scrollLeft;
    setZoom(clamped);
    requestAnimationFrame(() => {
      el.scrollLeft = currentTime * newPPS - playheadViewX;
    });
  };

  // Keep refs fresh for the wheel handler (avoids stale closure)
  const zoomRef = useRef(zoom);
  const currentTimeRef = useRef(currentTime);
  const pxPerSecRef = useRef(pxPerSec);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);

  // Zoom with Ctrl+scroll / trackpad pinch -- zooms toward playhead
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // deltaY from trackpad pinch is small (~1-5), mouse wheel is larger (~100)
        // Use a smooth exponential factor based on actual deltaY magnitude
        const sensitivity = 0.008;
        const factor = Math.exp(-e.deltaY * sensitivity);
        const curZoom = zoomRef.current;
        const minZ = getMinZoom();
        const newZoom = Math.max(minZ, Math.min(6, curZoom * factor));
        const newPPS = BASE_PX_PER_SEC * newZoom;
        const playheadViewX = currentTimeRef.current * pxPerSecRef.current - el.scrollLeft;
        setZoom(newZoom);
        requestAnimationFrame(() => {
          el.scrollLeft = currentTimeRef.current * newPPS - playheadViewX;
        });
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Undo
  const pushUndo = () => { setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]); setRedoStack([]); };
  const undo = () => { if (!undoStack.length) return; setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]); setAnalysis(undoStack[undoStack.length - 1]); setUndoStack(prev => prev.slice(0, -1)); };
  const redo = () => { if (!redoStack.length) return; setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(analysis))]); setAnalysis(redoStack[redoStack.length - 1]); setRedoStack(prev => prev.slice(0, -1)); };

  // Hard boundaries for clip overlap prevention
  const getClipBounds = (clipIdx) => {
    let minStart = 0, maxEnd = duration;
    const clip = clips[clipIdx];
    for (let i = 0; i < clips.length; i++) {
      if (i === clipIdx) continue;
      if (clips[i].end <= clip.start + 0.01 && clips[i].end > minStart) minStart = clips[i].end;
      if (clips[i].start >= clip.end - 0.01 && clips[i].start < maxEnd) maxEnd = clips[i].start;
    }
    return { minStart, maxEnd };
  };

  // Trim handle mouse down
  const handleTrimDown = (e, clipIdx, edge) => {
    e.preventDefault();
    e.stopPropagation();
    const clip = clips[clipIdx];
    const bounds = getClipBounds(clipIdx);
    setDragging({ type: "trim", clipIdx, edge, startX: e.clientX, origStart: clip.start, origEnd: clip.end, bounds });
    pushUndo();
    setSelectedClip(clipIdx);
    setSelectedSection(clip.sectionIdx);
  };

  // Convert mouse event to time position on the timeline
  const mouseToTime = (e) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const scrollEl = timelineRef.current;
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(x / pxPerSec, duration));
  };

  // Playhead drag
  const handlePlayheadDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ type: "playhead" });
  };

  // Unified drag handler
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (dragging.type === "playhead") {
        const t = mouseToTime(e);
        const ws = wsRef.current;
        if (ws && duration > 0) ws.seekTo(t / duration);
        return;
      }
      // Trim drag
      const dx = e.clientX - dragging.startX;
      const dt = dx / pxPerSec;
      const next = JSON.parse(JSON.stringify(analysis));
      const clip = clips[dragging.clipIdx];
      const sm = next.section_mappings[clip.sectionIdx];
      const take = sm.takes.find(t => t.take_number === clip.take_number && t.is_selected);
      if (!take) return;
      const { minStart, maxEnd } = dragging.bounds;

      if (dragging.edge === "left") {
        let v = dragging.origStart + dt;
        if (snap) {
          for (let i = 0; i < clips.length; i++) {
            if (i === dragging.clipIdx) continue;
            if (Math.abs((v - clips[i].end) * pxPerSec) < SNAP_PX) { v = clips[i].end; break; }
            if (Math.abs((v - clips[i].start) * pxPerSec) < SNAP_PX) { v = clips[i].start; break; }
          }
        }
        take.start = parseFloat(Math.max(minStart, Math.min(v, take.end - 0.05)).toFixed(3));
      } else {
        let v = dragging.origEnd + dt;
        if (snap) {
          for (let i = 0; i < clips.length; i++) {
            if (i === dragging.clipIdx) continue;
            if (Math.abs((v - clips[i].start) * pxPerSec) < SNAP_PX) { v = clips[i].start; break; }
            if (Math.abs((v - clips[i].end) * pxPerSec) < SNAP_PX) { v = clips[i].end; break; }
          }
        }
        take.end = parseFloat(Math.min(maxEnd, Math.max(v, take.start + 0.05)).toFixed(3));
      }
      setAnalysis(next);
    };
    const onUp = () => {
      setDragging(null);
      // After drag ends, ensure playhead is visible
      const el = timelineRef.current;
      if (el) {
        const px = currentTimeRef.current * pxPerSecRef.current;
        const vl = el.scrollLeft;
        const vr = vl + el.clientWidth;
        if (px < vl || px > vr) el.scrollLeft = px - el.clientWidth / 2;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, clips, snap, analysis, pxPerSec, duration]);

  // Split / Delete / Toggle
  const splitAtCursor = () => {
    if (selectedClip == null) return;
    const clip = clips[selectedClip];
    if (currentTime <= clip.start + 0.05 || currentTime >= clip.end - 0.05) return;
    pushUndo();
    const next = JSON.parse(JSON.stringify(analysis));
    const sm = next.section_mappings[clip.sectionIdx];
    const take = sm.takes.find(t => t.take_number === clip.take_number && t.is_selected);
    if (!take) return;
    const st = parseFloat(currentTime.toFixed(3));
    sm.takes.push({ ...JSON.parse(JSON.stringify(take)), take_number: sm.takes.length + 1, start: st, is_selected: true });
    take.end = st;
    setAnalysis(next);
  };

  const deleteClip = () => {
    if (selectedClip == null) return;
    pushUndo();
    const clip = clips[selectedClip];
    const next = JSON.parse(JSON.stringify(analysis));
    const sm = next.section_mappings[clip.sectionIdx];
    const take = sm.takes.find(t => t.take_number === clip.take_number && t.is_selected);
    if (take) take.is_selected = false;
    setSelectedClip(null);
    setAnalysis(next);
  };

  // Keep shortcut refs in sync
  splitRef.current = splitAtCursor;
  deleteRef.current = deleteClip;
  undoRef.current = undo;
  redoRef.current = redo;

  const toggleTake = (sectionIdx, takeNum) => {
    pushUndo();
    const next = JSON.parse(JSON.stringify(analysis));
    next.section_mappings[sectionIdx].takes.forEach(t => { t.is_selected = t.take_number === takeNum; });
    setAnalysis(next);
  };

  const playPause = () => { const ws = wsRef.current; if (ws) ws.isPlaying() ? ws.pause() : ws.play(); };

  const playResult = () => {
    const ws = wsRef.current;
    if (!ws || keepRegions.length === 0) return;
    if (previewPlaying) { ws.pause(); setPreviewPlaying(false); clearInterval(playIntervalRef.current); return; }
    let idx = 0;
    setPreviewPlaying(true);
    const playNext = () => {
      if (idx >= keepRegions.length) { ws.pause(); setPreviewPlaying(false); return; }
      const r = keepRegions[idx];
      ws.seekTo(r.start / ws.getDuration());
      ws.play();
      playIntervalRef.current = setInterval(() => {
        if (ws.getCurrentTime() >= r.end - 0.03) {
          clearInterval(playIntervalRef.current);
          ws.pause();
          idx++;
          setTimeout(playNext, 20);
        }
      }, 30);
    };
    playNext();
  };

  useEffect(() => () => clearInterval(playIntervalRef.current), []);

  // Click on timeline to seek (only if not clicking a clip or handle)
  const seekOnClick = (e) => {
    const ws = wsRef.current;
    if (!ws || dragging) return;
    const t = mouseToTime(e);
    if (t >= 0 && t <= duration && duration > 0) ws.seekTo(t / duration);
  };

  const totalWidth = duration > 0 ? duration * pxPerSec : 200;

  // Ruler interval based on zoom
  const rulerInterval = zoom >= 3 ? 1 : zoom >= 1.5 ? 2 : 5;
  const rulerCount = Math.ceil(duration / rulerInterval) + 1;

  return (
    <div>
      {/* Transport bar */}
      <div className="card" style={{ marginBottom: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={playPause} className="btn btn-primary btn-sm"
            style={{ borderRadius: "var(--radius-full)", width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <span style={{ fontSize: 12, fontFamily: "var(--fm)", color: "var(--text-secondary)", minWidth: 90 }}>{formatTs(currentTime)} / {formatTs(duration)}</span>
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
          <button onClick={playResult} className={`btn btn-sm ${previewPlaying ? "btn-success" : "btn-ghost"}`}
            style={{ fontSize: 11, gap: 4, display: "flex", alignItems: "center" }}>
            {previewPlaying ? "⏸ Stop" : "▶ Play Result"}
          </button>
          {previewPlaying && <span style={{ fontSize: 10, color: "var(--green-light)", fontWeight: 600 }}>Playing final...</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={splitAtCursor} disabled={selectedClip == null} className="btn btn-ghost btn-xs">✂ Split</button>
          <button onClick={deleteClip} disabled={selectedClip == null} className="btn btn-ghost btn-xs" style={{ color: "var(--red-light)" }}>✕ Delete</button>
          <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: snap ? "var(--accent-light)" : "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Snap
          </label>
          <button onClick={undo} disabled={!undoStack.length} className="btn btn-ghost btn-xs">Undo</button>
          <button onClick={redo} disabled={!redoStack.length} className="btn btn-ghost btn-xs">Redo</button>
          <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
          {/* Zoom slider */}
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Zoom</span>
          <input type="range" min={getMinZoom()} max="6" step="0.1" value={zoom}
            onChange={e => applyZoom(parseFloat(e.target.value))}
            style={{ width: 70, accentColor: "var(--accent)" }} />
          <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--fm)", minWidth: 24 }}>{zoom.toFixed(1)}x</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{ marginBottom: 12, padding: "8px 0", background: "#0a0a0a" }}>
        <div ref={timelineRef} onClick={seekOnClick}
          style={{ overflowX: "auto", position: "relative", cursor: "crosshair", padding: "0 12px" }}>
          <div ref={trackRef} style={{ width: totalWidth, height: RULER_H + CLIP_H + 8, position: "relative" }}>

            {/* Ruler */}
            <div style={{ height: RULER_H, position: "relative", borderBottom: "1px solid #222" }}>
              {duration > 0 && Array.from({ length: rulerCount }, (_, i) => {
                const sec = i * rulerInterval;
                if (sec > duration) return null;
                const isMajor = sec % 5 === 0 || rulerInterval <= 2;
                return (
                  <React.Fragment key={i}>
                    <div style={{ position: "absolute", left: sec * pxPerSec, top: isMajor ? 2 : 12, width: 1, height: isMajor ? RULER_H - 2 : 6, background: isMajor ? "#444" : "#2a2a2a" }} />
                    {isMajor && <span style={{ position: "absolute", left: sec * pxPerSec + 3, top: 3, fontSize: 9, color: "#555", fontFamily: "var(--fm)", userSelect: "none" }}>
                      {Math.floor(sec / 60)}:{(sec % 60).toString().padStart(2, "0")}
                    </span>}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Track area */}
            <div style={{ position: "relative", height: CLIP_H + 4, marginTop: 4 }}>
              {/* Full waveform background (entire audio) */}
              <canvas ref={waveCanvasRef} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} />

              {/* Clip borders + handles (rendered on top of waveform) */}
              {clips.map((clip, ci) => {
                const color = COLORS[clip.sectionIdx % COLORS.length];
                const isSel = selectedClip === ci;
                const left = clip.start * pxPerSec;
                const w = Math.max((clip.end - clip.start) * pxPerSec, 6);
                return (
                  <div key={`clip_${ci}_${clip.take_number}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedClip(ci); setSelectedSection(clip.sectionIdx); }}
                    style={{
                      position: "absolute", left, width: w, top: 0, height: CLIP_H,
                      border: `2px solid ${isSel ? "#fff" : color + "88"}`,
                      borderRadius: 4, cursor: "pointer",
                      boxShadow: isSel ? `0 0 0 1px ${color}, 0 0 12px ${color}44` : "none",
                      transition: "box-shadow 0.15s, border-color 0.15s",
                    }}>
                    {/* Left trim handle */}
                    <div onMouseDown={(e) => handleTrimDown(e, ci, "left")}
                      style={{ position: "absolute", left: -1, top: 0, bottom: 0, width: HANDLE_W, cursor: "ew-resize",
                        background: `linear-gradient(90deg, ${color}dd, transparent)`, borderRadius: "4px 0 0 4px", zIndex: 2 }}>
                      <div style={{ position: "absolute", left: 3, top: "50%", transform: "translateY(-50%)", width: 2, height: 18, background: "#fff", borderRadius: 1, opacity: 0.7 }} />
                    </div>
                    {/* Right trim handle */}
                    <div onMouseDown={(e) => handleTrimDown(e, ci, "right")}
                      style={{ position: "absolute", right: -1, top: 0, bottom: 0, width: HANDLE_W, cursor: "ew-resize",
                        background: `linear-gradient(270deg, ${color}dd, transparent)`, borderRadius: "0 4px 4px 0", zIndex: 2 }}>
                      <div style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", width: 2, height: 18, background: "#fff", borderRadius: 1, opacity: 0.7 }} />
                    </div>
                    {/* Label */}
                    {w > 40 && <div style={{ position: "absolute", left: HANDLE_W + 2, top: 3, zIndex: 3, pointerEvents: "none" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px #000", lineHeight: 1 }}>{clip.sectionLabel}</div>
                      <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", fontFamily: "var(--fm)", marginTop: 1 }}>{formatTs(clip.start)} - {formatTs(clip.end)}</div>
                    </div>}
                  </div>
                );
              })}

              {/* Playhead (draggable) */}
              <div onMouseDown={handlePlayheadDown} onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", left: currentTime * pxPerSec - 8, top: -RULER_H - 4,
                  width: 16, height: RULER_H + CLIP_H + 8,
                  cursor: "ew-resize", zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center",
                }}>
                {/* Head */}
                <div style={{ width: 12, height: 12, background: previewPlaying ? "#10b981" : "#fff", borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 6px rgba(0,0,0,0.5)" }} />
                {/* Line */}
                <div style={{ width: 2, flex: 1, background: previewPlaying ? "#10b981" : "#fff" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, padding: "6px 16px 0", fontSize: 9, color: "#444" }}>
          <span>Space = play/pause</span>
          <span>C = split</span>
          <span>X = delete</span>
          <span>Cmd/Ctrl+Z = undo</span>
          <span>Cmd/Ctrl+Shift+Z = redo</span>
          <span>Pinch/Ctrl+Scroll = zoom</span>
        </div>
      </div>

      {/* Section sidebar + take picker */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{sm.section_label || sections[i]?.label || `Section ${i + 1}`}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); const ws = wsRef.current; if (ws && sel) { ws.seekTo(sel.start / ws.getDuration()); ws.play(); } }}
                    className="btn btn-ghost btn-xs" style={{ fontSize: 11, padding: "2px 6px" }}>▶</button>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, marginLeft: 14 }}>
                  {sm.takes?.length || 0} takes{sel ? ` -- using #${sel.take_number}` : ""}
                </div>
              </div>
            );
          })}
        </div>

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
      // Build ordered segments from ALL selected takes, sorted by start time (left to right)
      const selectedSegments = [];
      for (const sm of analysis.section_mappings) {
        for (const take of (sm.takes || [])) {
          if (take.is_selected) {
            selectedSegments.push({ start: take.start, end: take.end, sectionId: sm.section_id });
          }
        }
      }
      selectedSegments.sort((a, b) => a.start - b.start);

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
        // Remove fillers, pauses, and off-script segments within this segment
        const fillers = (analysis.filler_words || []).filter(f => f.removed !== false && f.start >= start && f.end <= end);
        const pauses = (analysis.pauses || []).filter(p => p.removed !== false && p.start >= start && p.end <= end);
        const offScript = (analysis.off_script_segments || []).filter(s => s.start >= start && s.end <= end);
        const removals = [...fillers, ...pauses, ...offScript].sort((a, b) => a.start - b.start);

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

      // Trim silence/breaths from each segment edges
      setProgress("Trimming silence and breaths...");
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;
      const rawAudio = audioBuffer.getChannelData(0);
      const SILENCE_THRESHOLD = 0.015; // amplitude below this = silence
      const MIN_SILENCE_MS = 80; // trim silence longer than 80ms from edges
      const minSilenceSamples = Math.floor((MIN_SILENCE_MS / 1000) * sampleRate);

      // Trim leading and trailing silence from each cut segment
      for (let i = 0; i < cutSegments.length; i++) {
        const seg = cutSegments[i];
        let startSamp = Math.floor(seg.start * sampleRate);
        let endSamp = Math.floor(seg.end * sampleRate);

        // Trim leading silence/breaths
        let trimStart = startSamp;
        while (trimStart < endSamp - minSilenceSamples && Math.abs(rawAudio[trimStart] || 0) < SILENCE_THRESHOLD) trimStart++;
        // Step back a tiny bit to avoid cutting into speech onset
        trimStart = Math.max(startSamp, trimStart - Math.floor(sampleRate * 0.01));

        // Trim trailing silence/breaths
        let trimEnd = endSamp;
        while (trimEnd > trimStart + minSilenceSamples && Math.abs(rawAudio[trimEnd - 1] || 0) < SILENCE_THRESHOLD) trimEnd--;
        trimEnd = Math.min(endSamp, trimEnd + Math.floor(sampleRate * 0.01));

        seg.start = trimStart / sampleRate;
        seg.end = trimEnd / sampleRate;
      }

      // Remove any segments that became too short after trimming
      const trimmedSegments = cutSegments.filter(s => s.end - s.start > 0.03);
      totalDuration = trimmedSegments.reduce((sum, s) => sum + (s.end - s.start), 0);

      const outputBuffer = audioCtx.createBuffer(channels, Math.ceil(totalDuration * sampleRate), sampleRate);

      let writeOffset = 0;
      for (const cut of trimmedSegments) {
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
          settings: { ...settings, segments: trimmedSegments.length, duration: totalDuration },
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
