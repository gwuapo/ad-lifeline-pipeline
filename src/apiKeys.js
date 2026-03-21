import { supabase } from "./supabase.js";

const KEYS = {
  claude: { storage: "al_claude_key", env: "VITE_CLAUDE_API_KEY" },
  gemini: { storage: "al_gemini_key", env: "VITE_GEMINI_API_KEY" },
  openai: { storage: "al_openai_key", env: "VITE_OPENAI_API_KEY" },
  apify: { storage: "al_apify_key", env: "VITE_APIFY_API_KEY" },
  tiktok_access_token: { storage: "al_tiktok_access_token", env: "VITE_TIKTOK_ACCESS_TOKEN" },
  tiktok_advertiser_id: { storage: "al_tiktok_advertiser_id", env: "VITE_TIKTOK_ADVERTISER_ID" },
};

// Workspace-level key cache (loaded once on workspace init)
let _wsKeys = {};
let _wsId = null;

export async function loadWorkspaceKeys(workspaceId) {
  if (!workspaceId) return;
  _wsId = workspaceId;
  try {
    const { data } = await supabase
      .from("workspace_settings")
      .select("api_keys")
      .eq("workspace_id", workspaceId)
      .single();
    _wsKeys = data?.api_keys || {};
  } catch (e) {
    _wsKeys = {};
  }
}

export async function saveWorkspaceKey(workspaceId, service, value) {
  _wsKeys[service] = value;
  _wsId = workspaceId;
  try {
    // Upsert the api_keys column
    const { data: existing } = await supabase
      .from("workspace_settings")
      .select("api_keys")
      .eq("workspace_id", workspaceId)
      .single();
    const merged = { ...(existing?.api_keys || {}), [service]: value };
    await supabase
      .from("workspace_settings")
      .upsert({ workspace_id: workspaceId, api_keys: merged }, { onConflict: "workspace_id" });
  } catch (e) {
    console.error("Failed to save workspace key:", e);
  }
}

export function getApiKey(service) {
  const k = KEYS[service];
  // Priority: workspace-level > localStorage > env var
  const wsVal = _wsKeys[service];
  if (wsVal?.trim()) return wsVal;
  if (!k) return wsVal || "";
  return localStorage.getItem(k.storage) || import.meta.env[k.env] || "";
}

export function setApiKey(service, value) {
  const k = KEYS[service];
  // Save to workspace if we have a workspace ID
  if (_wsId) {
    saveWorkspaceKey(_wsId, service, value.trim());
  }
  // Also save to localStorage as fallback
  if (k) localStorage.setItem(k.storage, value);
}

export function isConfigured(service) {
  return !!getApiKey(service).trim();
}

export function getAllKeys() {
  return {
    claude: getApiKey("claude"),
    gemini: getApiKey("gemini"),
    openai: getApiKey("openai"),
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
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (Preview)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

const CLAUDE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-5-20250514", label: "Claude Sonnet 4.5" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
];

const OPENAI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "o3-mini", label: "o3 Mini" },
];

const MODEL_KEYS = { gemini: "al_gemini_model", claude: "al_claude_model", openai: "al_openai_model" };
const MODEL_DEFAULTS = { gemini: "gemini-2.5-flash", claude: "claude-sonnet-4-6", openai: "gpt-4o" };

export function getSelectedModel(service) {
  return localStorage.getItem(MODEL_KEYS[service] || MODEL_KEYS.gemini) || MODEL_DEFAULTS[service] || MODEL_DEFAULTS.gemini;
}

export function setSelectedModel(service, modelId) {
  localStorage.setItem(MODEL_KEYS[service] || MODEL_KEYS.gemini, modelId);
}

export { GEMINI_MODELS, CLAUDE_MODELS, OPENAI_MODELS };

// ── Research Prompts ──

