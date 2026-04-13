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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.map((step, i) => (
        <div key={i} className="tool-step" style={{ display: "flex", alignItems: "center", gap: 8, animationDelay: `${i * 50}ms` }}>
          {step.done ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6L9 17l-5-5"/></svg>
          ) : (
            <div style={{ width: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid var(--text-tertiary)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
            </div>
          )}
          <span style={{ fontSize: 13, color: step.done ? "var(--text-dim)" : "var(--text-secondary)", fontWeight: step.done ? 400 : 500 }}>
            {step.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function UsageBadge({ usage }) {
  if (!usage) return null;
  const inputCost = (usage.inputTokens / 1_000_000) * 15;
  const outputCost = (usage.outputTokens / 1_000_000) * 75;
  const total = inputCost + outputCost;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, color: "var(--text-dim)", marginTop: 8,
      padding: "4px 10px", borderRadius: 6,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
    }}>
      <span>{(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens</span>
      <span style={{ color: "var(--text-dim)" }}>|</span>
      <span>${total.toFixed(3)}</span>
    </div>
  );
}

function CostApproval({ estimate, onApprove, onCancel }) {
  return (
    <div className="msg-appear" style={{ padding: "4px 0" }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "var(--r-md)",
        padding: "16px 20px",
        maxWidth: "80%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Estimated Cost</span>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tokens</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", fontFeatureSettings: "'tnum'" }}>
              ~{estimate.totalTokens?.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>Cost Range</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", fontFeatureSettings: "'tnum'" }}>
              ${estimate.estimatedCost?.low} – ${estimate.estimatedCost?.high}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>Model</div>
            <div style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>
              Opus 4
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onApprove}
            style={{
              padding: "8px 20px", borderRadius: 10,
              background: "var(--accent)", border: "none",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            Run
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px", borderRadius: 10,
              background: "none", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="msg-appear" style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0 4px" }}>
        <div style={{
          fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)",
          fontWeight: 400, maxWidth: "75%", textAlign: "right",
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-appear" style={{ padding: "8px 0 16px" }}>
      {msg.toolSteps && msg.toolSteps.length > 0 && (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 12, padding: "12px 16px", marginBottom: 16,
          background: "rgba(255,255,255,0.02)",
        }}>
          <ToolSteps steps={msg.toolSteps} />
        </div>
      )}
      {msg.content && (
        <div style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--text-primary)", letterSpacing: "0.01em", fontWeight: 400 }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <p style={{ margin: "10px 0" }}>{children}</p>,
              strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--text-primary)" }}>{children}</strong>,
              h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, margin: "24px 0 8px", color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: "20px 0 6px", color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: "16px 0 4px", color: "var(--text-primary)" }}>{children}</h3>,
              ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: "8px 0" }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: "8px 0" }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: "4px 0", color: "var(--text-secondary)", lineHeight: 1.7 }}>{children}</li>,
              hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />,
              code: ({ inline, children }) => inline
                ? <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 13, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{children}</code>
                : <pre style={{ background: "rgba(255,255,255,0.03)", padding: "14px 16px", borderRadius: 10, overflow: "auto", fontSize: 13, margin: "12px 0", border: "1px solid var(--border)", fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6 }}><code>{children}</code></pre>,
            }}
          >{msg.content}</ReactMarkdown>
        </div>
      )}
      {msg.usage && <UsageBadge usage={msg.usage} />}
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
    <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 300, color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: 8 }}>
        What are you thinking about today?
      </h1>
      {!hasApiKey && (
        <button onClick={onOpenSettings} style={{
          marginTop: 16, background: "rgba(167,139,250,0.15)",
          border: "1px solid rgba(167,139,250,0.25)", borderRadius: "var(--r-sm)",
          padding: "8px 16px", color: "var(--accent)", fontSize: 13, fontWeight: 500, cursor: "pointer",
        }}>
          Add API key to get started
        </button>
      )}
    </div>
  );
}

