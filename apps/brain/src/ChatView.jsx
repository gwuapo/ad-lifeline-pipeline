import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const TOOLS = [
  { id: "angle_finder", name: "Angle Finder", icon: "compass", description: "Discover untapped ad angles for your product" },
  { id: "ad_copy", name: "Ad Copy", icon: "pen", description: "Generate direct response ad scripts and copy" },
  { id: "static_ad", name: "Static Ad", icon: "image", description: "Create static ad concepts and layouts" },
];

function ToolIcon({ type, size = 14 }) {
  const icons = {
    compass: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
    pen: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z"/></svg>,
    image: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  };
  return icons[type] || null;
}

function ToolSteps({ steps }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
      {steps.map((step, i) => (
        <div key={i} className="tool-step" style={{
          display: "flex", alignItems: "center", gap: 10,
          animationDelay: `${i * 60}ms`,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 6,
            background: step.done ? "rgba(99,226,160,0.12)" : "var(--accent-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {step.done ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                border: "2px solid var(--accent)",
                borderTopColor: "transparent",
                animation: "spin 0.8s linear infinite",
              }} />
            )}
          </div>
          <span style={{ fontSize: 13, color: step.done ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: 400 }}>
            {step.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="msg-appear" style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      padding: "4px 0",
    }}>
      <div style={{
        maxWidth: isUser ? "70%" : "80%",
        padding: isUser ? "10px 16px" : "2px 0",
        borderRadius: isUser ? "var(--r-md)" : 0,
        background: isUser ? "rgba(255,255,255,0.06)" : "transparent",
        border: isUser ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}>
        {msg.toolSteps && <ToolSteps steps={msg.toolSteps} />}
        {msg.content && (
          <div style={{
            fontSize: 14, lineHeight: 1.65, color: "var(--text-primary)",
            letterSpacing: "0.1px", fontWeight: 400,
          }}>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
                strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--text-primary)" }}>{children}</strong>,
                h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px", color: "var(--text-primary)" }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px", color: "var(--text-primary)" }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px", color: "var(--text-primary)" }}>{children}</h3>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
                li: ({ children }) => <li style={{ margin: "3px 0", color: "var(--text-secondary)" }}>{children}</li>,
                code: ({ inline, children }) => inline
                  ? <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 5, fontSize: 13 }}>{children}</code>
                  : <pre style={{ background: "rgba(255,255,255,0.04)", padding: 14, borderRadius: 10, overflow: "auto", fontSize: 13, margin: "8px 0", border: "1px solid var(--border)" }}><code>{children}</code></pre>,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function PillarBackground() {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
      display: "flex", justifyContent: "center", gap: "2.5vw",
      opacity: 0.2, pointerEvents: "none",
      maskImage: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
    }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{
          width: "2vw", maxWidth: 24, height: "100%",
          background: `linear-gradient(to top, rgba(140,170,120,${0.25 + (i % 3) * 0.1}), transparent)`,
          borderRadius: "3px 3px 0 0",
          animation: `pillars ${3 + (i % 4) * 0.7}s ease-in-out infinite ${i * 0.25}s`,
          transformOrigin: "bottom",
        }} />
      ))}
    </div>
  );
}

