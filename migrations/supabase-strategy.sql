-- ════════════════════════════════════════════════
-- STRATEGY DATA: Single JSONB table per workspace
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

create table if not exists strategy_data (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references workspaces(id) on delete cascade not null unique,
  brand_info jsonb default '{}'::jsonb,
  avatars jsonb default '[]'::jsonb,
  desires jsonb default '[]'::jsonb,
  emotional_triggers jsonb default '[]'::jsonb,
  fears jsonb default '[]'::jsonb,
  problem_solution jsonb default '{}'::jsonb,
  headlines jsonb default '[]'::jsonb,
  market_sophistication jsonb default '{}'::jsonb,
  products jsonb default '[]'::jsonb,
  objections jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table strategy_data enable row level security;

create policy "strategy_data_select" on strategy_data for select using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);

create policy "strategy_data_insert" on strategy_data for insert with check (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);

create policy "strategy_data_update" on strategy_data for update using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);

create policy "strategy_data_delete" on strategy_data for delete using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
