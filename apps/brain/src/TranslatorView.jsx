import { useState, useRef, useEffect, useCallback } from "react";
import { fetchTranslationMemory, addTranslationMemory, clearTranslationMemory, fetchTranslationHistory, saveTranslation } from "./brainData";

const SECTION_TYPES = [
  { id: "hook", label: "Hook", color: "#ef4444" },
  { id: "lead", label: "Lead", color: "#f59e0b" },
  { id: "body", label: "Body", color: "#6366f1" },
  { id: "proof", label: "Proof", color: "#10b981" },
  { id: "offer", label: "Offer", color: "#0ea5e9" },
  { id: "cta", label: "CTA", color: "#8b5cf6" },
  { id: "other", label: "Other", color: "#6b7280" },
];

function splitIntoSections(text) {
  if (!text.trim()) return [];
  return text.split(/\n\s*\n/).filter(s => s.trim()).map((text, i) => ({
    id: crypto.randomUUID(),
    index: i,
    english: text.trim(),
    arabic: "",
    approved: false,
    type: i === 0 ? "hook" : "other",
    editing: false,
  }));
}

export default function TranslatorView({ apiKey, workspaceId, onOpenSettings }) {
  const [scriptTitle, setScriptTitle] = useState("");
  const [inputText, setInputText] = useState("");
  const [sections, setSections] = useState([]);
  const [translating, setTranslating] = useState(null);
  const [allTranslating, setAllTranslating] = useState(false);
  const [memory, setMemory] = useState([]);
  const [showMemory, setShowMemory] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    fetchTranslationMemory(workspaceId).then(setMemory).catch(() => {});
    fetchTranslationHistory(workspaceId).then(setHistory).catch(() => {});
  }, [workspaceId]);

  const saveMemoryEntries = async (newEntries) => {
    if (!workspaceId) return;
    setMemory(prev => [...prev, ...newEntries]);
    await addTranslationMemory(workspaceId, newEntries).catch(() => {});
  };

  const handleImport = () => {
    if (!inputText.trim()) return;
    setSections(splitIntoSections(inputText));
    if (!scriptTitle) setScriptTitle("Script " + new Date().toLocaleDateString());
  };

  const translateSection = async (sectionId) => {
    if (!apiKey) { onOpenSettings(); return; }
    setTranslating(sectionId);
    const section = sections.find(s => s.id === sectionId);
    if (!section) { setTranslating(null); return; }

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: section.english,
          sectionType: section.type,
          memory: memory.slice(-50),
          apiKey,
        }),
      });
      const data = await res.json();
      if (data.translation) {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, arabic: data.translation } : s));
      }
    } catch (e) {
      console.error("Translation error:", e);
    }
    setTranslating(null);
  };

  const translateAll = async () => {
    if (!apiKey) { onOpenSettings(); return; }
    setAllTranslating(true);
    for (const section of sections) {
      if (section.approved || section.arabic) continue;
      setTranslating(section.id);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: section.english,
            sectionType: section.type,
            memory: memory.slice(-50),
            apiKey,
          }),
        });
        const data = await res.json();
        if (data.translation) {
          setSections(prev => prev.map(s => s.id === section.id ? { ...s, arabic: data.translation } : s));
        }
      } catch (e) { console.error("Translation error:", e); }
    }
    setTranslating(null);
    setAllTranslating(false);
  };

  const approveSection = (sectionId) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.arabic) return;

    const aiOriginal = section._aiOriginal || section.arabic;
    const userEdited = section.arabic;
    const wasEdited = aiOriginal !== userEdited;

    if (wasEdited) {
      const newEntry = {
        english: section.english,
        aiTranslation: aiOriginal,
        approvedTranslation: userEdited,
        sectionType: section.type,
      };
      saveMemoryEntries([newEntry]);
    }

    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, approved: true } : s));
  };

  const approveAll = () => {
    const corrections = [];
    sections.forEach(s => {
      if (!s.arabic || s.approved) return;
      const aiOriginal = s._aiOriginal || s.arabic;
      if (aiOriginal !== s.arabic) {
        corrections.push({
          english: s.english,
          aiTranslation: aiOriginal,
          approvedTranslation: s.arabic,
          sectionType: s.type,
        });
      }
    });
    if (corrections.length > 0) saveMemoryEntries(corrections);
    setSections(prev => prev.map(s => s.arabic ? { ...s, approved: true } : s));
  };

  const updateArabic = (sectionId, text) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const aiOriginal = s._aiOriginal || s.arabic;
      return { ...s, arabic: text, _aiOriginal: aiOriginal };
    }));
  };

  const saveToHistory = async () => {
    if (!workspaceId) return;
    const entry = {
      title: scriptTitle || "Untitled",
      sections: sections.map(s => ({ english: s.english, arabic: s.arabic, type: s.type })),
    };
    await saveTranslation(workspaceId, entry).catch(() => {});
    const updated = await fetchTranslationHistory(workspaceId).catch(() => []);
    setHistory(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const loadFromHistory = (entry) => {
    setScriptTitle(entry.title);
    setSections(entry.sections.map((s, i) => ({
      id: crypto.randomUUID(), index: i, english: s.english, arabic: s.arabic,
      approved: true, type: s.type, editing: false,
    })));
    setShowHistory(false);
  };

  const exportArabic = () => {
    const text = sections.map(s => s.arabic).filter(Boolean).join("\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scriptTitle || "translation"}_arabic.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allApproved = sections.length > 0 && sections.every(s => s.approved);
  const allTranslated = sections.length > 0 && sections.every(s => s.arabic);
  const approvedCount = sections.filter(s => s.approved).length;

  const cardBg = "rgba(255,255,255,0.025)";
  const border = "1px solid rgba(255,255,255,0.06)";

  // Import view
  if (sections.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", padding: 24, overflow: "auto" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, letterSpacing: "-0.03em" }}>
            Script Translator
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 24 }}>
            Translate English VSL/ad scripts into Saudi Najdi Arabic. The AI learns from your corrections over time.
          </p>

          {/* History button */}
          {history.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)}
              style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 10, background: cardBg, border, color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              📄 Previous translations ({history.length})
            </button>
          )}

          {showHistory && (
            <div style={{ marginBottom: 20, background: cardBg, border, borderRadius: 14, padding: 14, maxHeight: 240, overflowY: "auto" }}>
              {history.map(h => (
                <div key={h.id} onClick={() => loadFromHistory(h)}
                  style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{h.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{new Date(h.timestamp).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          <input
            value={scriptTitle}
            onChange={e => setScriptTitle(e.target.value)}
            placeholder="Script title (optional)"
            style={{ width: "100%", padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: cardBg, border, color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
          />

          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste your English script here...&#10;&#10;Separate sections with blank lines (double enter).&#10;Each section will be translated individually."
            rows={16}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: cardBg, border, color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font)", lineHeight: 1.6, outline: "none", resize: "vertical" }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={handleImport} disabled={!inputText.trim()}
              style={{ padding: "10px 24px", borderRadius: 10, background: inputText.trim() ? "var(--accent)" : "rgba(255,255,255,0.05)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: inputText.trim() ? "pointer" : "default", opacity: inputText.trim() ? 1 : 0.4, fontFamily: "var(--font)" }}>
              Import & Split Sections
            </button>
            {memory.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-dim)", alignSelf: "center" }}>
                {memory.length} corrections in memory
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Translation view
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: border, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSections([])} style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 13, cursor: "pointer", padding: "4px 8px" }}>← Back</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{scriptTitle || "Translation"}</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 6 }}>
            {approvedCount}/{sections.length} approved
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!allTranslated && (
            <button onClick={translateAll} disabled={allTranslating}
              style={{ padding: "7px 16px", borderRadius: 8, background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: allTranslating ? "wait" : "pointer", opacity: allTranslating ? 0.6 : 1, fontFamily: "var(--font)" }}>
              {allTranslating ? "Translating..." : "Translate All"}
            </button>
          )}
          {allTranslated && !allApproved && (
            <button onClick={approveAll}
              style={{ padding: "7px 16px", borderRadius: 8, background: "#10b981", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
              Approve All
            </button>
          )}
          <button onClick={saveToHistory}
            style={{ padding: "7px 16px", borderRadius: 8, background: cardBg, border, color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)" }}>
            {saved ? "✓ Saved" : "Save"}
          </button>
          {allApproved && (
            <button onClick={exportArabic}
              style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
              Export Arabic
            </button>
          )}
          <button onClick={() => setShowMemory(!showMemory)}
            style={{ padding: "7px 12px", borderRadius: 8, background: cardBg, border, color: "var(--text-dim)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font)" }}>
              🧠 {memory.length}
          </button>
        </div>
      </div>

      {/* Memory panel */}
      {showMemory && (
        <div style={{ padding: "12px 20px", borderBottom: border, background: "rgba(99,102,241,0.03)", maxHeight: 200, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Translation Memory ({memory.length} corrections)</span>
            {memory.length > 0 && (
              <button onClick={async () => { if (workspaceId) { await clearTranslationMemory(workspaceId); setMemory([]); } }} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 11, cursor: "pointer" }}>Clear all</button>
            )}
          </div>
          {memory.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-dim)" }}>No corrections yet. Approve translations after editing to teach the AI.</p>
          ) : (
            memory.slice(-10).reverse().map(m => (
              <div key={m.id} style={{ fontSize: 11, padding: "6px 8px", marginBottom: 4, borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
                <div style={{ color: "var(--text-dim)" }}>EN: {m.english.slice(0, 80)}...</div>
                <div style={{ color: "#ef4444" }}>AI: {m.aiTranslation.slice(0, 80)}...</div>
                <div style={{ color: "#10b981" }}>✓: {m.approvedTranslation.slice(0, 80)}...</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Side-by-side sections */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12, padding: "0 8px" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>English (Original)</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", direction: "rtl" }}>Arabic (Translation)</span>
        </div>

        {sections.map((section, i) => {
          const sType = SECTION_TYPES.find(t => t.id === section.type) || SECTION_TYPES[6];
          const isTranslating = translating === section.id;
          return (
            <div key={section.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
              {/* English side */}
              <div style={{ background: cardBg, border: section.approved ? "1px solid rgba(16,185,129,0.2)" : border, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)" }}>§{i + 1}</span>
                    <select value={section.type} onChange={e => setSections(prev => prev.map(s => s.id === section.id ? { ...s, type: e.target.value } : s))}
                      style={{ fontSize: 10, background: sType.color + "18", color: sType.color, border: `1px solid ${sType.color}33`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontFamily: "var(--font)" }}>
                      {SECTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  {section.approved && <span style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>✓ Approved</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{section.english}</div>
              </div>

              {/* Arabic side */}
              <div style={{ background: cardBg, border: section.approved ? "1px solid rgba(16,185,129,0.2)" : border, borderRadius: 12, padding: 14 }}>
                {!section.arabic && !isTranslating ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }}>
                    <button onClick={() => translateSection(section.id)}
                      style={{ padding: "8px 18px", borderRadius: 8, background: "var(--accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)" }}>
                      Translate
                    </button>
                  </div>
                ) : isTranslating ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--text-dim)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Translating...</span>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={section.arabic}
                      onChange={e => updateArabic(section.id, e.target.value)}
                      disabled={section.approved}
                      style={{
                        width: "100%", minHeight: 80, background: "transparent", border: "none", color: "var(--text-primary)",
                        fontSize: 14, fontFamily: "'Noto Sans Arabic', 'Tajawal', var(--font)", lineHeight: 1.8,
                        direction: "rtl", textAlign: "right", outline: "none", resize: "vertical",
                        opacity: section.approved ? 0.7 : 1,
                      }}
                    />
                    {!section.approved && (
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                        <button onClick={() => translateSection(section.id)}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border, color: "var(--text-dim)", fontSize: 10, cursor: "pointer", fontFamily: "var(--font)" }}>
                          Retranslate
                        </button>
                        <button onClick={() => approveSection(section.id)}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
                          Approve ✓
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
