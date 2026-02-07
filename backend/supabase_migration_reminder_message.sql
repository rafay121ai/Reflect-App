-- Add optional LLM-generated reminder message to revisit_reminders.
-- Run after supabase_migration_revisit_reminders.sql.

ALTER TABLE revisit_reminders
  ADD COLUMN IF NOT EXISTS message TEXT;
