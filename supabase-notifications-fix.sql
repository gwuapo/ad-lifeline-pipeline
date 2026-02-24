-- ════════════════════════════════════════════════
-- NOTIFICATIONS + DISPLAY NAME RPC (v3)
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- 1) Drop and recreate
drop table if exists notifications;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  recipient_id uuid not null,
  sender_name text not null,
  ad_id text not null,
  ad_name text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index idx_notif_recipient on notifications(recipient_id);
create index idx_notif_workspace on notifications(workspace_id);

-- 2) RLS: allow any authenticated user to insert, users read/update/delete their own
alter table notifications enable row level security;

drop policy if exists "notif_sel" on notifications;
drop policy if exists "notif_ins" on notifications;
drop policy if exists "notif_upd" on notifications;
drop policy if exists "notif_del" on notifications;

create policy "notif_sel" on notifications for select
  to authenticated using (recipient_id = auth.uid());

create policy "notif_ins" on notifications for insert
  to authenticated with check (true);

create policy "notif_upd" on notifications for update
  to authenticated using (recipient_id = auth.uid());

create policy "notif_del" on notifications for delete
  to authenticated using (recipient_id = auth.uid());

-- 3) Grant table access to authenticated role
grant all on notifications to authenticated;

-- 4) Realtime
alter publication supabase_realtime add table notifications;

-- 5) RPC to look up display_name from auth.users metadata
create or replace function get_display_name_by_user_id(uid uuid)
returns text
language sql
security definer
as $$
  select coalesce(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1)
  ) from auth.users where id = uid limit 1;
$$;