function EmptyState({ onOpenSettings, hasApiKey }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <PillarBackground />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <h1 style={{
          fontSize: 26, fontWeight: 300, color: "var(--text-primary)",
          letterSpacing: "-0.3px", marginBottom: 8,
        }}>
          What are you thinking about today?
        </h1>
        {!hasApiKey && (
          <button
            onClick={onOpenSettings}
            style={{
              marginTop: 16, background: "var(--accent-dim)",
              border: "1px solid rgba(167,139,250,0.25)",
              borderRadius: "var(--r-sm)", padding: "8px 16px",
              color: "var(--accent)", fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            Add API key to get started
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatView({ chat, apiKey, onUpdateChat, onNewChat, sidebarOpen, onToggleSidebar, onOpenSettings }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chat?.id]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input.trim() };
    let chatId = chat?.id;

    if (!chatId) {
      chatId = onNewChat();
    }

    const title = input.trim().slice(0, 50) + (input.trim().length > 50 ? "..." : "");

    onUpdateChat(chatId, prev => ({
      ...prev,
      title: prev.messages.length === 0 ? title : prev.title,
      messages: [...prev.messages, userMsg],
    }));

    setInput("");
    setLoading(true);

    if (!apiKey) {
      onUpdateChat(chatId, prev => ({
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: "Please add your Anthropic API key in Settings to start chatting." }],
      }));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          messages: [...(chat?.messages || []), userMsg],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let toolSteps = [];

      onUpdateChat(chatId, prev => ({
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: "", toolSteps: [] }],
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.trim());

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "tool_step") {
              toolSteps = [...toolSteps, { text: parsed.text, done: false }];
              onUpdateChat(chatId, prev => {
                const msgs = [...prev.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], toolSteps: [...toolSteps] };
                return { ...prev, messages: msgs };
              });
            } else if (parsed.type === "tool_step_done") {
              toolSteps = toolSteps.map((s, i) => i === toolSteps.length - 1 ? { ...s, done: true } : s);
              onUpdateChat(chatId, prev => {
                const msgs = [...prev.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], toolSteps: [...toolSteps] };
                return { ...prev, messages: msgs };
              });
            } else if (parsed.type === "content") {
              assistantContent += parsed.text;
              onUpdateChat(chatId, prev => {
                const msgs = [...prev.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: assistantContent };
                return { ...prev, messages: msgs };
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      onUpdateChat(chatId, prev => ({
        ...prev,
        messages: [...prev.messages, {
          role: "assistant",
          content: `Error: ${err.message}. Check your API key in Settings.`,
        }],
      }));
    } finally {
      setLoading(false);
    }
  };

  const hasMessages = chat?.messages?.length > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Top bar */}
      <div style={{
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        {!sidebarOpen && (
          <button
            onClick={onToggleSidebar}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", padding: 4, lineHeight: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        )}
      </div>

      {/* Messages or empty state */}
      {!hasMessages ? (
        <EmptyState onOpenSettings={onOpenSettings} hasApiKey={!!apiKey} />
      ) : (
        <div style={{
          flex: 1, overflow: "auto",
          padding: "0 20%",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ flex: 1 }} />
          {chat.messages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}
          {loading && (
            <div className="msg-appear" style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--accent)", animation: "pulse 1.2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div style={{
        flexShrink: 0,
        padding: hasMessages ? "12px 20%" : "0 15%",
        paddingBottom: hasMessages ? 20 : 0,
        position: hasMessages ? "relative" : "absolute",
        bottom: hasMessages ? undefined : "38%",
        left: hasMessages ? undefined : 0,
        right: hasMessages ? undefined : 0,
        zIndex: 2,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "var(--r-input)",
          padding: "4px 4px 4px 18px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.2s",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
          onFocus={() => {}}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="How can I help you today?"
            disabled={loading}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--text-primary)", fontSize: 14, fontWeight: 400,
              fontFamily: "var(--font)", letterSpacing: "0.1px",
              padding: "10px 0",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => setInput(prev => prev + (prev ? " " : "") + `[${tool.name}] `)}
                title={tool.description}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, padding: "5px 10px",
                  color: "var(--text-tertiary)",
                  cursor: "pointer", fontSize: 11, fontWeight: 500,
                  transition: "all 0.15s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.color = "var(--text-tertiary)";
                }}
              >
                <ToolIcon type={tool.icon} size={12} />
                {tool.name}
              </button>
            ))}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: input.trim() ? "var(--text-primary)" : "rgba(255,255,255,0.06)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() ? "pointer" : "default",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "var(--bg-void)" : "var(--text-dim)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
