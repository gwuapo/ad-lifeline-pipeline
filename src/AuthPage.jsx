import { useState } from "react";
import { supabase } from "./supabase.js";

export default function AuthPage({ onAuth, authError }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(authError ? `${authError}. Please sign in with your credentials.` : null);
  const [success, setSuccess] = useState(null);

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
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
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
            {isForgot ? "Enter your email to reset your password" : "Sign in to your pipeline"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ marginTop: 0 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required className="input" />
          </div>

          {!isForgot && (
            <div style={{ marginBottom: 20 }}>
              <label className="label" style={{ marginTop: 0 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="input" />
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

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 14 }}>
            {loading ? "..." : isForgot ? "Send Reset Link" : "Sign In"}
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

        {isForgot && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <span onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
              style={{ fontSize: 12.5, color: "var(--accent-light)", cursor: "pointer", fontWeight: 600 }}>
              Back to Sign In
            </span>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20, padding: "12px 0", borderTop: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            This app is invite-only. Contact your admin to get access.
          </div>
        </div>
      </div>
    </div>
  );
}
