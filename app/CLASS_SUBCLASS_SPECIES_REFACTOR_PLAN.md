# Class/Subclass/Species Refactor Plan

## Status

- Draft: ready for technical review
- Scope: schema, data migration, frontend data flow, bonus engine unification
- Target: replace character-owned feature modeling with source-of-truth grant modeling

---

## 1. Problem Statement

Current behavior is functional but structurally brittle:

- Class and subclass are embedded in `characters.classes` JSONB.
- Species is embedded as `characters.species` text.
- Features are stored directly on `character_features` and tagged with flexible `source` JSON.
- Bonus behavior is split across multiple frontend modules with duplicated parsing/normalization rules.

This creates three persistent issues:

1. Rules provenance is not first-class in the database.
2. Bonus computation depends on frontend conventions and source-tag strings.
3. Schema, import pipeline, and UI logic drift over time.

---

## 2. Goals

1. Model classes, subclasses, and species as first-class entities.
2. Model feature grants as explicit rules attached to source entities.
3. Keep character-specific feature rows for state only (uses, stance, selected choice), not definition.
4. Unify frontend bonus resolution pipeline so all tabs consume one canonical derived state.
5. Migrate incrementally with compatibility views/adapters and parity tests.

## Non-Goals

1. Rewrite all gameplay UX in one release.
2. Remove JSONB benefits payloads immediately.
3. Big-bang migration with downtime.

---

## 3. Target Data Model

## 3.1 Reference Tables

### `classes`

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `name text not null unique`
- `hit_die integer not null check (hit_die in (6, 8, 10, 12))`
- `spellcasting_progression text null check (spellcasting_progression in ('none', 'full', 'half', 'third', 'pact'))`
- `primary_ability_options text[] default '{}'::text[]`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `subclasses`

- `id uuid primary key default gen_random_uuid()`
- `class_id uuid not null references classes(id) on delete cascade`
- `slug text not null`
- `name text not null`
- `introduced_level integer null check (introduced_level between 1 and 20)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(class_id, slug)`
- unique `(class_id, name)`

### `species`

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `name text not null unique`
- `size text null`
- `base_speed integer null check (base_speed > 0)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `feature_definitions`

- `id uuid primary key default gen_random_uuid()`
- `slug text not null unique`
- `name text not null`
- `short text null`
- `description text`
- `benefits jsonb not null default '[]'::jsonb`
- `max_uses_expr text null`
- `reset_on text null check (reset_on in ('short', 'long', 'dawn', 'none') or reset_on is null)`
- `tags text[] not null default '{}'::text[]`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 3.2 Grant Rule Tables

These tables define why a character gets a feature.

### `class_feature_grants`

- `id uuid primary key default gen_random_uuid()`
- `class_id uuid not null references classes(id) on delete cascade`
- `feature_id uuid not null references feature_definitions(id) on delete cascade`
- `unlock_level integer not null check (unlock_level between 1 and 20)`
- `grant_mode text not null default 'auto' check (grant_mode in ('auto', 'choice', 'replace'))`
- `choice_group text null`
- `scaling jsonb null`
- `metadata jsonb not null default '{}'::jsonb`
- unique `(class_id, feature_id, unlock_level)`

### `subclass_feature_grants`

- `id uuid primary key default gen_random_uuid()`
- `subclass_id uuid not null references subclasses(id) on delete cascade`
- `feature_id uuid not null references feature_definitions(id) on delete cascade`
- `unlock_level integer not null check (unlock_level between 1 and 20)`
- `grant_mode text not null default 'auto' check (grant_mode in ('auto', 'choice', 'replace'))`
- `choice_group text null`
- `scaling jsonb null`
- `metadata jsonb not null default '{}'::jsonb`
- unique `(subclass_id, feature_id, unlock_level)`

### `species_feature_grants`

- `id uuid primary key default gen_random_uuid()`
- `species_id uuid not null references species(id) on delete cascade`
- `feature_id uuid not null references feature_definitions(id) on delete cascade`
- `unlock_level integer not null default 1 check (unlock_level between 1 and 20)`
- `grant_mode text not null default 'auto' check (grant_mode in ('auto', 'choice', 'replace'))`
- `choice_group text null`
- `metadata jsonb not null default '{}'::jsonb`
- unique `(species_id, feature_id, unlock_level)`

### `feat_feature_grants`

- `id uuid primary key default gen_random_uuid()`
- `feat_id uuid not null references feats(id) on delete cascade`
- `feature_id uuid not null references feature_definitions(id) on delete cascade`
- `unlock_level integer null check (unlock_level between 1 and 20)`
- `grant_mode text not null default 'auto' check (grant_mode in ('auto', 'choice', 'replace'))`
- `choice_group text null`
- `metadata jsonb not null default '{}'::jsonb`
- unique `(feat_id, feature_id, unlock_level)`

## 3.3 Character Progression Tables

### `character_species`

- `character_id uuid primary key references characters(id) on delete cascade`
- `species_id uuid not null references species(id)`
- `selected_at_level integer not null default 1 check (selected_at_level between 1 and 20)`
- `metadata jsonb not null default '{}'::jsonb`
- `updated_at timestamptz not null default now()`

### `character_classes`

- `id uuid primary key default gen_random_uuid()`
- `character_id uuid not null references characters(id) on delete cascade`
- `class_id uuid not null references classes(id)`
- `class_level integer not null check (class_level between 1 and 20)`
- `subclass_id uuid null references subclasses(id)`
- `subclass_level integer null check (subclass_level between 1 and 20)`
- `taken_order integer not null check (taken_order >= 1)`
- `is_primary boolean not null default false`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(character_id, class_id)`
- unique `(character_id, taken_order)`

