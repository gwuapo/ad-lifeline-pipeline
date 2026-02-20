import { useState } from "react";
import { supabase } from "./supabase.js";

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("founder");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isForgot) {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (resetErr) throw resetErr;
        setSuccess("Password reset link sent — check your email.");
      } else if (isSignup) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role, display_name: name.trim() || email.split("@")[0] },
          },
        });
        if (signUpErr) throw signUpErr;
        if (data.user && !data.session) {
          setSuccess("Check your email to confirm your account.");
        } else if (data.session) {
          onAuth(data.session);
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        onAuth(data.session);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-root)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      transition: "background 0.3s",
    }}>
      <div className="animate-fade-scale" style={{
        width: 420,
        maxWidth: "100%",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding: "36px 32px 32px",
        backdropFilter: "var(--glass)",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 10px rgba(99,102,241,0.3)",
            }}>
              <span style={{ fontSize: 15, color: "#fff", fontWeight: 800 }}>A</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: -0.5 }}>
              Ad Lifeline
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: 0 }}>
            {isForgot ? "Enter your email to reset your password" : isSignup ? "Create your account to get started" : "Sign in to your pipeline"}
          </p>
        </div>

        {/* Mode tabs */}
        {!isForgot && (
          <div className="tabs" style={{ marginBottom: 22 }}>
            {[
              { id: "login", label: "Sign In" },
              { id: "signup", label: "Sign Up" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setError(null); setSuccess(null); }}
                className={`tab-btn ${mode === m.id ? "active" : ""}`}
                style={{ flex: 1 }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div style={{ marginBottom: 14 }}>
              <label className="label" style={{ marginTop: 0 }}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="input" />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required className="input" />
          </div>

          {!isForgot && (
            <div style={{ marginBottom: isSignup ? 14 : 20 }}>
              <label className="label" style={{ marginTop: 0 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isSignup ? "Min 6 characters" : "••••••••"} required minLength={6} className="input" />
            </div>
          )}

          {isSignup && !isForgot && (
            <div style={{ marginBottom: 20 }}>
              <label className="label">Role</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { id: "founder", label: "Founder", desc: "Full pipeline access", icon: "◆", color: "var(--accent)" },
                  { id: "editor", label: "Editor", desc: "Assigned ads only", icon: "⚙", color: "var(--yellow)" },
                ].map(r => (
                  <div key={r.id} onClick={() => setRole(r.id)} style={{
                    flex: 1, padding: "13px 14px", borderRadius: "var(--radius-md)",
                    cursor: "pointer", transition: "all var(--transition)",
                    background: role === r.id ? "var(--accent-bg)" : "var(--bg-elevated)",
                    border: `1px solid ${role === r.id ? "var(--accent-border)" : "var(--border)"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: role === r.id ? r.color : "var(--text-muted)" }}>{r.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: role === r.id ? "var(--text-primary)" : "var(--text-secondary)" }}>{r.label}</span>
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="card-flat" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", marginBottom: 14, fontSize: 12.5, color: "var(--red-light)", padding: "10px 14px" }}>
              {error}
            </div>
          )}
          {success && (
            <div className="card-flat" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)", marginBottom: 14, fontSize: 12.5, color: "var(--green-light)", padding: "10px 14px" }}>
              {success}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{
            width: "100%", padding: "12px 0", fontSize: 14,
          }}>
            {loading ? "..." : isForgot ? "Send Reset Link" : isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <span onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
              style={{ fontSize: 12.5, color: "var(--accent-light)", cursor: "pointer", fontWeight: 600 }}>
              Forgot Password?
            </span>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: isForgot ? 18 : 10 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            {isForgot ? "Remember your password? " : isSignup ? "Already have an account? " : "Don't have an account? "}
            <span onClick={() => { setMode(isForgot ? "login" : isSignup ? "login" : "signup"); setError(null); setSuccess(null); }}
              style={{ color: "var(--accent-light)", cursor: "pointer", fontWeight: 600 }}>
              {isForgot ? "Sign In" : isSignup ? "Sign In" : "Sign Up"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
