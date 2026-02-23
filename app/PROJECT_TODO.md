# Character Sheet System - Project TODO

## Overview
Building a complete D&D 2024 character sheet system with D&D Beyond import, admin tools, and interactive gameplay features.

---

## Phase 1: Database Foundation

### 1.1 Supabase Schema Setup
- [x] Create `characters` table with all core fields
- [x] Create `character_skills` table
- [x] Create `character_features` table
- [x] Create `character_senses` table
- [x] Create `character_currency` table
- [x] Create `character_class_specific` table (JSONB)

### 1.2 Reference Data Tables
- [x] Create `spells` table (name, level, school, description, components, etc.)
- [x] Create `magic_items` table (name, type, rarity, description, properties)
- [x] Create `feats` table (name, description, prerequisites, benefits)

### 1.3 Character Relationships
- [x] Create `character_spells` junction table (character ↔ spell)
- [x] Create `character_inventory` table (handles both magic items and mundane)
- [x] Create `character_feats` junction table (character ↔ feat)

### 1.4 Indexes & Constraints
- [x] Add indexes on `user_id`, `character_id` foreign keys
- [x] Add unique constraints where needed
- [x] Add check constraints (level 1-20, ability scores 1-30, etc.)

### 1.5 Row Level Security (RLS)
- [x] Enable RLS on all tables
- [x] Create SELECT policies (users see own characters)
- [x] Create INSERT policies (users create own characters)
- [x] Create UPDATE policies (users update own characters)
- [x] Create DELETE policies (users delete own characters)
- [x] Create admin bypass policies for admin users
- [x] Create admin role/flag in user metadata

---

## Phase 2: Admin Dashboard - Reference Data Management

### 2.1 Admin Authentication & Access Control
- [ ] Add `is_admin` field to user profiles or metadata
- [x] Create `AdminRoute` component (extends `ProtectedRoute`)
- [ ] Add admin check to `AuthContext`
- [x] Create admin navigation in dashboard

### 2.2 Spell Management
- [x] Build "Add Spell" form (name, level, school, casting time, range, components, duration, description, higher levels)
- [ ] Build "Spells List" view with search/filter (by level, school, name)
- [ ] Build "Edit Spell" modal
- [ ] Build "Delete Spell" confirmation
- [ ] Import bulk spells (optional: from JSON or API)

### 2.3 Magic Item Management
- [x] Build "Add Magic Item" form (name, type, rarity, attunement, description, properties)
- [ ] Build "Magic Items List" view with search/filter
- [ ] Build "Edit Magic Item" modal
- [ ] Build "Delete Magic Item" confirmation
- [ ] Handle weapon properties (damage, attack bonus)
- [ ] Handle armor properties (AC bonus)
- [ ] Handle charge-based items

### 2.4 Feat Management
- [x] Build "Add Feat" form (name, description, prerequisites)
- [ ] Build "Feats List" view with search/filter
- [ ] Build "Edit Feat" modal
- [ ] Delete feat confirmation

---

## Phase 3: Character Creation & Import

### 3.1 D&D Beyond Import
- [x] Create import UI (input D&D Beyond character ID)
- [x] Connect to D&D Beyond API (or paste JSON)
- [x] Show preview of imported character
- [x] Confirm import → insert into database
- [x] Error handling for failed imports
- [x] Map imported data to our schema (already built transformer)

### 3.2 Manual Character Creation (Unnecessary - only editing needed, not creation)
- [ ] Build character creation wizard
- [ ] Step 1: Name, class, species, level
- [ ] Step 2: Ability scores
- [ ] Step 3: Skills & saves
- [ ] Step 4: Spells (if caster)
- [ ] Step 5: Equipment
- [ ] Save to database

### 3.3 Character Roster (unnecessary)
- [ ] Build character selection page
- [ ] Show all user's characters (cards/list)
- [ ] "Import" button → D&D Beyond import flow
- [ ] "Delete" character option

