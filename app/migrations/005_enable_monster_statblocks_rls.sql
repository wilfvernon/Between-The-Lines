-- ============================================================
-- Migration: Enable RLS for monster_statblocks with authenticated access
-- This keeps admin dashboard imports working via anon client JWT auth.
-- ============================================================

ALTER TABLE monster_statblocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Monster statblocks readable by authenticated users" ON monster_statblocks;
CREATE POLICY "Monster statblocks readable by authenticated users"
  ON monster_statblocks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Monster statblocks writable by authenticated users" ON monster_statblocks;
CREATE POLICY "Monster statblocks writable by authenticated users"
  ON monster_statblocks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
