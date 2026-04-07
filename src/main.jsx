import React, { useState, useEffect, Component } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./supabase.js";
import { ThemeProvider } from "./ThemeContext.jsx";
import AuthPage from "./AuthPage.jsx";
import EditorOnboarding from "./EditorOnboarding.jsx";
import WorkspaceSetup from "./WorkspaceSetup.jsx";
import App from "./App.jsx";
import { fetchWorkspaces, createWorkspace, fetchEditorProfile, acceptPendingInvites } from "./supabaseData.js";
import { loadWorkspaceKeys } from "./apiKeys.js";
import "./styles.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: 420, maxWidth: "100%", background: "#13131a", border: "1px solid #23232f", borderRadius: 16, padding: "36px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>Something went wrong</div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.6 }}>
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => { localStorage.clear(); window.location.reload(); }}
                style={{ padding: "10px 20px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Clear Cache & Reload
              </button>
              <button onClick={() => window.location.reload()}
                style={{ padding: "10px 20px", borderRadius: 8, background: "#23232f", color: "#ccc", border: "1px solid #33333f", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SetPasswordScreen({ email, displayName, onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState(displayName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setLoading(true); setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
        data: { display_name: name.trim() || email.split("@")[0] },
      });
      if (updateErr) throw updateErr;
      onComplete();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-root)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="animate-fade-scale" style={{ width: 420, maxWidth: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "36px 32px 32px", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>Welcome!</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Set up your account</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>You've been invited to join a workspace. Set your password to continue.</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ marginTop: 0 }}>Your Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="input" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={email} disabled className="input" style={{ opacity: 0.6 }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ marginTop: 0 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} className="input" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="label" style={{ marginTop: 0 }}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required minLength={6} className="input" />
          </div>
          {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 14, fontSize: 12, color: "var(--red-light)" }}>{error}</div>}
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>
            {loading ? "Setting up..." : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const [workspaces, setWorkspaces] = useState(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [editorOnboarded, setEditorOnboarded] = useState(null); // null = loading, true/false
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [needsPassword, setNeedsPassword] = useState(false);

  // Signal that React mounted successfully (hides HTML fallback)
  useEffect(() => { window.__appMounted = true; }, []);

  useEffect(() => {
    // Handle auth error redirects and invite link detection
    try {
      const hash = window.location.hash || "";
      if (hash.includes("error=")) {
        const params = new URLSearchParams(hash.replace("#", ""));
        const errDesc = params.get("error_description");
        if (errDesc) {
          setAuthError(errDesc.replace(/\+/g, " "));
        }
        // Always strip error hash from URL so it doesn't persist
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (hash.includes("type=invite") || hash.includes("type=magiclink")) {
        setNeedsPassword(true);
      }
    } catch (e) {
      console.error("Hash parsing failed:", e);
      // Strip the problematic hash entirely
      window.history.replaceState(null, "", window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Validate session isn't stale/corrupted
      if (session && !session.user?.id) {
        console.warn("Stale session detected, signing out");
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
      }
    }).catch((e) => {
      console.error("getSession failed:", e);
      setSession(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === "PASSWORD_RECOVERY") {
          setNeedsPassword(true);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Once we have a session, load workspaces + editor profile check
  useEffect(() => {
    if (!session) { setLoading(false); return; }
    if (!session.user?.id) { setLoading(false); return; }

    let cancelled = false;
    const init = async () => {
      try {
        // Accept any pending workspace invites for this email
        try { await acceptPendingInvites(); } catch (e) { console.log("No pending invites or table not ready:", e.message); }

        let ws = [];
        try {
          ws = await fetchWorkspaces();
        } catch (e) {
          console.error("fetchWorkspaces failed:", e);
          ws = [];
        }
        if (cancelled) return;
        setWorkspaces(ws);

        // Restore last active workspace from localStorage or pick first
        const savedWsId = localStorage.getItem("al_active_workspace");
        let wsId;
        if (savedWsId && ws.find(w => w.id === savedWsId)) {
          wsId = savedWsId;
        } else if (ws.length > 0) {
          wsId = ws[0].id;
          localStorage.setItem("al_active_workspace", wsId);
        } else {
          localStorage.removeItem("al_active_workspace");
        }
        if (wsId) {
          setActiveWorkspaceId(wsId);
          try { loadWorkspaceKeys(wsId); } catch (e) { console.error("loadWorkspaceKeys failed:", e); }
        }

        // Check editor onboarding -- wrap in try/catch so a failed profile fetch never blocks the app
        const role = session.user?.user_metadata?.role || "founder";
        if (role === "editor") {
          try {
            const profile = await fetchEditorProfile(session.user.id);
            if (!cancelled) {
              setEditorOnboarded(!!(profile?.display_name && profile?.portfolio_url && profile?.compensation_rate && profile?.weekly_minutes));
            }
          } catch (e) {
            console.error("fetchEditorProfile failed:", e);
            if (!cancelled) setEditorOnboarded(false);
          }
        } else {
          setEditorOnboarded(true);
        }
      } catch (e) {
        console.error("Init error:", e);
        if (!cancelled) {
          setWorkspaces([]);
          setEditorOnboarded(true);
        }
      }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [session]);

  // Update last_active timestamp
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("workspace_members").update({ last_active: new Date().toISOString() }).eq("user_id", session.user.id).then(() => {}).catch(() => {});
  }, [session?.user?.id]);

  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-dot" />
      </div>
    );
  }

  if (loading && session) {
    return (
      <div className="loading-screen">
        <div className="loading-dot" />
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>Loading workspace...</div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuth={(s) => { setSession(s); }} authError={authError} />;
  }

  const ADMIN_EMAILS = ["capo@nexusholdings.io", "af@nexusholdings.io"];
  const userMeta = session.user?.user_metadata || {};
  const email = session.user?.email?.toLowerCase() || "";
  const isAdmin = ADMIN_EMAILS.includes(email);
  const role = isAdmin ? "founder" : (userMeta.role || "editor");
  const displayName = userMeta.display_name || email.split("@")[0] || "User";

  // Set password screen for invite users
  if (needsPassword && session) {
    return <SetPasswordScreen email={email} displayName={displayName} onComplete={() => setNeedsPassword(false)} />;
  }

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

  const ROLE_DISPLAY = { founder: "Founder", admin: "Admin", manager: "Manager", strategist: "Creative Strategist", editor: "Editor", voice_actor: "Voice Actor" };
  // Non-founder/admin with no workspaces → waiting to be invited
  if (!["founder", "admin"].includes(role) && workspaces && workspaces.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Waiting for workspace invite</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
          You're signed up as <strong style={{ color: "var(--text-secondary)" }}>{ROLE_DISPLAY[role] || role}</strong>. Ask a founder to invite <strong style={{ color: "var(--text-secondary)" }}>{email}</strong> to their workspace from Settings.
        </div>
        <button onClick={() => supabase.auth.signOut()} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Sign Out</button>
      </div>
    );
  }

  // Founder/admin with no workspaces → create first one
  if (["founder", "admin"].includes(role) && workspaces && workspaces.length === 0) {
    return (
      <WorkspaceSetup onComplete={async (name) => {
        try {
          const ws = await createWorkspace(name);
          setWorkspaces([ws]);
          setActiveWorkspaceId(ws.id);
          loadWorkspaceKeys(ws.id);
          localStorage.setItem("al_active_workspace", ws.id);
        } catch (e) {
          console.error("Workspace creation failed:", e);
          alert("Failed to create workspace: " + (e.message || JSON.stringify(e)));
          throw e;
        }
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
    loadWorkspaceKeys(wsId);
    localStorage.setItem("al_active_workspace", wsId);
  };

  const handleCreateWorkspace = async (name) => {
    const ws = await createWorkspace(name);
    setWorkspaces(prev => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    loadWorkspaceKeys(ws.id);
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
    <ErrorBoundary>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