Critical consistency rule:

- `subclass_id` must belong to the same `class_id`.
- Implement with trigger validation (or composite FK strategy if `subclasses` has unique `(id, class_id)`).

### `character_feat_selections`

- `id uuid primary key default gen_random_uuid()`
- `character_id uuid not null references characters(id) on delete cascade`
- `feat_id uuid not null references feats(id)`
- `selected_at_level integer not null check (selected_at_level between 1 and 20)`
- `source_kind text not null check (source_kind in ('level', 'background', 'class', 'species', 'other'))`
- `source_ref_id uuid null`
- `choices jsonb null`
- `created_at timestamptz not null default now()`

## 3.4 Character Runtime Feature State

### `character_feature_state`

- `id uuid primary key default gen_random_uuid()`
- `character_id uuid not null references characters(id) on delete cascade`
- `feature_id uuid not null references feature_definitions(id) on delete cascade`
- `provenance_type text not null check (provenance_type in ('class', 'subclass', 'species', 'feat'))`
- `provenance_id uuid not null`
- `uses_spent integer not null default 0 check (uses_spent >= 0)`
- `pool_state jsonb null`
- `gauge_state jsonb null`
- `stance text null`
- `selected_choice text null`
- `notes text null`
- `updated_at timestamptz not null default now()`
- unique `(character_id, feature_id, provenance_type, provenance_id)`

Purpose:

- Persist mutable per-character feature state.
- Do not duplicate feature definition text/benefits here.

---

## 4. Legacy Compatibility Strategy

We will not immediately break existing code expecting `character.features` rows with `source`.

### 4.1 Compatibility View

Create a DB view `effective_character_features_v1` that emits current shape:

- `id` synthetic deterministic id
- `character_id`
- `name`
- `short`
- `description`
- `max_uses`
- `reset_on`
- `benefits`
- `source` JSON compatible with current UI

The view composes:

- feature grants (class/subclass/species/feat)
- character progression selections
- feature definition records
- optional state overlays from `character_feature_state`

### 4.2 Adapter in App Layer

In `useCharacter`, route feature fetch via view (or RPC) behind a feature flag:

- `USE_EFFECTIVE_FEATURES_V1=true` -> read from new model
- fallback -> read from `character_features`

---

## 5. Frontend Refactor Scope

