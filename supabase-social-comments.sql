-- Social Profiles: editors' TikTok/Instagram accounts
CREATE TABLE IF NOT EXISTS social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram')),
  username TEXT NOT NULL,
  profile_url TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'neither')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform, username)
);

-- Comment Assignments: founder assigns comments to specific profiles on each ad
CREATE TABLE IF NOT EXISTS comment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram')),
  ad_url TEXT,
  comment_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted')),
  assigned_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_assignments ENABLE ROW LEVEL SECURITY;

-- Social profiles: users can manage their own, workspace members can read all in their workspace
CREATE POLICY "Users can manage own social profiles" ON social_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Workspace members can view social profiles" ON social_profiles
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Comment assignments: workspace members can read, founders/admins can insert/update
CREATE POLICY "Workspace members can view comment assignments" ON comment_assignments
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Workspace members can insert comment assignments" ON comment_assignments
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Workspace members can update comment assignments" ON comment_assignments
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Workspace members can delete comment assignments" ON comment_assignments
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
