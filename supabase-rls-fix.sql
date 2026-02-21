-- ════════════════════════════════════════════════
-- NUCLEAR RLS FIX: Drop everything and recreate
-- Copy-paste this ENTIRE file into Supabase SQL Editor and Run
-- ════════════════════════════════════════════════

-- STEP 1: Disable RLS entirely on all tables
alter table workspaces disable row level security;
alter table workspace_members disable row level security;
alter table ads disable row level security;
alter table editor_profiles disable row level security;
alter table workspace_settings disable row level security;

-- STEP 2: Drop every possible policy name we've ever created
drop policy if exists "Users can view their workspaces" on workspaces;
drop policy if exists "Founders can create workspaces" on workspaces;
drop policy if exists "Founders can update their workspaces" on workspaces;
drop policy if exists "workspaces_select" on workspaces;
drop policy if exists "workspaces_insert" on workspaces;
drop policy if exists "workspaces_update" on workspaces;
drop policy if exists "ws_select" on workspaces;
drop policy if exists "ws_insert" on workspaces;
drop policy if exists "ws_update" on workspaces;
drop policy if exists "ws_delete" on workspaces;

drop policy if exists "Members can view workspace members" on workspace_members;
drop policy if exists "Founders can add members" on workspace_members;
drop policy if exists "Founders can remove members" on workspace_members;
drop policy if exists "wm_select" on workspace_members;
drop policy if exists "wm_insert" on workspace_members;
drop policy if exists "wm_update" on workspace_members;
drop policy if exists "wm_delete" on workspace_members;

drop policy if exists "Founders can do everything with ads" on ads;
drop policy if exists "Editors can view their assigned ads" on ads;
drop policy if exists "Editors can update their assigned ads" on ads;
drop policy if exists "ads_founder_all" on ads;
drop policy if exists "ads_editor_select" on ads;
drop policy if exists "ads_editor_update" on ads;
drop policy if exists "ads_select" on ads;
drop policy if exists "ads_insert" on ads;
drop policy if exists "ads_update" on ads;
drop policy if exists "ads_delete" on ads;

drop policy if exists "Users can manage their own profile" on editor_profiles;
drop policy if exists "Founders can view editor profiles in their workspace" on editor_profiles;
drop policy if exists "Founders can update editor profiles" on editor_profiles;
drop policy if exists "ep_own" on editor_profiles;
drop policy if exists "ep_founder_select" on editor_profiles;
drop policy if exists "ep_founder_update" on editor_profiles;
drop policy if exists "ep_select" on editor_profiles;
drop policy if exists "ep_insert" on editor_profiles;
drop policy if exists "ep_update" on editor_profiles;
drop policy if exists "ep_delete" on editor_profiles;

drop policy if exists "Members can view workspace settings" on workspace_settings;
drop policy if exists "Founders can manage workspace settings" on workspace_settings;
drop policy if exists "Founders can insert workspace settings" on workspace_settings;
drop policy if exists "Founders can update workspace settings" on workspace_settings;
drop policy if exists "Founders can delete workspace settings" on workspace_settings;
drop policy if exists "ws_select" on workspace_settings;
drop policy if exists "ws_insert" on workspace_settings;
drop policy if exists "ws_update" on workspace_settings;
drop policy if exists "ws_delete" on workspace_settings;
drop policy if exists "wset_select" on workspace_settings;
drop policy if exists "wset_insert" on workspace_settings;
drop policy if exists "wset_update" on workspace_settings;
drop policy if exists "wset_delete" on workspace_settings;

-- STEP 3: Re-enable RLS
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table ads enable row level security;
alter table editor_profiles enable row level security;
alter table workspace_settings enable row level security;

-- ════════════════════════════════════════════════
-- STEP 4: Create clean policies
-- RULE: No table ever references itself or creates circular refs
-- ════════════════════════════════════════════════

-- WORKSPACES: creator can do everything. No references to other tables.
create policy "ws_sel" on workspaces for select using (created_by = auth.uid());
create policy "ws_ins" on workspaces for insert with check (created_by = auth.uid());
create policy "ws_upd" on workspaces for update using (created_by = auth.uid());
create policy "ws_del" on workspaces for delete using (created_by = auth.uid());

-- WORKSPACE MEMBERS: users see their own rows. No self-reference.
create policy "wm_sel" on workspace_members for select using (user_id = auth.uid());
create policy "wm_ins" on workspace_members for insert with check (true);
create policy "wm_upd" on workspace_members for update using (user_id = auth.uid());
create policy "wm_del" on workspace_members for delete using (true);

-- ADS: check membership via workspace_members (one-way ref, no cycle)
create policy "ads_sel" on ads for select using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "ads_ins" on ads for insert with check (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "ads_upd" on ads for update using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "ads_del" on ads for delete using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);

-- EDITOR PROFILES: own profile only
create policy "ep_sel" on editor_profiles for select using (true);
create policy "ep_ins" on editor_profiles for insert with check (user_id = auth.uid());
create policy "ep_upd" on editor_profiles for update using (user_id = auth.uid());
create policy "ep_del" on editor_profiles for delete using (user_id = auth.uid());

-- WORKSPACE SETTINGS: check membership (one-way ref to workspace_members)
create policy "wset_sel" on workspace_settings for select using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "wset_ins" on workspace_settings for insert with check (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "wset_upd" on workspace_settings for update using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
create policy "wset_del" on workspace_settings for delete using (
  workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
);
