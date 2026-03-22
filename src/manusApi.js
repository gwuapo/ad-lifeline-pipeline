// Manus API integration -- placeholder until API credentials are provided
// Wire up: set MANUS_API_KEY in Settings, then implement the fetch calls below

let _manusKey = "";

export function setManusApiKey(key) { _manusKey = key; }
export function getManusApiKey() { return _manusKey || localStorage.getItem("al_manus_key") || ""; }
export function isManusConfigured() { return !!getManusApiKey().trim(); }

// Placeholder: submit a build job to Manus
// Returns a job ID that can be polled for status
export async function submitBuildJob({ copy, swipeFiles, presetType, domain }) {
  const key = getManusApiKey();
  if (!key) throw new Error("Manus API key not configured");

  // TODO: Replace with actual Manus API call
  // Expected: POST to Manus with the approved copy + swipe references
  // Returns: { jobId: "...", status: "queued" }
  throw new Error("Manus API not yet connected. Provide API credentials in Settings to enable page building.");
}

// Placeholder: poll job status
// Returns: { status: "building" | "review" | "complete" | "error", logs: [...], previewUrl?: "..." }
export async function getJobStatus(jobId) {
  const key = getManusApiKey();
  if (!key) throw new Error("Manus API key not configured");

  // TODO: Replace with actual Manus API polling
  throw new Error("Manus API not yet connected.");
}

// Placeholder: send feedback on a built page
export async function sendBuildFeedback(jobId, feedback) {
  const key = getManusApiKey();
  if (!key) throw new Error("Manus API key not configured");

  // TODO: Replace with actual Manus feedback endpoint
  throw new Error("Manus API not yet connected.");
}
