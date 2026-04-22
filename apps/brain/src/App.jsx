import { useState, useRef, useEffect, useCallback } from "react";
import { supabase, getSessionUser, getUserRole, signOut } from "./supabase";
import LoginScreen from "./LoginScreen";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import TranslatorView from "./TranslatorView";
import SettingsModal from "./SettingsModal";

const ALLOWED_ROLES = ["founder"];

const STORAGE_KEY = "nexus_brain_data";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { chats: [], projects: [], apiKey: "" };
    return JSON.parse(raw);
  } catch { return { chats: [], projects: [], apiKey: "" }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function App() {
  const [authState, setAuthState] = useState("loading"); // loading | login | denied | ready
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const [data, setData] = useState(loadData);
  const [activeChatId, setActiveChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState("chat");

  useEffect(() => { saveData(data); }, [data]);

  useEffect(() => {
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => checkAuth());
    return () => subscription?.unsubscribe();
  }, []);

  async function checkAuth() {
    const u = await getSessionUser();
    if (!u) {
      setAuthState("login");
      setUser(null);
      return;
    }
    setUser(u);

    const membership = await getUserRole(u.id);
    if (!membership || !ALLOWED_ROLES.includes(membership.role)) {
      setAuthState("denied");
      setUserRole(membership?.role || null);
      return;
    }

    setUserRole(membership.role);
    setAuthState("ready");
  }

  const handleSignOut = async () => {
    await signOut();
    setAuthState("login");
    setUser(null);
    setUserRole(null);
  };

  const activeChat = data.chats.find(c => c.id === activeChatId) || null;

  const createChat = useCallback((projectId = null) => {
    const chat = {
      id: crypto.randomUUID(),
      title: "New chat",
      projectId,
      messages: [],
      createdAt: Date.now(),
    };
    setData(prev => ({ ...prev, chats: [chat, ...prev.chats] }));
    setActiveChatId(chat.id);
    return chat.id;
  }, []);

  const updateChat = useCallback((chatId, updater) => {
    setData(prev => ({
      ...prev,
      chats: prev.chats.map(c => c.id === chatId ? (typeof updater === "function" ? updater(c) : { ...c, ...updater }) : c),
    }));
  }, []);

  const deleteChat = useCallback((chatId) => {
    setData(prev => ({ ...prev, chats: prev.chats.filter(c => c.id !== chatId) }));
    if (activeChatId === chatId) setActiveChatId(null);
  }, [activeChatId]);

  const createProject = useCallback((name) => {
    const proj = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    setData(prev => ({ ...prev, projects: [...prev.projects, proj] }));
    return proj.id;
  }, []);

  const deleteProject = useCallback((projectId) => {
    setData(prev => ({
      ...prev,
      projects: prev.projects.filter(p => p.id !== projectId),
      chats: prev.chats.map(c => c.projectId === projectId ? { ...c, projectId: null } : c),
    }));
  }, []);

  const setApiKey = useCallback((key) => {
    setData(prev => ({ ...prev, apiKey: key }));
  }, []);

  // Loading
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
        chats={data.chats}
        projects={data.projects}
        activeChatId={activeChatId}
        onSelectChat={(id) => { setActiveChatId(id); setActiveView("chat"); }}
        onNewChat={() => { const id = createChat(); setActiveView("chat"); return id; }}
        onDeleteChat={deleteChat}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
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
            apiKey={data.apiKey}
            onUpdateChat={updateChat}
            onNewChat={createChat}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(p => !p)}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <TranslatorView
            apiKey={data.apiKey}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          apiKey={data.apiKey}
          onSave={setApiKey}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
