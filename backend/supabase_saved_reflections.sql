-- Saved reflections: history per user (localStorage id now; Supabase Auth user_id later).
-- Open-later items: status = 'waiting'. Cleanup: delete waiting rows not revisited in 7 days.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.saved_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]',
  mirror_response TEXT NOT NULL,
  mood_word TEXT,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'waiting')),
  revisit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reflections_user ON public.saved_reflections(user_identifier);
CREATE INDEX IF NOT EXISTS idx_saved_reflections_status ON public.saved_reflections(status);
CREATE INDEX IF NOT EXISTS idx_saved_reflections_created ON public.saved_reflections(created_at DESC);
