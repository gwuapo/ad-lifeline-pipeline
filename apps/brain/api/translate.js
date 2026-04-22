import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-3-flash";

const SYSTEM_PROMPT = `You are an expert translator specializing in converting English direct-response advertising copy into Saudi Najdi Arabic dialect (اللهجة النجدية).

CRITICAL RULES:
1. PRESERVE the exact structure and rhythm of the original copy. If the English is a one-line hook, the Arabic must be a one-line hook. Do NOT add extra words or rewrite sentences.
2. Use Saudi Najdi dialect (النجدية), NOT Modern Standard Arabic (فصحى), NOT Egyptian (مصري), NOT Lebanese (لبناني). This means:
   - Use "ايش" not "ماذا" for "what"
   - Use "كذا" not "هكذا" for "like this"
   - Use "يبي" or "يبغى" not "يريد" for "want"
   - Use "وش" for "what" in questions
   - Use "حق" for possession ("my" = "حقي")
   - Use the Najdi verb conjugations and sentence patterns
3. KEEP the meaning EXACTLY the same. Do not interpret, summarize, or add your own ideas. If the English says "3 out of 4 doctors recommend", the Arabic must say the same thing, not a paraphrase.
4. Preserve numbers, statistics, brand names, and product names as-is.
5. Preserve line breaks exactly as they appear in the original.
6. Direct response copy has a specific rhythm — short punchy sentences, power words, urgency. Keep that energy in Arabic.
7. If a phrase has no natural Najdi equivalent, use the closest colloquial Saudi expression. Never fall back to MSA.

LEARNING FROM CORRECTIONS:
Below you may see previous corrections from the user. These are cases where your translation was wrong and the user fixed it. Study each correction carefully and apply the same patterns going forward. The user's approved version is always correct — internalize the vocabulary, phrasing, and style choices they made.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, sectionType, memory, apiKey } = req.body;
  if (!text || !apiKey) return res.status(400).json({ error: "Missing text or apiKey" });

  let memoryContext = "";
  if (memory && memory.length > 0) {
    const corrections = memory.filter(m => m.corrected).slice(-30);
    if (corrections.length > 0) {
      memoryContext = "\n\n=== PREVIOUS CORRECTIONS (learn from these) ===\n";
      corrections.forEach((c, i) => {
        memoryContext += `\nCorrection ${i + 1}:\n`;
        memoryContext += `English: ${c.english}\n`;
        memoryContext += `Your translation (WRONG): ${c.aiTranslation}\n`;
        memoryContext += `User's correction (CORRECT): ${c.approvedTranslation}\n`;
      });
      memoryContext += "\n=== END CORRECTIONS ===\n";
    }
  }

  const userMsg = `Translate the following ${sectionType || "section"} of an ad script from English to Saudi Najdi Arabic.

Return ONLY the Arabic translation, nothing else. No explanations, no notes, no "Here's the translation:" prefix. Just the Arabic text.

English text:
${text}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT + memoryContext,
    });

    const result = await model.generateContent(userMsg);
    const translation = result.response.text().trim();

    return res.status(200).json({
      translation,
      inputTokens: result.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
    });
  } catch (e) {
    console.error("Translation error:", e);
    return res.status(500).json({ error: e.message || "Translation failed" });
  }
}
