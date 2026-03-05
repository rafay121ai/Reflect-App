-- Run this in the Supabase SQL editor if reflections is missing mirror_report or you get 400 on save.
-- Ensures: questions (JSONB), answers (JSONB), personalized_mirror (TEXT), closing_text (TEXT), mirror_report (JSONB).

-- Add mirror_report (JSONB) for the 4-slide report; skip if already exists
ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS mirror_report jsonb NULL;

-- If your table was created without these, uncomment and run:
-- ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS questions jsonb NULL;
-- ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS answers jsonb NULL;
-- ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS personalized_mirror text NULL;
-- ALTER TABLE public.reflections ADD COLUMN IF NOT EXISTS closing_text text NULL;