const DEFAULT_RESEARCH_PROMPTS = {
  market_awareness: `You are a direct response marketing strategist. Analyze the following product and assess where its market sits on Eugene Schwartz's awareness spectrum and the sophistication spectrum.

Product: {PRODUCT_NAME}
Description: {PRODUCT_DESCRIPTION}
Niche: {PRODUCT_NICHE}
Target Audience: {TARGET_AUDIENCE}
Key Claims: {KEY_CLAIMS}
Price Point: {PRICE_POINT}

Provide a detailed analysis covering:
1. Market Awareness Level (Unaware, Problem-Aware, Solution-Aware, Product-Aware, Most-Aware)
2. Market Sophistication Level (1-5)
3. Implications for messaging strategy
4. Recommended approach for each awareness stage
5. Key messaging angles based on awareness/sophistication position

Format as a structured research document.`,

  competitor_research: `You are a competitive intelligence analyst. Research and map the competitive landscape for this product.

Product: {PRODUCT_NAME}
Description: {PRODUCT_DESCRIPTION}
Niche: {PRODUCT_NICHE}
Price Point: {PRICE_POINT}

Previous Research:
{PREV_MARKET_AWARENESS}

Analyze:
1. Top 5-10 direct competitors with positioning, claims, pricing, and channels
2. Indirect competitors and alternative solutions
3. Market gaps and underserved segments
4. Competitor ad strategies and messaging themes
5. Pricing landscape and value positioning opportunities
6. Weaknesses in competitor approaches that can be exploited

Format as a structured competitive analysis document.`,

  psychographic_research: `You are a consumer psychologist specializing in direct response marketing. Conduct deep psychographic research for this product's target audience.

Product: {PRODUCT_NAME}
Description: {PRODUCT_DESCRIPTION}
Niche: {PRODUCT_NICHE}
Target Audience: {TARGET_AUDIENCE}
Key Claims: {KEY_CLAIMS}

Previous Research:
{PREV_MARKET_AWARENESS}
{PREV_COMPETITOR_RESEARCH}

Provide exhaustive analysis of:
1. Core desires and motivations (both stated and hidden)
2. Fears, anxieties, and pain points
3. Objections and buying resistance
4. Language patterns and phrases they use
5. Emotional triggers that drive action
6. Identity and aspirational self-image
7. Trust barriers and proof requirements
8. Decision-making process and timeline
9. Influence sources and authority figures they trust
10. Common confusions and misconceptions

Be specific and actionable. Include example phrases and emotional states.`,

  psychographic_summary: `You are a research synthesis expert. You have three independent psychographic research documents produced by different AI models for the same product. Consolidate them into a unified, comprehensive summary.

Product: {PRODUCT_NAME}

Document 1 (Gemini):
{PSYCHO_GEMINI}

Document 2 (Claude):
{PSYCHO_CLAUDE}

Document 3 (GPT-4o):
{PSYCHO_OPENAI}

Create a unified psychographic profile that:
1. Identifies points of agreement across all three analyses
2. Highlights unique insights from each that the others missed
3. Resolves any contradictions with reasoned judgment
4. Produces a definitive avatar profile with desires, fears, objections
5. Lists the strongest emotional triggers and proof requirements
6. Provides a ranked list of messaging angles based on combined insights`,

  unified_document: `You are a marketing intelligence strategist. Create the definitive product knowledge base by synthesizing ALL previous research into a single, comprehensive document.

Product: {PRODUCT_NAME}
Description: {PRODUCT_DESCRIPTION}

Research Inputs:
Market Awareness Analysis:
{PREV_MARKET_AWARENESS}

Competitor Research:
{PREV_COMPETITOR_RESEARCH}

Consolidated Psychographic Research:
{PREV_PSYCHOGRAPHIC_SUMMARY}

Create the Unified Deep Research Document containing:

1. EXECUTIVE SUMMARY - Key findings and strategic recommendations

2. AVATARS - Detailed profiles of 2-4 target customer avatars with:
   - Demographics, psychographics, core desires
   - Language patterns and emotional states
   - Buying triggers and objection patterns

3. OBJECTIONS & CONFUSIONS - Complete list with counter-arguments

4. COMPETITOR LANDSCAPE - Positioning map, gaps, opportunities

5. UNIQUE MECHANISM OPTIONS - 3-5 potential unique mechanisms/angles

6. AWARENESS & SOPHISTICATION STRATEGY - How to message at each level

7. WINNING ANGLE HYPOTHESES - Top 10 angles ranked by predicted effectiveness

8. PROOF REQUIREMENTS - What types of proof will move this market

This document becomes the permanent truth source for all marketing decisions.

Respond ONLY in valid JSON:
{"avatars":[{"name":"...","description":"...","desires":["..."],"fears":["..."],"objections":["..."],"language":["..."]}],"objections":[{"objection":"...","counter":"..."}],"competitors":[{"name":"...","positioning":"...","weakness":"..."}],"unique_mechanisms":[{"name":"...","description":"..."}],"awareness_level":{"level":"...","sophistication":"...","strategy":"..."},"winning_angles":[{"angle":"...","rationale":"...","predicted_strength":"high|medium|low"}],"full_document":"... (the complete narrative document as a single string)"}`
};

export function getResearchPrompt(step) {
  return localStorage.getItem("al_research_prompt_" + step) || DEFAULT_RESEARCH_PROMPTS[step] || "";
}

export function setResearchPrompt(step, prompt) {
  localStorage.setItem("al_research_prompt_" + step, prompt);
}

export function resetResearchPrompt(step) {
  localStorage.removeItem("al_research_prompt_" + step);
  return DEFAULT_RESEARCH_PROMPTS[step] || "";
}

export function getResearchModelAssignment(step) {
  return localStorage.getItem("al_research_model_" + step) || getDefaultResearchModel(step);
}

export function setResearchModelAssignment(step, service) {
  localStorage.setItem("al_research_model_" + step, service);
}

function getDefaultResearchModel(step) {
  switch (step) {
    case "market_awareness": return "gemini";
    case "competitor_research": return "claude";
    case "psychographic_gemini": return "gemini";
    case "psychographic_claude": return "claude";
    case "psychographic_openai": return "openai";
    case "psychographic_summary": return "claude";
    case "unified_document": return "gemini";
    default: return "gemini";
  }
}

export { DEFAULT_RESEARCH_PROMPTS };

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
