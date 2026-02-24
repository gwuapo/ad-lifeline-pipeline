import { getApiKey, getSelectedModel, getResearchPrompt, getResearchModelAssignment } from "./apiKeys.js";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const OPENAI_API = "https://api.openai.com/v1/chat/completions";

async function callGemini(prompt) {
  const key = getApiKey("gemini").trim();
  if (!key) throw new Error("Gemini API key not configured");
  const model = getSelectedModel("gemini");
  const res = await fetch(`${GEMINI_API}/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
}

async function callClaude(prompt) {
  const key = getApiKey("claude").trim();
  if (!key) throw new Error("Claude API key not configured");
  const model = getSelectedModel("claude");
  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callOpenAI(prompt) {
  const key = getApiKey("openai").trim();
  if (!key) throw new Error("OpenAI API key not configured");
  const model = getSelectedModel("openai");
  const res = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function callModel(service, prompt) {
  switch (service) {
    case "gemini": return callGemini(prompt);
    case "claude": return callClaude(prompt);
    case "openai": return callOpenAI(prompt);
    default: throw new Error(`Unknown model service: ${service}`);
  }
}

function fillPromptVars(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "N/A");
  }
  return result;
}

// Research pipeline steps in order
export const RESEARCH_STEPS = [
  { id: "market_awareness", label: "Market Awareness", description: "Assess awareness & sophistication spectrum" },
  { id: "competitor_research", label: "Competitor Research", description: "Map competitor landscape" },
  { id: "psychographic_gemini", label: "Psychographic (Gemini)", description: "Deep psychographic research via Gemini" },
  { id: "psychographic_claude", label: "Psychographic (Claude)", description: "Deep psychographic research via Claude" },
  { id: "psychographic_openai", label: "Psychographic (GPT-4o)", description: "Deep psychographic research via GPT-4o" },
  { id: "psychographic_summary", label: "Psychographic Summary", description: "Consolidate 3 psychographic analyses" },
  { id: "unified_document", label: "Unified Document", description: "Final knowledge base synthesis" },
];

export async function runResearchStep(step, productDetails, previousOutputs, onStatus) {
  const vars = {
    PRODUCT_NAME: productDetails.name || "",
    PRODUCT_DESCRIPTION: productDetails.description || "",
    PRODUCT_NICHE: productDetails.niche || "",
    TARGET_AUDIENCE: productDetails.targetAudience || "",
    KEY_CLAIMS: productDetails.keyClaims || "",
    PRICE_POINT: productDetails.pricePoint || "",
    PRODUCT_URL: productDetails.url || "",
    PREV_MARKET_AWARENESS: previousOutputs.market_awareness || "Not yet completed",
    PREV_COMPETITOR_RESEARCH: previousOutputs.competitor_research || "Not yet completed",
    PSYCHO_GEMINI: previousOutputs.psychographic_gemini || "Not yet completed",
    PSYCHO_CLAUDE: previousOutputs.psychographic_claude || "Not yet completed",
    PSYCHO_OPENAI: previousOutputs.psychographic_openai || "Not yet completed",
    PREV_PSYCHOGRAPHIC_SUMMARY: previousOutputs.psychographic_summary || "Not yet completed",
  };

  // Determine which prompt template and model to use
  let promptKey = step;
  let service = getResearchModelAssignment(step);

  // Psychographic steps all use the same prompt template
  if (step.startsWith("psychographic_") && step !== "psychographic_summary") {
    promptKey = "psychographic_research";
    // Force the model based on step name
    if (step === "psychographic_gemini") service = "gemini";
    if (step === "psychographic_claude") service = "claude";
    if (step === "psychographic_openai") service = "openai";
  }

  const template = getResearchPrompt(promptKey);
  const prompt = fillPromptVars(template, vars);

  if (onStatus) onStatus(`Running ${step} with ${service}...`);
  const output = await callModel(service, prompt);
  return { output, model: service, prompt };
}

export function parseKnowledgeBase(unifiedOutput) {
  try {
    const cleaned = unifiedOutput.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      avatars: [],
      objections: [],
      competitors: [],
      unique_mechanisms: [],
      awareness_level: {},
      winning_angles: [],
      full_document: unifiedOutput,
    };
  }
}
