import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const { userId, workspaceId, deleteAccount } = req.body || {};
  if (!userId || !workspaceId) {
    return res.status(400).json({ error: "Missing userId or workspaceId" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify caller is a founder
  const callerToken = authHeader.replace("Bearer ", "");
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken);
  if (authErr || !caller) return res.status(401).json({ error: "Invalid auth token" });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", caller.id)
    .single();

  if (!membership || membership.role !== "founder") {
    return res.status(403).json({ error: "Only founders can remove members" });
  }

  // Don't allow removing yourself
  if (userId === caller.id) {
    return res.status(400).json({ error: "Cannot remove yourself" });
  }

  try {
    // Remove from workspace
    await supabase
      .from("workspace_members")
      .delete()
      .match({ workspace_id: workspaceId, user_id: userId });

    // Remove any pending invites for this user's email
    const { data: userInfo } = await supabase.auth.admin.getUserById(userId);
    if (userInfo?.user?.email) {
      await supabase
        .from("workspace_invites")
        .delete()
        .match({ workspace_id: workspaceId, email: userInfo.user.email.toLowerCase() });
    }

    // Delete their Supabase auth account if requested
    if (deleteAccount) {
      // Remove from ALL workspaces first
      await supabase.from("workspace_members").delete().eq("user_id", userId);
      // Delete editor profile
      await supabase.from("editor_profiles").delete().eq("user_id", userId);
      // Delete auth account
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) throw delErr;
      return res.status(200).json({ status: "deleted", message: "Member removed and account deleted" });
    }

    return res.status(200).json({ status: "removed", message: "Member removed from workspace" });
  } catch (e) {
    console.error("Remove member error:", e);
    return res.status(500).json({ error: e.message || "Failed to remove member" });
  }
}
