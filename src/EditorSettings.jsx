import { useState, useEffect, useRef } from "react";
import { fetchEditorProfile, upsertEditorProfile } from "./supabaseData.js";

const PAYMENT_METHODS = [
  { key: "usd_bank", label: "USD Bank Account", fields: [
    { key: "bank_name", label: "Bank Name", placeholder: "e.g. Chase, Wells Fargo" },
    { key: "account_holder", label: "Account Holder Name", placeholder: "Full legal name" },
    { key: "account_type", label: "Account Type", placeholder: "Checking or Savings", type: "select", options: ["Checking", "Savings"] },
    { key: "account_number", label: "Account Number", placeholder: "Account number" },
    { key: "routing_number", label: "Routing Number", placeholder: "9-digit routing number" },
    { key: "swift", label: "SWIFT / BIC (international)", placeholder: "Optional for international" },
    { key: "bank_address", label: "Bank Address", placeholder: "Full bank branch address" },
    { key: "recipient_address", label: "Recipient Legal Address", placeholder: "Your legal address for wire transfers" },
  ]},
  { key: "crypto", label: "USDT / USDC Wallet", fields: [
    { key: "wallet_address", label: "Wallet Address", placeholder: "0x... or T..." },
    { key: "chain", label: "Chain / Network", placeholder: "e.g. ERC-20, TRC-20, SOL, BEP-20", type: "select", options: ["ERC-20 (Ethereum)", "TRC-20 (Tron)", "BEP-20 (BSC)", "SOL (Solana)", "Polygon", "Arbitrum", "Other"] },
    { key: "token", label: "Token", placeholder: "USDT or USDC", type: "select", options: ["USDT", "USDC"] },
  ]},
  { key: "paypal", label: "PayPal", fields: [
    { key: "paypal_email", label: "PayPal Email", placeholder: "your@email.com" },
    { key: "paypal_name", label: "Account Holder Name", placeholder: "Full name on PayPal" },
  ]},
  { key: "cih", label: "CIH Bank (Morocco)", fields: [
    { key: "cih_name", label: "Account Holder Name", placeholder: "Full name" },
    { key: "cih_rib", label: "RIB Number", placeholder: "24-digit RIB" },
    { key: "cih_iban", label: "IBAN", placeholder: "MA..." },
    { key: "cih_qr", label: "CIH QR Code", type: "image" },
  ]},
];

export default function EditorSettings({ userId, userName }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [name, setName] = useState(userName || "");
  const [portfolio, setPortfolio] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState("");
  const [paymentMethods, setPaymentMethods] = useState({});
  const [activePayment, setActivePayment] = useState("usd_bank");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetchEditorProfile(userId).then(p => {
      if (p) {
        setProfile(p);
        setName(p.display_name || userName || "");
        setPhoto(p.photo_url || null);
        setPortfolio(p.portfolio_url || "");
        setWeeklyMinutes(p.weekly_minutes || "");
        setPaymentMethods(p.payment_methods || {});
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Photo must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const updatePaymentField = (methodKey, fieldKey, value) => {
    setPaymentMethods(prev => ({
      ...prev,
      [methodKey]: { ...(prev[methodKey] || {}), [fieldKey]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertEditorProfile(userId, {
        display_name: name.trim(),
        photo_url: photo,
        portfolio_url: portfolio.trim(),
        weekly_minutes: parseInt(weeklyMinutes) || 0,
        payment_methods: paymentMethods,
      });
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2200);
    } catch (e) {
      alert("Error saving: " + e.message);
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>;

  const cardS = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 16 };
  const labelS = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" };
  const inputS = { width: "100%", padding: "8px 12px", fontSize: 13, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none" };
  const mutedS = { fontSize: 11, color: "var(--text-muted)", marginTop: 3 };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Settings</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your profile, availability, and payment methods.</p>

      {/* Profile Card */}
      <div style={cardS}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Profile</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <div style={{ position: "relative", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
            {photo
              ? <img src={photo} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
              : <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent-bg)", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{(name || "E")[0]}</div>}
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>✎</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelS}>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputS} placeholder="Your name" />
          </div>
        </div>
        <label style={labelS}>Portfolio URL</label>
        <input value={portfolio} onChange={e => setPortfolio(e.target.value)} style={inputS} placeholder="https://yourportfolio.com or Google Drive link" />
      </div>

      {/* Availability Card */}
      <div style={cardS}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Availability</div>
        <p style={mutedS}>How many minutes of finished video can you edit per week?</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input type="number" value={weeklyMinutes} onChange={e => setWeeklyMinutes(e.target.value)} style={{ ...inputS, width: 120 }} placeholder="e.g. 60" min="1" />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>minutes / week</span>
        </div>
        {profile?.compensation_rate && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>Your rate:</span>{" "}
            <span style={{ color: "var(--green-light)", fontWeight: 600 }}>${parseFloat(String(profile.compensation_rate).replace(/[^0-9.]/g, "")) || profile.compensation_rate}/min</span>
            <span style={{ color: "var(--text-muted)", marginLeft: 4, fontSize: 10 }}>(set by admin)</span>
          </div>
        )}
      </div>

      {/* Payment Methods Card */}
      <div style={cardS}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Payment Methods</div>
        <p style={mutedS}>Add your preferred payment methods so we can pay you easily.</p>

        {/* Method Tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 16, flexWrap: "wrap" }}>
          {PAYMENT_METHODS.map(m => {
            const hasData = paymentMethods[m.key] && Object.values(paymentMethods[m.key]).some(v => v);
            return (
              <button key={m.key} onClick={() => setActivePayment(m.key)} style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                border: activePayment === m.key ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                background: activePayment === m.key ? "var(--accent-bg)" : "var(--bg-elevated)",
                color: activePayment === m.key ? "var(--accent)" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {m.label}
                {hasData && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>

        {/* Active Method Fields */}
        {PAYMENT_METHODS.filter(m => m.key === activePayment).map(method => (
          <div key={method.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {method.fields.map(field => (
              <div key={field.key}>
                <label style={labelS}>{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={paymentMethods[method.key]?.[field.key] || ""}
                    onChange={e => updatePaymentField(method.key, field.key, e.target.value)}
                    style={inputS}
                  >
                    <option value="">Select...</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === "image" ? (
                  <div>
                    {paymentMethods[method.key]?.[field.key] ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <img src={paymentMethods[method.key][field.key]} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                        <button onClick={() => updatePaymentField(method.key, field.key, null)} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "var(--red)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    ) : (
                      <div onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = (ev) => { const f = ev.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; } const r = new FileReader(); r.onload = () => updatePaymentField(method.key, field.key, r.result); r.readAsDataURL(f); }; inp.click(); }}
                        style={{ width: 200, height: 120, borderRadius: 8, border: "2px dashed var(--border)", background: "var(--bg-elevated)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{ fontSize: 24 }}>📷</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Upload QR Code</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    value={paymentMethods[method.key]?.[field.key] || ""}
                    onChange={e => updatePaymentField(method.key, field.key, e.target.value)}
                    style={inputS}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ padding: "10px 28px", fontSize: 13 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {saveToast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "var(--green)", color: "#fff", padding: "10px 24px",
          borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 99999,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "toastIn 0.3s ease-out",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>&#10003;</span> Changes saved
        </div>
      )}
    </div>
  );
}
