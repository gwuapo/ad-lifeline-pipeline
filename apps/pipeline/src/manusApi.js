const MANUS_BASE = "https://api.manus.ai/v1";

export function getManusApiKey() { return localStorage.getItem("al_manus_key") || ""; }
export function setManusApiKey(key) { localStorage.setItem("al_manus_key", key); }
export function isManusConfigured() { return !!getManusApiKey().trim(); }

async function manusRequest(method, path, body) {
  const key = getManusApiKey();
  if (!key) throw new Error("Manus API key not configured. Go to Settings → Integrations to add it.");
  const opts = {
    method,
    headers: { "API_KEY": key, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${MANUS_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Manus error (${res.status}): ${err?.error || err?.message || res.statusText}`);
  }
  return res.json();
}

export async function submitBuildJob({ copy, swipeFiles, presetType, knowledgeBase }) {
  const sections = (copy?.sections || []).map(s => {
    const parts = [];
    if (s.section_name) parts.push(`## ${s.section_name}`);
    if (s.copy_ar) parts.push(`[Arabic]\n${s.copy_ar}`);
    if (s.copy_en) parts.push(`[English]\n${s.copy_en}`);
    if (s.copy) parts.push(s.copy);
    return parts.join("\n\n");
  }).join("\n\n---\n\n");

  const prompt = `Build a production-ready landing page from the approved copy below.

PAGE TYPE: ${presetType || "advertorial"}

REQUIREMENTS:
- Modern, clean, mobile-responsive design
- High-converting direct-response layout
- Use the section structure and copy EXACTLY as provided
- Add appropriate spacing, typography hierarchy, and visual flow
- Include placeholder images where [IMAGE: ...] markers appear
- If Arabic text is present, set dir="rtl" on those sections
- Make CTAs prominent and clickable
- Output a complete, deployable HTML page with inline CSS

APPROVED COPY:
${sections}

${knowledgeBase ? `REFERENCE MATERIALS:\n${knowledgeBase}\n` : ""}

Deliver the final HTML file.`;

  const data = await manusRequest("POST", "/tasks", {
    prompt,
    agentProfile: "manus-1.6",
    createShareableLink: true,
  });

  return {
    taskId: data.task_id,
    taskUrl: data.task_url,
    shareUrl: data.share_url,
    title: data.task_title,
  };
}

export async function getJobStatus(taskId) {
  const data = await manusRequest("GET", `/tasks?query=${taskId}&limit=1`);
  const task = data?.data?.[0];
  if (!task) throw new Error("Task not found");

  const status = task.status; // pending, running, completed, failed
  const output = (task.output || [])
    .filter(o => o.role !== "user")
    .flatMap(o => (o.content || []).map(c => ({
      text: c.text || "",
      fileUrl: c.fileUrl || null,
      fileName: c.fileName || null,
    })));

  return {
    status,
    taskUrl: task.metadata?.task_url || "",
    error: task.error || task.incomplete_details || null,
    output,
    creditUsage: task.credit_usage || 0,
  };
}

export async function sendBuildFeedback(taskId, feedback) {
  const data = await manusRequest("POST", "/tasks", {
    prompt: feedback,
    agentProfile: "manus-1.6",
    taskId,
    createShareableLink: true,
  });

  return {
    taskId: data.task_id,
    taskUrl: data.task_url,
    shareUrl: data.share_url,
  };
}
