import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MODEL = "claude-opus-4-0-20250115";

// Opus pricing per million tokens
const INPUT_COST_PER_M = 15;
const OUTPUT_COST_PER_M = 75;

function loadKnowledge(relativePath) {
  const fullPath = join(process.cwd(), "knowledge", relativePath);
  if (!existsSync(fullPath)) return "";
  return readFileSync(fullPath, "utf-8");
}

function loadAllInDir(dir) {
  const dirPath = join(process.cwd(), "knowledge", dir);
  if (!existsSync(dirPath)) return "";
  const { readdirSync } = require("fs");
  const files = readdirSync(dirPath).filter(f => f.endsWith(".md"));
  return files.map(f => readFileSync(join(dirPath, f), "utf-8")).join("\n\n---\n\n");
}

const BASE_SYSTEM = `You are Stefan Brain, an elite direct response marketing AI assistant built for Nexus Holdings. You are sharp, strategic, and deeply knowledgeable about direct response advertising, media buying, creative strategy, and conversion optimization.

Your expertise covers:
- Direct response ad creative (UGC, VSL, static ads, landing pages)
- Ad angle discovery and avatar research
- Ad copywriting (hooks, scripts, headlines, body copy)
- Creative strategy and testing frameworks
- Funnel analysis and CRO
- Media buying strategy (Meta, TikTok, YouTube)

When using tools, break your work into clear steps and explain your thinking. Be concise but thorough. Use markdown formatting for readability.`;

const TOOL_CONFIGS = {
  angle_finder: {
    steps: [
      "Analyzing product and market positioning",
      "Researching target avatar pain points",
      "Mapping emotional triggers and desires",
      "Identifying untapped angles",
      "Ranking angles by estimated impact",
    ],
    knowledgeFiles: ["tools/angle-finder.md"],
    swipeFiles: ["swipe/winning-hooks.md", "swipe/frameworks.md"],
    brandFiles: ["brand/avatars.md", "brand/products.md"],
    estimatedOutputTokens: 2500,
  },
  ad_copy: {
    steps: [
      "Analyzing brief and target audience",
      "Crafting hook variations",
      "Writing body copy and script",
      "Generating CTA variations",
      "Reviewing and polishing",
    ],
    knowledgeFiles: ["tools/ad-copy.md"],
    swipeFiles: ["swipe/winning-hooks.md", "swipe/winning-scripts.md", "swipe/frameworks.md"],
    brandFiles: ["brand/voice.md", "brand/avatars.md", "brand/products.md"],
    estimatedOutputTokens: 3000,
  },
  static_ad: {
    steps: [
      "Analyzing creative brief",
      "Designing layout concepts",
      "Writing headline and copy",
      "Specifying visual elements",
      "Creating design specifications",
    ],
    knowledgeFiles: ["tools/static-ad.md"],
    swipeFiles: ["swipe/winning-hooks.md", "swipe/frameworks.md"],
    brandFiles: ["brand/voice.md", "brand/products.md"],
    estimatedOutputTokens: 2000,
  },
};

function detectTool(messages) {
  const lastMsg = messages[messages.length - 1]?.content || "";
  if (lastMsg.includes("[Angle Finder]")) return "angle_finder";
  if (lastMsg.includes("[Ad Copy]")) return "ad_copy";
  if (lastMsg.includes("[Static Ad]")) return "static_ad";
  return null;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 3.5);
}

function buildSystemPrompt(toolId) {
  let prompt = BASE_SYSTEM;
  const toolConfig = toolId ? TOOL_CONFIGS[toolId] : null;

  if (toolConfig) {
    for (const f of toolConfig.knowledgeFiles) {
      const content = loadKnowledge(f);
      if (content) prompt += `\n\n--- TOOL SOP ---\n${content}`;
    }
    for (const f of toolConfig.swipeFiles) {
      const content = loadKnowledge(f);
      if (content && content.length > 200) prompt += `\n\n--- SWIPE REFERENCE ---\n${content}`;
    }
    for (const f of toolConfig.brandFiles) {
      const content = loadKnowledge(f);
      if (content && content.length > 100) prompt += `\n\n--- BRAND CONTEXT ---\n${content}`;
    }
  }

  return prompt;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, messages, action } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "API key required" });
  }

  const toolId = detectTool(messages);
  const toolConfig = toolId ? TOOL_CONFIGS[toolId] : null;

  // ESTIMATE mode: return token/cost estimate without executing
  if (action === "estimate") {
    const systemPrompt = buildSystemPrompt(toolId);
    const conversationText = messages.map(m => m.content).join(" ");
    const inputTokens = estimateTokens(systemPrompt + conversationText);
    const outputTokens = toolConfig?.estimatedOutputTokens || 1500;

    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
    const totalCost = inputCost + outputCost;

    // Range: 0.8x to 1.3x estimate
    const lowCost = totalCost * 0.8;
    const highCost = totalCost * 1.3;

    return res.status(200).json({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: {
        low: Math.max(0.001, lowCost).toFixed(3),
        high: highCost.toFixed(3),
        currency: "USD",
      },
      model: MODEL,
      tool: toolId,
    });
  }

  // EXECUTE mode: stream the response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = new Anthropic({ apiKey });

    if (toolConfig) {
      for (let i = 0; i < toolConfig.steps.length; i++) {
        send({ type: "tool_step", text: toolConfig.steps[i] });
        await new Promise(r => setTimeout(r, 500));
        send({ type: "tool_step_done" });
      }
    }

    const systemPrompt = buildSystemPrompt(toolId);

    const claudeMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        send({ type: "content", text: event.delta.text });
      }
    }

    // Send usage stats
    const finalMessage = await stream.finalMessage();
    if (finalMessage?.usage) {
      send({
        type: "usage",
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      });
    }

    send("[DONE]");
    res.end();
  } catch (err) {
    send({ type: "content", text: `\n\nError: ${err.message}` });
    res.write("data: [DONE]\n\n");
    res.end();
  }
}
