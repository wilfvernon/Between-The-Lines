-- ============================================================
-- Migration: Enable character_inventory RLS with owner/admin access
-- Fixes admin dashboard linking of magic items to any character.
-- ============================================================

ALTER TABLE character_inventory ENABLE ROW LEVEL SECURITY;

-- Character inventory can be read by the character owner or the admin account.
DROP POLICY IF EXISTS "Character inventory readable by owner or admin" ON character_inventory;
CREATE POLICY "Character inventory readable by owner or admin"
  ON character_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.id = character_inventory.character_id
        AND (
          c.user_id = auth.uid()
          OR (auth.jwt() ->> 'email') = 'admin@candlekeep.sc'
        )
    )
  );

-- Inserts are allowed for owner or admin against the target character.
DROP POLICY IF EXISTS "Character inventory insert by owner or admin" ON character_inventory;
CREATE POLICY "Character inventory insert by owner or admin"
  ON character_inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.id = character_inventory.character_id
        AND (
          c.user_id = auth.uid()
          OR (auth.jwt() ->> 'email') = 'admin@candlekeep.sc'
        )
    )
  );

-- Updates are allowed for owner or admin for both existing and resulting rows.
DROP POLICY IF EXISTS "Character inventory update by owner or admin" ON character_inventory;
CREATE POLICY "Character inventory update by owner or admin"
  ON character_inventory
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.id = character_inventory.character_id
        AND (
          c.user_id = auth.uid()
          OR (auth.jwt() ->> 'email') = 'admin@candlekeep.sc'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.id = character_inventory.character_id
        AND (
          c.user_id = auth.uid()
          OR (auth.jwt() ->> 'email') = 'admin@candlekeep.sc'
        )
    )
  );

-- Deletes are allowed for owner or admin.
DROP POLICY IF EXISTS "Character inventory delete by owner or admin" ON character_inventory;
CREATE POLICY "Character inventory delete by owner or admin"
  ON character_inventory
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM characters c
      WHERE c.id = character_inventory.character_id
        AND (
          c.user_id = auth.uid()
          OR (auth.jwt() ->> 'email') = 'admin@candlekeep.sc'
        )
    )
  );
