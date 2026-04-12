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

-- Get user info (display_name, email, last_sign_in) for team display
create or replace function get_user_info(uid uuid)
returns json
language sql
security definer
as $$
  select json_build_object(
    'display_name', coalesce(raw_user_meta_data->>'display_name', ''),
    'email', coalesce(email, ''),
    'last_sign_in', last_sign_in_at,
    'created_at', created_at
  )
  from auth.users where id = uid limit 1;
$$;
