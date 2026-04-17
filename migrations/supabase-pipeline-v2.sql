-- ════════════════════════════════════════════════
-- AD LIFELINE: PIPELINE V2 MIGRATION
-- 11-stage pipeline with SLA tracking, priority, and stage transitions
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ════════════════════════════════════════════════

-- 1. ADD V2 COLUMNS TO ADS TABLE
-- These are all nullable/defaulted so existing ads are preserved

ALTER TABLE ads ADD COLUMN IF NOT EXISTS avatar_id text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS angle_hypothesis text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS hook_mechanism text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS script_body text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS hook_variants jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS compliance_flags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS citations jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS brief_body jsonb;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS estimated_edit_hours numeric;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS assigned_editor_id uuid REFERENCES auth.users(id);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority text DEFAULT 'P2';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_ship_date date;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS result_tag text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS learnings_note text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS kill_reason text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT now();
ALTER TABLE ads ADD COLUMN IF NOT EXISTS sla_hours numeric;

-- 2. MIGRATE EXISTING STAGES TO V2 STAGE NAMES
-- pre → scripted (safe default; cards with no script stay in drafting)
-- in → in_edit
-- post → qa
-- live → live (unchanged)
-- killed → killed (unchanged)

UPDATE ads SET stage = 'scripted' WHERE stage = 'pre';
UPDATE ads SET stage = 'in_edit' WHERE stage = 'in';
UPDATE ads SET stage = 'qa' WHERE stage = 'post';
-- live and killed stay as-is

-- Set stage_entered_at from the data jsonb if it exists, otherwise use updated_at
UPDATE ads SET stage_entered_at = COALESCE(
  to_timestamp((data->>'stageEnteredAt')::bigint / 1000),
  updated_at,
  now()
) WHERE stage_entered_at IS NULL OR stage_entered_at = now();

-- 3. STAGE TRANSITIONS EVENT LOG
CREATE TABLE IF NOT EXISTS stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES ads(id) ON DELETE CASCADE NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  transitioned_by uuid REFERENCES auth.users(id),
  transitioned_at timestamptz DEFAULT now(),
  notes text
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stage_transitions_concept ON stage_transitions(concept_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_at ON stage_transitions(transitioned_at);

-- 4. RLS for stage_transitions
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_transitions_select" ON stage_transitions FOR SELECT USING (true);
CREATE POLICY "stage_transitions_insert" ON stage_transitions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 5. AVATARS TABLE (the 14 Darina customer avatars)
CREATE TABLE IF NOT EXISTS avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatars_select" ON avatars FOR SELECT USING (true);
CREATE POLICY "avatars_insert" ON avatars FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "avatars_update" ON avatars FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "avatars_delete" ON avatars FOR DELETE USING (auth.uid() IS NOT NULL);

-- 6. Update the updated_at trigger for ads
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ads_updated_at ON ads;
CREATE TRIGGER ads_updated_at
  BEFORE UPDATE ON ads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
