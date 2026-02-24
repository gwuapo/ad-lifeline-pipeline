-- ════════════════════════════════════════════════
-- FIX: Drop foreign key on ad_id so notifications work
-- even if ad hasn't been synced to Supabase yet
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Drop the existing table and recreate without FK on ad_id
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
