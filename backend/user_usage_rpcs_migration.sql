-- RPCs required for reflection rate limiting. Run after user_usage_schema.sql.
-- supabase_client.increment_usage_atomic() and decrement_usage_atomic() depend on these.

-- Atomic increment: one row wins when at limit. Returns updated row or empty.
CREATE OR REPLACE FUNCTION public.increment_reflection_usage(
  p_user_id UUID,
  p_plan_type TEXT,
  p_limit_per_period INTEGER,
  p_trial_total_limit INTEGER,
  p_trial_per_day_limit INTEGER
)
RETURNS SETOF public.user_usage
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF LOWER(TRIM(p_plan_type)) = 'trial' THEN
    RETURN QUERY
    UPDATE public.user_usage
    SET
      reflections_used = reflections_used + 1,
      trial_total_used = trial_total_used + 1
    WHERE
      user_id = p_user_id
      AND plan_type = 'trial'
      AND reflections_used < p_trial_per_day_limit
      AND trial_total_used < p_trial_total_limit
      AND (trial_start IS NULL OR trial_start >= now() - interval '7 days')
    RETURNING *;
  ELSE
    RETURN QUERY
    UPDATE public.user_usage
    SET reflections_used = reflections_used + 1
    WHERE
      user_id = p_user_id
      AND plan_type = p_plan_type
      AND reflections_used < p_limit_per_period
    RETURNING *;
  END IF;
END;
$$;

-- Rollback one slot when LLM fails after increment. Never go negative.
CREATE OR REPLACE FUNCTION public.decrement_reflection_usage(
  p_user_id UUID,
  p_plan_type TEXT
)
RETURNS SETOF public.user_usage
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF LOWER(TRIM(p_plan_type)) = 'trial' THEN
    RETURN QUERY
    UPDATE public.user_usage
    SET
      reflections_used = GREATEST(0, reflections_used - 1),
      trial_total_used = GREATEST(0, trial_total_used - 1)
    WHERE user_id = p_user_id AND plan_type = 'trial'
    RETURNING *;
  ELSE
    RETURN QUERY
    UPDATE public.user_usage
    SET reflections_used = GREATEST(0, reflections_used - 1)
    WHERE user_id = p_user_id AND plan_type = p_plan_type
    RETURNING *;
  END IF;
END;
$$;
