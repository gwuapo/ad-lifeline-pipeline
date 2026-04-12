import { useState } from "react";

export default function WorkspaceSetup({ onComplete }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onComplete(name.trim());
    } catch (e) {
      alert("Error: " + e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-root)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="animate-fade-scale" style={{
        width: 440, maxWidth: "100%",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)", padding: "36px 32px 28px",
        backdropFilter: "var(--glass)", boxShadow: "var(--shadow-lg)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
            Create Your First Workspace
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
            A workspace is a brand or store. You can create more later.
            Each workspace has its own ad pipeline, editors, and learnings.
          </p>
        </div>

        <label className="label" style={{ marginTop: 0 }}>Workspace Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          className="input"
          placeholder="e.g. Hair Growth Brand, Skin Care Store..."
          autoFocus
        />
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, marginBottom: 20 }}>
          This is the brand name your team will see.
        </p>

        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          className="btn btn-primary"
          style={{ width: "100%", padding: "12px 0", fontSize: 14 }}
        >
          {loading ? "Creating..." : "Create Workspace"}
        </button>
      </div>
    </div>
  );
}
