-- Allow dynamic summon stat blocks to retain formula expressions such as ${7+spelllevel}.
ALTER TABLE public.monster_statblocks
  ALTER COLUMN armor_class_value TYPE TEXT USING armor_class_value::text,
  ALTER COLUMN hit_points_value TYPE TEXT USING hit_points_value::text;
