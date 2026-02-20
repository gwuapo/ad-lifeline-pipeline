import { useTheme } from "./ThemeContext.jsx";

const NAV_ITEMS = [
  { id: "pipeline", icon: "📊", label: "Pipeline" },
  { id: "editors", icon: "👥", label: "Editors" },
  { id: "learnings", icon: "🧠", label: "Learnings" },
];

const BOTTOM_ITEMS = [
  { id: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar({ page, setPage, role, userName, onSignOut, stats }) {
  const { isDark, toggle } = useTheme();

  return (
    <div className="sidebar">
      {/* Brand */}
      <div style={{ padding: "4px 10px 18px", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 10px rgba(99,102,241,0.3)",
        }}>
          <span style={{ fontSize: 14, color: "#fff", fontWeight: 800 }}>A</span>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3 }}>
            Ad Lifeline
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Pipeline</div>
        </div>
      </div>

      {/* Quick stats */}
      {stats && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5,
          padding: "0 4px", marginBottom: 12,
        }}>
          {[
            { label: "Live", value: stats.live, color: "var(--green)" },
            { label: "Winners", value: stats.win, color: "var(--green-light)" },
            { label: "Losing", value: stats.lose, color: "var(--red)" },
            { label: "Learnings", value: stats.learns, color: "var(--accent-light)" },
          ].map(s => (
            <div key={s.label} style={{
              padding: "7px 8px", borderRadius: "var(--radius-sm)",
              background: "var(--bg-elevated)", border: "1px solid var(--border-light)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: "var(--fm)" }}>{s.value}</div>
              <div style={{ fontSize: 8.5, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="nav-section-label">Main</div>

      {/* Nav items */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.filter(item => {
          if (item.id === "editors" && role === "editor") return false;
          return true;
        }).map(item => (
          <div
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <div style={{ padding: "0 2px", marginBottom: 4 }}>
        <button className="theme-toggle" onClick={toggle}>
          <span style={{ fontSize: 15 }}>{isDark ? "🌙" : "☀️"}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{isDark ? "Dark Mode" : "Light Mode"}</span>
          <div style={{ marginLeft: "auto" }}>
            <div className={`toggle-track ${isDark ? "on" : ""}`}>
              <div className="toggle-thumb" />
            </div>
          </div>
        </button>
      </div>

      <div className="nav-section-label">Support</div>

      {BOTTOM_ITEMS.filter(item => {
        if (item.id === "settings" && role === "editor") return false;
        return true;
      }).map(item => (
        <div
          key={item.id}
          className={`nav-item ${page === item.id ? "active" : ""}`}
          onClick={() => setPage(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}

      {/* User */}
      <div style={{
        marginTop: 10, padding: "10px 10px",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-light)",
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: "var(--radius-full)",
          background: "var(--accent-bg)", border: "1.5px solid var(--accent-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "var(--accent-light)",
        }}>
          {(userName || "U")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{userName || "User"}</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "capitalize" }}>{role}</div>
        </div>
        <button
          onClick={onSignOut}
          className="btn btn-ghost btn-xs"
          style={{ padding: "4px 8px", fontSize: 10 }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
