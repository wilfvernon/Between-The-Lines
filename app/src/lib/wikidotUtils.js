/**
 * Wikidot URL utilities and constants
 */

export const WIKIDOT_BASE = 'http://dnd2024.wikidot.com';

/**
 * Convert a spell/item/feat name to wikidot URL slug format
 * Examples:
 *   "Fireball" -> "fireball"
 *   "Bag of Holding" -> "bag-of-holding"
 *   "Magic Missile" -> "magic-missile"
 *   "Pass Without Trace" -> "pass-without-trace"
 */
export function nameToSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '') // Remove apostrophes
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Collapse multiple hyphens
}

/**
 * Build wikidot URL for a spell
 */
export function getSpellUrl(spellName) {
  return `${WIKIDOT_BASE}/spell:${nameToSlug(spellName)}`;
}

/**
 * Build wikidot URL for a magic item
 */
export function getItemUrl(itemName) {
  return `${WIKIDOT_BASE}/magic-item:${nameToSlug(itemName)}`;
}

/**
 * Build wikidot URL for a feat
 */
export function getFeatUrl(featName) {
  return `${WIKIDOT_BASE}/feat:${nameToSlug(featName)}`;
}

/**
 * Check if HTML is a wikidot "page not found" response
 */
function isWikidotPageNotFound(html) {
  const notFoundPatterns = [
    'The page does not (yet) exist',
    'This page does not exist yet',
    'This page does not yet exist',
    'This page does not exist',
    'page does not exist yet',
    'page does not yet exist',
  ];
  
  const notFoundCheck = notFoundPatterns.some(pattern => html.includes(pattern));
  
  // Debug logging
  if (notFoundCheck) {
    console.log('[fetchWikidot] Detected "page does not exist" response');
  } else {
    // Log first 200 chars to diagnose if we're missing a pattern
    const snippet = html.substring(0, 200);
    if (html.length < 500 && !html.includes('<!DOCTYPE') && !html.includes('<html')) {
      console.warn('[fetchWikidot] HTML looks short/unusual, might be 404 page:', snippet);
    }
  }
  
  return notFoundCheck;
}

/**
 * Fetch HTML from wikidot via CORS proxy
 * Returns { html, attemptedUrls } to track which domains were tried
 */
export async function fetchWikidot(url) {
  const corsProxy = 'https://api.allorigins.win/raw?url=';
  const attemptedUrls = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const tryFetch = async (targetUrl) => {
    attemptedUrls.push(targetUrl);
    console.log(`[fetchWikidot] Attempting: ${targetUrl}`);
    const response = await fetch(corsProxy + encodeURIComponent(targetUrl));
    
    // Check for rate limiting (429)
    if (response.status === 429) {
      console.log(`[fetchWikidot] Got 429 rate limit at ${targetUrl}`);
      throw new Error(`Rate limited (429) at ${targetUrl}`);
    }
    
    if (!response.ok) {
      console.log(`[fetchWikidot] Got ${response.status} at ${targetUrl}`);
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`[fetchWikidot] Got 200 response from ${targetUrl}, checking content...`);
    
    // Check if wikidot returned a "page not found" page
    if (isWikidotPageNotFound(html)) {
      console.log(`[fetchWikidot] Content indicates page not found, will try fallback`);
      throw new Error('Wikidot page not found');
    }
    
    console.log(`[fetchWikidot] ✅ Successfully fetched ${targetUrl}`);
    return html;
  };

  try {
    const html = await tryFetch(url);
    return { html, attemptedUrls };
  } catch (error) {
    if (url.includes('dnd2024.wikidot.com')) {
      const fallbackUrl = url.replace('dnd2024.wikidot.com', 'dnd5e.wikidot.com');
      console.log(`[fetchWikidot] Initial attempt failed, waiting 1s before trying fallback...`);
      await sleep(1000); // Wait 1 second before fallback to avoid rate limiting
      try {
        const html = await tryFetch(fallbackUrl);
        return { html, attemptedUrls };
      } catch {
        // Both attempts failed; create error message with all attempted URLs
        const urlList = attemptedUrls.join(' → ');
        console.log(`[fetchWikidot] Both attempts failed: ${urlList}`);
        const err = new Error(`Failed after trying: ${urlList}`);
        err.attemptedUrls = attemptedUrls;
        throw err;
      }
    }
    // Single attempt failed
    console.log(`[fetchWikidot] Fetch failed (no fallback): ${error.message}`);
    const err = new Error(error.message);
    err.attemptedUrls = attemptedUrls;
    throw err;
  }
}
