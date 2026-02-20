import { useState } from "react";
import { useTheme } from "./ThemeContext.jsx";
import { getTripleWhaleConfig, setTripleWhaleConfig, validateApiKey } from "./tripleWhale.js";
import { getApiKey, setApiKey, isConfigured, getAnalysisPrompt, setAnalysisPrompt, resetAnalysisPrompt, DEFAULT_ANALYSIS_PROMPT, getSelectedModel, setSelectedModel, GEMINI_MODELS, CLAUDE_MODELS, getProxyUrl, setProxyUrl } from "./apiKeys.js";

export default function SettingsPage({ thresholds, setThresholds }) {
  const { isDark, setTheme: setThemeMode } = useTheme();
  const [g, setG] = useState(thresholds.green);
  const [y, setY] = useState(thresholds.yellow);
  const [saved, setSaved] = useState(false);

  // Triple Whale
  const twConf = getTripleWhaleConfig();
  const [twKey, setTwKey] = useState(twConf.apiKey);
  const [twShop, setTwShop] = useState(twConf.shopDomain);
  const [twStatus, setTwStatus] = useState(null);
  const [twLoading, setTwLoading] = useState(false);

  // API Keys
  const [claudeKey, setClaudeKey] = useState(getApiKey("claude"));
  const [geminiKey, setGeminiKey] = useState(getApiKey("gemini"));
  const [apifyKey, setApifyKey] = useState(getApiKey("apify"));
  const [keySaved, setKeySaved] = useState(null);

  // Model selection
  const [claudeModel, setClaudeModel] = useState(getSelectedModel("claude"));
  const [geminiModel, setGeminiModel] = useState(getSelectedModel("gemini"));
  const [proxyUrl, setProxyUrlState] = useState(getProxyUrl());

  // Analysis prompt
  const [prompt, setPrompt] = useState(getAnalysisPrompt());
  const [promptSaved, setPromptSaved] = useState(false);

  const saveThresholds = () => {
    setThresholds({ green: g, yellow: y });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveTw = async () => {
    setTripleWhaleConfig(twKey.trim(), twShop.trim());
    setTwStatus(null);
    if (twKey.trim()) {
      setTwLoading(true);
      try {
        await validateApiKey();
        setTwStatus({ ok: true, msg: "Connected successfully" });
      } catch (e) {
        setTwStatus({ ok: false, msg: e.message });
      }
      setTwLoading(false);
    }
  };

  const saveKey = (service, value) => {
    setApiKey(service, value.trim());
    setKeySaved(service);
    setTimeout(() => setKeySaved(null), 2000);
  };

  const keyStatus = (service) => isConfigured(service);

  return (
    <div className="animate-fade" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Settings</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Configure thresholds, API integrations, and appearance.</p>
      </div>

      {/* Appearance */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Appearance</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 14px" }}>
          Choose between light and dark mode for the interface.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {["light", "dark"].map(m => (
            <button key={m} onClick={() => setThemeMode(m)} className="btn btn-ghost" style={{
              flex: 1, padding: "14px 16px",
              background: (isDark ? "dark" : "light") === m ? "var(--accent-bg)" : "var(--bg-elevated)",
              borderColor: (isDark ? "dark" : "light") === m ? "var(--accent-border)" : "var(--border)",
              color: (isDark ? "dark" : "light") === m ? "var(--accent-light)" : "var(--text-secondary)",
              justifyContent: "flex-start",
            }}>
              <span style={{ fontSize: 18, marginRight: 4 }}>{m === "light" ? "☀️" : "🌙"}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m === "light" ? "Light" : "Dark"}</div>
                <div style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 400 }}>{m === "light" ? "Clean and bright" : "Easy on the eyes"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CPA Thresholds */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">CPA Thresholds</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 14px" }}>
          Ads auto-classify based on latest CPA against these thresholds. All live ads reclassify instantly.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="label" style={{ marginTop: 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--green)", marginRight: 5, verticalAlign: "middle" }} />
              Green (Winner) -- CPA &le;
            </label>
            <input type="number" step="0.01" value={g} onChange={e => setG(+e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" style={{ marginTop: 0 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--yellow)", marginRight: 5, verticalAlign: "middle" }} />
              Yellow (Medium) -- CPA &le;
            </label>
            <input type="number" step="0.01" value={y} onChange={e => setY(+e.target.value)} className="input" />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: "8px 0 14px" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)", marginRight: 5, verticalAlign: "middle" }} />
          Red (Losing) = anything above yellow threshold
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={saveThresholds} className="btn btn-primary btn-sm">Save Thresholds</button>
          {saved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* Analysis Prompt */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Analysis Prompt</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Customize the prompt sent to Gemini/Claude when analyzing ads. Use <code style={{ background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: 4, fontSize: 11.5, color: "var(--accent-light)" }}>{"{{AD_DATA}}"}</code> as a placeholder -- it will be replaced with the ad's metrics, comments, brief, and iteration history at runtime.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="input"
          rows={12}
          style={{ fontFamily: "var(--fm)", fontSize: 11.5, lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <button onClick={() => { setAnalysisPrompt(prompt); setPromptSaved(true); setTimeout(() => setPromptSaved(false), 2000); }} className="btn btn-primary btn-sm">Save Prompt</button>
          <button onClick={() => { const d = resetAnalysisPrompt(); setPrompt(d); setPromptSaved(true); setTimeout(() => setPromptSaved(false), 2000); }} className="btn btn-ghost btn-sm">Reset to Default</button>
          {promptSaved && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* ── AI & SCRAPING INTEGRATIONS ── */}
      <div style={{ marginBottom: 8 }}>
        <div className="section-title" style={{ fontSize: 12, marginBottom: 16 }}>AI & Scraping Integrations</div>
      </div>

      {/* Claude */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>Claude (Anthropic)</div>
          <span className={`badge ${keyStatus("claude") ? "badge-green" : "badge-red"}`}>
            {keyStatus("claude") ? "Connected" : "Not configured"}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Used for text-based ad analysis when no video is provided. Get your key from{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>console.anthropic.com</a>.
        </p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)} className="input" placeholder="sk-ant-..." />
        <label className="label">Model</label>
        <select value={claudeModel} onChange={e => { setClaudeModel(e.target.value); setSelectedModel("claude", e.target.value); }} className="input" style={{ cursor: "pointer" }}>
          {CLAUDE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("claude", claudeKey)} className="btn btn-ghost btn-sm">Save Key</button>
          {keySaved === "claude" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* Gemini */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>Gemini (Google AI)</div>
          <span className={`badge ${keyStatus("gemini") ? "badge-green" : "badge-red"}`}>
            {keyStatus("gemini") ? "Connected" : "Not configured"}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Used for multimodal video analysis -- Gemini watches your ad creative and analyzes visuals, pacing, hooks, and proof elements alongside metrics. Get your key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>aistudio.google.com</a>.
        </p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="input" placeholder="AIza..." />
        <label className="label">Model</label>
        <select value={geminiModel} onChange={e => { setGeminiModel(e.target.value); setSelectedModel("gemini", e.target.value); }} className="input" style={{ cursor: "pointer" }}>
          {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("gemini", geminiKey)} className="btn btn-ghost btn-sm">Save Key</button>
          {keySaved === "gemini" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>

        <div style={{ borderTop: "1px solid var(--border-light)", marginTop: 14, paddingTop: 14 }}>
          <label className="label" style={{ marginTop: 0 }}>Upload Proxy URL <span style={{ fontWeight: 400, textTransform: "none", color: "var(--text-muted)" }}>(for videos over 20MB)</span></label>
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
            Videos under 20MB upload directly. For 20-100MB files, deploy the Cloudflare Worker in <code style={{ background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: 4, fontSize: 11, color: "var(--accent-light)" }}>worker/gemini-proxy.js</code> and paste the URL here. For files over 100MB, compress first with ffmpeg.
          </p>
          <input value={proxyUrl} onChange={e => { setProxyUrlState(e.target.value); setProxyUrl(e.target.value.trim()); }} className="input" placeholder="https://gemini-upload-proxy.your-account.workers.dev" />
          {proxyUrl.trim() && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--green-light)" }}>Proxy configured -- large file uploads enabled</div>}
        </div>
      </div>

      {/* Apify */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>Apify (Comment Scraping)</div>
          <span className={`badge ${keyStatus("apify") ? "badge-green" : "badge-red"}`}>
            {keyStatus("apify") ? "Connected" : "Not configured"}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Scrapes TikTok comments from your ad videos using the{" "}
          <a href="https://apify.com/clockworks/tiktok-comments-scraper" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>TikTok Comments Scraper</a>.
          Get your API token from{" "}
          <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>console.apify.com</a>.
        </p>
        <label className="label" style={{ marginTop: 0 }}>API Token</label>
        <input type="password" value={apifyKey} onChange={e => setApifyKey(e.target.value)} className="input" placeholder="apify_api_..." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button onClick={() => saveKey("apify", apifyKey)} className="btn btn-ghost btn-sm">Save Token</button>
          {keySaved === "apify" && <span style={{ fontSize: 12, color: "var(--green-light)", fontWeight: 600 }}>Saved</span>}
        </div>
      </div>

      {/* Triple Whale */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>Triple Whale (Metrics)</div>
          <span className={`badge ${twConf.apiKey ? "badge-green" : "badge-red"}`}>
            {twConf.apiKey ? "Connected" : "Not configured"}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          Pull ad-level CPA, spend, conversions, CTR, and CPM directly from Triple Whale.
          Go to <span style={{ color: "var(--accent-light)", fontWeight: 600 }}>Settings &rarr; API Keys</span> in your TW dashboard to generate a key with "Summary Page: Read" scope.
        </p>
        <label className="label" style={{ marginTop: 0 }}>API Key</label>
        <input type="password" value={twKey} onChange={e => setTwKey(e.target.value)} className="input" placeholder="tw_api_..." />
        <label className="label">Shop Domain</label>
        <input value={twShop} onChange={e => setTwShop(e.target.value)} className="input" placeholder="your-store.myshopify.com" />
        {twStatus && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--radius-md)", marginTop: 10, fontSize: 12.5, fontWeight: 500,
            background: twStatus.ok ? "var(--green-bg)" : "var(--red-bg)",
            border: `1px solid ${twStatus.ok ? "var(--green-border)" : "var(--red-border)"}`,
            color: twStatus.ok ? "var(--green-light)" : "var(--red-light)",
          }}>
            {twStatus.ok ? "✓" : "✕"} {twStatus.msg}
          </div>
        )}
        <button onClick={saveTw} disabled={twLoading} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>
          {twLoading ? "Validating..." : "Save & Test Connection"}
        </button>
      </div>
    </div>
  );
}
