-- ════════════════════════════════════════════════
-- BRAIN APP: Shared workspace sync tables
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- 1. Brain workspace config (API keys, settings) — one row per workspace
CREATE TABLE IF NOT EXISTS brain_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE NOT NULL,
  api_key text DEFAULT '',
  gemini_key text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE brain_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_config_select" ON brain_config FOR SELECT USING (true);
CREATE POLICY "brain_config_insert" ON brain_config FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brain_config_update" ON brain_config FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 2. Brain chats — shared across workspace
CREATE TABLE IF NOT EXISTS brain_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  title text DEFAULT 'New chat',
  project_id uuid,
  messages jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE brain_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_chats_select" ON brain_chats FOR SELECT USING (true);
CREATE POLICY "brain_chats_insert" ON brain_chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brain_chats_update" ON brain_chats FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "brain_chats_delete" ON brain_chats FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_brain_chats_workspace ON brain_chats(workspace_id);

-- 3. Brain projects — shared across workspace
CREATE TABLE IF NOT EXISTS brain_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brain_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_projects_select" ON brain_projects FOR SELECT USING (true);
CREATE POLICY "brain_projects_insert" ON brain_projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brain_projects_update" ON brain_projects FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "brain_projects_delete" ON brain_projects FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Translation memory — shared corrections
CREATE TABLE IF NOT EXISTS brain_translation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  english text NOT NULL,
  ai_translation text,
  approved_translation text NOT NULL,
  section_type text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brain_translation_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_tm_select" ON brain_translation_memory FOR SELECT USING (true);
CREATE POLICY "brain_tm_insert" ON brain_translation_memory FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brain_tm_delete" ON brain_translation_memory FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_brain_tm_workspace ON brain_translation_memory(workspace_id);

-- 5. Translation history — saved translated scripts
CREATE TABLE IF NOT EXISTS brain_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  title text DEFAULT 'Untitled',
  sections jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brain_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_translations_select" ON brain_translations FOR SELECT USING (true);
CREATE POLICY "brain_translations_insert" ON brain_translations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "brain_translations_delete" ON brain_translations FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_brain_translations_workspace ON brain_translations(workspace_id);
