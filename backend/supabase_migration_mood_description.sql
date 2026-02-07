-- Add description to mood_checkins (from the suggestion card when user picks one).
-- Run in Supabase SQL Editor after supabase_migration_mood.sql.

ALTER TABLE mood_checkins ADD COLUMN IF NOT EXISTS description TEXT;
