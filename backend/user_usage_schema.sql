-- public.user_usage — production rate limiting for reflections
-- user_id references auth.users(id); trigger keeps updated_at current.

CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free',
  reflections_used INTEGER NOT NULL DEFAULT 0,
  trial_total_used INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_start TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_usage_reflections_used_non_negative CHECK (reflections_used >= 0),
  CONSTRAINT user_usage_trial_total_used_non_negative CHECK (trial_total_used >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_usage_plan_type ON public.user_usage (plan_type);
CREATE INDEX IF NOT EXISTS idx_user_usage_period_start ON public.user_usage (period_start);

CREATE OR REPLACE FUNCTION public.set_user_usage_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_usage_updated_at ON public.user_usage;
CREATE TRIGGER trg_user_usage_updated_at
  BEFORE UPDATE ON public.user_usage
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_user_usage_updated_at();
