// Vercel Serverless: Whisper transcription proxy
// Receives audio blob, sends to OpenAI Whisper, returns word-level timestamps

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const openaiKey = req.headers["x-openai-key"];
  if (!openaiKey) return res.status(400).json({ error: "Missing x-openai-key header" });

  try {
    // Read raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Parse multipart manually to get the audio file
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    // Forward to OpenAI Whisper API as-is
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: createWhisperFormData(body, contentType),
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return res.status(whisperRes.status).json({ error: err });
    }

    const data = await whisperRes.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function createWhisperFormData(rawBody, contentType) {
  // Extract boundary from content-type
  const boundary = contentType.split("boundary=")[1];
  if (!boundary) return rawBody;

  // Parse the incoming multipart to extract the audio file
  const parts = parseMultipart(rawBody, boundary);
  const audioPart = parts.find(p => p.name === "file");
  
  const formData = new FormData();
  formData.append("file", new Blob([audioPart.data], { type: audioPart.contentType || "audio/wav" }), audioPart.filename || "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  
  // Check if language was specified
  const langPart = parts.find(p => p.name === "language");
  formData.append("language", langPart ? langPart.data.toString().trim() : "ar");
  
  return formData;
}

function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);
  
  let pos = 0;
  while (pos < body.length) {
    const start = body.indexOf(boundaryBuf, pos);
    if (start === -1) break;
    
    const nextStart = body.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (nextStart === -1) break;
    
    const partData = body.slice(start + boundaryBuf.length, nextStart);
    const headerEnd = partData.indexOf("\r\n\r\n");
    if (headerEnd === -1) { pos = nextStart; continue; }
    
    const headerStr = partData.slice(0, headerEnd).toString();
    const data = partData.slice(headerEnd + 4, partData.length - 2); // trim trailing \r\n
    
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
    
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1],
        contentType: ctMatch?.[1]?.trim(),
        data,
      });
    }
    pos = nextStart;
  }
  return parts;
}
