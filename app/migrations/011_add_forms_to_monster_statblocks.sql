-- Store named summon-form overlays for conditional movement, traits, and actions.
ALTER TABLE public.monster_statblocks
  ADD COLUMN IF NOT EXISTS forms JSONB NOT NULL DEFAULT '[]'::jsonb;