-- ============================================================
-- Migration: Add equipment_id to character_inventory
-- Migrate from mundane_item_name to equipment_id foreign key
-- Preserves: quantity, equipped, attuned, notes, character_id
-- ============================================================

-- 1. Add equipment_id column
ALTER TABLE character_inventory
ADD COLUMN equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE;

-- 2. Populate equipment_id by matching names (case-insensitive, trimmed)
UPDATE character_inventory ci
SET equipment_id = e.id
FROM equipment e
WHERE LOWER(TRIM(ci.mundane_item_name)) = LOWER(TRIM(e.name))
  AND ci.mundane_item_name IS NOT NULL
  AND ci.magic_item_id IS NULL
  AND ci.equipment_id IS NULL;

-- 3. Check for any items that couldn't be matched
-- IMPORTANT: Run this first to see what items won't migrate cleanly
DO $$
DECLARE
  unmatched_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmatched_count
  FROM character_inventory
  WHERE equipment_id IS NULL 
    AND magic_item_id IS NULL 
    AND mundane_item_name IS NOT NULL;
  
  IF unmatched_count > 0 THEN
    RAISE NOTICE 'Found % unmatched items that will be deleted:', unmatched_count;
    
    -- Log the unmatched items
    RAISE NOTICE 'Unmatched items: %', (
      SELECT STRING_AGG(DISTINCT mundane_item_name, ', ')
      FROM character_inventory
      WHERE equipment_id IS NULL 
        AND magic_item_id IS NULL 
        AND mundane_item_name IS NOT NULL
    );
  END IF;
END $$;

-- 4. Delete items that couldn't be matched (they will become orphaned otherwise)
DELETE FROM character_inventory
WHERE equipment_id IS NULL 
  AND magic_item_id IS NULL 
  AND mundane_item_name IS NOT NULL;

-- 4. Remove old constraint
ALTER TABLE character_inventory
DROP CONSTRAINT character_inventory_check;

-- 5. Drop mundane_item_name column
ALTER TABLE character_inventory
DROP COLUMN mundane_item_name;

-- 6. Add new constraint (must use one of magic_item_id OR equipment_id)
ALTER TABLE character_inventory
ADD CONSTRAINT equipment_or_magic CHECK (
  (magic_item_id IS NOT NULL AND equipment_id IS NULL) OR
  (magic_item_id IS NULL AND equipment_id IS NOT NULL)
);

-- 7. Add index for equipment lookups
CREATE INDEX idx_character_inventory_equipment_id ON character_inventory(equipment_id);

-- ============================================================
-- Verification: Run these to check the migration
-- ============================================================

-- Check all inventory items have either magic_item_id or equipment_id
-- SELECT COUNT(*) as total, 
--        SUM(CASE WHEN magic_item_id IS NOT NULL THEN 1 ELSE 0 END) as magic_items,
--        SUM(CASE WHEN equipment_id IS NOT NULL THEN 1 ELSE 0 END) as equipment_items
-- FROM character_inventory;

-- Check sample data with equipment details
-- SELECT ci.id, ci.character_id, ci.quantity, e.name, e.type, e.is_weapon
-- FROM character_inventory ci
-- LEFT JOIN equipment e ON ci.equipment_id = e.id
-- LIMIT 10;
