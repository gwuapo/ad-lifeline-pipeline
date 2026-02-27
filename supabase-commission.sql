-- ════════════════════════════════════════════════
-- EDITOR COMMISSION: Add commission_pct to editor_profiles
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

alter table editor_profiles add column if not exists commission_pct numeric default 0;
