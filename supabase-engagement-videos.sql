-- Engagement videos: multiple videos per ad per platform
CREATE TABLE IF NOT EXISTS engagement_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram')),
  video_number INT NOT NULL DEFAULT 1,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, ad_id, platform, video_number)
);

-- Add video_id to comment_assignments
ALTER TABLE comment_assignments ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES engagement_videos(id) ON DELETE CASCADE;

-- RLS
ALTER TABLE engagement_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view engagement videos" ON engagement_videos
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Workspace members can insert engagement videos" ON engagement_videos
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Workspace members can update engagement videos" ON engagement_videos
  FOR UPDATE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "Workspace members can delete engagement videos" ON engagement_videos
  FOR DELETE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
