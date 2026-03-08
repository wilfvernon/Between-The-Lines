-- ============================================================
-- Migration: Create notes table for user-authored notes
-- Notes can be private (owner only) or public (visible to all authenticated users)
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT notes_content_not_empty CHECK (length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_public ON notes(is_public);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

DROP TRIGGER IF EXISTS set_notes_updated_at ON notes;
CREATE OR REPLACE FUNCTION set_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION set_notes_updated_at();
