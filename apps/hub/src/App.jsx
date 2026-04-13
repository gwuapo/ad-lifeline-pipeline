import { useState, useEffect } from "react";

const APPS = [
  {
    id: "pipeline",
    name: "Ad Lifeline",
    description: "Ad pipeline management, tracking, and editor workflow",
    icon: "🎯",
    gradient: "linear-gradient(135deg, #ff6363 0%, #ff4040 100%)",
    url: "https://studio.nexusholdings.io",
    status: "live",
  },
  {
    id: "brain",
    name: "Stefan Brain",
    description: "AI-powered marketing material generation and creative tools",
    icon: "🧠",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
    url: null,
    status: "coming-soon",
  },
  {
    id: "profit",
    name: "Profit Tracker",
    description: "Financial analytics, ROAS tracking, and revenue forecasting",
    icon: "📊",
    gradient: "linear-gradient(135deg, #5fc992 0%, #34d399 100%)",
    url: null,
    status: "coming-soon",
  },
  {
    id: "intel",
    name: "Data Intelligence",
    description: "Cross-platform data analysis, insights, and decision engine",
    icon: "⚡",
    gradient: "linear-gradient(135deg, #55b3ff 0%, #3b82f6 100%)",
    url: null,
    status: "planned",
  },
];

function StatusBadge({ status }) {
  const config = {
    live: { label: "Live", color: "#5fc992", bg: "rgba(95,201,146,0.12)" },
    "coming-soon": { label: "Coming Soon", color: "#ffbc33", bg: "rgba(255,188,51,0.12)" },
    planned: { label: "Planned", color: "#9c9c9d", bg: "rgba(156,156,157,0.12)" },
  };
  const c = config[status] || config.planned;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.5px",
      padding: "3px 10px", borderRadius: "var(--r-pill)",
      color: c.color, background: c.bg,
      textTransform: "uppercase",
    }}>
      {c.label}
    </span>
  );
}

function AppCard({ app, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const active = isSelected || hovered;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 240,
        minHeight: 260,
        borderRadius: "var(--r-lg)",
        background: active
          ? "linear-gradient(180deg, rgba(27,28,30,0.95) 0%, rgba(16,17,17,0.98) 100%)"
          : "var(--bg-surface)",
        border: `1px solid ${active ? "rgba(255,255,255,0.08)" : "var(--border-subtle)"}`,
        padding: "var(--sp-7)",
        cursor: app.url ? "pointer" : "default",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: active ? "translateY(-4px) scale(1.02)" : "translateY(0) scale(1)",
        boxShadow: active
          ? "0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)"
          : "0 2px 8px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-5)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {active && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: app.gradient,
          borderRadius: "var(--r-lg) var(--r-lg) 0 0",
        }} />
      )}

      <div style={{
        width: 48, height: 48, borderRadius: "var(--r-md)",
        background: app.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}>
        {app.icon}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        <div style={{
          fontSize: 18, fontWeight: 600, color: "var(--text-primary)",
          lineHeight: 1.2,
        }}>
          {app.name}
        </div>
        <div style={{
          fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)",
          lineHeight: 1.5,
        }}>
          {app.description}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <StatusBadge status={app.status} />
        {app.url && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-dim)" }}>
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  );
}

function TimeDisplay() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ textAlign: "center", marginBottom: "var(--sp-10)" }}>
      <div style={{
        fontSize: 56, fontWeight: 300, color: "var(--text-primary)",
        letterSpacing: "-1px", lineHeight: 1.1,
        fontFeatureSettings: "'tnum'",
      }}>
        {time}
      </div>
      <div style={{
        fontSize: 15, fontWeight: 400, color: "var(--text-tertiary)",
        marginTop: "var(--sp-3)", letterSpacing: "0.3px",
      }}>
        {date}
      </div>
    </div>
  );
}

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleAppClick = (app) => {
    setSelectedApp(app.id);
    if (app.url) {
      window.open(app.url, "_blank");
    }
  };

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "var(--sp-8)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute",
        top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: "80%", height: "60%",
        background: "radial-gradient(ellipse, rgba(85,179,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-10%", left: "30%",
        width: "40%", height: "40%",
        background: "radial-gradient(ellipse, rgba(167,139,250,0.03) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 1100,
      }}>
        {/* Logo */}
        <div style={{
          marginBottom: "var(--sp-8)",
          display: "flex", alignItems: "center", gap: "var(--sp-4)",
        }}>
          <img
            src="/nexus-logo-light.png"
            alt="Nexus"
            style={{ width: 36, height: 36, borderRadius: "var(--r-sm)" }}
          />
          <span style={{
            fontSize: 20, fontWeight: 600, color: "var(--text-primary)",
            letterSpacing: "0.5px",
          }}>
            NEXUS
          </span>
        </div>

        <TimeDisplay />

        {/* App grid */}
        <div style={{
          display: "flex",
          gap: "var(--sp-6)",
          justifyContent: "center",
          flexWrap: "wrap",
        }}>
          {APPS.map((app, i) => (
            <div
              key={app.id}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(30px)",
                transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${150 + i * 80}ms`,
              }}
            >
              <AppCard
                app={app}
                isSelected={selectedApp === app.id}
                onClick={() => handleAppClick(app)}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: "var(--sp-10)",
          fontSize: 12,
          color: "var(--text-dim)",
          letterSpacing: "0.3px",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-3)",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--accent-green)",
            boxShadow: "0 0 6px rgba(95,201,146,0.4)",
          }} />
          All systems operational
        </div>
      </div>
    </div>
  );
}
