-- Personalization context: derived summaries only (no raw thoughts).
-- Used to build personalized emails without storing or using private content.
-- Populated by backend from reflection_patterns, mood words, and activity – never raw thought text.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_personalization_context (
  user_id UUID PRIMARY KEY,
  recurring_themes JSONB NOT NULL DEFAULT '[]',           -- e.g. ["growth", "gratitude"] from patterns
  recent_mood_words JSONB NOT NULL DEFAULT '[]',         -- last N mood words only, no context
  emotional_tone_summary TEXT,                           -- one line, e.g. "mostly reflective, sometimes hopeful"
  last_reflection_at TIMESTAMPTZ,
  reflection_count_7d INT DEFAULT 0,                      -- count for "you reflected N times this week"
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personalization_context_updated ON public.user_personalization_context(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_personalization_context_last_reflection ON public.user_personalization_context(last_reflection_at DESC);

COMMENT ON TABLE public.user_personalization_context IS 'Derived summaries for personalized emails only; no raw thoughts or identifiable content.';
