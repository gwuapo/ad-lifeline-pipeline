import { useState, useRef } from "react";
import { saveEditorProfile } from "./editorProfiles.js";

export default function EditorOnboarding({ email, displayName, onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(displayName || "");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [compensationRate, setCompensationRate] = useState("");
  const [weeklyMinutes, setWeeklyMinutes] = useState("");
  const fileRef = useRef(null);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Photo must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    saveEditorProfile(email, {
      displayName: name.trim(),
      photoUrl: photoPreview || null,
      portfolioUrl: portfolioUrl.trim(),
      compensationRate: compensationRate.trim(),
      weeklyMinutes: parseInt(weeklyMinutes) || 0,
      onboardedAt: new Date().toISOString(),
    });
    onComplete(name.trim());
  };

  const canSubmit = name.trim() && portfolioUrl.trim() && compensationRate.trim() && weeklyMinutes;

  const steps = [
    {
      title: "Welcome to Ad Lifeline",
      desc: "Let's set up your editor profile. This takes about 1 minute.",
      content: (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            We need a few details to get you set up in the pipeline.
            Your responses will be visible to founders.
          </p>
        </div>
      ),
    },
    {
      title: "Your Profile",
      desc: "Upload a headshot and confirm your name.",
      content: (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div onClick={() => fileRef.current?.click()} style={{
              width: 80, height: 80, borderRadius: "var(--radius-full)",
              background: photoPreview ? `url(${photoPreview}) center/cover` : "var(--bg-elevated)",
              border: "2px dashed var(--border)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all var(--transition)",
            }}>
              {!photoPreview && <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.3 }}>Upload<br/>Photo</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            <div style={{ flex: 1 }}>
              <label className="label" style={{ marginTop: 0 }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Your full name" />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Portfolio & Rate",
      desc: "Share your work and agreed compensation.",
      content: (
        <div>
          <label className="label" style={{ marginTop: 0 }}>Portfolio URL</label>
          <input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} className="input" placeholder="https://yourportfolio.com or Google Drive link" />
          <label className="label">Agreed Compensation Rate</label>
          <input value={compensationRate} onChange={e => setCompensationRate(e.target.value)} className="input" placeholder="e.g. $20/minute edited" />
          <label className="label">Weekly Editing Capacity (minutes of video)</label>
          <input type="number" value={weeklyMinutes} onChange={e => setWeeklyMinutes(e.target.value)} className="input" placeholder="e.g. 60" min="1" />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Maximum minutes of finished video you can edit per week.</p>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-root)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="animate-fade-scale" style={{
        width: 480, maxWidth: "100%",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)", padding: "36px 32px 28px",
        backdropFilter: "var(--glass)", boxShadow: "var(--shadow-lg)",
      }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? "var(--accent)" : "var(--border-light)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{current.title}</h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>{current.desc}</p>
        </div>

        {current.content}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {step > 0
            ? <button onClick={() => setStep(step - 1)} className="btn btn-ghost btn-sm">Back</button>
            : <div />}
          {isLast
            ? <button onClick={handleSubmit} disabled={!canSubmit} className="btn btn-primary btn-sm">Complete Setup</button>
            : <button onClick={() => setStep(step + 1)} className="btn btn-primary btn-sm">Continue</button>}
        </div>
      </div>
    </div>
  );
}
