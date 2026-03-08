-- ============================================================
-- Migration: Enable RLS for notes table
-- Visibility rules:
--   - Public notes are visible to any authenticated user
--   - Private notes are visible only to owner
--   - Insert/Update/Delete are owner-only
-- ============================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notes visible by visibility rules" ON notes;
CREATE POLICY "Notes visible by visibility rules"
  ON notes
  FOR SELECT
  TO authenticated
  USING (is_public = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "Notes insert by owner" ON notes;
CREATE POLICY "Notes insert by owner"
  ON notes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Notes update by owner" ON notes;
CREATE POLICY "Notes update by owner"
  ON notes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Notes delete by owner" ON notes;
CREATE POLICY "Notes delete by owner"
  ON notes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
