# Character Sheet Feature

This directory is the beginning of a domain-local organization for the sheet and its related logic.

## Purpose

The character sheet is currently spread between:

- pages/CharacterSheet.jsx
- pages/CharacterSheet/tabs/
- lib/bonusEngine.js
- hook and utility logic in multiple modules

This structure is intended to centralize that domain as the refactor matures.

## Planned split

The eventual layout should look roughly like this:

```text
character-sheet/
├── CharacterSheet.jsx
├── hooks/
├── selectors/
├── adapters/
├── utils/
├── tabs/
├── tests/
└── index.js
```

## Current state

Only the shell is in place. Legacy files remain where they are so the app remains stable while the domain boundary is established.

The intention is to migrate feature-specific code into this folder gradually rather than all at once.
