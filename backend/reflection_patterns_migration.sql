-- Run this migration in the Supabase SQL editor.
-- Recreates reflection_patterns with user_id and deep pattern fields.

-- If reflections has a FK to reflection_patterns, drop it first so we can drop the table
ALTER TABLE public.reflections DROP CONSTRAINT IF EXISTS reflections_pattern_id_fkey;

-- Drop old table (no user_id = useless)
DROP TABLE IF EXISTS public.reflection_patterns;

-- Recreate with proper schema
CREATE TABLE public.reflection_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reflection_id uuid NULL REFERENCES public.reflections(id) ON DELETE SET NULL,

  -- Surface level (existing)
  emotional_tone text NULL,
  themes text[] NULL,
  time_orientation text NULL,

  -- Deep level (new — what makes personalization actually work)
  recurring_phrases text[] NULL,  -- exact words/phrases user keeps using
  core_tension text NULL,         -- the central unresolved conflict
  unresolved_threads text[] NULL, -- things left open, not concluded
  self_beliefs text[] NULL,       -- beliefs about themselves surfaced in this reflection

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reflection_patterns_pkey PRIMARY KEY (id)
);

CREATE INDEX reflection_patterns_user_id_idx
  ON public.reflection_patterns(user_id);

CREATE INDEX reflection_patterns_created_at_idx
  ON public.reflection_patterns(user_id, created_at DESC);

ALTER TABLE public.reflection_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own patterns"
  ON public.reflection_patterns
  FOR ALL USING (auth.uid() = user_id);

-- Re-add FK from reflections to reflection_patterns so pattern_id still works
ALTER TABLE public.reflections
  ADD CONSTRAINT reflections_pattern_id_fkey
  FOREIGN KEY (pattern_id) REFERENCES public.reflection_patterns(id) ON DELETE SET NULL;
