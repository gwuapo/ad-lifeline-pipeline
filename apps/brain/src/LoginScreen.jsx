import { useState } from "react";
import { signIn } from "./supabase";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      onLogin();
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field) => ({
    width: "100%",
    padding: "12px 0",
    background: "none",
    border: "none",
    borderBottom: `1px solid ${focused === field ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.08)"}`,
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "var(--font)",
    fontWeight: 400,
    letterSpacing: "0.01em",
    outline: "none",
    transition: "border-color 0.25s ease",
  });

  return (
    <div style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-void)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute",
        width: "50vw", height: "50vw", maxWidth: 600, maxHeight: 600,
        top: "-15%", right: "-10%",
        background: "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(80px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        width: "40vw", height: "40vw", maxWidth: 500, maxHeight: 500,
        bottom: "-10%", left: "-5%",
        background: "radial-gradient(circle, rgba(110,168,254,0.04) 0%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(80px)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        width: 360,
        padding: "40px 36px 36px",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        boxShadow: "0 32px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <img
            src="/nexus-logo-dark.png"
            alt="Nexus"
            style={{ height: 24, width: "auto", objectFit: "contain", marginBottom: 24 }}
          />
          <h1 style={{
            fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
            letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 6,
          }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13, fontWeight: 400, color: "var(--text-tertiary)", letterSpacing: "0.01em" }}>
            Sign in to Nexus Brain
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 500,
              color: "var(--text-dim)", textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 6,
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              placeholder="you@company.com"
              required
              style={inputStyle("email")}
            />
          </div>

          <div>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 500,
              color: "var(--text-dim)", textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              placeholder="Enter your password"
              required
              style={inputStyle("password")}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13, fontWeight: 400, color: "#ff6363",
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,99,99,0.06)",
              border: "1px solid rgba(255,99,99,0.1)",
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px 0",
              marginTop: 4,
              background: loading ? "rgba(167,139,250,0.5)" : "var(--accent)",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "var(--font)",
              letterSpacing: "0.01em",
              cursor: loading ? "wait" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: loading ? "none" : "0 4px 12px rgba(167,139,250,0.25)",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
