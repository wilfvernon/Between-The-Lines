# Between the Lines - App status

This is the current project overview for the live app and its active code paths.

Important: this repository contains three different kinds of documentation:

- current app state: this README plus CURRENT_STATE.md
- target product scope: FINAL_SCOPE.md
- future refactor architecture: CLASS_SUBCLASS_SPECIES_REFACTOR_PLAN.md
- regression requirements: TEST_SCOPE.md

If you are trying to understand the code as it exists today, start with CURRENT_STATE.md and the code in src/.

## Current status

The app is an active React + Vite + Supabase project with a working character-sheet flow and multiple supporting modules.

The character sheet is already a real feature rather than a stub. It is mounted in the main app shell and relies on derived stat logic, feature benefits, inventory, spells, and UI state management.

## Active app areas

- authentication and route guards
- character loading and related data hydration
- character sheet rendering and derived stat calculation
- inventory and magic item behavior
- spell casting and slot logic
- feature and trait display
- notes, bookshelf, admin tools

## Stack

- React 18
- Vite
- React Router
- Supabase
- Vitest + Testing Library + Playwright
- custom CSS + PWA support

## Setup

```bash
cd app
npm install
```

Configure environment variables:

```bash
cp .env.example .env
```

Then add:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run locally:

```bash
npm run dev
```

## Useful commands

```bash
npm run test:run
npm run build
npm run test:e2e
npm run lint
```

## Documentation map

- CURRENT_STATE.md — what the app does today
- FINAL_SCOPE.md — target product scope for the future app
- CLASS_SUBCLASS_SPECIES_REFACTOR_PLAN.md — future data-model architecture
- TEST_SCOPE.md — regression gate before refactor work
- CHARACTER_SHEET_SPEC.md — sheet data contract notes and legacy spec material
- SCHEMA_READINESS.md — database readiness notes
- JSONB_SCHEMAS.md — data-shape notes

## Current project structure

```text
app/
├── src/
│   ├── App.jsx
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   ├── test/
│   └── features/
├── e2e/
├── migrations/
├── public/
├── scripts/
├── README.md
├── CURRENT_STATE.md
├── FINAL_SCOPE.md
├── TEST_SCOPE.md
├── CLASS_SUBCLASS_SPECIES_REFACTOR_PLAN.md
├── ...
└── package.json
```

## Note on status

The app is in active development and is not yet a finished D&D rules engine. The current priority is to stabilize feature- and stat-derived behavior while the refactor work is being prepared.

This project is currently in a transition point: the sheet is live, but the data model and some feature architecture are still being cleaned up.

- [ ] Set up Supabase credentials in `.env`
- [ ] Migrate items from JSON to Supabase database
- [ ] Implement character sheet functionality
- [ ] Add notes editor
- [ ] Build admin dashboard

