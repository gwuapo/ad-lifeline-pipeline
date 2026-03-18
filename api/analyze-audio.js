// Vercel Serverless: Claude analysis of transcript vs script
// Receives script sections + Whisper transcript, returns structured analysis

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-claude-key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const claudeKey = req.headers["x-claude-key"];
  if (!claudeKey) return res.status(400).json({ error: "Missing x-claude-key header" });

  const { scriptSections, transcript, language } = req.body || {};
  if (!scriptSections || !transcript) {
    return res.status(400).json({ error: "Missing scriptSections or transcript" });
  }

  const sectionsText = scriptSections.map((s, i) =>
    `Section ${i + 1} (${s.label}): "${s.script_text}"`
  ).join("\n");

  const wordsText = transcript.words?.map(w =>
    `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`
  ).join("\n") || transcript.text || "";

  const prompt = `You are an audio editing assistant analyzing a VSL voiceover recording in ${language || "Saudi Arabic"}.

Here is the original script broken into sections:
${sectionsText}

Here is the full transcript with word-level timestamps from the recording:
${wordsText}

Full transcript text: "${transcript.text || ""}"

Your job:
1. Map each chunk of the transcript to the corresponding script section. The speaker may have recorded multiple takes of each section back to back.
2. Within each section, identify separate takes (indicated by repeated content, long pauses >1.5s between attempts, or the speaker restarting the same line).
3. Rank each take per section by: completeness (all words from script present), clarity (minimal stumbling), and natural flow.
4. Flag all filler words (um, ah, uh, يعني, هاه, آه, etc.) with their exact timestamps.
5. Flag all pauses/silence gaps longer than 0.8 seconds with their timestamps.
6. For each section, select the best take as your recommendation.

Return your analysis as a JSON object with this EXACT structure (no markdown, no code fences, just raw JSON):
{
  "section_mappings": [
    {
      "section_id": "section index (0-based)",
      "section_label": "the label",
      "takes": [
        {
          "take_number": 1,
          "start": 0.0,
          "end": 5.5,
          "rank": 1,
          "completeness_score": 0.95,
          "clarity_notes": "brief note on quality",
          "is_selected": true
        }
      ]
    }
  ],
  "filler_words": [
    { "start": 2.1, "end": 2.4, "word": "um" }
  ],
  "pauses": [
    { "start": 5.5, "end": 6.8, "duration": 1.3 }
  ]
}`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(claudeRes.status).json({ error: err });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();

    try {
      const analysis = JSON.parse(cleaned);
      return res.status(200).json(analysis);
    } catch {
      return res.status(200).json({ raw: cleaned, parseError: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
