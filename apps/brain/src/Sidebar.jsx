import { useState } from "react";

function SidebarSection({ title, children, action }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px 6px",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)",
          letterSpacing: "0.6px", textTransform: "uppercase",
        }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function ChatItem({ chat, active, onSelect, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px",
        borderRadius: "var(--r-sm)",
        background: active ? "rgba(255,255,255,0.07)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
        margin: "0 6px",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 400,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {chat.title}
      </span>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-dim)", padding: 2, lineHeight: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}

function ProjectItem({ project, chats, activeChatId, onSelectChat, onNewChat, onDeleteProject }) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const projectChats = chats.filter(c => c.projectId === project.id);

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", margin: "0 6px",
          borderRadius: "var(--r-sm)",
          cursor: "pointer",
          background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
          transition: "background 0.15s",
        }}
        onClick={() => setExpanded(p => !p)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 500,
          color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{project.name}</span>
        {hovered && (
          <div style={{ display: "flex", gap: 2 }}>
            <button
              onClick={e => { e.stopPropagation(); onNewChat(project.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, lineHeight: 0 }}
              title="New chat in project"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDeleteProject(project.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, lineHeight: 0 }}
              title="Delete project"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
      </div>
      {expanded && projectChats.length > 0 && (
        <div style={{ paddingLeft: 18 }}>
          {projectChats.map(c => (
            <ChatItem
              key={c.id}
              chat={c}
              active={c.id === activeChatId}
              onSelect={() => onSelectChat(c.id)}
              onDelete={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  open, onToggle, chats, projects, activeChatId,
  onSelectChat, onNewChat, onDeleteChat, onCreateProject, onDeleteProject, onOpenSettings,
  onSignOut, userName,
}) {
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);

  const ungroupedChats = chats.filter(c => !c.projectId);

  const handleNewProject = () => {
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim());
      setNewProjectName("");
      setShowNewProject(false);
    }
  };

  return (
    <div style={{
      width: open ? "var(--sidebar-w)" : 0,
      minWidth: open ? "var(--sidebar-w)" : 0,
      height: "100%",
      background: "var(--bg-sidebar)",
      borderRight: open ? "1px solid var(--border)" : "none",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      transition: "width 0.25s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      backdropFilter: "blur(40px)",
      WebkitBackdropFilter: "blur(40px)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/nexus-logo-dark.png" alt="Nexus" style={{ height: 22, width: "auto", objectFit: "contain" }} />
        </div>
        <button
          onClick={() => onNewChat()}
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "5px 7px",
            lineHeight: 0,
            transition: "all 0.15s",
          }}
          title="New chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "10px 0" }}>
        {/* Projects */}
        {projects.length > 0 && (
          <SidebarSection
            title="Projects"
            action={
              <button
                onClick={() => setShowNewProject(p => !p)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, lineHeight: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            }
          >
            {showNewProject && (
              <div style={{ padding: "4px 20px 8px", display: "flex", gap: 6 }}>
                <input
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleNewProject()}
                  placeholder="Project name..."
                  autoFocus
                  style={{
                    flex: 1, background: "var(--bg-input)", border: "1px solid var(--border)",
                    borderRadius: 6, padding: "5px 8px", color: "var(--text-primary)",
                    fontSize: 12, outline: "none",
                  }}
                />
              </div>
            )}
            {projects.map(p => (
              <ProjectItem
                key={p.id}
                project={p}
                chats={chats}
                activeChatId={activeChatId}
                onSelectChat={onSelectChat}
                onNewChat={onNewChat}
                onDeleteProject={onDeleteProject}
              />
            ))}
          </SidebarSection>
        )}

        {/* Recent chats */}
        <SidebarSection
          title="Recent"
          action={
            projects.length === 0 ? (
              <button
                onClick={() => setShowNewProject(p => !p)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, lineHeight: 0 }}
                title="New project"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            ) : null
          }
        >
          {projects.length === 0 && showNewProject && (
            <div style={{ padding: "4px 20px 8px", display: "flex", gap: 6 }}>
              <input
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleNewProject()}
                placeholder="Project name..."
                autoFocus
                style={{
                  flex: 1, background: "var(--bg-input)", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "5px 8px", color: "var(--text-primary)",
                  fontSize: 12, outline: "none",
                }}
              />
            </div>
          )}
          {ungroupedChats.length === 0 && (
            <div style={{ padding: "12px 20px", fontSize: 12, color: "var(--text-dim)" }}>
              No conversations yet
            </div>
          )}
          {ungroupedChats.map(c => (
            <ChatItem
              key={c.id}
              chat={c}
              active={c.id === activeChatId}
              onSelect={() => onSelectChat(c.id)}
              onDelete={() => onDeleteChat(c.id)}
            />
          ))}
        </SidebarSection>
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--border)",
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 4,
      }}>
        <button
          onClick={onOpenSettings}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", color: "var(--text-tertiary)",
            cursor: "pointer", padding: "7px 8px", borderRadius: "var(--r-sm)",
            fontSize: 13, fontWeight: 400, transition: "all 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          Settings
        </button>

        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 8px", borderRadius: "var(--r-sm)",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: "rgba(167,139,250,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600, color: "var(--accent)", flexShrink: 0,
          }}>
            {(userName || "U")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 400, color: "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {userName || "User"}
            </div>
          </div>
          <button
            onClick={onSignOut}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dim)", padding: 2, lineHeight: 0,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-dim)"}
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
