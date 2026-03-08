/* global process */
import { supabase } from './supabaseNode.js';
import { transformDnDBeyondCharacter } from './characterTransformer.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Insert a transformed character and all related data into Supabase
 */
export async function insertCharacter(transformedData) {
  try {
    console.log('🎲 Starting character insertion...\n');

    // 1. Insert main character
    console.log('📝 Inserting character:', transformedData.character.name);
    const { data: character, error: charError } = await supabase
      .from('characters')
      .insert({
        user_id: transformedData.character.userId,
        name: transformedData.character.name,
        full_name: transformedData.character.fullName,
        level: transformedData.character.level,
        classes: transformedData.character.classes,
        species: transformedData.character.species,
        background: transformedData.character.background,
        image_url: transformedData.character.imageUrl,
        alt_image_url: transformedData.character.altImageUrl,
        bio: transformedData.character.bio,
        languages: transformedData.character.languages,
        tools: transformedData.character.tools,
        instruments: transformedData.character.instruments,
        occupation: transformedData.character.occupation,
        age: transformedData.character.age,
        height: transformedData.character.height,
        likes: transformedData.character.likes,
        dislikes: transformedData.character.dislikes,
        fact: transformedData.character.fact,
        bravery: transformedData.character.bravery,
        charm: transformedData.character.charm,
        kindness: transformedData.character.kindness,
        knowledge: transformedData.character.knowledge,
        technique: transformedData.character.technique,
        max_hp: transformedData.character.maxHp,
        strength: transformedData.character.strength,
        dexterity: transformedData.character.dexterity,
        constitution: transformedData.character.constitution,
        intelligence: transformedData.character.intelligence,
        wisdom: transformedData.character.wisdom,
        charisma: transformedData.character.charisma,
        save_strength: transformedData.character.saveStrength,
        save_dexterity: transformedData.character.saveDexterity,
        save_constitution: transformedData.character.saveConstitution,
        save_intelligence: transformedData.character.saveIntelligence,
        save_wisdom: transformedData.character.saveWisdom,
        save_charisma: transformedData.character.saveCharisma,
        spellcasting_ability: transformedData.character.spellcastingAbility,
      })
      .select()
      .single();

    if (charError) throw new Error(`Character insert failed: ${charError.message}`);
    console.log(`✅ Character created with ID: ${character.id}\n`);

    const characterId = character.id;

    // 2. Insert skills
    if (transformedData.skills.length > 0) {
      console.log(`📚 Inserting ${transformedData.skills.length} skills...`);
      const { error: skillsError } = await supabase
        .from('character_skills')
        .insert(
          transformedData.skills.map(skill => ({
            character_id: characterId,
            skill_name: skill.skill_name,
            expertise: skill.expertise,
          }))
        );
      if (skillsError) throw new Error(`Skills insert failed: ${skillsError.message}`);
      console.log('✅ Skills inserted\n');
    }

    // 3. Insert features
    if (transformedData.features.length > 0) {
      console.log(`⚡ Inserting ${transformedData.features.length} features...`);
      const { error: featuresError } = await supabase
        .from('character_features')
        .insert(
          transformedData.features.map(feature => ({
            character_id: characterId,
            name: feature.name,
            source: feature.source,
            description: feature.description,
            max_uses: feature.max_uses,
            reset_on: feature.reset_on,
            benefits: feature.benefits,
          }))
        );
      if (featuresError) throw new Error(`Features insert failed: ${featuresError.message}`);
      console.log('✅ Features inserted\n');
    }

    // 4. Insert feats (requires feats to exist in reference table first)
    if (transformedData.feats.length > 0) {
      console.log(`🎯 Processing ${transformedData.feats.length} feats...`);
      for (const feat of transformedData.feats) {
        // Check if feat exists in reference table
        const { data: existingFeat } = await supabase
          .from('feats')
          .select('id')
          .eq('name', feat.name)
          .single();

        let featId;
        if (existingFeat) {
          featId = existingFeat.id;
        } else {
          // Create feat in reference table
          const { data: newFeat, error: featError } = await supabase
            .from('feats')
            .insert({
              name: feat.name,
              description: feat.description || 'Description not available',
              prerequisites: feat.prerequisites,
              benefits: feat.benefits || {},
            })
            .select('id')
            .single();
          
          if (featError) {
            console.warn(`  ⚠️  Failed to create feat "${feat.name}": ${featError.message}`);
            continue;
          }
          featId = newFeat.id;
        }

        // Link feat to character
        const { error: linkError } = await supabase
          .from('character_feats')
          .insert({
            character_id: characterId,
            feat_id: featId,
            source: feat.source,
          });

        if (linkError) {
          console.warn(`  ⚠️  Failed to link feat "${feat.name}": ${linkError.message}`);
        }
      }
      console.log('✅ Feats processed\n');
    }

    // 5. Insert inventory
    if (transformedData.inventory.length > 0) {
      console.log(`🎒 Inserting ${transformedData.inventory.length} inventory items...`);
      const inventoryRows = [];

      for (const item of transformedData.inventory) {
        let magicItemId = null;
        let equipmentId = null;
        let trinketName = null;

        if (item.is_magic_item) {
          const { data: magicItemRecord } = await supabase
            .from('magic_items')
            .select('id')
            .eq('name', item.name)
            .single();

          if (!magicItemRecord) {
            console.warn(`  ⚠️ Inventory magic item not found, using trinket: ${item.name}`);
            trinketName = item.name;
          } else {
            magicItemId = magicItemRecord.id;
          }
        } else {
          const { data: equipmentRecord } = await supabase
            .from('equipment')
            .select('id')
            .eq('name', item.name)
            .single();

          if (!equipmentRecord) {
            console.warn(`  ⚠️ Inventory equipment not found, using trinket: ${item.name}`);
            trinketName = item.name;
          } else {
            equipmentId = equipmentRecord.id;
          }
        }

        inventoryRows.push({
          character_id: characterId,
          ...(magicItemId ? { magic_item_id: magicItemId } : {}),
          ...(equipmentId ? { equipment_id: equipmentId } : {}),
          ...(trinketName ? { trinket_name: trinketName } : {}),
          quantity: item.quantity,
          equipped: item.equipped,
          attuned: item.attuned,
          notes: item.notes,
        });
      }

      if (inventoryRows.length > 0) {
      const { error: inventoryError } = await supabase
        .from('character_inventory')
        .insert(inventoryRows);
        if (inventoryError) throw new Error(`Inventory insert failed: ${inventoryError.message}`);
      }
      console.log('✅ Inventory inserted\n');
    }

    // 7. Insert senses
    if (transformedData.senses.length > 0) {
      console.log(`👁️  Inserting ${transformedData.senses.length} senses...`);
      const { error: sensesError } = await supabase
        .from('character_senses')
        .insert(
          transformedData.senses.map(sense => ({
            character_id: characterId,
            sense_type: sense.type,
            range: sense.range,
            notes: sense.notes,
          }))
        );
      if (sensesError) throw new Error(`Senses insert failed: ${sensesError.message}`);
      console.log('✅ Senses inserted\n');
    }

    // 8. Insert class-specific data
    if (transformedData.classSpecific && Object.keys(transformedData.classSpecific).length > 0) {
      console.log(`🔮 Inserting class-specific data...`);
      const { error: classSpecificError } = await supabase
        .from('character_class_specific')
        .insert({
          character_id: characterId,
          data: transformedData.classSpecific,
        });
      if (classSpecificError) throw new Error(`Class-specific insert failed: ${classSpecificError.message}`);
      console.log('✅ Class-specific data inserted\n');
    }

    console.log('🎉 Character insertion complete!');
    return { success: true, characterId };

  } catch (error) {
    console.error('❌ Error inserting character:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test function to insert Corinn Vale
 */
async function testInsertCorinn() {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ No authenticated user found. Please log in first.');
      return;
    }

    console.log(`👤 Authenticated as: ${user.email}\n`);

    // Load Corinn's JSON
    const corinnPath = join(__dirname, '../../corrin.json');
    const corinnData = JSON.parse(readFileSync(corinnPath, 'utf8'));
    
    // Transform the data
    console.log('🔄 Transforming D&D Beyond data...\n');
    const transformedData = transformDnDBeyondCharacter(corinnData, user.id);
    
    console.log('📋 Transformed data preview:');
    console.log(`   Name: ${transformedData.character.name}`);
    console.log(`   Classes: ${JSON.stringify(transformedData.character.classes)}`);
    console.log(`   Level: ${transformedData.character.level}`);
    console.log(`   Skills: ${transformedData.skills.length}`);
    console.log(`   Features: ${transformedData.features.length}`);
    console.log(`   Feats: ${transformedData.feats.length}`);
    console.log(`   Inventory: ${transformedData.inventory.length}`);
    console.log('');

    // Insert
    const result = await insertCharacter(transformedData);
    
    if (result.success) {
      console.log(`\n✨ Success! Character ID: ${result.characterId}`);
    } else {
      console.log(`\n💥 Failed: ${result.error}`);
    }

  } catch (error) {
    console.error('💥 Fatal error:', error);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testInsertCorinn();
}

export { testInsertCorinn };
