import { useState, useRef, useEffect, useCallback } from "react";
import { supabase, getSessionUser, getUserRole, signOut } from "./supabase";
import { getConfig, saveConfig, fetchChats, createChat as dbCreateChat, updateChat as dbUpdateChat, deleteChat as dbDeleteChat, fetchProjects, createProject as dbCreateProject, deleteProject as dbDeleteProject } from "./brainData";
import LoginScreen from "./LoginScreen";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import TranslatorView from "./TranslatorView";
import SettingsModal from "./SettingsModal";

const ALLOWED_ROLES = ["founder"];

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);

  const [chats, setChats] = useState([]);
  const [projects, setProjects] = useState([]);
  const [apiKey, setApiKeyState] = useState("");
  const [geminiKey, setGeminiKeyState] = useState("");
  const [activeChatId, setActiveChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState("chat");
  const [dataLoaded, setDataLoaded] = useState(false);

  const saveChatRef = useRef(null);

  useEffect(() => {
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => checkAuth());
    return () => subscription?.unsubscribe();
  }, []);

  // Load workspace data once we have a workspaceId
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const [chatData, projData, config] = await Promise.all([
          fetchChats(workspaceId).catch(() => []),
          fetchProjects(workspaceId).catch(() => []),
          getConfig(workspaceId).catch(() => ({ api_key: "", gemini_key: "" })),
        ]);
        if (cancelled) return;
        setChats(chatData);
        setProjects(projData);
        setApiKeyState(config.api_key || "");
        setGeminiKeyState(config.gemini_key || "");
      } catch (e) {
        console.error("Load workspace data failed:", e);
      }
      setDataLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function checkAuth() {
    try {
      console.log("[Brain] checkAuth: getting session...");
      const u = await getSessionUser();
      if (!u) {
        console.log("[Brain] checkAuth: no session, showing login");
        setAuthState("login");
        setUser(null);
        return;
      }
      console.log("[Brain] checkAuth: user found", u.email);
      setUser(u);

      console.log("[Brain] checkAuth: getting role...");
      const membership = await getUserRole(u.id);
      console.log("[Brain] checkAuth: membership =", membership);
      if (!membership || !ALLOWED_ROLES.includes(membership.role)) {
        setAuthState("denied");
        setUserRole(membership?.role || null);
        return;
      }

      setUserRole(membership.role);
      setWorkspaceId(membership.workspace_id);
      console.log("[Brain] checkAuth: ready, workspace =", membership.workspace_id);
      setAuthState("ready");
    } catch (e) {
      console.error("[Brain] Auth check failed:", e);
      setAuthState("login");
    }
  }

  const handleSignOut = async () => {
    await signOut();
    setAuthState("login");
    setUser(null);
    setUserRole(null);
    setWorkspaceId(null);
  };

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const handleCreateChat = useCallback((projectId = null) => {
    if (!workspaceId) return;
    const chat = {
      id: crypto.randomUUID(),
      title: "New chat",
      projectId,
      messages: [],
      createdAt: Date.now(),
    };
    setChats(prev => [chat, ...prev]);
    setActiveChatId(chat.id);
    dbCreateChat(workspaceId, chat).catch(e => console.error("Create chat:", e));
    return chat.id;
  }, [workspaceId]);

  const handleUpdateChat = useCallback((chatId, updater) => {
    setChats(prev => {
      const updated = prev.map(c => c.id === chatId ? (typeof updater === "function" ? updater(c) : { ...c, ...updater }) : c);
      const chat = updated.find(c => c.id === chatId);
      // Debounce DB writes
      clearTimeout(saveChatRef.current);
      saveChatRef.current = setTimeout(() => {
        if (chat) dbUpdateChat(chatId, { title: chat.title, messages: chat.messages, projectId: chat.projectId }).catch(e => console.error("Update chat:", e));
      }, 500);
      return updated;
    });
  }, []);

  const handleDeleteChat = useCallback((chatId) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
    dbDeleteChat(chatId).catch(e => console.error("Delete chat:", e));
  }, [activeChatId]);

  const handleCreateProject = useCallback((name) => {
    if (!workspaceId) return;
    const proj = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    setProjects(prev => [...prev, proj]);
    dbCreateProject(workspaceId, proj).catch(e => console.error("Create project:", e));
    return proj.id;
  }, [workspaceId]);

  const handleDeleteProject = useCallback((projectId) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setChats(prev => prev.map(c => c.projectId === projectId ? { ...c, projectId: null } : c));
    dbDeleteProject(projectId).catch(e => console.error("Delete project:", e));
  }, []);

  const setApiKey = useCallback((key) => {
    setApiKeyState(key);
    if (workspaceId) saveConfig(workspaceId, { api_key: key, gemini_key: geminiKey });
  }, [workspaceId, geminiKey]);

  const setGeminiKey = useCallback((key) => {
    setGeminiKeyState(key);
    if (workspaceId) saveConfig(workspaceId, { api_key: apiKey, gemini_key: key });
  }, [workspaceId, apiKey]);

  // Loading - auto-fallback to login after 5s
  useEffect(() => {
    if (authState !== "loading") return;
    const t = setTimeout(() => {
      console.warn("Auth check timed out, falling back to login");
      setAuthState("login");
    }, 5000);
    return () => clearTimeout(t);
  }, [authState]);

  if (authState === "loading") {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-void)" }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--text-dim)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  // Login
  if (authState === "login") {
    return <LoginScreen onLogin={checkAuth} />;
  }

  // Access denied
  if (authState === "denied") {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--bg-void)", gap: 16,
      }}>
        <img src="/nexus-logo-dark.png" alt="Nexus" style={{ height: 28, width: "auto", objectFit: "contain" }} />
        <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--text-primary)" }}>Access Restricted</h1>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", textAlign: "center", maxWidth: 340, lineHeight: 1.5 }}>
          Nexus Brain is only available to founders and managers.
          Your current role is <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{userRole || "none"}</span>.
        </p>
        <button
          onClick={handleSignOut}
          style={{
            marginTop: 8, padding: "9px 20px", borderRadius: 10,
            background: "none", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", position: "relative" }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(p => !p)}
        chats={chats}
        projects={projects}
        activeChatId={activeChatId}
        onSelectChat={(id) => { setActiveChatId(id); setActiveView("chat"); }}
        onNewChat={() => { const id = handleCreateChat(); setActiveView("chat"); return id; }}
        onDeleteChat={handleDeleteChat}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onOpenSettings={() => setShowSettings(true)}
        onSignOut={handleSignOut}
        userName={user?.email}
        activeView={activeView}
        onSwitchView={setActiveView}
      />

      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        height: "100%", position: "relative", overflow: "hidden",
      }}>
        {activeView === "chat" ? (
          <ChatView
            chat={activeChat}
            apiKey={apiKey}
            onUpdateChat={handleUpdateChat}
            onNewChat={handleCreateChat}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(p => !p)}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <TranslatorView
            apiKey={geminiKey}
            workspaceId={workspaceId}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          apiKey={apiKey}
          geminiKey={geminiKey}
          onSave={setApiKey}
          onSaveGemini={setGeminiKey}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
