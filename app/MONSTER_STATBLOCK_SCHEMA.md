# Monster Stat Block Schema

Monster stat blocks are stored in `monster_statblocks`. The parser stores base values in dedicated columns and supports named form overlays in `forms`.

## Formula notation

Formula fields support `${...}` expressions. Available variables in the creature display include:

- `level`: character level
- `spelllevel`: selected casting-slot level
- `spellmod`: spellcasting ability modifier
- `spellattack`: spell attack bonus
- `spellsave`: spell save DC

Example:

```text
**Armor Class** :: ${7+spelllevel}
**Hit Points** :: ${10*spelllevel}
```

Use `${spelllevel}` for summon values that scale with the spell slot used to cast the summon. `${level}` remains character level and does not change when the spell-level dropdown changes.

Formula results round down. For example, `${spelllevel/2}` evaluates to `2` at spell level 5.

## Forms

Use `(Form Name Only)` in a speed entry or trait/action name. The parser removes this suffix from the base entry and stores it in the corresponding named form.

```text
**Speed** :: 30 ft.; Fly 30 ft. (hover; Beholderkin Only)

### Actions
***Eye Ray (Beholderkin Only).*** _Ranged Attack Roll:_ +${spellattack} to hit.
```

This produces a base stat block with walking speed, plus a `Beholderkin` form overlay containing fly speed and Eye Ray. In the creature modal, selecting a form overlays its movement and adds its traits/actions to the base stat block.

The `forms` column is JSONB because it is nested, stat-block-local data. Forms are not a separate shared entity.

## Runtime state

The creature modal stores the selected spell level, selected form, current HP text, and calculated maximum HP in browser storage, keyed by character and stat block. Form and spell-level selections persist indefinitely. Current HP accepts any text, including `0` and `120+2`, and resets to the stored maximum on a Long Rest.
