import { supabase } from "./supabase";

// ═══════════════════════════════
// CONFIG (API keys)
// ═══════════════════════════════

export async function getConfig(workspaceId) {
  const { data, error } = await supabase
    .from("brain_config")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();
  if (error && error.code !== "PGRST116") console.error("getConfig:", error);
  return data || { api_key: "", gemini_key: "" };
}

export async function saveConfig(workspaceId, config) {
  const { error } = await supabase
    .from("brain_config")
    .upsert({ workspace_id: workspaceId, ...config, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) console.error("saveConfig:", error);
}

// ═══════════════════════════════
// CHATS
// ═══════════════════════════════

export async function fetchChats(workspaceId) {
  const { data, error } = await supabase
    .from("brain_chats")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchChats:", error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    title: r.title,
    projectId: r.project_id,
    messages: r.messages || [],
    createdAt: new Date(r.created_at).getTime(),
    createdBy: r.created_by,
  }));
}

export async function createChat(workspaceId, chat) {
  const { data, error } = await supabase
    .from("brain_chats")
    .insert({
      id: chat.id,
      workspace_id: workspaceId,
      title: chat.title,
      project_id: chat.projectId || null,
      messages: chat.messages || [],
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single();
  if (error) console.error("createChat:", error);
  return data;
}

export async function updateChat(chatId, updates) {
  const row = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.messages !== undefined) row.messages = updates.messages;
  if (updates.projectId !== undefined) row.project_id = updates.projectId;
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("brain_chats").update(row).eq("id", chatId);
  if (error) console.error("updateChat:", error);
}

export async function deleteChat(chatId) {
  const { error } = await supabase.from("brain_chats").delete().eq("id", chatId);
  if (error) console.error("deleteChat:", error);
}

// ═══════════════════════════════
// PROJECTS
// ═══════════════════════════════

export async function fetchProjects(workspaceId) {
  const { data, error } = await supabase
    .from("brain_projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchProjects:", error); return []; }
  return (data || []).map(r => ({ id: r.id, name: r.name, createdAt: new Date(r.created_at).getTime() }));
}

export async function createProject(workspaceId, project) {
  const { data, error } = await supabase
    .from("brain_projects")
    .insert({ id: project.id, workspace_id: workspaceId, name: project.name })
    .select()
    .single();
  if (error) console.error("createProject:", error);
  return data;
}

export async function deleteProject(projectId) {
  const { error } = await supabase.from("brain_projects").delete().eq("id", projectId);
  if (error) console.error("deleteProject:", error);
}

// ═══════════════════════════════
// TRANSLATION MEMORY
// ═══════════════════════════════

export async function fetchTranslationMemory(workspaceId) {
  const { data, error } = await supabase
    .from("brain_translation_memory")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchTM:", error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    english: r.english,
    aiTranslation: r.ai_translation,
    approvedTranslation: r.approved_translation,
    sectionType: r.section_type,
    corrected: true,
    timestamp: new Date(r.created_at).getTime(),
  }));
}

export async function addTranslationMemory(workspaceId, entries) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const rows = entries.map(e => ({
    workspace_id: workspaceId,
    english: e.english,
    ai_translation: e.aiTranslation,
    approved_translation: e.approvedTranslation,
    section_type: e.sectionType,
    created_by: userId,
  }));
  const { error } = await supabase.from("brain_translation_memory").insert(rows);
  if (error) console.error("addTM:", error);
}

export async function clearTranslationMemory(workspaceId) {
  const { error } = await supabase.from("brain_translation_memory").delete().eq("workspace_id", workspaceId);
  if (error) console.error("clearTM:", error);
}

// ═══════════════════════════════
// TRANSLATION HISTORY
// ═══════════════════════════════

export async function fetchTranslationHistory(workspaceId) {
  const { data, error } = await supabase
    .from("brain_translations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.error("fetchHistory:", error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    title: r.title,
    sections: r.sections || [],
    timestamp: new Date(r.created_at).getTime(),
  }));
}

export async function saveTranslation(workspaceId, entry) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from("brain_translations").insert({
    workspace_id: workspaceId,
    title: entry.title,
    sections: entry.sections,
    created_by: userId,
  });
  if (error) console.error("saveTranslation:", error);
}