This refactor is not schema-only. Bonus computation currently spans multiple modules with duplicated rules.

## 5.1 Current Problem in UI Layer

Benefit normalization/parsing and conditional state resolution are duplicated across:

- `src/lib/bonusEngine.js`
- `src/pages/CharacterSheet.jsx`
- `src/pages/CharacterSheet/tabs/ActionsTab.jsx`
- `src/pages/CharacterSheet/utils/skillMath.js`
- `src/pages/CharacterSheet/tabs/SpellsTab.jsx`

Result:

- Inconsistent interpretation by tab.
- Fragile behavior when benefit schemas evolve.

## 5.2 Target Frontend Architecture

Introduce a single rules pipeline with explicit contracts.

### A. Progression Resolver

Input:

- character core row
- `character_species`
- `character_classes`
- `character_feat_selections`

Output:

- `effectiveProgression` object with canonical class/subclass/species/feat state.

### B. Feature Resolver

Input:

- progression + grant tables + feature definitions + `character_feature_state`

Output:

- `effectiveFeatures[]` each with stable provenance.

### C. Benefit Resolver

Input:

- `effectiveFeatures[]` + UI state (selected stance/choice)

Output:

- normalized active benefits list (single shape)

### D. Bonus Engine

Input:

- base character data + normalized active benefits + item effects

Output:

- derived totals/sources consumed by all tabs

### E. Presentation

All tabs consume the same derived outputs and do not re-interpret benefit semantics locally.

## 5.3 New Frontend Contracts

Add shared type contracts (JSDoc or TS typedef module):

- `EffectiveFeature`
- `FeatureProvenance`
- `NormalizedBenefit`
- `FeatureStateSnapshot`
- `DerivedStats`

Minimum provenance shape:

```json
{
  "source_type": "class",
  "source_entity_id": "uuid",
  "grant_id": "uuid",
  "unlock_level": 3
}
```

---

## 6. Backend + Frontend Migration Phases

## Phase 0: Preparation

1. Freeze benefit schema changes except fixes.
2. Add golden fixtures for representative characters.
3. Add parity test harness comparing old vs new derived outputs.

Deliverables:

- fixture pack
- parity runner
- baseline snapshots

## Phase 1: Schema Introduction (No Behavior Change)

1. Add all new reference/progression/grant/state tables.
2. Add indexes and constraints.
3. Add validation trigger for class/subclass consistency.

Deliverables:

- SQL migration files `010+`
- rollback scripts

## Phase 2: Backfill and Dual-Read

1. Seed classes/subclasses/species and feature_definitions.
2. Backfill progression from `characters.classes` and `characters.species`.
3. Backfill grants from existing `character_features`/`character_feats` where possible.
4. Create `effective_character_features_v1` view.

Deliverables:

- backfill scripts
- data audit report (unmapped rows and exceptions)

## Phase 3: Frontend Rules Unification

1. Centralize `normalizeBenefitsInput`, benefit type normalization, and formula evaluation in one shared module.
2. Route all tabs through resolved effective features + bonus engine output.
3. Remove tab-local benefit interpretation duplicates.

Deliverables:

- shared rules utilities
- simplified tabs
- green unit tests

## Phase 4: Dual-Write Import/Level-Up

1. Importers write both legacy and normalized progression paths.
2. Admin level-up tools update normalized progression and feature state.
3. Verify parity against golden fixtures after each import/update flow.

Deliverables:

- dual-write service layer
- migration monitoring metrics

## Phase 5: Cutover

1. Enable read path from new effective view/RPC by default.
2. Keep legacy read as fallback for one release window.
3. Remove legacy feature creation flows after stability period.

Deliverables:

- feature flag switch
- rollout checklist
- rollback switch

## Phase 6: Cleanup

1. Deprecate `characters.classes` and `characters.species` fields from active app usage.
2. Freeze `character_features` as legacy-only or migrate remaining rows and remove dependency.
3. Update docs and schema artifacts.

Deliverables:

- final schema docs
- deprecation notice

---

## 7. Bonus Engine Workstream (High Priority)

