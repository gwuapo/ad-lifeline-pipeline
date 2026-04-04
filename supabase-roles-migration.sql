-- ════════════════════════════════════════════════
-- Add admin and manager roles to workspace_members and workspace_invites
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Update workspace_members role constraint
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('founder', 'admin', 'manager', 'editor', 'strategist'));

-- Update workspace_invites role constraint
ALTER TABLE workspace_invites DROP CONSTRAINT IF EXISTS workspace_invites_role_check;
ALTER TABLE workspace_invites ADD CONSTRAINT workspace_invites_role_check
  CHECK (role IN ('founder', 'admin', 'manager', 'editor', 'strategist'));
