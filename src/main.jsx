import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./supabase.js";
import { ThemeProvider } from "./ThemeContext.jsx";
import AuthPage from "./AuthPage.jsx";
import EditorOnboarding from "./EditorOnboarding.jsx";
import WorkspaceSetup from "./WorkspaceSetup.jsx";
import App from "./App.jsx";
import { fetchWorkspaces, createWorkspace, fetchEditorProfile } from "./supabaseData.js";
import "./styles.css";

function Root() {
  const [session, setSession] = useState(undefined);
  const [workspaces, setWorkspaces] = useState(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [editorOnboarded, setEditorOnboarded] = useState(null); // null = loading, true/false
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  // Once we have a session, load workspaces + editor profile check
  useEffect(() => {
    if (!session) { setLoading(false); return; }

    const init = async () => {
      try {
        const ws = await fetchWorkspaces();
        setWorkspaces(ws);

        // Restore last active workspace from localStorage or pick first
        const savedWsId = localStorage.getItem("al_active_workspace");
        if (savedWsId && ws.find(w => w.id === savedWsId)) {
          setActiveWorkspaceId(savedWsId);
        } else if (ws.length > 0) {
          setActiveWorkspaceId(ws[0].id);
        }

        // Check editor onboarding
        const role = session.user?.user_metadata?.role || "founder";
        if (role === "editor") {
          const profile = await fetchEditorProfile(session.user.id);
          setEditorOnboarded(!!(profile?.display_name && profile?.portfolio_url && profile?.compensation_rate && profile?.weekly_minutes));
        } else {
          setEditorOnboarded(true); // founders skip onboarding
        }
      } catch (e) {
        console.error("Init error:", e);
        setWorkspaces([]);
        setEditorOnboarded(true);
      }
      setLoading(false);
    };
    init();
  }, [session]);

  if (session === undefined || loading) {
    return (
      <div className="loading-screen">
        <div className="loading-dot" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuth={setSession} />;
  }

  const userMeta = session.user?.user_metadata || {};
  const role = userMeta.role || "founder";
  const email = session.user?.email || "";
  const displayName = userMeta.display_name || email.split("@")[0] || "User";

  // Editor onboarding (Supabase-backed)
  if (role === "editor" && editorOnboarded === false) {
    return (
      <EditorOnboarding
        email={email}
        displayName={displayName}
        userId={session.user.id}
        onComplete={() => setEditorOnboarded(true)}
      />
    );
  }

  // Founder with no workspaces → create first one
  if (role === "founder" && workspaces && workspaces.length === 0) {
    return (
      <WorkspaceSetup onComplete={async (name) => {
        const ws = await createWorkspace(name);
        setWorkspaces([ws]);
        setActiveWorkspaceId(ws.id);
        localStorage.setItem("al_active_workspace", ws.id);
      }} />
    );
  }

  // Editor with no workspaces → waiting screen
  if (role === "editor" && workspaces && workspaces.length === 0) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--bg-root)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
        <div className="animate-fade-scale" style={{
          width: 420, maxWidth: "100%",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)", padding: "36px 32px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            Waiting for Workspace Assignment
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20 }}>
            A founder needs to add you to a workspace before you can start.
            Ask your team lead to assign you.
          </p>
          <button onClick={() => supabase.auth.signOut()} className="btn btn-ghost btn-sm">Sign Out</button>
        </div>
      </div>
    );
  }

  const handleSelectWorkspace = (wsId) => {
    setActiveWorkspaceId(wsId);
    localStorage.setItem("al_active_workspace", wsId);
  };

  const handleCreateWorkspace = async (name) => {
    const ws = await createWorkspace(name);
    setWorkspaces(prev => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    localStorage.setItem("al_active_workspace", ws.id);
  };

  return (
    <App
      session={session}
      userRole={role}
      userName={displayName}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onSelectWorkspace={handleSelectWorkspace}
      onCreateWorkspace={handleCreateWorkspace}
      onWorkspacesChange={setWorkspaces}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </React.StrictMode>
);
