-- Revisit reminders: store reminders in DB, schedule via code, trigger via time-based logic.
-- Requires: public.reflections table with id (UUID).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.revisit_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES public.reflections(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisit_reminders_reflection_id ON public.revisit_reminders(reflection_id);
CREATE INDEX IF NOT EXISTS idx_revisit_reminders_remind_at ON public.revisit_reminders(remind_at);
