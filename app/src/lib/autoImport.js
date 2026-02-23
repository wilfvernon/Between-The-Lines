/**
 * Auto-import reference data (spells, magic items, feats) from wikidot
 * Checks DB first, scrapes and adds missing items
 */

import { supabase } from './supabase';
import { getSpellUrl, getItemUrl, getFeatUrl, fetchWikidot } from './wikidotUtils';
import { parseSpellHtml, parseItemHtml, parseFeatHtml } from './wikidotScrapers';

/**
 * Auto-import spells by name
 * @param {string[]} spellNames - Array of spell names to ensure exist
 * @returns {Promise<{imported: string[], failed: Array<{name: string, error: string}>}>}
 */
export async function autoImportSpells(spellNames) {
  const imported = [];
  const failed = [];
  
  for (const spellName of spellNames) {
    try {
      // Check if spell already exists
      const { data: existing } = await supabase
        .from('spells')
        .select('name')
        .eq('name', spellName)
        .single();
      
      if (existing) {
        // Already exists, skip
        continue;
      }
      
      // Doesn't exist, scrape it
      console.log(`[Auto-import] Scraping spell: ${spellName}`);
      const url = getSpellUrl(spellName);
      const { html } = await fetchWikidot(url);
      const spellData = parseSpellHtml(html);
      
      // Insert into DB
      const { error: insertError } = await supabase
        .from('spells')
        .insert(spellData);
      
      if (insertError) throw insertError;
      
      imported.push(spellName);
      console.log(`[Auto-import] ✅ Imported spell: ${spellName}`);
      
    } catch (error) {
      console.error(`[Auto-import] ❌ Failed to import spell "${spellName}":`, error);
      failed.push({ name: spellName, error: error.message });
    }
  }
  
  return { imported, failed };
}

/**
 * Auto-import magic items by name
 * @param {string[]} itemNames - Array of item names to ensure exist
 * @returns {Promise<{imported: string[], failed: Array<{name: string, error: string}>}>}
 */
export async function autoImportItems(itemNames) {
  const imported = [];
  const failed = [];
  
  for (const itemName of itemNames) {
    try {
      // Check if item already exists
      const { data: existing } = await supabase
        .from('magic_items')
        .select('name')
        .eq('name', itemName)
        .single();
      
      if (existing) {
        // Already exists, skip
        continue;
      }
      
      // Doesn't exist, scrape it
      console.log(`[Auto-import] Scraping item: ${itemName}`);
      const url = getItemUrl(itemName);
      const { html } = await fetchWikidot(url);
      const itemData = parseItemHtml(html);
      
      // Insert into DB
      const { error: insertError } = await supabase
        .from('magic_items')
        .insert(itemData);
      
      if (insertError) throw insertError;
      
      imported.push(itemName);
      console.log(`[Auto-import] ✅ Imported item: ${itemName}`);
      
    } catch (error) {
      console.error(`[Auto-import] ❌ Failed to import item "${itemName}":`, error);
      failed.push({ name: itemName, error: error.message });
    }
  }
  
  return { imported, failed };
}

/**
 * Auto-import feats by name
 * @param {string[]} featNames - Array of feat names to ensure exist
 * @returns {Promise<{imported: string[], failed: Array<{name: string, error: string}>}>}
 */
export async function autoImportFeats(featNames) {
  const imported = [];
  const failed = [];
  
  for (const featName of featNames) {
    try {
      // Check if feat already exists
      const { data: existing } = await supabase
        .from('feats')
        .select('name')
        .eq('name', featName)
        .single();
      
      if (existing) {
        // Already exists, skip
        continue;
      }
      
      // Doesn't exist, scrape it
      console.log(`[Auto-import] Scraping feat: ${featName}`);
      const url = getFeatUrl(featName);
      const { html } = await fetchWikidot(url);
      const featData = parseFeatHtml(html);
      
      // Insert into DB
      const { error: insertError } = await supabase
        .from('feats')
        .insert(featData);
      
      if (insertError) throw insertError;
      
      imported.push(featName);
      console.log(`[Auto-import] ✅ Imported feat: ${featName}`);
      
    } catch (error) {
      console.error(`[Auto-import] ❌ Failed to import feat "${featName}":`, error);
      failed.push({ name: featName, error: error.message });
    }
  }
  
  return { imported, failed };
}

/**
 * Auto-import all reference data for a character
 * @param {Object} characterData - Character data containing spells, items, feats
 * @returns {Promise<{spells: {imported, failed}, items: {imported, failed}, feats: {imported, failed}}>}
 */