### 3.4 Initial Character Setup (6 Party Members)
- [ ] Create Supabase admin account(s)
- [ ] Import all 6 party member characters via admin
- [ ] Assign each character to appropriate user
- [ ] Test user access (each user sees only their character)

---

## Phase 4: Character Sheet Display (Read-Only)

### 4.1 Data Fetching & State Management
- [x] Create `useCharacter` hook (fetch character by ID)
- [x] Fetch all related data (skills, spells, inventory, features, etc.)
- [x] Combine into unified character object
- [x] Add loading and error states

### 4.2 Calculated Values & Game Rules
- [x] Calculate ability modifiers: `Math.floor((score - 10) / 2)`
- [x] Calculate proficiency bonus: `Math.ceil(level / 4) + 1`
- [x] Calculate skill bonuses: `abilityMod + (proficient ? profBonus : 0) + (expertise ? profBonus : 0)`
- [x] Calculate saving throw bonuses: `abilityMod + (proficient ? profBonus : 0)`
- [ ] Calculate spell attack bonus: `profBonus + castingAbilityMod`
- [ ] Calculate spell save DC: `8 + profBonus + castingAbilityMod`
- [ ] Calculate AC from equipped armor + DEX mod + shields
- [x] Calculate initiative: `dexMod`
- [x] Calculate passive perception: `10 + Perception bonus`
- [ ] Calculate max spell slots by class & level
- [ ] Utility functions file: `characterCalculations.js`

### 4.3 Header Section
- [x] Display name (editable inline later)
- [ ] Display level, class/subclass, species
- [x] Display character avatar/image (optional)

### 4.4 Vital Stats Panel
- [x] Display current HP / max HP (with color coding)
- [x] Display temp HP field (session state)
- [x] Display AC (calculated)
- [x] Display initiative (calculated)
- [x] Display speed

### 4.5 Ability Scores
- [x] Display 6 ability scores in grid
- [x] Display modifiers below each score
- [x] Visual indicator for save proficiencies

### 4.6 Skills & Saves
- [x] Display all 6 saving throws with bonuses
- [x] Display all 18 skills with bonuses
- [x] Visual indicators for proficiency/expertise
- [x] Display passive perception
- [x] Display senses (darkvision, etc.)

### 4.7 Spellcasting
- [ ] Display spell attack bonus & spell DC
- [x] Group spells by level (cantrips, 1-9)
- [ ] Show prepared spells highlighted
- [ ] Show spell slots (max only, for now)
- [ ] Spell modal/expandable for full description

### 4.8 Features & Traits
- [ ] Display all features grouped by source (class/species/background/feats)
- [ ] Show feature descriptions (expandable)
- [ ] Show limited-use features with max uses

### 4.9 Inventory
- [ ] Display all items grouped by type
- [ ] Show equipped items with indicator
- [ ] Show attuned items with indicator
- [ ] Show quantities
- [ ] Display item descriptions (modals/expandable)

### 4.10 Currency
- [ ] Display gold amount

### 4.11 Feats
- [ ] Display all feats with descriptions

---

## Phase 5: Interactive Features (Session State)

### 5.1 HP Management
- [ ] Add +5, +1, -1, -5 buttons for HP adjustment
- [x] Add direct input field for precise HP changes
- [x] Add temp HP input field
- [x] Enforce HP can't go below 0 or above max
- [ ] Color-code HP bar (green → yellow → red)
- [ ] Toast notifications for HP changes
- [x] Store current HP in component state (not DB)
- [x] Local storage persistence (optional)

### 5.2 Spell Slot Tracking (Session State)
- [ ] Visual spell slot circles (filled = used, empty = available)
- [ ] Click to toggle slot used/available
- [ ] Track per level (1-9)
- [ ] Store in component state
- [ ] Local storage persistence (optional)

### 5.3 Feature Usage Tracking (Session State)
- [ ] Show "uses remaining" for limited-use features
- [ ] Click to use/regain
- [ ] Store in component state
- [ ] Reset based on `reset_on` (short/long/dawn)

