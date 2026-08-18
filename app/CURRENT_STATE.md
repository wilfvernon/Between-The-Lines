# Current app state

This document describes the codebase as it exists today, not the planned end state.

## Current execution reality

The app already contains a working character-sheet experience mounted from the main route. The sheet reads character data, related feature data, equipment, spells, and derived bonus logic from the frontend code, and it displays those values to the user.

The main relevant files are:

- app/src/App.jsx
- app/src/hooks/useCharacter.js
- app/src/lib/bonusEngine.js
- app/src/pages/CharacterSheet.jsx
- app/src/pages/CharacterSheet/tabs/*

## What the app currently does

- loads a selected character with related data
- derives ability/modifier totals and bonus sources
- renders the character sheet UI and tabbed sections
- applies skill, save, initiative, AC, and HP-related behavior from feature benefits and other rule sources
- handles inventory, spells, and feature-driven UI state
- keeps some source information embedded in the feature data while the rules engine normalizes it on the frontend

## Current data shape assumptions

The code still contains legacy patterns, including:

- direct feature arrays on character objects
- benefit normalization that accepts arrays, single objects, and nested wrapper objects
- source fields that vary between class / subclass / species / feat / background patterns
- derived stat logic living in the frontend bonus engine rather than a strict canonical model

This is why the refactor plan is important: the app is working, but the model is not yet fully normalized.

## Current feature model tension

The app currently behaves as though a feature has all of the following at once:

- a definition
- a source provenance
- runtime state
- user-selected choices

That conflation is what the refactor is trying to separate.

## Current stability status

The app is functional, but the data model and feature provenance are still in a transitional state.

The safe assumption is:

- the app behavior is the source of truth for user-visible correctness
- the database model is still evolving
- refactors must preserve current sheet behavior through compatibility shims and regression tests

## The practical rule

When the code or schema changes, the regression gate is:

- the character sheet still shows the same stats, features, and derived values
- the legacy data formats still render correctly
- the new canonical model is introduced behind compatibility filters, not through a wholesale swap
