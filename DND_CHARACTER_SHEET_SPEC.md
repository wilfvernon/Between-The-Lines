# D&D Character Sheet Specification

## Integrations
### D&D Beyond Integration
- **Character Import/Export**: Users can import/export characters in JSON format using D&D Beyond’s API.
    - **Import**: Fetch character data from D&D Beyond and map to the sheet fields.
    - **Export**: Convert character sheet data into JSON format for D&D Beyond.
- **Homebrew Content Management**: Enable tracking and management of homebrew content with source attribution.con
  
## Database Schema
- **Characters**: Table structure for storing character information.
  - `id`: Unique identifier
  - `name`: Character name
  - `class`: Class name
  - `level`: Current level
  - `stats`: JSON field for character stats
  - `inventory`: JSON field for inventory items
  - `homebrew`: JSON field for homebrew content

## Data Sourcing
- Characters and items fetched from:
  - D&D Beyond API
  - Local Database

## Sync Behavior
- **Automatic Syncing**: Implement a background service to periodically sync character data.
- **User Sync Functionality**: Allow users to manually trigger data syncing with D&D Beyond.

## Feature List
- Character sheet display with:
  - Attributes (Str, Dex, etc.)
  - HP tracking (current temp/max modifications)
  - AC (Armor Class) calculations
  - Saving Throws, DC (Difficulty Class) calculations, and Skill calculations.
- Class-specific User Interface sections to display unique features.
- Lookup fallback mechanism with API-first approach to ensure data is retrieved as needed.
- Spell/Item/Feature Display:
    - Uses API to fetch data, falling back to local database if necessary.
    - Users can track spell slots and item usage dynamically.

## Implementation Details
1. **Character Import/Export from D&D Beyond JSON**: 
    - Define the fields to map and conversion logic for JSON files.
2. **Homebrew Content Management**: 
    - Create a tagging/attribution system for users to mark homebrew content source.
3. **Spell/Item/Feature Display**: 
    - Structured display using modular components to fetch data as required.
4. **HP Tracking**: 
    - Modify methods to reflect changes in HP dynamically.
5. **Calculations**: 
    - Implement formulas for AC, Saves, DCs, etc. dynamically updating on changes.
6. **Class Specific UI**: 
    - Build components based on character class

## Future Considerations
- Add support for additional integrations.
- Implement user feedback loops for feature improvements.