### 5.4 Rest Functions
- [ ] "Short Rest" button
  - [ ] Prompt for hit dice usage (future)
  - [ ] Reset short rest features
  - [ ] Reset spell slots (Warlock pact magic)
- [ ] "Long Rest" button
  - [ ] Restore HP to max
  - [ ] Reset all spell slots
  - [ ] Reset all features
  - [ ] Clear temp HP

### 5.5 Editable Gold
- [ ] Make gold field editable (inline or modal)
- [ ] Save changes to DB on blur/confirm
- [ ] Validation (non-negative integers)

---

## Phase 6: Mundane Item Integration

### 6.1 External API Setup
- [ ] Identify mundane items API (D&D 5e API, Open5e, or custom)
- [ ] Create API service/utility functions
- [ ] Test API endpoints (GET items, search, filter)

### 6.2 Item Search & Add
- [ ] Build item search modal
- [ ] Search API by name
- [ ] Display results (name, type, weight, cost)
- [ ] Add item to character inventory
- [ ] Store as `mundane_item_name` in DB

### 6.3 Item Display
- [ ] Fetch mundane item details from API on demand
- [ ] Cache API responses (optional)
- [ ] Display in inventory with magic items

---

## Phase 7: Advanced Feature Parsing

### 7.1 Magic Item Effects Parser
- [ ] Parse magic items for stat bonuses (e.g., +1 weapons, +X armor)
- [ ] Apply AC bonuses from magic armor
- [ ] Apply attack/damage bonuses from weapons
- [ ] Parse spell-granting items (e.g., Ring of Spell Storing)
- [ ] Add bonus spells to character spell list (temporary)

### 7.2 Feature Effects Parser
- [ ] Parse features for ability score increases
- [ ] Parse features for proficiency grants
- [ ] Parse features for spell grants (e.g., racial spells)
- [ ] Parse features for passive bonuses (e.g., Unarmored Defense)
- [ ] Apply calculated bonuses to character stats

### 7.3 Feat Effects Parser
- [ ] Parse feats for ability score increases
- [ ] Parse feats for proficiency grants
- [ ] Apply to calculated stats

---

## Phase 8: UI Organization & Navigation

### 8.1 Collapsible Sections
- [ ] Make spellcasting section collapsible
- [ ] Make features section collapsible
- [ ] Make inventory section collapsible
- [ ] Remember collapse state (local storage)

### 8.2 Tabbed Sections
- [ ] Features: Tabs for Class/Species/Background/Feats
- [ ] Inventory: Tabs for All/Weapons/Armor/Items

### 8.3 Multi-Page Layout (Optional)
- [ ] Page 1: Core stats, abilities, skills
- [ ] Page 2: Spellcasting
- [ ] Page 3: Features & traits
- [ ] Page 4: Inventory & equipment
- [ ] Navigation between pages

---

## Phase 9: Admin Dashboard - Character Management

### 9.1 Character Editor
- [ ] Admin view: See all characters (all users)
- [ ] Edit character core stats (HP, ability scores, level)
- [ ] Add/remove spells
- [ ] Add/remove features
- [ ] Add/remove inventory items
- [ ] Change character ownership (assign to different user)

### 9.2 Level Up Tool
- [ ] Select character
- [ ] Increase level by 1
- [ ] Calculate new HP (manual input or auto)
- [ ] Increase proficiency bonus (auto)
- [ ] Unlock new class features (manual selection)
- [ ] Grant new spell slots (auto)
- [ ] Grant ASI/feat (manual selection)
- [ ] Save changes

### 9.3 Bulk Operations
- [ ] Long rest all party members at once
- [ ] Award gold to all party members
- [ ] Apply global modifiers (buffs/debuffs)

---

## Phase 10: Character-Specific Features

### 10.1 Wizard Spellbook
- [ ] Separate view for "Known Spells" vs "Prepared Spells"
- [ ] "Learn new spell" flow (costs gold)
- [ ] Prepare/unprepare spells daily

### 10.2 Warlock Invocations
- [ ] Display invocations list
- [ ] Select invocations on level up

