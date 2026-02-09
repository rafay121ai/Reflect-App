-- Complete Supabase schema for REFLECT app
-- Run this in Supabase SQL Editor for a new project
-- Order matters: create tables before foreign keys

-- 1. Reflection patterns (for pattern analysis)
CREATE TABLE IF NOT EXISTS public.reflection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emotional_tone TEXT,
  themes TEXT[],
  time_orientation TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Reflections (main reflection table)
CREATE TABLE IF NOT EXISTS public.reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  thought TEXT NOT NULL,
  sections JSONB NOT NULL,
  pattern_id UUID REFERENCES public.reflection_patterns(id),
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  questions JSONB,
  answers JSONB,
  personalized_mirror TEXT
);

CREATE INDEX IF NOT EXISTS idx_reflections_user_id ON public.reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_reflections_pattern_id ON public.reflections(pattern_id);
CREATE INDEX IF NOT EXISTS idx_reflections_created_at ON public.reflections(created_at DESC);

-- 3. Mood check-ins
CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES public.reflections(id) ON DELETE CASCADE,
  word_or_phrase TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_mood_checkins_reflection_id ON public.mood_checkins(reflection_id);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_created_at ON public.mood_checkins(created_at DESC);

-- 4. Revisit reminders
CREATE TABLE IF NOT EXISTS public.revisit_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES public.reflections(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisit_reminders_reflection_id ON public.revisit_reminders(reflection_id);
CREATE INDEX IF NOT EXISTS idx_revisit_reminders_remind_at ON public.revisit_reminders(remind_at);

-- 5. Saved reflections (user history)
CREATE TABLE IF NOT EXISTS public.saved_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  mirror_response TEXT NOT NULL,
  mood_word TEXT,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'waiting')),
  revisit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  revisit_type TEXT CHECK (revisit_type IS NULL OR revisit_type IN ('come_back', 'remind'))
);

CREATE INDEX IF NOT EXISTS idx_saved_reflections_user ON public.saved_reflections(user_identifier);
CREATE INDEX IF NOT EXISTS idx_saved_reflections_status ON public.saved_reflections(status);
CREATE INDEX IF NOT EXISTS idx_saved_reflections_created ON public.saved_reflections(created_at DESC);

-- 6. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_updated ON public.profiles(updated_at DESC);

-- 7. User personalization context
CREATE TABLE IF NOT EXISTS public.user_personalization_context (
  user_id UUID PRIMARY KEY,
  recurring_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_mood_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  emotional_tone_summary TEXT,
  last_reflection_at TIMESTAMPTZ,
  reflection_count_7d INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name_from_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_personalization_context_updated ON public.user_personalization_context(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_personalization_context_last_reflection ON public.user_personalization_context(last_reflection_at DESC);

-- 8. Weekly insights
CREATE TABLE IF NOT EXISTS public.weekly_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_insights_user_week ON public.weekly_insights(user_id, week_start);
