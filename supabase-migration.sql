-- ════════════════════════════════════════════════
-- AD LIFELINE: MULTI-WORKSPACE MIGRATION
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ════════════════════════════════════════════════

-- 1. WORKSPACES
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- 2. WORKSPACE MEMBERS
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('founder', 'editor')),
  editor_name text, -- display name used for ad assignment matching
  joined_at timestamptz default now(),
  unique(workspace_id, user_id)
);

-- 3. ADS (JSONB data column for nested structures)
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  type text not null,
  stage text not null default 'pre',
  editor text default '',
  deadline text default '',
  brief text default '',
  notes text default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. EDITOR PROFILES
create table if not exists editor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  display_name text not null default '',
  photo_url text,
  portfolio_url text default '',
  compensation_rate text default '',
  weekly_minutes integer default 0,
  onboarded_at timestamptz default now()
);

-- 5. WORKSPACE SETTINGS (thresholds per workspace)
create table if not exists workspace_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade unique not null,
  thresholds jsonb not null default '{"green": 15, "yellow": 25}'::jsonb
);

-- ════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════
create index if not exists idx_ads_workspace on ads(workspace_id);
create index if not exists idx_ads_editor on ads(editor);
create index if not exists idx_members_workspace on workspace_members(workspace_id);
create index if not exists idx_members_user on workspace_members(user_id);

-- ════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table ads enable row level security;
alter table editor_profiles enable row level security;
alter table workspace_settings enable row level security;

-- WORKSPACES: members can read their workspaces, founders can create
create policy "Users can view their workspaces"
  on workspaces for select using (
    id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create policy "Founders can create workspaces"
  on workspaces for insert with check (created_by = auth.uid());

create policy "Founders can update their workspaces"
  on workspaces for update using (
    id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'founder')
  );

-- WORKSPACE MEMBERS: founders can manage, all members can read their workspace's members
create policy "Members can view workspace members"
  on workspace_members for select using (
    workspace_id in (select workspace_id from workspace_members wm where wm.user_id = auth.uid())
  );

create policy "Founders can add members"
  on workspace_members for insert with check (
    workspace_id in (select workspace_id from workspace_members wm where wm.user_id = auth.uid() and wm.role = 'founder')
    or user_id = auth.uid() -- allow self-insert when creating workspace
  );

create policy "Founders can remove members"
  on workspace_members for delete using (
    workspace_id in (select workspace_id from workspace_members wm where wm.user_id = auth.uid() and wm.role = 'founder')
  );

-- ADS: founders see all workspace ads, editors see only their assigned ads
create policy "Founders can do everything with ads"
  on ads for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'founder')
  );

create policy "Editors can view their assigned ads"
  on ads for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'editor')
    and editor in (select editor_name from workspace_members where user_id = auth.uid() and workspace_id = ads.workspace_id)
  );

create policy "Editors can update their assigned ads"
  on ads for update using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'editor')
    and editor in (select editor_name from workspace_members where user_id = auth.uid() and workspace_id = ads.workspace_id)
  );

-- EDITOR PROFILES: owners can manage theirs, founders in same workspace can read/update
create policy "Users can manage their own profile"
  on editor_profiles for all using (user_id = auth.uid());

create policy "Founders can view editor profiles in their workspace"
  on editor_profiles for select using (
    user_id in (
      select wm.user_id from workspace_members wm
      where wm.workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'founder')
      and wm.role = 'editor'
    )
  );

create policy "Founders can update editor profiles"
  on editor_profiles for update using (
    user_id in (
      select wm.user_id from workspace_members wm
      where wm.workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'founder')
      and wm.role = 'editor'
    )
  );

-- WORKSPACE SETTINGS: founders can manage, all members can read
create policy "Members can view workspace settings"
  on workspace_settings for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

create policy "Founders can manage workspace settings"
  on workspace_settings for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'founder')
  );

-- ════════════════════════════════════════════════
-- REALTIME (enable for live sync)
-- ════════════════════════════════════════════════
alter publication supabase_realtime add table ads;
alter publication supabase_realtime add table workspace_members;
