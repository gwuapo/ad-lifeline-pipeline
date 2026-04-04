-- ════════════════════════════════════════════════
-- Fix: Allow admins/founders to update editor profiles
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Drop the restrictive update policy (only allowed self-updates)
DROP POLICY IF EXISTS "ep_upd" ON editor_profiles;

-- New update policy: allow self-update OR workspace founder/admin/manager
CREATE POLICY "ep_upd" ON editor_profiles FOR UPDATE USING (
  user_id = auth.uid()
  OR
  user_id IN (
    SELECT wm.user_id FROM workspace_members wm
    WHERE wm.workspace_id IN (
      SELECT wm2.workspace_id FROM workspace_members wm2
      WHERE wm2.user_id = auth.uid()
        AND wm2.role IN ('founder', 'admin', 'manager')
    )
  )
);
