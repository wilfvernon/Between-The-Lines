# Character Sheet System - FINAL SCOPE

## 🎯 Core Purpose
A **mobile-first PWA character sheet** for your 6-person D&D 2024 party. Players use physical dice but track everything else digitally.

---

## ✅ COMPLETE FEATURE SET

### **1. CHARACTER DISPLAY & CORE STATS**

#### Display Fields (Read-Only Calculated)
- Name / Full name (e.g., "Hazel" or "Hazel the Spirited")
- Level, class/subclass, species, background
- All 6 ability scores + modifiers
- Proficiency bonus
- AC (calculated from armor + items)
- Initiative modifier
- Speed
- Passive Perception
- All 6 saving throws (with proficiency indicators)
- All 18 skills (with proficiency/expertise indicators)
- Spell attack bonus & spell save DC (for casters)
- Senses (darkvision, etc.)

#### Bio Section
- Character portrait/image
- Bio text field (editable)

---

### **2. COMBAT & SESSION TRACKING**

#### HP Management
- Current HP / Max HP (editable with +/- buttons)
- Temp HP (session state)
- Color-coded HP bar (green → yellow → red)
- Manual input for precise changes

#### Death Saves
- Track successes (0-3)
- Track failures (0-3)
- Reset button
- Visual indicators (circles/checkboxes)

#### Hit Dice
- Track current/max hit dice by die type (d6, d8, d10, d12)
- Spend on short rest (roll + CON mod to heal)
- Regain half (rounded down) on long rest

#### Conditions
- Apply/remove standard conditions:
  - Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated
  - Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained
  - Stunned, Unconscious, Exhausted (levels 1-6)
- Visual indicators on character sheet
- Display condition effects (tooltip/expandable)

#### Concentration
- Mark which spell is being concentrated on
- Visual indicator (highlighted spell)
- Quick reference for concentration save DC (10 or half damage)

#### Initiative
- Display initiative modifier (DEX mod)
- Input field for rolled initiative (to track turn order)

---

### **3. RESOURCES & INSPIRATION**

