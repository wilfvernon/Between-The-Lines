# Test Scope and Regression Gate

This document defines the minimum test coverage required before we refactor the data model around class, subclass, species, and feature grants.

## Why this exists

The sheet is not just a view. It is the product contract for derived stats, feature effects, class logic, and user-visible state. Changing the data model without preserving that contract risks silent rule regressions.

The goal of this test suite is to protect behavior, not just implementation details.

## Core principle

We treat the character sheet as the source of truth for user-visible rules.

If the sheet is wrong, the refactor is wrong, even if the database model looks cleaner.

## Test layers

### 1. Unit tests

These verify rule-level logic in isolation.

Required areas:
- bonus aggregation
- feature benefit normalization
- skill bonus resolution
- initiative and AC calculations
- HP bonus rules
- shield / armor / proficiency logic
- ability score improvement conversion

Key baseline files:
- app/src/lib/bonusEngine.test.js
- app/src/pages/CharacterSheet/ability-score tests
- app/src/pages/CharacterSheet/utils/* tests

### 2. Component tests

These verify feature-driven UI behavior.

Required areas:
- skills display with feature proficiency modifiers
- feature list rendering and nested benefit state
- selected choices and active stances
- active/inactive feature toggles
- class/species/subclass grouping
- inventory/equipment-derived bonuses

Key baseline files:
- app/src/pages/CharacterSheet.test.jsx
- app/src/pages/CharacterSheet/tabs/SkillsTab.test.jsx

### 3. Integration tests

These verify that the full character sheet renders with realistic character data and derived values remain consistent across tabs.

Required user journeys:
- load a character with classes, species, features, inventory, and spells
- view derived AC, initiative, and skill values
- open feature detail state and confirm active selections
- change HP and verify sticky header updates
- switch between tabs without losing feature state

### 4. Migration compatibility tests

These are the guardrails for the data-model refactor.

Required checks:
- legacy feature payloads still render
- `benefits` and `benefit` inputs resolve identically
- class/subclass/species source tags still resolve to the same user-visible behavior
- runtime state remains separate from feature definition data
- old and new shapes produce equivalent derived stats

## Minimum regression gate before refactor

No data-model refactor is ready until all of the following are true:

1. All existing bonus engine tests pass.
2. Sheet rendering tests pass for key character states.
3. Feature selection and active-state tests pass.
4. Legacy payload compatibility tests pass.
5. A real character fixture has been run through the whole sheet without rule drift.

## In-scope user stories

We need the suite to cover these high-value stories:

- A character with class feature bonuses sees proper skill and save output.
- AC updates correctly when armor, shield, dexterity, and feature bonuses interact.
- Feature choices are applied correctly and displayed correctly.
- Species and class-level traits contribute to derived data with no duplication.
- Inventory and magic item bonuses are applied without clobbering feature bonuses.
- Legacy feature records still work during migration.

## Out of scope for the initial gate

These are not required before the first safety pass:

- broad end-to-end campaign management tests
- every possible edge-case feature benefit
- database migration performance benchmarking
- visual snapshots for every mocked state

## File organization target

The app is now large enough that we should separate concerns into bounded domains:

- features/
  - character-sheet/
  - spell-system/
  - inventory/
- lib/
  - bonus rules and data helpers
- pages/
  - route-level screens only
- components/
  - reusable UI only
- tests/
  - fixture and shared helpers

This is a guidance target, not a strict ban on existing files.

## Release rule

If a change affects derived stat logic, feature data contract, or sheet rendering, it must include a failing or updated regression test in the same change.

This is the threshold for safe refactoring.
