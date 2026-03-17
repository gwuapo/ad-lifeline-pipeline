import { getApiKey, getSelectedModel, getAnalysisPrompt } from "./apiKeys.js";

const WINNER_ANALYSIS_PROMPT = `You are an elite direct response advertising analyst. A winning ad has been identified (CPA consistently in the green zone). Your job is to deeply analyze WHY this ad is winning so we can replicate and compound its success.

{AD_DATA}

WINNING AD COMMENTS:
{COMMENTS}

PREVIOUS LEARNINGS FROM THIS WORKSPACE (build on these, don't repeat):
{EXISTING_LEARNINGS}

Analyze this winner and extract specific, actionable learnings in these categories. Be extremely specific — reference exact timestamps, phrases, visual elements, and comment patterns.

Respond ONLY in valid JSON:
{
  "winnerSummary": "2-3 sentence summary of WHY this ad wins",
  "learnings": [
    {
      "type": "hook_pattern|proof_structure|angle_theme|pacing|visual_style|objection_handling|audience_insight|offer_positioning",
      "text": "Specific, actionable learning",
      "confidence": "high|medium",
      "evidence": "What data supports this (metric, comment theme, etc.)"
    }
  ],
  "replicationPlan": "How to systematically replicate this winner's success in new ads",
  "commentInsights": [
    {
      "theme": "Recurring comment theme",
      "count_estimate": "rough frequency",
      "implication": "What this means for future creative"
    }
  ],
  "patternMatch": "If this winning pattern matches any known framework (e.g., problem-agitate-solve, social proof lead, authority hook), name it"
}`;

export function buildWinnerAdData(ad, th, channelMetrics) {
  const allMetrics = [];
  if (channelMetrics) {
    for (const [ch, metrics] of Object.entries(channelMetrics)) {
      if (metrics?.length) {
        const totSpend = metrics.reduce((s, m) => s + m.spend, 0);
        const totConv = metrics.reduce((s, m) => s + m.conv, 0);
        const avgCpa = totConv > 0 ? (totSpend / totConv).toFixed(2) : "N/A";
        const avgRoas = metrics.reduce((s, m) => s + (m.roas || 0), 0) / metrics.length;
        allMetrics.push(`${ch.toUpperCase()}: ${metrics.length} days, Spend $${totSpend.toFixed(0)}, ${totConv} conv, Avg CPA $${avgCpa}, ROAS ${avgRoas.toFixed(1)}x`);
        allMetrics.push(`  CPA Trend: ${metrics.map(m => "$" + m.cpa).join(" → ")}`);
      }
    }
  }
  if (ad.metrics?.length) {
    allMetrics.push(`Manual metrics: ${ad.metrics.map(m => `$${m.cpa} CPA`).join(" → ")}`);
  }

  const sn = { positive: 0, negative: 0, neutral: 0 };
  (ad.comments || []).forEach(c => sn[c.sentiment]++);

  return `WINNING AD: "${ad.name}" (${ad.type})
BRIEF: ${ad.brief || "N/A"}
NOTES: ${ad.notes || "N/A"}
STATUS: Winner — CPA consistently below ${th.green} threshold
ITERATIONS: ${ad.iterations} (${ad.iterHistory?.map(h => h.reason).join("; ") || "none"})

PERFORMANCE:
${allMetrics.join("\n") || "No metrics available"}

COMMENT SENTIMENT: ${sn.positive} positive, ${sn.negative} negative, ${sn.neutral} neutral (${ad.comments?.length || 0} total)`;
}

export async function analyzeWinner(ad, th, existingLearnings = []) {
  const geminiKey = getApiKey("gemini").trim();
  const claudeKey = getApiKey("claude").trim();
  if (!geminiKey && !claudeKey) return null;

  const adData = buildWinnerAdData(ad, th, ad.channelMetrics);
  const comments = (ad.comments || [])
    .map(c => `"${c.text}" [${c.sentiment}]${c.hidden ? " [HIDDEN]" : ""}`)
    .join("\n") || "No comments scraped";

  const existingLearningsText = existingLearnings.length > 0
    ? existingLearnings.map(l => `[${l.type}] ${l.text}`).join("\n")
    : "None yet — this is the first winner analysis";

  const prompt = WINNER_ANALYSIS_PROMPT
    .replace("{AD_DATA}", adData)
    .replace("{COMMENTS}", comments)
    .replace("{EXISTING_LEARNINGS}", existingLearningsText);

  try {
    let text;
    let engine;

    if (geminiKey) {
      engine = getSelectedModel("gemini");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${engine}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4096 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error (${res.status})`);
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    } else {
      engine = getSelectedModel("claude");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: engine,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Claude error (${res.status})`);
      const data = await res.json();
      text = data.content?.[0]?.text || "";
    }

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return { ...parsed, engine, ts: new Date().toISOString() };
  } catch (e) {
    console.error("Winner analysis failed:", e);
    return null;
  }
}

// Format learnings for injection into research/generation prompts
export function formatLearningsForContext(learnings) {
  if (!learnings.length) return "";

  const grouped = {};
  learnings.forEach(l => {
    const type = l.type || "general";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(l);
  });

  let context = "\n\n=== INTELLIGENCE FLYWHEEL: PROVEN LEARNINGS FROM LIVE ADS ===\n";
  context += "These learnings are extracted from winning ads. Use them to inform your output.\n\n";

  for (const [type, items] of Object.entries(grouped)) {
    context += `[${type.replace(/_/g, " ").toUpperCase()}]\n`;
    items.forEach(l => {
      context += `- ${l.text}`;
      if (l.adName) context += ` (from: "${l.adName}")`;
      if (l.confidence) context += ` [${l.confidence} confidence]`;
      context += "\n";
    });
    context += "\n";
  }

  return context;
}
