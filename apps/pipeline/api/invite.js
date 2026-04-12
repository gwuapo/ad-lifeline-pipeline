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
    return res.status(500).json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY env var" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const { email, role, workspaceId } = req.body || {};
  if (!email || !role || !workspaceId) {
    return res.status(400).json({ error: "Missing email, role, or workspaceId" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify the caller is a founder of the workspace
  const callerToken = authHeader.replace("Bearer ", "");
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken);
  if (authErr || !caller) return res.status(401).json({ error: "Invalid auth token" });

  // Only admin emails can invite
  const ADMIN_EMAILS = ["capo@nexusholdings.io", "af@nexusholdings.io"];
  if (!ADMIN_EMAILS.includes(caller.email?.toLowerCase())) {
    return res.status(403).json({ error: "Only admins can invite members" });
  }

  try {
    // Check if user already exists in auth
    const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // User exists -- add directly to workspace
      const { error: memErr } = await supabase
        .from("workspace_members")
        .upsert({
          workspace_id: workspaceId,
          user_id: existingUser.id,
          role,
          editor_name: role === "editor" ? (existingUser.user_metadata?.display_name || email.split("@")[0]) : null,
        }, { onConflict: "workspace_id,user_id" });

      if (memErr) throw memErr;

      // Upsert invite record as accepted so it shows in Team tab history
      await supabase
        .from("workspace_invites")
        .upsert({
          workspace_id: workspaceId,
          email: email.toLowerCase(),
          role,
          invited_by: caller.id,
          status: "accepted",
          accepted_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,email" });

      return res.status(200).json({ status: "added", message: `${email} added to workspace` });
    }

    // User doesn't exist -- send Supabase invite email
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role, display_name: email.split("@")[0] },
      redirectTo: `${req.headers.origin || process.env.APP_URL || "https://studio.nexusholdings.io"}`,
    });

    if (inviteErr) {
      if (inviteErr.message?.includes("already been registered") || inviteErr.message?.includes("already been invited")) {
        // User exists in auth but wasn't found in listUsers (edge case) or was already invited
        // Try to find them and add directly
        const { data: { users: retryUsers } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const retryUser = retryUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (retryUser) {
          await supabase
            .from("workspace_members")
            .upsert({ workspace_id: workspaceId, user_id: retryUser.id, role, editor_name: role === "editor" ? (retryUser.user_metadata?.display_name || email.split("@")[0]) : null }, { onConflict: "workspace_id,user_id" });
          await supabase
            .from("workspace_invites")
            .update({ status: "accepted", accepted_at: new Date().toISOString() })
            .match({ workspace_id: workspaceId, email: email.toLowerCase() });
          return res.status(200).json({ status: "added", message: `${email} added to workspace (existing account).` });
        }
        // If still not found, re-send via magic link as fallback
        const { error: magicErr } = await supabase.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${req.headers.origin || process.env.APP_URL || "https://studio.nexusholdings.io"}` } });
        if (magicErr) console.error("Magic link fallback:", magicErr);
        // Reset invite to pending so it can be accepted on login
        await supabase
          .from("workspace_invites")
          .upsert({ workspace_id: workspaceId, email: email.toLowerCase(), role, invited_by: caller.id, status: "pending" }, { onConflict: "workspace_id,email" });
        return res.status(200).json({ status: "re-invited", message: `Re-invite sent to ${email}. They should check their email or log in.` });
      }
      throw inviteErr;
    }

    // Store pending invite in our table
    await supabase
      .from("workspace_invites")
      .upsert({
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        role,
        invited_by: caller.id,
        status: "pending",
      }, { onConflict: "workspace_id,email" });

    return res.status(200).json({
      status: "invited",
      message: `Invite email sent to ${email}. They'll be added to your workspace when they sign up.`,
    });
  } catch (e) {
    console.error("Invite error:", e);
    return res.status(500).json({ error: e.message || "Failed to send invite" });
  }
}
