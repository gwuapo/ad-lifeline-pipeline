import { useState } from "react";
import { signIn } from "./supabase";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-void)",
    }}>
      <div style={{
        width: 380, padding: 32,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/nexus-logo-dark.png" alt="Nexus" style={{ height: 28, width: "auto", objectFit: "contain", marginBottom: 16 }} />
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Sign in to Brain
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6 }}>
            Use your Nexus account
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            style={{
              width: "100%", padding: "11px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, color: "var(--text-primary)",
              fontSize: 14, fontFamily: "var(--font)", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            style={{
              width: "100%", padding: "11px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, color: "var(--text-primary)",
              fontSize: 14, fontFamily: "var(--font)", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
          />

          {error && (
            <div style={{
              fontSize: 13, color: "var(--red)",
              padding: "8px 12px", borderRadius: 8,
              background: "rgba(255,99,99,0.08)",
              border: "1px solid rgba(255,99,99,0.15)",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "11px 0", marginTop: 4,
              background: "var(--accent)", border: "none", borderRadius: 10,
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
