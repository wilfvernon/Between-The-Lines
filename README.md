# Galatea Fine Art

A curated gallery website for showcasing fine art pieces. Built with React + Vite.

## Project Structure

```
src/
├── main.jsx              # React entry point
├── App.jsx              # Main app component
├── index.css            # Global styles
└── components/
    ├── Header.jsx       # Page header with title and month
    ├── Gallery.jsx      # Gallery grid layout
    └── Modal.jsx        # Item detail modal
public/
└── items.json           # Gallery data
index.html              # HTML template
package.json            # Dependencies
vite.config.js          # Vite configuration
```

## Getting Started

### Install dependencies
```bash
npm install
```

### Development server
```bash
npm run dev
```

Server runs at `http://localhost:5173`

### Build for production
```bash
npm run build
```

## Adding Items

Edit `public/items.json` to add or modify gallery items. Each item should have:

```json
{
  "name": "Item Name",
  "type": "Item Type",
  "rarity": "rarity-level",
  "attunement": null,
  "image": "url-to-image",
  "description": "Item description with **bold text** support"
}
```

## Color Palette

- **#f8f2dc** - Cream background
- **#2d2416** - Dark text
- **#9e6240** - Warm brown
- **#81adc8** - Muted blue
- **#6b9e7f** - Muted sage green

## Styling

All styles are in `src/index.css`. The design uses:
- Playfair Display for headings
- EB Garamond for body text
- Space Mono for metadata
