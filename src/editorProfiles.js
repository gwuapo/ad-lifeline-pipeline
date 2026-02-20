const STORAGE_KEY = "al_editor_profiles";

export function getEditorProfiles() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

export function getEditorProfile(email) {
  return getEditorProfiles()[email] || null;
}

export function saveEditorProfile(email, profile) {
  const all = getEditorProfiles();
  all[email] = { ...all[email], ...profile, email, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all[email];
}

export function isOnboardingComplete(email) {
  const p = getEditorProfile(email);
  if (!p) return false;
  return !!(p.displayName && p.portfolioUrl && p.compensationRate && p.weeklyMinutes);
}

export function getAllEditorProfiles() {
  return getEditorProfiles();
}
