-- Track when a saved reflection was opened (viewed) by the user.
-- Run in Supabase SQL Editor after supabase_saved_reflections.sql.

ALTER TABLE public.saved_reflections
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
