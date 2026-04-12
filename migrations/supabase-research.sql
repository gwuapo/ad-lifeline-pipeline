-- ════════════════════════════════════════════════
-- MODULE 1: PRODUCT INTELLIGENCE
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Product details per workspace
alter table workspaces add column if not exists product_details jsonb default '{}'::jsonb;

-- Research documents per workspace
create table if not exists product_research (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  step text not null,
  model_used text,
  prompt_used text,
  output text not null default '',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'error')),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_research_workspace on product_research(workspace_id);
create index if not exists idx_research_step on product_research(step);

-- Knowledge base per workspace (synthesized from research)
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade unique not null,
  avatars jsonb default '[]'::jsonb,
  objections jsonb default '[]'::jsonb,
  competitors jsonb default '[]'::jsonb,
  unique_mechanisms jsonb default '[]'::jsonb,
  awareness_level jsonb default '{}'::jsonb,
  winning_angles jsonb default '[]'::jsonb,
  full_document text default '',
  updated_at timestamptz default now()
);

-- RLS
alter table product_research enable row level security;
alter table knowledge_base enable row level security;

grant all on product_research to authenticated;
grant all on knowledge_base to authenticated;

-- Research: workspace members can read/write
create policy "research_sel" on product_research for select to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "research_ins" on product_research for insert to authenticated
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "research_upd" on product_research for update to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "research_del" on product_research for delete to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Knowledge base: workspace members can read/write
create policy "kb_sel" on knowledge_base for select to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "kb_ins" on knowledge_base for insert to authenticated
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "kb_upd" on knowledge_base for update to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

create policy "kb_del" on knowledge_base for delete to authenticated
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid()));

-- Update workspace product details RPC (safe update of jsonb column)
create or replace function update_workspace_product_details(ws_id uuid, details jsonb)
returns void
language plpgsql
security definer
as $$
begin
  update workspaces set product_details = details where id = ws_id;
end;
$$;
