-- ════════════════════════════════════════════════
-- NOTIFICATIONS (v4) - Uses RPC to bypass RLS for inserts
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- 1) Drop and recreate table
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

grant all on notifications to authenticated;

-- 2) RLS - only for select/update/delete (insert via RPC)
alter table notifications enable row level security;

create policy "notif_sel" on notifications for select
  to authenticated using (recipient_id = auth.uid());

create policy "notif_upd" on notifications for update
  to authenticated using (recipient_id = auth.uid());

create policy "notif_del" on notifications for delete
  to authenticated using (recipient_id = auth.uid());

-- 3) security definer RPC to insert notifications (bypasses RLS)
create or replace function create_notification(
  p_workspace_id uuid,
  p_recipient_id uuid,
  p_sender_name text,
  p_ad_id text,
  p_ad_name text,
  p_message text
)
returns void
language plpgsql
security definer
as $$
begin
  insert into notifications (workspace_id, recipient_id, sender_name, ad_id, ad_name, message)
  values (p_workspace_id, p_recipient_id, p_sender_name, p_ad_id, p_ad_name, p_message);
end;
$$;

-- 4) Realtime
alter publication supabase_realtime add table notifications;

-- 5) Display name lookup RPC
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