export async function autoImportCharacterReferences(characterData) {
  console.log('[Auto-import] Starting auto-import for character references...');
  
  // Extract unique names from character data
  const spellNames = new Set();
  const itemNames = new Set();
  const featNames = new Set();
  
  // Collect spell names (from character_spells relationship)
  if (characterData.spells && Array.isArray(characterData.spells)) {
    characterData.spells.forEach((spell) => {
      const name = typeof spell === 'string' ? spell : spell?.name;
      if (name) spellNames.add(name);
    });
  }
  
  // Collect item names (from character_inventory relationship)
  if (characterData.inventory && Array.isArray(characterData.inventory)) {
    characterData.inventory.forEach((item) => {
      const isMagicItem = item?.is_magic_item;
      const name = item?.name;
      if (isMagicItem && name) itemNames.add(name);
    });
  }
  
  // Collect feat names (from character_feats relationship)
  if (characterData.feats && Array.isArray(characterData.feats)) {
    characterData.feats.forEach((feat) => {
      const name = typeof feat === 'string' ? feat : feat?.name;
      if (name) featNames.add(name);
    });
  }
  
  // Run imports in parallel
  const [spellsResult, itemsResult, featsResult] = await Promise.all([
    spellNames.size > 0 ? autoImportSpells([...spellNames]) : { imported: [], failed: [] },
    itemNames.size > 0 ? autoImportItems([...itemNames]) : { imported: [], failed: [] },
    featNames.size > 0 ? autoImportFeats([...featNames]) : { imported: [], failed: [] }
  ]);
  
  console.log('[Auto-import] Auto-import complete!');
  console.log(`  Spells: ${spellsResult.imported.length} imported, ${spellsResult.failed.length} failed`);
  console.log(`  Items: ${itemsResult.imported.length} imported, ${itemsResult.failed.length} failed`);
  console.log(`  Feats: ${featsResult.imported.length} imported, ${featsResult.failed.length} failed`);
  
  return {
    spells: spellsResult,
    items: itemsResult,
    feats: featsResult
  };
}

function extractReferenceNames(characterData) {
  const spellNames = new Set();
  const itemNames = new Set();
  const featNames = new Set();

  if (characterData.spells && Array.isArray(characterData.spells)) {
    characterData.spells.forEach((spell) => {
      const name = typeof spell === 'string' ? spell : spell?.name;
      if (name) spellNames.add(name);
    });
  }

  if (characterData.inventory && Array.isArray(characterData.inventory)) {
    characterData.inventory.forEach((item) => {
      const isMagicItem = Boolean(
        item?.magicItemId ||
        item?.attuned ||
        item?.itemDetails?.requiresAttunement
      );
      const name = typeof item === 'string' ? item : item?.itemDetails?.name;
      if (isMagicItem && name) itemNames.add(name);
    });
  }

  if (characterData.feats && Array.isArray(characterData.feats)) {
    characterData.feats.forEach((feat) => {
      const name = typeof feat === 'string' ? feat : feat?.name;
      if (name) featNames.add(name);
    });
  }

  return {
    spellNames: [...spellNames],
    itemNames: [...itemNames],
    featNames: [...featNames]
  };
}

async function prepareReferenceCandidates(table, names, getUrl, parseFn) {
  if (names.length === 0) {
    return { candidates: [], existing: [], failed: [] };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const { data: existingRows, error } = await supabase
    .from(table)
    .select('name')
    .in('name', names);

  if (error) throw error;

  const existingSet = new Set((existingRows || []).map((row) => row.name));
  const missing = names.filter((name) => !existingSet.has(name));
  const candidates = [];
  const failed = [];

  for (const name of missing) {
    try {
      const url = getUrl(name);
      const { html, attemptedUrls } = await fetchWikidot(url);
      const parsed = parseFn(html);
      candidates.push({
        name: parsed.name || name,
        data: parsed,
        sourceUrl: attemptedUrls.join(' → '),
        approved: false
      });
    } catch (err) {
      const sourceUrl = err.attemptedUrls ? err.attemptedUrls.join(' → ') : getUrl(name);
      failed.push({ name, error: err.message, sourceUrl, approved: false });
    }

    // Throttle more aggressively: 2 seconds between requests to avoid 429
    await sleep(2000);
  }

  return {
    candidates,
    existing: names.filter((name) => existingSet.has(name)),
    failed
  };
}

export async function prepareReferenceImports(characterData) {
  const { spellNames, itemNames, featNames } = extractReferenceNames(characterData);

  const [spells, items, feats] = await Promise.all([
    prepareReferenceCandidates('spells', spellNames, getSpellUrl, parseSpellHtml),
    prepareReferenceCandidates('magic_items', itemNames, getItemUrl, parseItemHtml),
    prepareReferenceCandidates('feats', featNames, getFeatUrl, parseFeatHtml)
  ]);

  return { spells, items, feats };
}

export async function insertReferenceCandidates(reviewData) {
  const results = {
    spells: { inserted: [], failed: [] },
    items: { inserted: [], failed: [] },
    feats: { inserted: [], failed: [] }
  };

  const insertBatch = async (table, list, bucket) => {
    for (const entry of list) {
      try {
        const { error } = await supabase
          .from(table)
          .upsert(entry.data, { onConflict: 'name' });
        if (error) {
          console.error(`[insertBatch] Error upserting ${table} "${entry.name}":`, error);
          throw error;
        }
        bucket.inserted.push(entry.name);
      } catch (err) {
        console.error(`[insertBatch] Failed to insert ${table} "${entry.name}":`, err.message);
        console.error(`[insertBatch] Data that failed:`, entry.data);
        bucket.failed.push({ name: entry.name, error: err.message });
      }
    }
  };

  await insertBatch('spells', reviewData.spells || [], results.spells);
  await insertBatch('magic_items', reviewData.items || [], results.items);
  await insertBatch('feats', reviewData.feats || [], results.feats);

  return results;
}
