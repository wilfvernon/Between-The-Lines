import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAssetPreloader, getAllAssets, getTextureAssets } from '../hooks/useAssetPreloader';

/**
 * AssetLoader - Preloads critical assets before rendering children
 * Shows a loading screen with glowing crest
 * Integrates with child component loading states (e.g., character data loading)
 */
export default function AssetLoader({ children, mode = 'critical', showLoading = false }) {
  const assetPaths = useMemo(() => {
    if (mode === 'all') {
      return getAllAssets();
    }
    // Default to critical textures only for faster initial load
    return getTextureAssets();
  }, [mode]);

  const { loading: assetsLoading } = useAssetPreloader(assetPaths, {
    parallel: true,
    timeout: 8000,
  });

  // Show loading screen if assets are loading OR if child component wants to show loading
  const loading = assetsLoading || showLoading;

  if (loading) {
    return (
      <div className="route-loading">
        <img src="/crest.png" alt="" className="loading-crest" />
      </div>
    );
  }

  return children;
}

AssetLoader.propTypes = {
  children: PropTypes.node.isRequired,
  mode: PropTypes.oneOf(['critical', 'all']),
  showLoading: PropTypes.bool,
};
