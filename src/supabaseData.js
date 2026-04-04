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
// WORKSPACE INVITES
// ════════════════════════════════════════════════

export async function getWorkspaceInvites(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) { console.error("getWorkspaceInvites:", error); return []; }
  return data || [];
}

export async function sendInvite(workspaceId, email, role) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, role, workspaceId }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send invite");
  return data;
}

export async function revokeInvite(inviteId) {
  const { error } = await supabase
    .from("workspace_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}

export async function acceptPendingInvites() {
  const { data, error } = await supabase.rpc("accept_pending_invites");
  if (error) { console.error("acceptPendingInvites:", error); return []; }
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
  const defaults = { green: 15, yellow: 25, grossMarginPct: 70 };
  return data?.thresholds ? { ...defaults, ...data.thresholds } : defaults;
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
      channelMatchedNames: rest.channelMatchedNames || {},
      tiktokUrl: rest.tiktokUrl || "",
      production_cost: rest.production_cost ?? null,
      production_cost_override: rest.production_cost_override ?? false,
      video_duration: rest.video_duration ?? null,
      // Strategy / Ads Lab fields
      strategy: rest.strategy || {},
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
    channelMatchedNames: d.channelMatchedNames || {},
    tiktokUrl: d.tiktokUrl || "",
    production_cost: d.production_cost ?? null,
    production_cost_override: d.production_cost_override ?? false,
    video_duration: d.video_duration ?? null,
    strategy: d.strategy || {},
    checklist: d.checklist || {},
    stageEnteredAt: d.stageEnteredAt || new Date(row.created_at || Date.now()).getTime(),
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
  // Keep workspace_members.editor_name in sync
  if (profile.display_name) {
    await supabase
      .from("workspace_members")
      .update({ editor_name: profile.display_name })
      .eq("user_id", userId);
  }
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

export async function clearAllNotifications() {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("recipient_id", userId);
  if (error) console.error("clearAllNotifications:", error);
}

// ════════════════════════════════════════════════
// PRODUCT RESEARCH
// ════════════════════════════════════════════════

export async function fetchResearchDocs(workspaceId) {
  const { data, error } = await supabase
    .from("product_research")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchResearchDocs:", error); return []; }
  return data || [];
}

export async function upsertResearchDoc(workspaceId, step, doc) {
  // Check if exists
  const { data: existing } = await supabase
    .from("product_research")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("step", step)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("product_research")
      .update({ ...doc, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("product_research")
      .insert({ workspace_id: workspaceId, step, ...doc });
    if (error) throw error;
  }
}

export async function fetchKnowledgeBase(workspaceId) {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) { console.error("fetchKnowledgeBase:", error); return null; }
  return data;
}

export async function upsertKnowledgeBase(workspaceId, kb) {
  const { error } = await supabase
    .from("knowledge_base")
    .upsert({ workspace_id: workspaceId, ...kb, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) throw error;
}

export async function updateWorkspaceProductDetails(workspaceId, details) {
  const { error } = await supabase.rpc("update_workspace_product_details", {
    ws_id: workspaceId,
    details,
  });
  if (error) {
    // Fallback to direct update if RPC doesn't exist
    const { error: e2 } = await supabase
      .from("workspaces")
      .update({ product_details: details })
      .eq("id", workspaceId);
    if (e2) throw e2;
  }
}

export async function getWorkspaceProductDetails(workspaceId) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("product_details")
    .eq("id", workspaceId)
    .single();
  if (error) { console.error("getWorkspaceProductDetails:", error); return {}; }
  return data?.product_details || {};
}

// ════════════════════════════════════════════════
// WORKSPACE LEARNINGS (Intelligence Flywheel)
// ════════════════════════════════════════════════

export async function fetchWorkspaceLearnings(workspaceId) {
  const { data, error } = await supabase
    .from("workspace_learnings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    // Table might not exist yet -- fall back to gathering from ads
    if (error.code === "42P01" || error.message?.includes("does not exist")) return null;
    console.error("fetchWorkspaceLearnings:", error);
    return null;
  }
  return data || [];
}

export async function saveWorkspaceLearning(workspaceId, learning) {
  const { error } = await supabase
    .from("workspace_learnings")
    .insert({
      workspace_id: workspaceId,
      ad_id: learning.adId || null,
      ad_name: learning.adName || "",
      type: learning.type || "general",
      text: learning.text || "",
      confidence: learning.confidence || "medium",
      evidence: learning.evidence || "",
      source: learning.source || "auto", // "auto" = flywheel, "manual" = user
    });
  if (error) {
    // If table doesn't exist, silently fail -- learnings still live in ad data
    if (error.code === "42P01" || error.message?.includes("does not exist")) return;
    console.error("saveWorkspaceLearning:", error);
  }
}

export async function saveWorkspaceLearningsBatch(workspaceId, learnings) {
  if (!learnings.length) return;
  const rows = learnings.map(l => ({
    workspace_id: workspaceId,
    ad_id: l.adId || null,
    ad_name: l.adName || "",
    type: l.type || "general",
    text: l.text || "",
    confidence: l.confidence || "medium",
    evidence: l.evidence || "",
    source: l.source || "auto",
  }));
  const { error } = await supabase.from("workspace_learnings").insert(rows);
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) return;
    console.error("saveWorkspaceLearningsBatch:", error);
  }
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

// ════════════════════════════════════════════════
// STRATEGY DATA
// ════════════════════════════════════════════════

// Realtime subscription for strategy_data changes
export function subscribeToStrategy(workspaceId, callback) {
  const channel = supabase
    .channel(`strategy-${workspaceId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "strategy_data",
      filter: `workspace_id=eq.${workspaceId}`,
    }, (payload) => {
      callback(payload);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// Presence: track who's viewing which tab
export function createPresenceChannel(workspaceId, userId, userName) {
  const channel = supabase.channel(`presence-${workspaceId}`, {
    config: { presence: { key: userId } },
  });

  return {
    channel,
    subscribe: (onSync) => {
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        onSync(state);
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, user_name: userName, page: "pipeline", online_at: new Date().toISOString() });
        }
      });
    },
    updatePage: (page) => {
      channel.track({ user_id: userId, user_name: userName, page, online_at: new Date().toISOString() });
    },
    unsubscribe: () => {
      channel.untrack();
      supabase.removeChannel(channel);
    },
  };
}

export async function fetchStrategyData(workspaceId) {
  const { data, error } = await supabase
    .from("strategy_data")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();
  if (error && error.code === "PGRST116") return null; // no rows
  if (error) throw error;
  return data;
}

export async function upsertStrategyData(workspaceId, section, value) {
  const { data: existing } = await supabase
    .from("strategy_data")
    .select("id")
    .eq("workspace_id", workspaceId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("strategy_data")
      .update({ [section]: value, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from("strategy_data")
      .insert({ workspace_id: workspaceId, [section]: value })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// ════════════════════════════════════════════════
// SPLIT TESTS
// ════════════════════════════════════════════════

export async function fetchSplitTests(workspaceId) {
  const { data, error } = await supabase.from("split_tests").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSplitTest(workspaceId, test) {
  const { data, error } = await supabase.from("split_tests").insert({ workspace_id: workspaceId, ...test }).select().single();
  if (error) throw error;
  return data;
}

export async function updateSplitTest(testId, updates) {
  const { data, error } = await supabase.from("split_tests").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", testId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSplitTest(testId) {
  const { error } = await supabase.from("split_tests").delete().eq("id", testId);
  if (error) throw error;
}

// Variations
export async function fetchVariations(splitTestId) {
  const { data, error } = await supabase.from("split_test_variations").select("*").eq("split_test_id", splitTestId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createVariation(variation) {
  const { data, error } = await supabase.from("split_test_variations").insert(variation).select().single();
  if (error) throw error;
  return data;
}

export async function updateVariation(varId, updates) {
  const { data, error } = await supabase.from("split_test_variations").update(updates).eq("id", varId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVariation(varId) {
  const { error } = await supabase.from("split_test_variations").delete().eq("id", varId);
  if (error) throw error;
}

// Snapshots
export async function fetchSnapshots(variationIds) {
  if (!variationIds.length) return [];
  const { data, error } = await supabase.from("split_test_snapshots").select("*").in("variation_id", variationIds).order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertSnapshot(snapshot) {
  const { data, error } = await supabase.from("split_test_snapshots").upsert(snapshot, { onConflict: "variation_id,date" }).select().single();
  if (error) throw error;
  return data;
}

export async function bulkUpsertSnapshots(snapshots) {
  if (!snapshots.length) return [];
  const { data, error } = await supabase.from("split_test_snapshots").upsert(snapshots, { onConflict: "variation_id,date" }).select();
  if (error) throw error;
  return data || [];
}

// Offer Library
export async function fetchOfferLibrary(workspaceId) {
  const { data, error } = await supabase.from("offer_library").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createOffer(workspaceId, offer) {
  const { data, error } = await supabase.from("offer_library").insert({ workspace_id: workspaceId, ...offer }).select().single();
  if (error) throw error;
  return data;
}

export async function updateOffer(offerId, updates) {
  const { data, error } = await supabase.from("offer_library").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", offerId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteOffer(offerId) {
  const { error } = await supabase.from("offer_library").delete().eq("id", offerId);
  if (error) throw error;
}
