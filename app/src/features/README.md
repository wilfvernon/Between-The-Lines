# Features directory

This directory is the start of a cleaner app layout for domain-based modules.

## Goal

Keep the app from feeling like one giant flat folder by grouping features by domain rather than by page or utility type.

## Intended shape

```text
src/
├── components/
├── features/
│   ├── character-sheet/
│   ├── inventory/
│   ├── spells/
│   └── character-management/
├── hooks/
├── lib/
├── pages/
├── test/
└── App.jsx
```

## Current status

This is intentionally a migration scaffold, not a full reorganization.

We keep legacy imports working while adding domain boundaries that can absorb future refactors without widening the blast radius.

## Rules

- route-level screens stay in `pages/`
- reusable UI stays in `components/`
- feature-specific logic belongs in `features/`
- shared calculations stay in `lib/`
- test fixtures stay in `test/` or feature-specific test folders

## Example

The character sheet feature is being organized under:

- src/features/character-sheet/

It can eventually own its own domain-specific hooks, selectors, adapters, and tests.
