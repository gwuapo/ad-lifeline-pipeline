-- ════════════════════════════════════════════════
-- TEAM INVITE: Create RPC function to look up users by email
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

create or replace function get_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
as $$
  select id from auth.users where email = lookup_email limit 1;
$$;
