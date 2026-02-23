-- ════════════════════════════════════════════════
-- Look up display_name from auth.users metadata by user ID
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

create or replace function get_display_name_by_user_id(uid uuid)
returns text
language sql
security definer
as $$
  select raw_user_meta_data->>'display_name' from auth.users where id = uid limit 1;
$$;
