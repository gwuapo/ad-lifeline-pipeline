import { useState, useEffect, useRef } from "react";

const APPS = [
  {
    id: "pipeline",
    name: "Ad Lifeline",
    description: "Pipeline management, ad tracking, editor workflow, and performance analytics",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
      </svg>
    ),
    gradient: ["#ff6363", "#e8453a"],
    glow: "rgba(255,99,99,0.15)",
    url: "https://studio.nexusholdings.io",
    status: "live",
    tag: "Core",
  },
  {
    id: "brain",
    name: "Stefan Brain",
    description: "AI creative engine for ad scripts, static ads, landing pages, and voiceovers",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A5.5 5.5 0 0 0 5 7.5c0 .96.246 1.863.677 2.65L4 14l3-.8c.927.508 2 .8 3.154.8A5.5 5.5 0 0 0 9.5 2Z"/><path d="M14.5 22a5.5 5.5 0 0 0 .654-10.96 5.5 5.5 0 0 0-9.592-3.463"/><path d="M14.5 22a5.5 5.5 0 0 1-.654-10.96"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14.5" cy="16.5" r="1"/>
      </svg>
    ),
    gradient: ["#a78bfa", "#7c3aed"],
    glow: "rgba(167,139,250,0.15)",
    url: "https://ai.nexusholdings.io",
    status: "live",
    tag: "AI",
  },
  {
    id: "profit",
    name: "Profit Tracker",
    description: "Revenue analytics, margin tracking, ROAS optimization, and financial forecasting",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    gradient: ["#63e2a0", "#22c55e"],
    glow: "rgba(99,226,160,0.15)",
    url: null,
    status: "planned",
    tag: "Finance",
  },
  {
    id: "intel",
    name: "Data Intelligence",
    description: "Cross-platform data synthesis, pattern recognition, and autonomous decision support",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    gradient: ["#6ea8fe", "#3b82f6"],
    glow: "rgba(110,168,254,0.15)",
    url: null,
    status: "planned",
    tag: "Intelligence",
  },
];

function StatusPill({ status }) {
  const map = {
    live: { label: "Live", color: "#63e2a0", bg: "rgba(99,226,160,0.1)", border: "rgba(99,226,160,0.2)" },
    building: { label: "In Development", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.2)" },
    planned: { label: "Planned", color: "#6b6b7b", bg: "rgba(107,107,123,0.08)", border: "rgba(107,107,123,0.15)" },
  };
  const c = map[status] || map.planned;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 500, letterSpacing: "0.3px",
      padding: "4px 10px", borderRadius: 100,
      color: c.color, background: c.bg,
      border: `1px solid ${c.border}`,
    }}>
      {status === "live" && (
        <span className="status-dot" style={{ background: c.color, flexShrink: 0 }} />
      )}
      {c.label}
    </span>
  );
}

function AppCard({ app, index }) {
  const isClickable = !!app.url;

  return (
    <div
      className="glass-card"
      onClick={() => isClickable && window.open(app.url, "_blank")}
      style={{
        width: "100%",
        padding: "28px 26px 24px",
        cursor: isClickable ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        animation: `fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${120 + index * 70}ms both`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 13,
          background: `linear-gradient(135deg, ${app.gradient[0]}, ${app.gradient[1]})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          boxShadow: `0 8px 20px ${app.glow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          flexShrink: 0,
        }}>
          {app.icon}
        </div>
        <StatusPill status={app.status} />
      </div>

      <div>
        <div style={{
          fontSize: 17, fontWeight: 600, color: "var(--text-primary)",
          letterSpacing: "-0.01em", lineHeight: 1.2, marginBottom: 8,
        }}>
          {app.name}
        </div>
        <div style={{
          fontSize: 13, fontWeight: 400, color: "var(--text-secondary)",
          lineHeight: 1.55, letterSpacing: "0.1px",
        }}>
          {app.description}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: "auto", paddingTop: 4,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
          letterSpacing: "0.5px", textTransform: "uppercase",
        }}>
          {app.tag}
        </span>
        {isClickable && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.3s ease",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7"/><path d="M7 7h10v10"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function AuroraBackground() {
  return (
    <div style={{
      position: "fixed", inset: 0, overflow: "hidden",
      background: "#050507", zIndex: 0,
    }}>
      {/* Base gradient mesh */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(88,28,135,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 70% 100%, rgba(30,58,138,0.12) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 20% 80%, rgba(15,82,186,0.08) 0%, transparent 50%)",
      }} />

      {/* Animated aurora orbs */}
      <div style={{
        position: "absolute",
        width: "60vw", height: "60vw", maxWidth: 800, maxHeight: 800,
        top: "-20%", left: "15%",
        background: "radial-gradient(circle, rgba(120,80,220,0.12) 0%, rgba(60,40,160,0.05) 40%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(60px)",
        animation: "aurora 20s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute",
        width: "50vw", height: "50vw", maxWidth: 700, maxHeight: 700,
        bottom: "-15%", right: "10%",
        background: "radial-gradient(circle, rgba(50,100,220,0.1) 0%, rgba(30,60,180,0.04) 40%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(80px)",
        animation: "aurora 25s ease-in-out infinite reverse",
      }} />
      <div style={{
        position: "absolute",
        width: "35vw", height: "35vw", maxWidth: 500, maxHeight: 500,
        top: "40%", right: "30%",
        background: "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 60%)",
        borderRadius: "50%",
        filter: "blur(60px)",
        animation: "aurora 18s ease-in-out infinite 5s",
      }} />

      {/* Light pillars (PS5-inspired) */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0, height: "55%",
        display: "flex", justifyContent: "center", gap: "3vw",
        opacity: 0.25,
        maskImage: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)",
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            width: "2.5vw", maxWidth: 28, height: "100%",
            background: `linear-gradient(to top, rgba(100,140,255,${0.3 + (i % 3) * 0.1}), transparent)`,
            borderRadius: "4px 4px 0 0",
            animation: `pillars ${3 + (i % 4) * 0.8}s ease-in-out infinite ${i * 0.3}s`,
            transformOrigin: "bottom",
          }} />
        ))}
      </div>

      {/* Noise texture overlay */}
      <div style={{
        position: "absolute", inset: 0,
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "128px 128px",
      }} />
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
    <div style={{
      textAlign: "center", marginBottom: 52,
      animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 50ms both",
    }}>
      <div style={{
        fontSize: 64, fontWeight: 200, color: "var(--text-primary)",
        letterSpacing: "-2px", lineHeight: 1,
        fontFeatureSettings: "'tnum'",
      }}>
        {time}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 400, color: "var(--text-tertiary)",
        marginTop: 10, letterSpacing: "0.5px",
      }}>
        {date}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ height: "100%", position: "relative" }}>
      <AuroraBackground />

      <div style={{
        position: "relative", zIndex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}>
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", width: "100%", maxWidth: 1060,
        }}>
          {/* Logo */}
          <div style={{
            marginBottom: 36,
            animation: "fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}>
            <img
              src="/nexus-logo-dark.png"
              alt="Nexus"
              style={{
                height: 40, width: "auto",
                objectFit: "contain",
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
              }}
            />
          </div>

          <TimeDisplay />

          {/* App grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            width: "100%",
          }}>
            {APPS.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} />
            ))}
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 44,
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, fontWeight: 400, color: "var(--text-dim)",
            letterSpacing: "0.2px",
            animation: "fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 600ms both",
          }}>
            <span className="status-dot" style={{ background: "#63e2a0" }} />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}
