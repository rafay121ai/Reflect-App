-- Guest reflections + plan_type tracking
-- Run in Supabase SQL editor.

-- Add guest_id column to reflections table
ALTER TABLE public.reflections
ADD COLUMN IF NOT EXISTS guest_id TEXT NULL;

-- Index for fast guest_id lookups during migration
CREATE INDEX IF NOT EXISTS reflections_guest_id_idx
  ON public.reflections(guest_id)
  WHERE guest_id IS NOT NULL;

-- Add plan_type to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'guest'
CHECK (plan_type IN ('guest', 'trial', 'monthly', 'yearly'));

-- Ensure user_usage plan_type allows 'guest'
ALTER TABLE public.user_usage
DROP CONSTRAINT IF EXISTS user_usage_plan_type_check;

ALTER TABLE public.user_usage
ADD CONSTRAINT user_usage_plan_type_check
CHECK (plan_type IN ('guest', 'trial', 'monthly', 'yearly'));

-- Update RLS for reflections: authenticated users see only their own rows
-- (guest rows have user_id IS NULL and are not accessible via anon key)
DROP POLICY IF EXISTS "Users can only see their own reflections"
  ON public.reflections;

CREATE POLICY "Users can only see their own reflections"
  ON public.reflections
  FOR ALL USING (
    auth.uid() = user_id
  );
