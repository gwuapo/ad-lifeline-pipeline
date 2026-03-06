-- ════════════════════════════════════════════════
-- SPLIT TESTS: NCM Split Test Module
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════

-- Offer Library (reusable offer configurations)
create table if not exists offer_library (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid not null,
  name text not null,
  tiers jsonb default '[]'::jsonb,
  quantity_mix jsonb default '[]'::jsonb,
  payment_pct numeric default 5,
  refund_rate numeric default 0.05,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Split Tests
create table if not exists split_tests (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid not null,
  name text not null,
  platforms jsonb default '["meta"]'::jsonb,
  currency text default 'SAR',
  usd_exchange_rate numeric default 3.75,
  start_date date,
  status text default 'active' check (status in ('active', 'completed', 'archived')),
  winner_variation_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Variations (child of split_tests)
create table if not exists split_test_variations (
  id uuid default gen_random_uuid() primary key,
  split_test_id uuid references split_tests(id) on delete cascade not null,
  name text not null,
  ad_set_id_meta text,
  ad_set_id_tiktok text,
  tiers jsonb default '[]'::jsonb,
  quantity_mix jsonb default '[]'::jsonb,
  payment_pct numeric default 5,
  refund_rate numeric default 0.05,
  manual_spend numeric default 0,
  manual_orders numeric default 0,
  manual_revenue numeric default 0,
  created_at timestamptz default now()
);

-- Daily Snapshots (synced from Triple Whale)
create table if not exists split_test_snapshots (
  id uuid default gen_random_uuid() primary key,
  variation_id uuid references split_test_variations(id) on delete cascade not null,
  date date not null,
  ad_spend numeric default 0,
  orders numeric default 0,
  revenue numeric default 0,
  source text default 'manual' check (source in ('manual', 'triple_whale')),
  synced_at timestamptz default now(),
  unique (variation_id, date)
);

-- RLS (simple: any authenticated user can access)
alter table offer_library enable row level security;
alter table split_tests enable row level security;
alter table split_test_variations enable row level security;
alter table split_test_snapshots enable row level security;

-- offer_library policies
create policy "offer_library_select" on offer_library for select using (auth.uid() is not null);
create policy "offer_library_insert" on offer_library for insert with check (auth.uid() is not null);
create policy "offer_library_update" on offer_library for update using (auth.uid() is not null);
create policy "offer_library_delete" on offer_library for delete using (auth.uid() is not null);

-- split_tests policies
create policy "split_tests_select" on split_tests for select using (auth.uid() is not null);
create policy "split_tests_insert" on split_tests for insert with check (auth.uid() is not null);
create policy "split_tests_update" on split_tests for update using (auth.uid() is not null);
create policy "split_tests_delete" on split_tests for delete using (auth.uid() is not null);

-- split_test_variations policies
create policy "variations_select" on split_test_variations for select using (auth.uid() is not null);
create policy "variations_insert" on split_test_variations for insert with check (auth.uid() is not null);
create policy "variations_update" on split_test_variations for update using (auth.uid() is not null);
create policy "variations_delete" on split_test_variations for delete using (auth.uid() is not null);

-- split_test_snapshots policies
create policy "snapshots_select" on split_test_snapshots for select using (auth.uid() is not null);
create policy "snapshots_insert" on split_test_snapshots for insert with check (auth.uid() is not null);
create policy "snapshots_update" on split_test_snapshots for update using (auth.uid() is not null);
create policy "snapshots_delete" on split_test_snapshots for delete using (auth.uid() is not null);
