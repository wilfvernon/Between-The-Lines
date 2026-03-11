-- Add hidden flag to magic items so admins can suppress item effects/display
ALTER TABLE magic_items
ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
