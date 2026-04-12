-- ════════════════════════════════════════════════
-- NOTIFICATIONS TABLE: Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  sender_name text not null,
  ad_id uuid references ads(id) on delete cascade not null,
  ad_name text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notif_recipient on notifications(recipient_id);
create index if not exists idx_notif_workspace on notifications(workspace_id);

alter table notifications enable row level security;

-- Users can see their own notifications
create policy "notif_sel" on notifications for select using (recipient_id = auth.uid());
-- Anyone in workspace can create notifications
create policy "notif_ins" on notifications for insert with check (true);
-- Users can update (mark read) their own notifications
create policy "notif_upd" on notifications for update using (recipient_id = auth.uid());
-- Users can delete their own notifications
create policy "notif_del" on notifications for delete using (recipient_id = auth.uid());

-- Enable realtime
alter publication supabase_realtime add table notifications;

-- RPC to look up user ID by display name within a workspace
create or replace function get_user_id_by_name(lookup_name text, ws_id uuid)
returns uuid
language sql
security definer
as $$
  select wm.user_id from workspace_members wm
  left join editor_profiles ep on ep.user_id = wm.user_id
  where wm.workspace_id = ws_id
  and (
    wm.editor_name = lookup_name
    or ep.display_name = lookup_name
  )
  limit 1;
$$;

-- Also check auth.users metadata for founders
create or replace function get_user_id_by_display_name(lookup_name text)
returns uuid
language sql
security definer
as $$
  select id from auth.users
  where raw_user_meta_data->>'display_name' = lookup_name
  limit 1;
$$;
