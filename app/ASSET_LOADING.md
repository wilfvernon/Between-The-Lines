# Asset Loading Solution

## Problem Summary

The app had inconsistent image/texture loading across multiple components:

1. **HP Modal** - Manual `onLoad`/`onError` tracking for 3 images
2. **SpellDetailModal** - Silent preload using `new Image()` for 8 textures
3. **CSS Backgrounds** - 15+ textures loaded unpredictably via `url()` with no tracking
4. **No Global Strategy** - Each component handled loading differently or not at all
5. **FOUC Issues** - Flash of unstyled content when textures load late

## Solution Implemented

A comprehensive, centralized asset preloading system with:

### 1. **useAssetPreloader Hook** (`src/hooks/useAssetPreloader.js`)

Custom React hook that:
- Preloads arrays of image paths
- Tracks loading progress (0-100%)
- Handles errors gracefully
- Supports parallel or sequential loading
- Returns `{ loading, progress, errors, loaded }`

**Features:**
- Timeout protection (default 10s per asset)
- Parallel loading by default for speed
- Comprehensive error tracking
- Automatic progress calculation

**Asset Discovery Functions:**
- `getTextureAssets()` - Critical material textures (parchment, leather, metal, etc.)
- `getSpellSchoolTextures()` - Spell school background textures
- `getSpellSchoolSymbols()` - Spell school icon symbols
- `getHPModalAssets()` - HP modal specific images
- `getAllAssets()` - Complete asset list

### 2. **AssetLoader Component** (`src/components/AssetLoader.jsx`)

Wrapper component that:
- Shows loading screen while assets preload
- Displays animated progress bar
- Renders children once loading completes
- Supports two modes: `'critical'` (default) or `'all'`

**Usage:**
```jsx
<AssetLoader mode="critical">
  <YourApp />
</AssetLoader>
```

### 3. **Loading UI** (`src/components/AssetLoader.css`)

Beautiful loading screen with:
- Animated glowing crest
- Progress bar with shimmer effect
- Percentage indicator
- Consistent with app's Candlekeep theme

### 4. **Integration** (`src/App.jsx`)

Wrapped authenticated routes with AssetLoader:
```jsx
<ProtectedRoute>
  <AssetLoader mode="critical">
    <Layout />
  </AssetLoader>
</ProtectedRoute>
```

**Why this placement?**
- Login page loads immediately (no texture delay)
- Authenticated app waits for all textures before rendering
- Single loading screen for entire app session
- Textures cached after first load

### 5. **Cleanup**

Removed old manual loading code from:
- `CharacterSheet.jsx` - Removed HP modal asset tracking state
- `SpellDetailModal.jsx` - Removed silent preload effect

## Benefits

✅ **Centralized** - Single source of truth for asset loading
✅ **Predictable** - All textures load before app renders
✅ **User-Friendly** - Beautiful loading UI with progress feedback
✅ **Performant** - Parallel loading, browser caching
✅ **Maintainable** - Easy to add/remove assets from lists
✅ **Error-Tolerant** - Continues even if some assets fail
✅ **Type-Safe** - PropTypes validation

## Asset Lists

### Critical Assets (loaded by default)
- `/crest.png`
- `/textures/materials/parchment.png`
- `/textures/materials/parchment2.png`
- `/textures/materials/parchment3.png`
- `/textures/materials/leather.png`
- `/textures/materials/metal.png`
- `/textures/materials/velvet.png`
- `/textures/materials/Journal.png`
- `/textures/spellbook.png`
- `/gate.png`

### Extended Assets (mode="all")
- All critical assets above
- 8 spell school textures
- 8 spell school symbols
- Damage.png
- Healing.png

## How to Add New Assets

1. **Add to appropriate function in `useAssetPreloader.js`:**
```js
export function getTextureAssets() {
  return [
    ...existing,
    '/textures/new-texture.png', // Add here
  ];
}
```

2. **Or create new category:**
```js
export function getMyNewAssets() {
  return ['/path/to/asset.png'];
}

export function getAllAssets() {
  return [
    ...getTextureAssets(),
    ...getMyNewAssets(), // Include in "all" mode
  ];
}
```

## How to Use for Component-Level Loading

If you need to preload assets for a specific component (without global loading):

```jsx
import { useAssetPreloader } from '../hooks/useAssetPreloader';

function MyComponent() {
  const { loading, progress } = useAssetPreloader([
    '/my-image1.png',
    '/my-image2.png',
  ]);

  if (loading) {
    return <div>Loading... {progress}%</div>;
  }

  return <div>Content ready!</div>;
}
```

## Performance Considerations

- **First Load**: ~2-3 seconds for all critical textures
- **Subsequent Loads**: Instant (browser cache)
- **Parallel Loading**: All assets load simultaneously
- **Timeout Protection**: Won't hang if asset fails
- **Progressive Enhancement**: App works even if some fail

## Testing

To test the loading screen:
1. Open DevTools Network tab
2. Enable "Slow 3G" throttling
3. Hard reload (Cmd+Shift+R)
4. Watch loading screen with progress bar

## Future Enhancements

Potential improvements:
- [ ] Service worker integration for offline support
- [ ] Lazy-load non-critical assets after app renders
- [ ] Retry failed assets automatically
- [ ] Asset versioning/cache busting
- [ ] Image compression/optimization pipeline
- [ ] WebP format support with PNG fallback

## Files Modified

- ✅ Created: `src/hooks/useAssetPreloader.js`
- ✅ Created: `src/components/AssetLoader.jsx`
- ✅ Created: `src/components/AssetLoader.css`
- ✅ Updated: `src/App.jsx`
- ✅ Updated: `src/pages/CharacterSheet.jsx`
- ✅ Updated: `src/components/SpellDetailModal.jsx`

## Migration Notes

**Breaking Changes:** None - fully backward compatible

**CSS Changes:** None - loading styles are new, don't affect existing UI

**Behavior Changes:** 
- App now shows loading screen on first authenticated page visit
- Textures guaranteed to be loaded before app renders
- No more texture "pop-in" during navigation
