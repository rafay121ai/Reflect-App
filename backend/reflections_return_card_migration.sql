-- Add return_card column to reflections table
-- Run this in Supabase SQL Editor

ALTER TABLE reflections ADD COLUMN IF NOT EXISTS return_card TEXT;
