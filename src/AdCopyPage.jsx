import { useState, useRef } from "react";
import { getApiKey, getSelectedModel } from "./apiKeys.js";

const ARABIC_LANG_RULE = `
CRITICAL LANGUAGE RULE: Detect the language of the ad script.
- If the script is in Arabic, ALL generated copy MUST be in Saudi-dialect Arabic (اللهجة السعودية). Use natural Saudi expressions, slang, and phrasing that resonates with Saudi audiences. Do NOT use formal/MSA Arabic or Egyptian dialect.
- If the script is in English, generate in English.
- Match the exact language of the input script.`;

const JSON_INSTRUCTION = `
IMPORTANT: You MUST respond with ONLY valid JSON, no markdown, no code fences, no explanation.
The JSON must have exactly this structure:
{"primaryTexts": ["text1", "text2", ...], "headlines": ["headline1", "headline2", ...]}
Do NOT wrap in \`\`\`json or any other formatting. Just raw JSON.`;

const DEFAULT_PRESETS = [
  {
    id: "clickbait",
    name: "Clickbait One-Liners",
    description: "Short, punchy, curiosity-driven copy that stops the scroll",
    prompt: `You are an expert direct-response copywriter. Given the ad script below, generate ad copy variations.
${ARABIC_LANG_RULE}

Rules:
- Primary texts should be 1-2 short sentences max, curiosity-driven, scroll-stopping
- Use open loops, shock value, controversy, or bold claims
- Headlines should be punchy, 3-8 words, use power words
- Match the tone and angle of the script
- Do NOT use generic filler or clichés

Generate exactly 20 primary texts and 20 headlines.
${JSON_INSTRUCTION}`,
  },
  {
    id: "mini-lead",
    name: "Mini Lead / Story",
    description: "Longer form copy that reads like a mini advertorial or story lead",
    prompt: `You are an expert direct-response copywriter. Given the ad script below, generate ad copy variations.
${ARABIC_LANG_RULE}

Rules:
- Primary texts should be 3-5 sentences, storytelling style, mini-lead format
- Open with a hook, build curiosity, end with a soft CTA or open loop
- Use conversational tone, as if telling a friend
- Headlines should complement the story angle, 4-10 words
- Match the emotional triggers and avatar from the script

Generate exactly 20 primary texts and 20 headlines.
${JSON_INSTRUCTION}`,
  },
  {
    id: "benefit",
    name: "Benefit-Driven",
    description: "Focus on outcomes, transformations, and what the viewer gets",
    prompt: `You are an expert direct-response copywriter. Given the ad script below, generate ad copy variations.
${ARABIC_LANG_RULE}

Rules:
- Primary texts should lead with the #1 benefit or transformation
- 2-3 sentences, outcome-focused, paint the after picture
- Use specific numbers, timeframes, or results where possible
- Headlines should be benefit-first, clear and direct
- No fluff, every word earns its place

Generate exactly 20 primary texts and 20 headlines.
${JSON_INSTRUCTION}`,
  },
];

const CUSTOM_PRESETS_KEY = "al_adcopy_custom_presets";

function loadCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]");
  } catch { return []; }
}

function saveCustomPresets(presets) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

