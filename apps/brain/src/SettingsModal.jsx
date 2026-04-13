import { useState } from "react";

export default function SettingsModal({ apiKey, onSave, onClose }) {
  const [key, setKey] = useState(apiKey || "");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440,
          background: "rgba(18,18,22,0.95)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: 28,
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", padding: 4, lineHeight: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: "block", fontSize: 13, fontWeight: 500,
            color: "var(--text-secondary)", marginBottom: 8,
          }}>
            Anthropic API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              width: "100%",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "11px 14px",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "monospace",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
            Get your key from{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
              style={{ color: "var(--accent)", textDecoration: "none" }}>
              console.anthropic.com
            </a>
            . Your key is stored locally and never sent to our servers.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", borderRadius: 10,
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(key); onClose(); }}
            style={{
              padding: "9px 18px", borderRadius: 10,
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