export default function ChatView({ chat, apiKey, onUpdateChat, onNewChat, sidebarOpen, onToggleSidebar, onOpenSettings }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEstimate, setPendingEstimate] = useState(null);
  const [pendingMessages, setPendingMessages] = useState(null);
  const [pendingChatId, setPendingChatId] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat?.messages]);
  useEffect(() => { inputRef.current?.focus(); }, [chat?.id]);

  const detectsTool = (text) => {
    return text.includes("[Angle Finder]") || text.includes("[Ad Copy]") || text.includes("[Static Ad]");
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const rawInput = input.trim();
    const toolTag = selectedTool ? `[${selectedTool.name}] ` : "";
    const fullContent = rawInput.includes("[") ? rawInput : toolTag + rawInput;

    const userMsg = { role: "user", content: fullContent };
    let chatId = chat?.id;
    if (!chatId) chatId = onNewChat();

    const title = rawInput.slice(0, 50) + (rawInput.length > 50 ? "..." : "");
    onUpdateChat(chatId, prev => ({
      ...prev,
      title: prev.messages.length === 0 ? title : prev.title,
      messages: [...prev.messages, userMsg],
    }));

    const allMessages = [...(chat?.messages || []), userMsg];
    setInput("");
    setSelectedTool(null);

    if (!apiKey) {
      onUpdateChat(chatId, prev => ({
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: "Please add your Anthropic API key in Settings to start chatting." }],
      }));
      return;
    }

    // If a tool is detected, get estimate first
    if (detectsTool(fullContent)) {
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, messages: allMessages, action: "estimate" }),
        });
        const estimate = await res.json();
        setPendingEstimate(estimate);
        setPendingMessages(allMessages);
        setPendingChatId(chatId);
        setLoading(false);
        return;
      } catch (err) {
        setLoading(false);
      }
    }

    // No tool = execute directly (cheap general chat)
    await executeChat(chatId, allMessages);
  };

  const handleApprove = () => {
    const chatId = pendingChatId;
    const messages = pendingMessages;
    setPendingEstimate(null);
    setPendingMessages(null);
    setPendingChatId(null);
    executeChat(chatId, messages);
  };

  const handleCancelEstimate = () => {
    setPendingEstimate(null);
    setPendingMessages(null);
    setPendingChatId(null);
  };

  const executeChat = async (chatId, allMessages) => {
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, messages: allMessages }),
      });

      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let toolSteps = [];
      let usage = null;

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
            } else if (parsed.type === "usage") {
              usage = { inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens };
              onUpdateChat(chatId, prev => {
                const msgs = [...prev.messages];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], usage };
                return { ...prev, messages: msgs };
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      onUpdateChat(chatId, prev => ({
        ...prev,
        messages: [...prev.messages, { role: "assistant", content: `Error: ${err.message}. Check your API key in Settings.` }],
      }));
    } finally {
      setLoading(false);
    }
  };

  const hasMessages = chat?.messages?.length > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Top bar */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {!sidebarOpen && (
          <button onClick={onToggleSidebar} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4, lineHeight: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        )}
      </div>

      {!hasMessages ? (
        /* Centered layout: heading + input as one unit in the middle */
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          position: "relative", padding: "0 18%",
        }}>
          <PillarBackground />
          <EmptyState onOpenSettings={onOpenSettings} hasApiKey={!!apiKey} />
          <div style={{ width: "100%", position: "relative", zIndex: 2 }}>
            <InputBar
              input={input}
              setInput={setInput}
              inputRef={inputRef}
              loading={loading}
              onSend={handleSend}
              hasMessages={false}
              selectedTool={selectedTool}
              setSelectedTool={setSelectedTool}
            />
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflow: "auto", padding: "0 18%", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 40 }} />
            {chat.messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {pendingEstimate && (
              <CostApproval estimate={pendingEstimate} onApprove={handleApprove} onCancel={handleCancelEstimate} />
            )}
            {loading && !pendingEstimate && (
              <div className="msg-appear" style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-tertiary)", animation: "pulse 1.4s ease-in-out infinite" }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-tertiary)", animation: "pulse 1.4s ease-in-out infinite 0.2s" }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-tertiary)", animation: "pulse 1.4s ease-in-out infinite 0.4s" }} />
              </div>
            )}
            <div ref={messagesEndRef} style={{ height: 8 }} />
          </div>
          <InputBar
            input={input}
            setInput={setInput}
            inputRef={inputRef}
            loading={loading}
            onSend={handleSend}
            hasMessages={true}
            selectedTool={selectedTool}
            setSelectedTool={setSelectedTool}
          />
        </>
      )}
    </div>
  );
}