## 7.1 Required Changes

1. Move all benefit normalization to `src/lib/rules/benefitNormalization.js`.
2. Move all formula evaluation to `src/lib/rules/formulaEvaluator.js`.
3. Ensure `collectBonuses` accepts one canonical feature input shape.
4. Keep conditional state (stances/selects) as data, not ad hoc UI logic.

## 7.2 De-duplication Targets

Remove local implementations from tabs and page-level modules once shared utilities are adopted.

## 7.3 Engine Contract Guarantee

Any benefit type must be interpreted by exactly one of:

1. Numeric/category bonus engine handler.
2. Explicit non-numeric resolver used by UI.

No duplicate interpretation across tabs.

---

## 8. Testing Strategy

## 8.1 Parity Tests (Mandatory)

For each fixture character, compare old/new outputs for:

1. ability scores/modifiers
2. saving throws
3. skills (including half proficiency/expertise)
4. AC and overrides
5. initiative
6. speed and senses
7. resistances/immunities
8. spell bonuses

## 8.2 Migration Data Audits

Validate:

1. every character has exactly one `character_species`
2. class levels sum to character level (where expected)
3. subclass belongs to class
4. no orphan grants
5. every active feature has provenance

## 8.3 UI Integration Tests

1. class/species/feats tabs render correct grouping from provenance
2. stance/select state persists and resolves correctly
3. long rest/short rest resets still behave correctly

---

## 9. Risks and Mitigations

1. Risk: behavior drift in skill math.
	Mitigation: golden parity tests and shared skill computation module.

2. Risk: malformed legacy feature sources break backfill.
	Mitigation: exception table + manual review queue.

3. Risk: migration complexity causes prolonged dual-model state.
	Mitigation: strict phase gates and deadline for cutover.

4. Risk: performance regressions from new joins.
	Mitigation: targeted indexes + precomposed effective view/RPC.

---

## 10. Rollout Gates

Gate 1: Schema ready

- all new tables/constraints deployed
- seed data loaded

Gate 2: Backfill ready

- >99% rows auto-mapped
- exception queue reviewed

Gate 3: Frontend parity ready

- parity suite green on golden fixtures
- manual smoke tests pass

Gate 4: Production cutover

- feature flag switched
- monitoring confirms no critical drift

---

## 11. Implementation Checklist

Schema:

- [ ] create reference tables (`classes`, `subclasses`, `species`, `feature_definitions`)
- [ ] create grant tables
- [ ] create progression tables
- [ ] create feature state table
- [ ] add indexes and triggers

Data:

- [ ] seed class/subclass/species
- [ ] backfill progression from character JSON/text
- [ ] map features to definitions/grants
- [ ] produce migration audit report

Frontend:

- [ ] shared normalization/formula modules
- [ ] progression resolver
- [ ] feature resolver
- [ ] benefit resolver
- [ ] update `useCharacter` read path
- [ ] remove tab-local duplicate benefit logic

Quality:

- [ ] parity tests complete
- [ ] integration tests updated
- [ ] rollout and rollback runbook complete

---

## 12. Decisions Locked for This Refactor

1. Subclass is stored on the character-class progression row (`character_classes.subclass_id`) rather than a separate join table.
2. Class/subclass/species are relational, not JSON-only.
3. Feature grants are source-owned, not character-owned.
4. Character feature tables persist mutable state, not definitions.
5. Bonus derivation has one canonical computation path.

---

## 13. Open Questions

1. Do we want a formal backgrounds table in this phase or defer?
2. Should feat-granted spells remain in `character_spells` only, or be fully derived from grants at runtime?
3. Should class-specific resources remain in `character_class_specific`, or be split into structured tables later?
4. Do we introduce TypeScript types now for rules contracts, or remain JS with JSDoc first?

---

## 14. Suggested First Execution Sprint

1. Ship schema tables + constraints only.
2. Build `effective_character_features_v1` view.
3. Centralize benefit normalization into shared module.
4. Add parity tests for five representative characters.

This yields immediate risk reduction before full migration.
