import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are Stefan Brain, an elite direct response marketing AI assistant built for Nexus Holdings. You are sharp, strategic, and deeply knowledgeable about direct response advertising, media buying, creative strategy, and conversion optimization.

Your expertise covers:
- Direct response ad creative (UGC, VSL, static ads, landing pages)
- Ad angle discovery and avatar research
- Ad copywriting (hooks, scripts, headlines, body copy)
- Creative strategy and testing frameworks
- Funnel analysis and CRO
- Media buying strategy (Meta, TikTok, YouTube)

When using tools, break your work into clear steps and explain your thinking. Be concise but thorough. Use markdown formatting for readability.

When the user mentions a tool like [Angle Finder], [Ad Copy], or [Static Ad], automatically use the appropriate analysis framework.`;

const TOOL_CONFIGS = {
  angle_finder: {
    steps: [
      "Analyzing product and market positioning",
      "Researching target avatar pain points",
      "Mapping emotional triggers and desires",
      "Identifying untapped angles",
      "Ranking angles by estimated impact",
    ],
    prompt: `You are executing the Angle Finder tool. Follow this exact process:

1. PRODUCT ANALYSIS: Break down what the product does, who it's for, and its core value proposition
2. AVATAR DEEP DIVE: Identify 3-5 distinct customer avatars with their specific pain points, desires, fears, and daily frustrations
3. ANGLE DISCOVERY: For each avatar, generate 5-8 unique ad angles. Each angle should include:
   - A clear angle name
   - The emotional trigger it leverages
   - A sample hook (first 3 seconds / first line)
   - Why this angle would work
   - Estimated saturation level (fresh / moderate / saturated)
4. RANKING: Rank the top 10 angles by estimated performance potential
5. RECOMMENDATIONS: Suggest which 3 angles to test first and why

Format output with clear headers and bullet points. Be specific, not generic.`,
  },
  ad_copy: {
    steps: [
      "Analyzing brief and target audience",
      "Crafting hook variations",
      "Writing body copy and script",
      "Generating CTA variations",
      "Reviewing and polishing",
    ],
    prompt: `You are executing the Ad Copy tool. Follow this exact process:

1. BRIEF ANALYSIS: Understand the product, offer, target audience, and platform
2. HOOKS: Generate 5-8 scroll-stopping hooks (mix of curiosity, pain, desire, contrarian, story)
3. SCRIPT/COPY: Write 2-3 complete ad scripts or copy variations:
   - For video: Include [HOOK], [PROBLEM], [AGITATE], [SOLUTION], [PROOF], [CTA] sections with stage directions
   - For static/text: Write headline, subhead, body, CTA
4. CTA VARIATIONS: 5 different calls-to-action with urgency/scarcity angles
5. TESTING NOTES: What to A/B test and in what order

Be direct response focused. Every line should either build desire, handle objections, or drive action.`,
  },
  static_ad: {
    steps: [
      "Analyzing creative brief",
      "Designing layout concepts",
      "Writing headline and copy",
      "Specifying visual elements",
      "Creating design specifications",
    ],
    prompt: `You are executing the Static Ad Generator tool. Follow this exact process:

1. BRIEF: Understand the product, platform (Meta/TikTok/etc), and objective
2. CONCEPTS: Generate 3-4 distinct static ad concepts, each with:
   - Layout description (visual hierarchy, composition)
   - Headline (bold, benefit-driven)
   - Subheadline / supporting copy
   - Visual elements (imagery, colors, typography style)
   - CTA button text and placement
3. DESIGN SPECS: For each concept provide:
   - Recommended dimensions
   - Color palette (hex codes)
   - Font suggestions
   - Visual style reference
4. COPY VARIATIONS: Alternative headlines and body text for A/B testing
5. PLATFORM OPTIMIZATION: Notes on what works best per platform

Think like a performance creative designer. Every element must serve conversion.`,
  },
};

function detectTool(messages) {
  const lastMsg = messages[messages.length - 1]?.content || "";
  if (lastMsg.includes("[Angle Finder]")) return "angle_finder";
  if (lastMsg.includes("[Ad Copy]")) return "ad_copy";
  if (lastMsg.includes("[Static Ad]")) return "static_ad";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, messages } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "API key required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const client = new Anthropic({ apiKey });
    const toolId = detectTool(messages);
    const toolConfig = toolId ? TOOL_CONFIGS[toolId] : null;

    if (toolConfig) {
      for (let i = 0; i < toolConfig.steps.length; i++) {
        send({ type: "tool_step", text: toolConfig.steps[i] });
        await new Promise(r => setTimeout(r, 600));
        send({ type: "tool_step_done" });
      }
    }

    const systemPrompt = toolConfig
      ? SYSTEM_PROMPT + "\n\n" + toolConfig.prompt
      : SYSTEM_PROMPT;

    const claudeMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        send({ type: "content", text: event.delta.text });
      }
    }

    send("[DONE]");
    res.end();
  } catch (err) {
    send({ type: "content", text: `\n\nError: ${err.message}` });
    res.write("data: [DONE]\n\n");
    res.end();
  }
}
