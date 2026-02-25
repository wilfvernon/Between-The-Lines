# Copilot Context for Galatea Fine Art

## Primary Design Context

**This project defaults to MOBILE-FIRST design.**

- Mobile is the primary use case—default styling targets mobile viewports
- Mobile dimensions/font sizes should be the base layer in all CSS
- Media queries use `@media (min-width:)` to scale UP for larger screens, never `@media (max-width:)`
- When modifying responsive styles, changes to mobile values take priority and should take immediate effect without media query conflicts

## Code Organization

- **React 18 + Vite** build system
- **Supabase** backend (auth, data)
- **Bonus engine**: `collectBonuses()`, `deriveCharacterStats()` with source tracking
- **Character sheet** uses ability score improvements, HP tracking with journal, stat modals
- **Parchment-themed UI** with Cinzel headers, Goudy Bookletter body text, BlackoutOldskull for numbers

## Font System

- **Headers (h1-h3)**: Cinzel
- **Body text**: Goudy Bookletter 1911
- **Numeric values**: Blackout Oldskull (custom TTF from `/public/fonts/`)
- **Font sizing**: Use `rem` units (16px base = 1rem), never `px`

## Key Files

- `app/src/pages/CharacterSheet.jsx` - Main character display
- `app/src/components/StatsInspectorModal.jsx` - Reusable stat inspection modal
- `app/src/lib/bonusEngine.js` - Bonus calculation engine
- `app/src/context/AuthContext.jsx` - Authentication context

## Component Strategy

- Stats inspector modal is generalized and can be extended to skills, AC, initiative, etc.
- Currently integrated for ability scores only
- Custom modifier persistence saved to character data
