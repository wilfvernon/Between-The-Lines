-- ============================================================
-- Enable RLS policies for reference tables
-- Equipment and Magic Items should be readable by all authenticated users
-- ============================================================

-- Enable RLS on equipment table
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT from equipment
CREATE POLICY "Equipment is viewable by authenticated users"
ON equipment FOR SELECT
TO authenticated
USING (true);

-- Enable RLS on magic_items table (if not already enabled)
ALTER TABLE magic_items ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT from magic_items
CREATE POLICY "Magic items are viewable by authenticated users"
ON magic_items FOR SELECT
TO authenticated
USING (true);

-- Verify policies are created
-- Run this to check:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('equipment', 'magic_items');
