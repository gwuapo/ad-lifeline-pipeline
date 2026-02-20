const KEYS = {
  claude: { storage: "al_claude_key", env: "VITE_CLAUDE_API_KEY" },
  gemini: { storage: "al_gemini_key", env: "VITE_GEMINI_API_KEY" },
  apify: { storage: "al_apify_key", env: "VITE_APIFY_API_KEY" },
};

export function getApiKey(service) {
  const k = KEYS[service];
  if (!k) return "";
  return localStorage.getItem(k.storage) || import.meta.env[k.env] || "";
}

export function setApiKey(service, value) {
  const k = KEYS[service];
  if (!k) return;
  localStorage.setItem(k.storage, value);
}

export function isConfigured(service) {
  return !!getApiKey(service).trim();
}

export function getAllKeys() {
  return {
    claude: getApiKey("claude"),
    gemini: getApiKey("gemini"),
    apify: getApiKey("apify"),
  };
}

const DEFAULT_ANALYSIS_PROMPT = `You are an expert direct response advertising analyst. Analyze this ad creative alongside its performance data and audience comments.

If a video is provided, watch it carefully and analyze: pacing, hook effectiveness (first 3 seconds), visual quality, proof elements, CTA clarity, emotional triggers, editing rhythm, and text overlay readability.

Cross-reference what you see in the video with the comment sentiment and performance metrics to find causal connections (e.g. "comments mention confusion about X, and the video doesn't explain X until second 45 — move it earlier").

{AD_DATA}

Respond ONLY in valid JSON, no markdown fences:
{"summary":"2-3 sentence assessment referencing video observations if available","findings":[{"type":"positive|negative|warning|action","text":"specific finding — reference video timestamps and comment themes where relevant"}],"nextIterationPlan":"specific plan if losing, or null if winning","suggestedLearnings":[{"type":"hook_pattern|proof_structure|angle_theme|pacing|visual_style|objection_handling","text":"learning to capture"}]}`;

export function getAnalysisPrompt() {
  return localStorage.getItem("al_analysis_prompt") || DEFAULT_ANALYSIS_PROMPT;
}

export function setAnalysisPrompt(prompt) {
  localStorage.setItem("al_analysis_prompt", prompt);
}

export function resetAnalysisPrompt() {
  localStorage.removeItem("al_analysis_prompt");
  return DEFAULT_ANALYSIS_PROMPT;
}

export { DEFAULT_ANALYSIS_PROMPT };

// ── Model Selection ──

const GEMINI_MODELS = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
  { id: "gemini-3.0-flash-preview", label: "Gemini 3 Flash Preview" },
  { id: "gemini-3.0-pro-preview", label: "Gemini 3 Pro Preview" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
];

const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-haiku-4-20250414", label: "Claude Haiku 4" },
];

export function getSelectedModel(service) {
  const key = service === "gemini" ? "al_gemini_model" : "al_claude_model";
  const def = service === "gemini" ? "gemini-2.0-flash" : "claude-sonnet-4-5-20250514";
  return localStorage.getItem(key) || def;
}

export function setSelectedModel(service, modelId) {
  const key = service === "gemini" ? "al_gemini_model" : "al_claude_model";
  localStorage.setItem(key, modelId);
}

export { GEMINI_MODELS, CLAUDE_MODELS };

// ── Upload Proxy ──

export function getProxyUrl() {
  return localStorage.getItem("al_proxy_url") || import.meta.env.VITE_GEMINI_PROXY_URL || "";
}

export function setProxyUrl(url) {
  localStorage.setItem("al_proxy_url", url);
}

export function isProxyConfigured() {
  return !!getProxyUrl().trim();
}
