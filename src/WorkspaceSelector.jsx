import { useState } from "react";

export default function WorkspaceSelector({ workspaces, activeId, onSelect, onCreate, role }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const active = workspaces.find(w => w.id === activeId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreate(newName.trim());
      setNewName("");
      setShowCreate(false);
    } catch (e) {
      alert("Error creating workspace: " + e.message);
    }
    setCreating(false);
  };

  if (workspaces.length <= 1 && role !== "founder") {
    return active ? (
      <div style={{ padding: "0 6px 10px", fontSize: 11, color: "var(--text-muted)" }}>
        {active.name}
      </div>
    ) : null;
  }

  return (
    <div style={{ padding: "0 4px 12px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderRadius: "var(--radius-md)",
        background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
        cursor: "pointer", position: "relative",
      }}>
        <select
          value={activeId || ""}
          onChange={e => onSelect(e.target.value)}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)",
            cursor: "pointer", appearance: "none", WebkitAppearance: "none",
          }}
        >
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 9, color: "var(--text-muted)", pointerEvents: "none" }}>▼</span>
      </div>

      {role === "founder" && (
        <>
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-ghost btn-xs"
              style={{ marginTop: 6, width: "100%", fontSize: 10.5 }}
            >
              + New Workspace
            </button>
          ) : (
            <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="Brand name..."
                className="input"
                style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}
                autoFocus
              />
              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn btn-primary btn-xs" style={{ fontSize: 10 }}>
                {creating ? "..." : "Add"}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(""); }} className="btn btn-ghost btn-xs" style={{ fontSize: 10 }}>✕</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
