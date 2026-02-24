-- ════════════════════════════════════════════════
-- NOTIFICATIONS + DISPLAY NAME RPC
-- Run this ONCE in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- 1) Recreate notifications table without FK on ad_id
drop table if exists notifications;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  sender_name text not null,
  ad_id text not null,
  ad_name text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index idx_notif_recipient on notifications(recipient_id);
create index idx_notif_workspace on notifications(workspace_id);

alter table notifications enable row level security;

create policy "notif_sel" on notifications for select using (recipient_id = auth.uid());
create policy "notif_ins" on notifications for insert with check (true);
create policy "notif_upd" on notifications for update using (recipient_id = auth.uid());
create policy "notif_del" on notifications for delete using (recipient_id = auth.uid());

alter publication supabase_realtime add table notifications;

-- 2) RPC to look up display_name from auth.users metadata by user ID
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
