-- Add SLA config column to workspace_settings
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS sla_config jsonb DEFAULT '{}'::jsonb;
