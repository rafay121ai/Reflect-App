-- =============================================================================
-- REFLECT — Supabase RLS (Row Level Security) setup
-- =============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Backend uses SERVICE ROLE key, which bypasses RLS; these policies protect
-- direct access via the ANON key (e.g. if client ever queries these tables).
-- No data is modified; only RLS and policies are added.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. reflections (user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reflections_select_own" ON reflections;
CREATE POLICY "reflections_select_own" ON reflections
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "reflections_insert_own" ON reflections;
CREATE POLICY "reflections_insert_own" ON reflections
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "reflections_update_own" ON reflections;
CREATE POLICY "reflections_update_own" ON reflections
  FOR UPDATE USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "reflections_delete_own" ON reflections;
CREATE POLICY "reflections_delete_own" ON reflections
  FOR DELETE USING (user_id = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 2. mood_checkins (linked via reflection_id → reflections.user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE mood_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mood_checkins_select_own" ON mood_checkins;
CREATE POLICY "mood_checkins_select_own" ON mood_checkins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = mood_checkins.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "mood_checkins_insert_own" ON mood_checkins;
CREATE POLICY "mood_checkins_insert_own" ON mood_checkins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = mood_checkins.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "mood_checkins_update_own" ON mood_checkins;
CREATE POLICY "mood_checkins_update_own" ON mood_checkins
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = mood_checkins.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "mood_checkins_delete_own" ON mood_checkins;
CREATE POLICY "mood_checkins_delete_own" ON mood_checkins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = mood_checkins.reflection_id AND r.user_id = auth.uid()::text
    )
  );

-- -----------------------------------------------------------------------------
-- 3. revisit_reminders (linked via reflection_id → reflections.user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE revisit_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revisit_reminders_select_own" ON revisit_reminders;
CREATE POLICY "revisit_reminders_select_own" ON revisit_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = revisit_reminders.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "revisit_reminders_insert_own" ON revisit_reminders;
CREATE POLICY "revisit_reminders_insert_own" ON revisit_reminders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = revisit_reminders.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "revisit_reminders_update_own" ON revisit_reminders;
CREATE POLICY "revisit_reminders_update_own" ON revisit_reminders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = revisit_reminders.reflection_id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "revisit_reminders_delete_own" ON revisit_reminders;
CREATE POLICY "revisit_reminders_delete_own" ON revisit_reminders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.id = revisit_reminders.reflection_id AND r.user_id = auth.uid()::text
    )
  );

-- -----------------------------------------------------------------------------
-- 4. reflection_patterns (linked via reflections.pattern_id; no direct user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE reflection_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reflection_patterns_select_own" ON reflection_patterns;
CREATE POLICY "reflection_patterns_select_own" ON reflection_patterns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.pattern_id = reflection_patterns.id AND r.user_id = auth.uid()::text
    )
  );

-- Insert: backend creates pattern then links via reflection; allow authenticated insert
DROP POLICY IF EXISTS "reflection_patterns_insert_auth" ON reflection_patterns;
CREATE POLICY "reflection_patterns_insert_auth" ON reflection_patterns
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "reflection_patterns_update_own" ON reflection_patterns;
CREATE POLICY "reflection_patterns_update_own" ON reflection_patterns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.pattern_id = reflection_patterns.id AND r.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "reflection_patterns_delete_own" ON reflection_patterns;
CREATE POLICY "reflection_patterns_delete_own" ON reflection_patterns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.pattern_id = reflection_patterns.id AND r.user_id = auth.uid()::text
    )
  );

-- -----------------------------------------------------------------------------
-- 5. saved_reflections (user_identifier)
-- -----------------------------------------------------------------------------
ALTER TABLE saved_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_reflections_select_own" ON saved_reflections;
CREATE POLICY "saved_reflections_select_own" ON saved_reflections
  FOR SELECT USING (user_identifier = auth.uid()::text);

DROP POLICY IF EXISTS "saved_reflections_insert_own" ON saved_reflections;
CREATE POLICY "saved_reflections_insert_own" ON saved_reflections
  FOR INSERT WITH CHECK (user_identifier = auth.uid()::text);

DROP POLICY IF EXISTS "saved_reflections_update_own" ON saved_reflections;
CREATE POLICY "saved_reflections_update_own" ON saved_reflections
  FOR UPDATE USING (user_identifier = auth.uid()::text);

DROP POLICY IF EXISTS "saved_reflections_delete_own" ON saved_reflections;
CREATE POLICY "saved_reflections_delete_own" ON saved_reflections
  FOR DELETE USING (user_identifier = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 6. weekly_insights (user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE weekly_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_insights_select_own" ON weekly_insights;
CREATE POLICY "weekly_insights_select_own" ON weekly_insights
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "weekly_insights_insert_own" ON weekly_insights;
CREATE POLICY "weekly_insights_insert_own" ON weekly_insights
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "weekly_insights_update_own" ON weekly_insights;
CREATE POLICY "weekly_insights_update_own" ON weekly_insights
  FOR UPDATE USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "weekly_insights_delete_own" ON weekly_insights;
CREATE POLICY "weekly_insights_delete_own" ON weekly_insights
  FOR DELETE USING (user_id = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 7. user_personalization_context (user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE user_personalization_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_personalization_context_select_own" ON user_personalization_context;
CREATE POLICY "user_personalization_context_select_own" ON user_personalization_context
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_personalization_context_insert_own" ON user_personalization_context;
CREATE POLICY "user_personalization_context_insert_own" ON user_personalization_context
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_personalization_context_update_own" ON user_personalization_context;
CREATE POLICY "user_personalization_context_update_own" ON user_personalization_context
  FOR UPDATE USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "user_personalization_context_delete_own" ON user_personalization_context;
CREATE POLICY "user_personalization_context_delete_own" ON user_personalization_context
  FOR DELETE USING (user_id = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 8. profiles (user_id)
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles
  FOR DELETE USING (user_id = auth.uid()::text);