function InputBar({ input, setInput, inputRef, loading, onSend, hasMessages, selectedTool, setSelectedTool }) {
  const [showTools, setShowTools] = useState(false);
  const [listening, setListening] = useState(false);
  const toolsRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setShowTools(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectTool = (tool) => {
    setSelectedTool(selectedTool?.id === tool.id ? null : tool);
    setShowTools(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    const names = Array.from(files).map(f => f.name).join(", ");
    setInput(prev => prev + (prev ? "\n" : "") + `[Attached: ${names}]`);
    inputRef.current?.focus();
    e.target.value = "";
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice dictation not supported in this browser. Use Chrome or Edge."); return; }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + " ";
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      setInput(prev => {
        const base = prev.replace(/\u200B.*$/, "").trimEnd();
        const combined = (base ? base + " " : "") + finalTranscript + (interim ? "\u200B" + interim : "");
        return combined.trimStart();
      });
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      setInput(prev => prev.replace(/\u200B/g, "").trimEnd());
    };

    recognition.start();
    setListening(true);
  };

  return (
    <div style={{
      flexShrink: 0,
      padding: hasMessages ? "12px 18% 20px" : "0",
      position: "relative", zIndex: 2,
    }}>
      {selectedTool && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", marginBottom: 8,
          background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)",
          borderRadius: 8, fontSize: 12, fontWeight: 500, color: "var(--accent)",
        }}>
          <ToolIcon type={selectedTool.icon} size={13} />
          {selectedTool.name}
          <button onClick={() => setSelectedTool(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 0, lineHeight: 0, marginLeft: 2 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv" style={{ display: "none" }} onChange={handleFileSelect} />

      <div style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
      }}>
        <div style={{ padding: "12px 16px 8px", minHeight: 44 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            disabled={loading}
            rows={1}
            style={{
              width: "100%", background: "none", border: "none", outline: "none", resize: "none",
              color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font)",
              letterSpacing: "0.1px", lineHeight: 1.5,
            }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* + File upload */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 32, height: 32, borderRadius: 8, background: "transparent",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-tertiary)", transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              title="Upload files or images"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>

            {/* Tools dropdown */}
            <div ref={toolsRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowTools(p => !p)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 32, padding: "0 10px", borderRadius: 8,
                  background: showTools ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none", cursor: "pointer",
                  color: "var(--text-tertiary)", fontSize: 13, fontWeight: 500,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!showTools) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!showTools) e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
                Tools
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {showTools && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                  background: "rgba(18,18,22,0.96)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: 6, minWidth: 240,
                  backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}>
                  <div style={{ padding: "6px 12px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Select a tool
                  </div>
                  {TOOLS.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => handleSelectTool(tool)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "9px 12px", borderRadius: 8,
                        background: selectedTool?.id === tool.id ? "rgba(167,139,250,0.1)" : "transparent",
                        border: "none", cursor: "pointer", transition: "background 0.12s", textAlign: "left",
                      }}
                      onMouseEnter={e => { if (selectedTool?.id !== tool.id) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={e => { if (selectedTool?.id !== tool.id) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: selectedTool?.id === tool.id ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.05)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: selectedTool?.id === tool.id ? "var(--accent)" : "var(--text-tertiary)", flexShrink: 0,
                      }}>
                        <ToolIcon type={tool.icon} size={14} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: selectedTool?.id === tool.id ? "var(--accent)" : "var(--text-primary)" }}>{tool.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{tool.description}</div>
                      </div>
                      {selectedTool?.id === tool.id && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}><path d="M20 6L9 17l-5-5"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Mic button */}
            <button
              onClick={toggleVoice}
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: listening ? "rgba(255,99,99,0.15)" : "transparent",
                border: listening ? "1px solid rgba(255,99,99,0.3)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
                color: listening ? "var(--red)" : "var(--text-tertiary)",
              }}
              onMouseEnter={e => { if (!listening) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (!listening) e.currentTarget.style.background = "transparent"; }}
              title={listening ? "Stop dictation" : "Voice dictation"}
            >
              {listening ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
              )}
            </button>

            {/* Send button */}
            <button
              onClick={onSend}
              disabled={!input.trim() || loading}
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: input.trim() ? "var(--accent)" : "rgba(255,255,255,0.06)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() ? "pointer" : "default", transition: "all 0.2s", flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#fff" : "var(--text-dim)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
