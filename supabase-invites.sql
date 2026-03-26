-- ════════════════════════════════════════════════
-- AD LIFELINE: WORKSPACE INVITES
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ════════════════════════════════════════════════

-- Allow 'strategist' role in workspace_members (if not already updated)
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('founder', 'editor', 'strategist'));

-- Track last activity
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS last_active timestamptz;

-- Pending invites table -- tracks invites by email before signup
CREATE TABLE IF NOT EXISTS workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('founder', 'editor', 'strategist')),
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invites_email ON workspace_invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_workspace ON workspace_invites(workspace_id);

-- RLS
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- Members of the workspace can view invites
CREATE POLICY "Workspace members can view invites"
  ON workspace_invites FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Founders can create invites
CREATE POLICY "Founders can create invites"
  ON workspace_invites FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspace_invites.workspace_id
        AND user_id = auth.uid()
        AND role = 'founder'
    )
  );

-- Founders can update invites (mark accepted)
CREATE POLICY "Founders can update invites"
  ON workspace_invites FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'founder'
    )
  );

-- Founders can delete invites
CREATE POLICY "Founders can delete invites"
  ON workspace_invites FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'founder'
    )
  );

-- Also allow the invited user themselves to read their own invites (for auto-join on signup)
CREATE POLICY "Users can view their own invites by email"
  ON workspace_invites FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- RPC to accept an invite: looks up pending invites by email, adds to workspace, marks accepted
CREATE OR REPLACE FUNCTION accept_pending_invites()
RETURNS SETOF workspace_invites
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
  user_email TEXT;
  uid UUID;
BEGIN
  uid := auth.uid();
  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  IF user_email IS NULL THEN
    RETURN;
  END IF;

  FOR inv IN
    SELECT * FROM workspace_invites
    WHERE email = user_email AND status = 'pending'
  LOOP
    -- Add to workspace if not already a member
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, uid, inv.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    -- Mark invite as accepted
    UPDATE workspace_invites
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;

    RETURN NEXT inv;
  END LOOP;
END;
$$;
