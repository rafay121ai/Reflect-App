-- Revisit reminders: gentle reminder to return to a reflection.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS revisit_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisit_reminders_reflection_id ON revisit_reminders(reflection_id);
CREATE INDEX IF NOT EXISTS idx_revisit_reminders_remind_at ON revisit_reminders(remind_at);
