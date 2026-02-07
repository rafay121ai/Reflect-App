-- Add Q&A and personalized mirror to your existing reflections table.
-- Run this in Supabase SQL Editor after your main schema.

ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS questions JSONB,
  ADD COLUMN IF NOT EXISTS answers JSONB,
  ADD COLUMN IF NOT EXISTS personalized_mirror TEXT;
