-- Intelligence Flywheel: Workspace Learnings Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS workspace_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES ads(id) ON DELETE SET NULL,
  ad_name TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'general',
  text TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium',
  evidence TEXT DEFAULT '',
  source TEXT DEFAULT 'auto', -- 'auto' = flywheel, 'manual' = user
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_learnings_ws ON workspace_learnings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_learnings_type ON workspace_learnings(type);

ALTER TABLE workspace_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view learnings in their workspaces"
  ON workspace_learnings FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert learnings in their workspaces"
  ON workspace_learnings FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
