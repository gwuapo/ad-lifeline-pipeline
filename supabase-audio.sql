-- ════════════════════════════════════════════════
-- AD LIFELINE: AUDIO RECORDING TOOL
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Audio projects table
CREATE TABLE IF NOT EXISTS audio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  ad_id uuid,
  name text NOT NULL DEFAULT 'Untitled Project',
  script_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recording', 'processing', 'editing', 'exported')),
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audio recordings (raw files)
CREATE TABLE IF NOT EXISTS audio_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES audio_projects(id) ON DELETE CASCADE NOT NULL,
  file_url text NOT NULL,
  file_path text NOT NULL,
  duration_seconds float,
  file_size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

-- Audio analysis results (from Whisper + Claude)
CREATE TABLE IF NOT EXISTS audio_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES audio_projects(id) ON DELETE CASCADE NOT NULL,
  recording_id uuid REFERENCES audio_recordings(id) ON DELETE CASCADE NOT NULL,
  transcript jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Audio exports
CREATE TABLE IF NOT EXISTS audio_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES audio_projects(id) ON DELETE CASCADE NOT NULL,
  file_url text NOT NULL,
  file_path text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  exported_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audio_projects_workspace ON audio_projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_project ON audio_recordings(project_id);
CREATE INDEX IF NOT EXISTS idx_audio_analyses_project ON audio_analyses(project_id);

-- RLS
ALTER TABLE audio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_exports ENABLE ROW LEVEL SECURITY;

-- Audio projects: workspace members can CRUD
CREATE POLICY "Workspace members can view audio projects"
  ON audio_projects FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Workspace members can create audio projects"
  ON audio_projects FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Workspace members can update audio projects"
  ON audio_projects FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Workspace members can delete audio projects"
  ON audio_projects FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Recordings: access via project membership
CREATE POLICY "Access recordings via project"
  ON audio_recordings FOR ALL USING (
    project_id IN (SELECT id FROM audio_projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

-- Analyses: access via project membership
CREATE POLICY "Access analyses via project"
  ON audio_analyses FOR ALL USING (
    project_id IN (SELECT id FROM audio_projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

-- Exports: access via project membership
CREATE POLICY "Access exports via project"
  ON audio_exports FOR ALL USING (
    project_id IN (SELECT id FROM audio_projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

-- Storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'audio' AND auth.uid() IS NOT NULL);
