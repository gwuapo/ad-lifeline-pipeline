-- Add api_keys JSONB column to workspace_settings
-- This stores API keys at the workspace level so all team members share them
-- Run this in Supabase SQL Editor

ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS api_keys jsonb NOT NULL DEFAULT '{}'::jsonb;
