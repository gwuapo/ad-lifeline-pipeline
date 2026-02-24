import { supabase } from "./supabase.js";

// ════════════════════════════════════════════════
// WORKSPACES
// ════════════════════════════════════════════════

export async function fetchWorkspaces() {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  // First get workspace IDs the user is a member of
  const { data: memberships, error: memErr } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);
  if (memErr) {
    console.error("fetchWorkspaces memberships error:", memErr);
    // If table doesn't exist or RLS error, return empty
    return [];
  }

  const wsIds = (memberships || []).map(m => m.workspace_id);
  if (wsIds.length === 0) return [];

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", wsIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchWorkspaces error:", error);
    return [];
  }
  return data || [];
}

export async function createWorkspace(name) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (wsErr) throw wsErr;

  // Auto-add creator as founder member
  const { error: memErr } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "founder" });
  if (memErr) throw memErr;

  // Create default settings
  const { error: setErr } = await supabase
    .from("workspace_settings")
    .insert({ workspace_id: ws.id, thresholds: { green: 15, yellow: 25 } });
  if (setErr) throw setErr;

  return ws;
}

export async function addMemberToWorkspace(workspaceId, userId, role, editorName) {
  const { data, error } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: userId, role, editor_name: editorName || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeMemberFromWorkspace(workspaceId, userId) {
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .match({ workspace_id: workspaceId, user_id: userId });
  if (error) throw error;
}

export async function getWorkspaceMembers(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════════
// WORKSPACE SETTINGS
// ════════════════════════════════════════════════

export async function getWorkspaceSettings(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return data?.thresholds || { green: 15, yellow: 25 };
}

export async function saveWorkspaceSettings(workspaceId, thresholds) {
  const { error } = await supabase
    .from("workspace_settings")
    .upsert({ workspace_id: workspaceId, thresholds }, { onConflict: "workspace_id" });
  if (error) throw error;
}

// ════════════════════════════════════════════════
// ADS
// ════════════════════════════════════════════════

function adToRow(ad, workspaceId) {
  const { id, name, type, stage, editor, deadline, brief, notes, ...rest } = ad;
  return {
    ...(id && !id.toString().match(/^\d+$/) ? { id } : {}), // keep uuid, skip numeric seed IDs
    workspace_id: workspaceId,
    name, type, stage,
    editor: editor || "",
    deadline: deadline || "",
    brief: brief || "",
    notes: notes || "",
    data: {
      iterations: rest.iterations || 0,
      maxIter: rest.maxIter || 3,
      iterHistory: rest.iterHistory || [],
      briefApproved: rest.briefApproved || false,
      draftSubmitted: rest.draftSubmitted || false,
      finalApproved: rest.finalApproved || false,
      drafts: rest.drafts || [],
      revisionRequests: rest.revisionRequests || [],
      metrics: rest.metrics || [],
      comments: rest.comments || [],
      analyses: rest.analyses || [],
      learnings: rest.learnings || [],
      thread: rest.thread || [],
      parentId: rest.parentId || null,
      childIds: rest.childIds || [],
      notifications: rest.notifications || [],
      channelIds: rest.channelIds || {},
      channelMetrics: rest.channelMetrics || {},
      tiktokUrl: rest.tiktokUrl || "",
    },
  };
}

function rowToAd(row) {
  const d = row.data || {};
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    stage: row.stage,
    editor: row.editor || "",
    deadline: row.deadline || "",
    brief: row.brief || "",
    notes: row.notes || "",
    iterations: d.iterations || 0,
    maxIter: d.maxIter || 3,
    iterHistory: d.iterHistory || [],
    briefApproved: d.briefApproved || false,
    draftSubmitted: d.draftSubmitted || false,
    finalApproved: d.finalApproved || false,
    drafts: d.drafts || [],
    revisionRequests: d.revisionRequests || [],
    metrics: d.metrics || [],
    comments: d.comments || [],
    analyses: d.analyses || [],
    learnings: d.learnings || [],
    thread: d.thread || [],
    parentId: d.parentId || null,
    childIds: d.childIds || [],
    notifications: d.notifications || [],
    channelIds: d.channelIds || {},
    channelMetrics: d.channelMetrics || {},
    tiktokUrl: d.tiktokUrl || "",
  };
}

export async function fetchAds(workspaceId) {
  const { data, error } = await supabase
    .from("ads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToAd);
}

export async function createAd(ad, workspaceId) {
  const row = adToRow(ad, workspaceId);
  const { data, error } = await supabase
    .from("ads")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToAd(data);
}

export async function updateAd(adId, updates, workspaceId) {
  // updates can be top-level fields or nested data fields
  const current = await supabase.from("ads").select("*").eq("id", adId).single();
  if (current.error) throw current.error;

  const row = current.data;
  const newData = { ...row.data };
  const topFields = {};

  for (const [key, val] of Object.entries(updates)) {
    if (["name", "type", "stage", "editor", "deadline", "brief", "notes"].includes(key)) {
      topFields[key] = val;
    } else {
      newData[key] = val;
    }
  }

  const { data, error } = await supabase
    .from("ads")
    .update({ ...topFields, data: newData, updated_at: new Date().toISOString() })
    .eq("id", adId)
    .select()
    .single();
  if (error) throw error;
  return rowToAd(data);
}

export async function deleteAd(adId) {
  const { error } = await supabase.from("ads").delete().eq("id", adId);
  if (error) throw error;
}

// Bulk save — for initial workspace population or full state sync
export async function bulkUpsertAds(ads, workspaceId) {
  const rows = ads.map(a => adToRow(a, workspaceId));
  const { data, error } = await supabase
    .from("ads")
    .upsert(rows)
    .select();
  if (error) throw error;
  return (data || []).map(rowToAd);
}

// ════════════════════════════════════════════════
// REALTIME SUBSCRIPTION
// ════════════════════════════════════════════════

export function subscribeToAds(workspaceId, callback) {
  const channel = supabase
    .channel(`ads-${workspaceId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "ads",
      filter: `workspace_id=eq.${workspaceId}`,
    }, (payload) => {
      callback(payload);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ════════════════════════════════════════════════
// EDITOR PROFILES (Supabase)
// ════════════════════════════════════════════════

export async function fetchEditorProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("editor_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("fetchEditorProfile error:", error);
      return null;
    }
    return data || null;
  } catch (e) {
    console.error("fetchEditorProfile exception:", e);
    return null;
  }
}

export async function upsertEditorProfile(userId, profile) {
  const { data, error } = await supabase
    .from("editor_profiles")
    .upsert({ user_id: userId, ...profile }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAllEditorProfiles(workspaceId) {
  // Get all editor members of this workspace, then fetch their profiles
  const { data: members, error: memErr } = await supabase
    .from("workspace_members")
    .select("user_id, editor_name")
    .eq("workspace_id", workspaceId)
    .eq("role", "editor");
  if (memErr) throw memErr;
  if (!members?.length) return [];

  const userIds = members.map(m => m.user_id);
  const { data: profiles, error: profErr } = await supabase
    .from("editor_profiles")
    .select("*")
    .in("user_id", userIds);
  if (profErr) throw profErr;

  return (profiles || []).map(p => {
    const member = members.find(m => m.user_id === p.user_id);
    return { ...p, editor_name: member?.editor_name || p.display_name };
  });
}

// ════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════

export async function fetchNotifications() {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.error("fetchNotifications:", error); return []; }
  return data || [];
}

export async function createNotification({ workspaceId, recipientId, senderName, adId, adName, message }) {
  const { error } = await supabase.rpc("create_notification", {
    p_workspace_id: workspaceId,
    p_recipient_id: recipientId,
    p_sender_name: senderName,
    p_ad_id: adId,
    p_ad_name: adName,
    p_message: message,
  });
  if (error) {
    console.error("createNotification error:", error);
    throw error;
  }
}

export async function markNotificationRead(notifId) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notifId);
  if (error) console.error("markNotificationRead:", error);
}

export async function markAllNotificationsRead() {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  if (error) console.error("markAllNotificationsRead:", error);
}

export async function resolveUserIdByName(name, workspaceId) {
  // Try workspace-scoped lookup first
  try {
    const { data } = await supabase.rpc("get_user_id_by_name", { lookup_name: name, ws_id: workspaceId });
    if (data) return data;
  } catch {}
  // Fallback to global display name lookup
  try {
    const { data } = await supabase.rpc("get_user_id_by_display_name", { lookup_name: name });
    if (data) return data;
  } catch {}
  return null;
}

export function subscribeToNotifications(userId, callback) {
  const channel = supabase
    .channel(`notifs-${userId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `recipient_id=eq.${userId}`,
    }, (payload) => {
      callback(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function getWorkspaceMemberNames(workspaceId) {
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, editor_name")
    .eq("workspace_id", workspaceId);
  if (error) { console.error("getWorkspaceMemberNames:", error); return []; }

  const userIds = (members || []).map(m => m.user_id);
  if (userIds.length === 0) return [];

  // Get editor profiles for display names
  const { data: profiles } = await supabase
    .from("editor_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.user_id] = p.display_name; });

  // For the current user, we can get their own metadata
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const results = [];
  for (const m of (members || [])) {
    let name = m.editor_name || profileMap[m.user_id];
    // For founders: use current user's metadata if it's them, otherwise try RPC
    if (!name) {
      if (currentUser && m.user_id === currentUser.id) {
        name = currentUser.user_metadata?.display_name || currentUser.email?.split("@")[0];
      } else {
        // Try RPC (may not exist), then fall back to workspace member data
        try {
          const { data } = await supabase.rpc("get_display_name_by_user_id", { uid: m.user_id });
          if (data) name = data;
        } catch {}
      }
    }
    results.push({
      userId: m.user_id,
      name: name || "Member",
      role: m.role,
    });
  }
  console.log("[getWorkspaceMemberNames] results:", results);
  return results;
}
