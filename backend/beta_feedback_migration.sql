-- Beta feedback: notepad-style entries per user.
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_feedback_user_id_idx ON public.beta_feedback(user_id);
CREATE INDEX IF NOT EXISTS beta_feedback_created_at_idx ON public.beta_feedback(created_at DESC);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own beta feedback" ON public.beta_feedback;
CREATE POLICY "Users can only see their own beta feedback"
  ON public.beta_feedback
  FOR ALL
  USING (auth.uid()::text = user_id);

COMMENT ON TABLE public.beta_feedback IS 'Beta user feedback entries; one row per submission.';
