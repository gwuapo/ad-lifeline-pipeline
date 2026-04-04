import { useTheme } from "./ThemeContext.jsx";
import WorkspaceSelector from "./WorkspaceSelector.jsx";

const NAV_ITEMS = [
  { id: "pipeline", icon: "📊", label: "Pipeline" },
  { id: "strategy", icon: "🧪", label: "Strategy" },
  { id: "editors", icon: "👥", label: "Editors" },
  { id: "splittests", icon: "⚖️", label: "Split Tests" },
  { id: "earnings", icon: "💰", label: "Earnings" },
  { id: "learnings", icon: "🧠", label: "Learnings" },
  { id: "audio", icon: "🎙️", label: "Audio" },
  { id: "adcopy", icon: "✍️", label: "Ad Copy" },
  { id: "landingpages", icon: "🌐", label: "Landing Pages" },
  { id: "marketplace", icon: "🏪", label: "Marketplace" },
];

const BOTTOM_ITEMS = [
  { id: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar({ page, setPage, role, userName, onSignOut, stats, workspaces, activeWorkspaceId, onSelectWorkspace, onCreateWorkspace }) {
  const { isDark } = useTheme();

  return (
    <div className="sidebar" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Brand */}
      <div style={{ padding: "0 8px 20px", flexShrink: 0 }}>
        <img
          src={isDark ? "/nexus-logo-dark.png" : "/nexus-logo-light.png"}
          alt="Nexus Holdings"
          style={{ height: 26, objectFit: "contain" }}
        />
      </div>

      {/* Workspace selector */}
      {workspaces && workspaces.length > 0 && (
        <WorkspaceSelector
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          onSelect={onSelectWorkspace}
          onCreate={onCreateWorkspace}
          role={role}
        />
      )}

      {/* Scrollable middle */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {/* Quick stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "0 4px", marginBottom: 16 }}>
            {[
              { label: "Live", value: stats.live, color: "var(--green)" },
              { label: "Winners", value: stats.win, color: "var(--green-light)" },
              { label: "Losing", value: stats.lose, color: "var(--red)" },
              { label: "Learnings", value: stats.learns, color: "var(--accent)" },
            ].map(s => (
              <div key={s.label} style={{
                padding: "8px 10px", borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)", textAlign: "center",
              }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: s.color, fontFamily: "var(--fm)" }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="nav-section-label">Main</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.filter(item => {
            if (role === "editor") return item.id === "pipeline" || item.id === "earnings" || item.id === "marketplace";
            if (role === "strategist") return item.id !== "editors" && item.id !== "splittests";
            return true;
          }).map(item => (
            <div key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="nav-section-label">Support</div>

        {BOTTOM_ITEMS.filter(item => {
          if (item.id === "settings" && role === "strategist") return false;
          return true;
        }).map(item => (
          <div key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{
        flexShrink: 0, marginTop: 10, padding: "10px 12px",
        borderRadius: "var(--radius-md)", background: "var(--bg-elevated)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: "var(--radius-full)",
          background: "var(--accent-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600, color: "var(--accent)",
        }}>
          {(userName || "U")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userName || "User"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "capitalize" }}>{role}</div>
        </div>
        <button onClick={onSignOut} className="btn btn-ghost btn-xs" style={{ padding: "3px 8px", fontSize: 10 }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
