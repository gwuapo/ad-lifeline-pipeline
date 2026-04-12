-- Add payment_methods JSONB column to editor_profiles
-- Run this in Supabase SQL Editor
ALTER TABLE editor_profiles ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '{}';