export default function AdCopyPage({ ads }) {
  const [script, setScript] = useState("");
  const [selectedAd, setSelectedAd] = useState("");
  const [preset, setPreset] = useState("clickbait");
  const [customPresets, setCustomPresets] = useState(loadCustomPresets);
  const [results, setResults] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [editingPreset, setEditingPreset] = useState(null);
  const [newPreset, setNewPreset] = useState({ name: "", description: "", prompt: "" });
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const abortRef = useRef(null);

  const allPresets = [...DEFAULT_PRESETS, ...customPresets];
  const activePreset = allPresets.find(p => p.id === preset) || allPresets[0];

  const handleAdSelect = (adId) => {
    setSelectedAd(adId);
    const ad = ads.find(a => a.id === adId);
    if (ad?.brief) setScript(ad.brief);
  };

  const generate = async () => {
    if (!script.trim()) { setError("Paste or type an ad script first"); return; }

    const geminiKey = getApiKey("gemini");
    const claudeKey = getApiKey("claude");
    if (!geminiKey && !claudeKey) { setError("Configure an AI API key in Settings (Gemini or Claude)"); return; }

    setGenerating(true);
    setError(null);
    setResults(null);

    const fullPrompt = `${activePreset.prompt}\n\nAD SCRIPT:\n${script.trim()}`;
    const useGemini = !!geminiKey;
    const aiModel = useGemini ? getSelectedModel("gemini") : getSelectedModel("claude");
    setError(null);

    try {
      let rawText = "";

      if (useGemini) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 8192, responseMimeType: "application/json" },
            }),
          }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Gemini API error (${res.status}): ${errData?.error?.message || res.statusText}`);
        }
        const data = await res.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!rawText && data?.candidates?.[0]?.finishReason) {
          throw new Error(`Gemini stopped: ${data.candidates[0].finishReason}. Try a shorter script.`);
        }
      } else {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": claudeKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: aiModel,
            max_tokens: 8192,
            messages: [{ role: "user", content: fullPrompt }],
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Claude API error (${res.status}): ${errData?.error?.message || res.statusText}`);
        }
        const data = await res.json();
        rawText = data?.content?.[0]?.text || "";
      }

      if (!rawText.trim()) throw new Error("AI returned empty response. Try again.");

      // Parse JSON -- strip markdown fences if present
      let jsonStr = rawText.trim();
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[AdCopy] Raw AI response:", rawText);
        throw new Error("AI didn't return valid JSON. Check console for raw response.");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.primaryTexts?.length || !parsed.headlines?.length) {
        throw new Error("AI response missing primaryTexts or headlines arrays");
      }

      setResults({
        primaryTexts: parsed.primaryTexts,
        headlines: parsed.headlines,
        preset: activePreset.name,
        model: aiModel,
        ts: new Date().toLocaleString(),
      });
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  const copyToClipboard = (text, idx, type) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(`${type}-${idx}`);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const copyAll = (items, type) => {
    navigator.clipboard.writeText(items.join("\n\n"));
    setCopiedIdx(`all-${type}`);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const savePreset = () => {
    if (!newPreset.name.trim() || !newPreset.prompt.trim()) return;
    const id = "custom_" + Date.now();
    const updated = editingPreset
      ? customPresets.map(p => p.id === editingPreset ? { ...p, ...newPreset } : p)
      : [...customPresets, { id, ...newPreset }];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setNewPreset({ name: "", description: "", prompt: "" });
    setEditingPreset(null);
    setShowPresetEditor(false);
    if (!editingPreset) setPreset(id);
  };

  const deletePreset = (id) => {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    if (preset === id) setPreset("clickbait");
  };

  const sectionS = { background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "16px 18px", marginBottom: 16 };
  const labelS = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-tertiary)", marginBottom: 8 };

  return (
    <div className="animate-fade" style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Ad Text Generator</h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 20px" }}>Upload your ad script, pick a preset, and generate primary texts + headlines</p>

      {/* Script input */}
      <div style={sectionS}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={labelS}>Ad Script</div>
          {ads?.length > 0 && (
            <select value={selectedAd} onChange={e => handleAdSelect(e.target.value)} className="input" style={{ width: "auto", fontSize: 11, padding: "4px 8px" }}>
              <option value="">Load from ad...</option>
              {ads.filter(a => a.stage !== "killed").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={8}
          className="input"
          placeholder="Paste your VSL script, ad script, or key talking points here..."
          style={{ fontSize: 13, lineHeight: 1.6, resize: "vertical" }}
        />
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{script.trim().split(/\s+/).filter(Boolean).length} words</div>
      </div>

      {/* Preset selector */}
      <div style={sectionS}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={labelS}>Preset</div>
          <button onClick={() => { setShowPresetEditor(true); setEditingPreset(null); setNewPreset({ name: "", description: "", prompt: "" }); }} className="btn btn-ghost btn-xs">+ New Preset</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {allPresets.map(p => (
            <div
              key={p.id}
              onClick={() => setPreset(p.id)}
              style={{
                padding: "10px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                border: preset === p.id ? "1.5px solid var(--accent)" : "1px solid var(--border-light)",
                background: preset === p.id ? "var(--accent-bg)" : "var(--bg-card)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: preset === p.id ? "var(--accent)" : "var(--text-primary)", marginBottom: 3 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{p.description}</div>
              {p.id.startsWith("custom_") && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button onClick={e => { e.stopPropagation(); setEditingPreset(p.id); setNewPreset({ name: p.name, description: p.description, prompt: p.prompt }); setShowPresetEditor(true); }} className="btn btn-ghost btn-xs" style={{ fontSize: 10 }}>Edit</button>
                  <button onClick={e => { e.stopPropagation(); deletePreset(p.id); }} className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: "var(--red)" }}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Preset editor modal */}
      {showPresetEditor && (
        <div style={sectionS}>
          <div style={labelS}>{editingPreset ? "Edit Preset" : "New Preset"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={newPreset.name} onChange={e => setNewPreset(p => ({ ...p, name: e.target.value }))} className="input" placeholder="Preset name..." style={{ fontSize: 13 }} />
            <input value={newPreset.description} onChange={e => setNewPreset(p => ({ ...p, description: e.target.value }))} className="input" placeholder="Short description..." style={{ fontSize: 12 }} />
            <textarea value={newPreset.prompt} onChange={e => setNewPreset(p => ({ ...p, prompt: e.target.value }))} rows={8} className="input" placeholder="AI prompt... Use {script} as placeholder for the ad script, or it will be appended automatically." style={{ fontSize: 12, lineHeight: 1.5, fontFamily: "var(--fm)" }} />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowPresetEditor(false); setEditingPreset(null); }} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={savePreset} disabled={!newPreset.name.trim() || !newPreset.prompt.trim()} className="btn btn-primary btn-sm">
                {editingPreset ? "Update" : "Save Preset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={generate} disabled={generating || !script.trim()} className="btn btn-primary" style={{ padding: "10px 28px", fontSize: 14 }}>
          {generating ? "Generating..." : `Generate with "${activePreset.name}"`}
        </button>
        {error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>}
      </div>

      {/* Results */}
      {results && (
        <div className="animate-fade">
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
            Generated with <span style={{ color: "var(--accent)", fontWeight: 500 }}>{results.preset}</span> · {results.model} · {results.ts}
          </div>

          {/* Primary Texts */}
          <div style={sectionS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={labelS}>Primary Texts ({results.primaryTexts.length})</div>
              <button onClick={() => copyAll(results.primaryTexts, "pt")} className="btn btn-ghost btn-xs">
                {copiedIdx === "all-pt" ? "Copied!" : "Copy All"}
              </button>
            </div>
            {results.primaryTexts.map((text, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: i < results.primaryTexts.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)", width: 20, flexShrink: 0, paddingTop: 2 }}>{i + 1}</span>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{text}</div>
                <button onClick={() => copyToClipboard(text, i, "pt")} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 10 }}>
                  {copiedIdx === `pt-${i}` ? "✓" : "Copy"}
                </button>
              </div>
            ))}
          </div>

          {/* Headlines */}
          <div style={sectionS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={labelS}>Headlines ({results.headlines.length})</div>
              <button onClick={() => copyAll(results.headlines, "hl")} className="btn btn-ghost btn-xs">
                {copiedIdx === "all-hl" ? "Copied!" : "Copy All"}
              </button>
            </div>
            {results.headlines.map((text, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: i < results.headlines.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)", width: 20, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{text}</div>
                <button onClick={() => copyToClipboard(text, i, "hl")} className="btn btn-ghost btn-xs" style={{ flexShrink: 0, fontSize: 10 }}>
                  {copiedIdx === `hl-${i}` ? "✓" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