### 10.3 Monk Ki Points
- [ ] Display ki points max
- [ ] Track ki points used (session state)
- [ ] Reset on short/long rest

### 10.4 Sorcerer Sorcery Points & Metamagic
- [ ] Display sorcery points max
- [ ] Track sorcery points used
- [ ] List metamagic options
- [ ] Convert spell slots ↔ sorcery points

### 10.5 Barbarian Rage
- [ ] Display rage uses
- [ ] Track rage uses (session state)
- [ ] Activate rage toggle (apply bonuses)

### 10.6 Other Classes
- [ ] Identify and implement class-specific mechanics as needed

---

## Phase 11: Advanced Admin Tools

### 11.1 Subclass Builder
- [ ] Define subclass structure (name, parent class, level granted)
- [ ] Add features by level (3rd, 6th, 10th, 14th, etc.)
- [ ] Define feature effects (stat bonuses, proficiencies, spells)
- [ ] Save as structured data (JSONB or new table)
- [ ] Apply subclass to character

### 11.2 Custom Content
- [ ] Admin can create homebrew spells
- [ ] Admin can create homebrew magic items
- [ ] Admin can create homebrew feats
- [ ] Flag content as "homebrew" vs "official"

---

## Phase 12: Quality of Life & Polish

### 12.1 Responsive Design
- [ ] Optimize for mobile (primary use case)
- [ ] Optimize for tablet
- [ ] Acceptable on desktop

### 12.2 Dark Mode
- [ ] Implement dark mode theme
- [ ] Toggle in user preferences

### 12.3 PWA Features
- [ ] Ensure offline functionality
- [ ] Service worker for caching
- [ ] Install prompt for mobile

### 12.4 Performance
- [ ] Lazy load large sections (spells, features)
- [ ] Optimize spell/item lookups (indexes, caching)
- [ ] Debounce search inputs

### 12.5 Error Handling
- [ ] User-friendly error messages
- [ ] Retry failed API calls
- [ ] Fallback UI for missing data

### 12.6 Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] ARIA labels
- [ ] High contrast mode

---

## Phase 13: Testing & Deployment

### 13.1 Unit Tests
- [ ] Test calculation functions (ability mods, proficiency, skills, etc.)
- [ ] Test D&D Beyond transformer
- [ ] Test API utilities

### 13.2 Integration Tests
- [ ] Test character import flow
- [ ] Test admin CRUD operations
- [ ] Test user permissions

### 13.3 E2E Tests
- [ ] Test character sheet display
- [ ] Test HP management
- [ ] Test spell slot tracking
- [ ] Test rest functions

### 13.4 Deployment
- [ ] Deploy Supabase schema to production
- [ ] Deploy frontend to hosting (Vercel/Netlify)
- [ ] Configure environment variables
- [ ] Test in production

---

## Current Status

### ✅ Completed
- Character sheet spec (database schema, JSON structure)
- D&D Beyond transformer function
- Test data (Corrin Vale successfully transformed)

### 🚧 Next Steps
1. **Phase 1.1-1.5**: Set up Supabase database with all tables
2. **Phase 2.1-2.2**: Build admin dashboard spell management
3. **Phase 3.1**: Implement D&D Beyond import UI

---

## Dependencies & Considerations

### External Dependencies
- **Supabase**: Database, auth, RLS
- **D&D Beyond API**: Character import (may require auth)
- **Mundane Items API**: D&D 5e API or Open5e
- **React Router**: Multi-page navigation (already installed)

### Performance Targets
- Character sheet loads in < 2s
- HP updates feel instant (< 100ms)
- Spell/item search returns results in < 500ms

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

---

## Notes

- Prioritize **Phase 1-5** for MVP (basic character sheet with interactive features)
- **Phase 6-7** can be deferred (nice-to-have)
- **Phase 9-11** are admin-only features (can build incrementally)
- Keep mobile-first design throughout
- Test with all 6 party members regularly

---

**Last Updated**: February 20, 2026
