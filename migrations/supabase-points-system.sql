-- ════════════════════════════════════════════════
-- Points System Tables
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Points transactions (every point earn/spend)
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  editor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  editor_name text NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('earn', 'redeem')),
  category text NOT NULL,
  reason text NOT NULL,
  ad_id uuid REFERENCES ads(id) ON DELETE SET NULL,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_name text,
  created_at timestamptz DEFAULT now()
);

-- Marketplace rewards catalog
CREATE TABLE IF NOT EXISTS marketplace_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  cost integer NOT NULL,
  tier integer NOT NULL DEFAULT 1,
  icon text DEFAULT '🎁',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Redemption requests
CREATE TABLE IF NOT EXISTS redemption_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  editor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  editor_name text NOT NULL,
  reward_id uuid REFERENCES marketplace_rewards(id) ON DELETE SET NULL,
  reward_name text NOT NULL,
  cost integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'denied')),
  admin_notes text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  handled_at timestamptz
);

-- Quality ratings on deliverables
CREATE TABLE IF NOT EXISTS deliverable_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  ad_id uuid REFERENCES ads(id) ON DELETE CASCADE NOT NULL,
  draft_id text NOT NULL,
  editor_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  rated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rated_by_name text,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ad_id, draft_id)
);

-- RLS policies
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_ratings ENABLE ROW LEVEL SECURITY;

-- Open read for workspace members
CREATE POLICY "pt_sel" ON point_transactions FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "pt_ins" ON point_transactions FOR INSERT WITH CHECK (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "mr_sel" ON marketplace_rewards FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "mr_ins" ON marketplace_rewards FOR INSERT WITH CHECK (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "mr_upd" ON marketplace_rewards FOR UPDATE USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "mr_del" ON marketplace_rewards FOR DELETE USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "rr_sel" ON redemption_requests FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "rr_ins" ON redemption_requests FOR INSERT WITH CHECK (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "rr_upd" ON redemption_requests FOR UPDATE USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

CREATE POLICY "dr_sel" ON deliverable_ratings FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "dr_ins" ON deliverable_ratings FOR INSERT WITH CHECK (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "dr_upd" ON deliverable_ratings FOR UPDATE USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

-- Seed default marketplace rewards
-- (Run only once, or use INSERT ... ON CONFLICT DO NOTHING if re-running)
