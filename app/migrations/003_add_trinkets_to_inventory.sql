-- ============================================================
-- Migration: Add player-defined trinkets to character_inventory
-- Trinkets are custom inventory entries that are not in equipment/magic_items.
-- ============================================================

-- 1. Add trinket_name column
ALTER TABLE character_inventory
ADD COLUMN trinket_name TEXT;

-- 2. Replace equipment_or_magic constraint with 3-way source constraint
ALTER TABLE character_inventory
DROP CONSTRAINT IF EXISTS equipment_or_magic;

ALTER TABLE character_inventory
ADD CONSTRAINT inventory_item_source_check CHECK (
  (
    CASE WHEN magic_item_id IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN equipment_id IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN trinket_name IS NOT NULL AND length(trim(trinket_name)) > 0 THEN 1 ELSE 0 END
  ) = 1
);

-- 3. Add optional index for trinket lookups
CREATE INDEX IF NOT EXISTS idx_character_inventory_trinket_name ON character_inventory(trinket_name);
