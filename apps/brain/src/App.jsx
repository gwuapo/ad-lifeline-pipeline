import { useState, useRef, useEffect, useCallback } from "react";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import SettingsModal from "./SettingsModal";

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
  const [data, setData] = useState(loadData);
  const [activeChatId, setActiveChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { saveData(data); }, [data]);

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

  return (
    <div style={{ display: "flex", height: "100%", position: "relative" }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(p => !p)}
        chats={data.chats}
        projects={data.projects}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={createChat}
        onDeleteChat={deleteChat}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}>
        <ChatView
          chat={activeChat}
          apiKey={data.apiKey}
          onUpdateChat={updateChat}
          onNewChat={createChat}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(p => !p)}
          onOpenSettings={() => setShowSettings(true)}
        />
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
