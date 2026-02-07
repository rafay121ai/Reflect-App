-- Add name_from_email: derived from the user's email (e.g. "john.doe" -> "John Doe") for personalization.
-- Run in Supabase SQL Editor.

ALTER TABLE public.user_personalization_context
  ADD COLUMN IF NOT EXISTS name_from_email TEXT;

COMMENT ON COLUMN public.user_personalization_context.name_from_email IS 'Name derived from email local part (e.g. john.doe@… -> John Doe) for personalized emails.';