#### Inspiration
- Boolean toggle (have/don't have)
- Visual indicator

#### Bardic Inspiration
- Track dice type (d6, d8, d10, d12 based on level)
- Track uses per long rest (based on CHA mod)
- Spend/regain buttons

#### Resource Tracking (Generic)
- Track any limited-use feature (Rage, Ki Points, Spell Points, etc.)
- Display current/max
- Reset on short/long rest based on feature definition

---

### **4. SPELLCASTING**

#### Spell Display
- Group spells by level (Cantrips, 1-9)
- Show prepared spells
- Show always-prepared spells (racial, class granted)
- Expand spell for full details (description, components, etc.)

#### Spell Slot Tracking
- Visual circles per spell level (filled = used, empty = available)
- Click to toggle used/available
- Reset on long rest
- Handle Warlock pact magic separately (resets on short rest)

#### Spell Info
- Spell attack bonus (calculated)
- Spell save DC (calculated)
- Casting ability

---

### **5. ATTACKS & ACTIONS**

#### Weapon Attacks
- Auto-generate from equipped weapons
- Display: Weapon name, to-hit bonus, damage formula
- Include proficiency if proficient with weapon type
- Include magic weapon bonuses
- Include ability modifier (STR for melee, DEX for finesse/ranged)

#### Spell Attacks
- List attack spells with spell attack bonus
- Show damage formula

#### Custom Actions
- Allow adding custom actions/attacks (admin or user)
- Define name, to-hit, damage, description

---

### **6. FEATURES, FEATS & TRAITS**

#### Display
- All class features (organized by level)
- All species traits
- All background features
- All feats
- Expandable descriptions

#### Limited-Use Features
- Show uses per rest (if applicable)
- Track current uses (session state)
- Reset on short/long rest

---

### **7. INVENTORY & EQUIPMENT**

#### Display
- All items (magic + mundane)
- Equipped indicator
- Attuned indicator (for magic items)
- Quantity
- Item descriptions (expandable)

#### Magic Item Effects
- Parse for stat bonuses (+1 weapon, +2 armor, etc.)
- Apply to calculated stats (AC, attack bonuses)
- Grant additional spells if item grants spells

#### Mundane Items
- Search external API (D&D 5e API)
- Add to inventory by name
- Fetch details on demand

---

### **8. CURRENCY**

#### Gold Tracking
- Current gold amount (editable)
- Simple +/- interface
- Validates non-negative

---

### **9. REST FUNCTIONS**

#### Short Rest
- Prompt to spend hit dice (select die type, roll + CON mod, add to HP)
- Reset short-rest features
- Reset Warlock pact magic slots
- Restore Bardic Inspiration uses (if bard)

#### Long Rest
- Restore HP to max
- Clear temp HP
- Reset all spell slots
- Reset all features (short + long rest)
- Regain half hit dice (rounded down)
- Reset death saves
- Remove exhaustion level (if any)

---

### **10. SHARED PARTY RESOURCES**

#### Display on Character Sheet
- Show party-wide shared resources (e.g., group inspiration pool, shared items)
- View-only for most players
- Admin can edit

#### Examples
- Group gold pool
- Shared magic items (Bag of Holding, etc.)
- Party buffs/effects

---

### **11. MULTICLASSING SUPPORT**

#### Handle Multiple Classes
- Display all classes with levels (e.g., "Fighter 3 / Wizard 2")
- Calculate total character level
- Calculate proficiency bonus from total level
- Combine spell slots (if multiclassing casters)
- Display features from all classes

---

### **12. CLASS-SPECIFIC FEATURES**

#### Wizard
- Spellbook list (all known spells)
- Prepare spells (up to INT mod + level)

#### Warlock
- Pact magic (separate spell slots, recharge on short rest)
- Eldritch invocations list

#### Monk
- Ki points (current/max)
- Spend/regain

#### Sorcerer
- Sorcery points (current/max)
- Metamagic options list
- Convert spell slots ↔ sorcery points

#### Barbarian
- Rage uses (current/max)
- Activate rage (visual indicator)

#### Paladin
- Lay on Hands pool (current/max)

#### Artificer
- Infusions list
- Infused items tracking

#### Cleric/Druid/Paladin
- Prepared spells (up to WIS/CHA mod + level)

#### Bard
- Bardic Inspiration (already covered above)

#### Ranger/Other
- Handle as features with limited uses

---

### **13. ADMIN DASHBOARD**

#### Reference Data Management
- **Spells**: Add, edit, delete spells (full details)
- **Magic Items**: Add, edit, delete magic items (with properties)
- **Feats**: Add, edit, delete feats

#### Character Management
- View all 6 characters
- Edit any character field
- Assign characters to users
- Import from D&D Beyond
- Delete characters

#### Level Up Tool
- Select character
- Increase level (+1)
- Update max HP (manual input or formula)
- Grant new class features (manual selection)
- Update spell slots (auto-calculated)
- Grant ASI or feat (manual selection)
- Save changes

#### Bulk Operations
- Long rest all party members at once
- Award gold to entire party
- Apply party-wide buffs/debuffs

---

### **14. D&D BEYOND INTEGRATION**

#### Character Import
- Input D&D Beyond character ID or paste JSON
- Preview imported character data
- Transform to our schema (using existing transformer)
- Insert into database
- Error handling

#### Data Mapping
- Map all D&D Beyond fields to our schema
- Extract skills, spells, features, inventory
- Parse modifiers for bonuses
- Handle subclass, multiclass, feats

---

### **15. UI/UX REQUIREMENTS**

#### Layout
- Mobile-first design
- Single-page scroll or tabbed sections
- Collapsible sections (Spells, Features, Inventory)
- Sticky header with name/level/HP

#### Interactions
- Touch-friendly buttons (large hit areas)
- Inline editing for simple fields
- Modals for complex editing
- Toast notifications for updates
- Smooth animations (HP changes, slot toggles)

#### Responsive Design
- Mobile (< 640px): Single column, full-width
- Tablet (640-1024px): Two columns where appropriate
- Desktop (> 1024px): Optimized but not primary focus

#### Dark Mode
- Toggle in user settings
- Persistent preference
- Clean dark theme

#### PWA Features
- Offline support (cached character data)
- Installable on mobile
- Service worker for caching
- Fast load times

---

## 🗄️ DATABASE SCHEMA

### Core Tables
- `characters` - Core character data (abilities, HP, level, class, species)
- `character_skills` - Proficient/expertise skills only
- `character_spells` - References to known spells
- `character_features` - Class/species/background features
- `character_feats` - References to feats
- `character_inventory` - Items (magic item ID or mundane name)
- `character_currency` - Gold only
- `character_senses` - Darkvision, etc.
- `character_class_specific` - JSONB for class-specific data

### Reference Tables
- `spells` - All spell definitions
- `magic_items` - All magic item definitions
- `feats` - All feat definitions

### Other Tables
- `users` - Auth + is_admin flag
- `shared_resources` - Party-wide resources (optional)

---

## 📊 DATA FLOW

### Persistent (Database)
- Core stats: Ability scores, proficiencies, max HP, speed, etc.
- Known spells, features, feats, inventory
- Base values, not calculated

### Calculated (Runtime)
- All bonuses: Ability modifiers, proficiency bonus, skill bonuses, saves
- AC (from armor + items)
- Spell attack bonus, spell DC
- Attack bonuses (from weapons + proficiency)
- Initiative modifier

### Session State (Local Storage + Component State)
- Current HP, temp HP
- Spell slots used per level
- Hit dice used per type
- Feature uses (Rage, Ki, etc.)
- Active conditions
- Concentration status
- Death saves
- Rolled initiative value

---

## 📅 IMPLEMENTATION PHASES

### **PHASE 1: Foundation (Week 1-2)**
- Set up all database tables in Supabase
- Implement RLS policies
- Set up admin authentication
- Build basic character display (read-only)
- Implement calculation functions (ability mods, prof bonus, skills, saves, AC, spell DC)

### **PHASE 2: Combat Essentials (Week 2-3)**
- HP management with +/- buttons
- Death saves tracker
- Hit dice tracker
- Conditions manager
- Concentration indicator
- Initiative input
- Rest functions (short/long)

### **PHASE 3: Resources & Spells (Week 3-4)**
- Spell slot tracking
- Inspiration toggle
- Bardic inspiration tracker
- Generic resource tracking (Rage, Ki, etc.)
- Spell display with expand/collapse
- Warlock pact magic handling

### **PHASE 4: Attacks & Inventory (Week 4-5)**
- Weapon attack generation
- Attack display with to-hit/damage
- Inventory display (magic + mundane)
- Magic item effect parsing
- Mundane item API integration
- Gold editing

### **PHASE 5: Admin Dashboard (Week 5-6)**
- Spell CRUD interface
- Magic item CRUD interface
- Feat CRUD interface
- Character list view
- Character editing
- Level up tool

### **PHASE 6: Import & Setup (Week 6)**
- D&D Beyond import UI
- Import all 6 party member characters
- Assign to users
- Test all features with real data

### **PHASE 7: Advanced Features (Week 7-8)**
- Multiclass support
- Class-specific features (Wizard spellbook, Ki points, etc.)
- Feature usage tracking
- Shared party resources
- Bio section with image upload

### **PHASE 8: Polish (Week 8-9)**
- Dark mode
- Responsive design refinement
- PWA optimization (offline, installable)
- Accessibility improvements
- Performance optimization
- Error handling
- Loading states

---

## 🎯 SUCCESS CRITERIA

### Functional
- ✅ All 6 characters imported and displayed correctly
- ✅ All calculations accurate (skill bonuses, saves, AC, spell DC, etc.)
- ✅ HP changes persist across sessions (local storage)
- ✅ Spell slots track correctly and reset on rest
- ✅ Attacks show correct to-hit and damage
- ✅ Admin can add/edit spells, items, feats

### Performance
- Character loads in < 2 seconds
- HP/spell slot updates feel instant (< 100ms)
- Works offline after initial load

### UX
- Usable on phone during gameplay
- No accidental clicks (large touch targets)
- Dark mode for low-light play
- Smooth animations

---

## 🚫 OUT OF SCOPE

Explicitly **NOT** included:
- Virtual dice roller (players use physical dice)
- Encumbrance/weight tracking
- XP tracking
- Campaign management tools (single campaign only)
- Character versioning/history
- Export to PDF/JSON
- Full personality fields (traits, ideals, bonds, flaws)
- Initiative tracker tool (separate DM concern)
- Combat log/damage history
- NPC/monster tracking

---

## 🤝 ASSUMPTIONS

- **Single campaign**: All 6 characters are part of one campaign
- **Supabase**: Using existing Supabase project
- **D&D 2024 rules**: Using updated D&D rules (2024 edition)
- **6 fixed characters**: Not a character creation tool, primarily for existing characters
- **Physical dice**: App doesn't need dice roller
- **Admin managed**: You (admin) handle most data entry and character updates

---

**This is the complete, final scope. Ready to build?**
