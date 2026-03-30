-- ════════════════════════════════════════════════
-- SECURITY: Disable public signups, restrict to invite-only
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- IMPORTANT: Also go to Supabase Dashboard > Authentication > Settings
-- and DISABLE "Allow new users to sign up" checkbox.
-- This prevents anyone from calling supabase.auth.signUp() directly.

-- Block workspace creation for non-admins
-- Only capo@ and af@ can create workspaces
CREATE OR REPLACE FUNCTION check_workspace_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  creator_email TEXT;
  allowed_emails TEXT[] := ARRAY['capo@nexusholdings.io', 'af@nexusholdings.io'];
BEGIN
  SELECT email INTO creator_email FROM auth.users WHERE id = NEW.created_by;
  IF creator_email IS NULL OR NOT (creator_email = ANY(allowed_emails)) THEN
    RAISE EXCEPTION 'Only admins can create workspaces';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_workspace_creator ON workspaces;
CREATE TRIGGER enforce_workspace_creator
  BEFORE INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION check_workspace_creator();
