-- Landing Page Projects table
CREATE TABLE IF NOT EXISTS landing_page_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled',
  preset_type TEXT NOT NULL DEFAULT 'advertorial',
  step TEXT NOT NULL DEFAULT 'setup',
  context JSONB NOT NULL DEFAULT '{}',
  ideas JSONB,
  selected_idea JSONB,
  structure JSONB,
  full_copy JSONB,
  copy_version INTEGER NOT NULL DEFAULT 0,
  build_status TEXT,
  build_logs JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for workspace lookup
CREATE INDEX IF NOT EXISTS idx_lp_projects_workspace ON landing_page_projects(workspace_id);

-- RLS
ALTER TABLE landing_page_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage landing page projects in their workspace"
  ON landing_page_projects FOR ALL
  USING (true)
  WITH CHECK (true);
