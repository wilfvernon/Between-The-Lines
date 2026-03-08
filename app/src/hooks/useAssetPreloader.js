import { useState, useEffect } from 'react';

/**
 * Preloads image assets and tracks loading progress
 * @param {string[]} assetPaths - Array of asset URLs to preload
 * @param {Object} options - Configuration options
 * @param {boolean} options.parallel - Load assets in parallel (default: true)
 * @param {number} options.timeout - Timeout per asset in ms (default: 10000)
 * @returns {Object} - { loading, progress, errors, loaded }
 */
export function useAssetPreloader(assetPaths = [], options = {}) {
  const { parallel = true, timeout = 10000 } = options;
  
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!assetPaths || assetPaths.length === 0) {
      setLoading(false);
      setLoaded(true);
      setProgress(100);
      return;
    }

    let isMounted = true;
    let loadedCount = 0;

    const loadImage = (src) => {
      return new Promise((resolve) => {
        const img = new Image();
        
        const timeoutId = setTimeout(() => {
          resolve({ src, success: false, error: 'Timeout' });
        }, timeout);

        img.onload = () => {
          clearTimeout(timeoutId);
          // Force browser to decode the image for faster rendering
          if (img.decode) {
            img.decode()
              .then(() => resolve({ src, success: true }))
              .catch(() => resolve({ src, success: true }));
          } else {
            resolve({ src, success: true });
          }
        };

        img.onerror = (err) => {
          clearTimeout(timeoutId);
          resolve({ src, success: false, error: err.message || 'Failed to load' });
        };

        img.src = src;
        // Force immediate loading
        img.loading = 'eager';
      });
    };

    const updateProgress = () => {
      loadedCount++;
      const newProgress = Math.round((loadedCount / assetPaths.length) * 100);
      if (isMounted) {
        setProgress(newProgress);
      }
    };

    const loadAssets = async () => {
      setLoading(true);
      setProgress(0);
      setErrors([]);

      try {
        if (parallel) {
          // Load all assets in parallel
          const results = await Promise.all(
            assetPaths.map(async (path) => {
              const result = await loadImage(path);
              updateProgress();
              return result;
            })
          );

          const failed = results.filter((r) => !r.success);
          if (isMounted) {
            if (failed.length > 0) {
              setErrors(failed);
              console.warn('Some assets failed to load:', failed);
            }
          }
        } else {
          // Load assets sequentially
          const failed = [];
          for (const path of assetPaths) {
            const result = await loadImage(path);
            updateProgress();
            if (!result.success) {
              failed.push(result);
            }
          }

          if (isMounted && failed.length > 0) {
            setErrors(failed);
            console.warn('Some assets failed to load:', failed);
          }
        }
      } catch (err) {
        console.error('Asset preloading error:', err);
        if (isMounted) {
          setErrors([{ error: err.message }]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setLoaded(true);
          setProgress(100);
        }
      }
    };

    loadAssets();

    return () => {
      isMounted = false;
    };
  }, [assetPaths, parallel, timeout]);

  return { loading, progress, errors, loaded };
}

/**
 * Get all texture assets for preloading
 * Uses Vite's import.meta.glob to discover assets at build time
 */
export function getTextureAssets() {
  // Critical textures that must load before app renders
  const critical = [
    '/crest.png',
    '/textures/materials/parchment.png',
    '/textures/materials/parchment2.png',
    '/textures/materials/parchment3.png',
    '/textures/materials/leather.png',
    '/textures/materials/metal.png',
    '/textures/materials/velvet.png',
    '/textures/materials/Journal.png',
    '/textures/spellbook.png',
    '/gate.png',
    '/Damage.png',
    '/Healing.png',
    // Spell school textures for modals
    ...getSpellSchoolTextures(),
  ];

  return critical;
}

/**
 * Get spell school textures
 */
export function getSpellSchoolTextures() {
  const schools = [
    'abjuration',
    'conjuration',
    'divination',
    'enchantment',
    'evocation',
    'illusion',
    'necromancy',
    'transmutation'
  ];

  return schools.map((school) => `/textures/spell-schools/${school}.png`);
}

/**
 * Get spell school symbols
 */
export function getSpellSchoolSymbols() {
  const schools = [
    'abjuration',
    'conjuration',
    'divination',
    'enchantment',
    'evocation',
    'illusion',
    'necromancy',
    'transmutation'
  ];

  return schools.map((school) => `/school-symbols/${school}.png`);
}

/**
 * Get all assets for preloading
 */
export function getAllAssets() {
  return [
    ...getTextureAssets(),
    ...getSpellSchoolSymbols(),
  ];
}
