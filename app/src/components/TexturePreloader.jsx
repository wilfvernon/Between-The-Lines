/**
 * TexturePreloader - Hidden div that forces CSS backgrounds to cache
 * This ensures background images are truly ready before the app renders
 */
export default function TexturePreloader() {
  return (
    <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
      {/* Material textures */}
      <div style={{ backgroundImage: 'url(/textures/materials/parchment.png)', width: 1, height: 1 }} />
        <div style={{ backgroundImage: 'url(/textures/materials/parchment.png)', backgroundSize: '140%', backgroundPosition: 'center', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/parchment2.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/parchment3.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/leather.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/metal.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/velvet.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/materials/Journal.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spellbook.png)', width: 1, height: 1 }} />
      
      {/* Spell school textures */}
      <div style={{ backgroundImage: 'url(/textures/spell-schools/abjuration.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/conjuration.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/divination.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/enchantment.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/evocation.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/illusion.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/necromancy.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/textures/spell-schools/transmutation.png)', width: 1, height: 1 }} />
      
      {/* UI assets */}
      <div style={{ backgroundImage: 'url(/crest.png)', width: 1, height: 1 }} />
        <div style={{ backgroundImage: 'url(/crest.png)', backgroundSize: '17%', backgroundPosition: 'center', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/gate.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/Damage.png)', width: 1, height: 1 }} />
      <div style={{ backgroundImage: 'url(/Healing.png)', width: 1, height: 1 }} />
      
      {/* SVG masks for tab icons - force browser to cache */}
      <img src="/icons/sword.svg" alt="" style={{ width: 1, height: 1 }} />
      <img src="/icons/entity/pack.svg" alt="" style={{ width: 1, height: 1 }} />
      <img src="/icons/entity/book.svg" alt="" style={{ width: 1, height: 1 }} />
      <img src="/icons/monster/dragon.svg" alt="" style={{ width: 1, height: 1 }} />
    </div>
  );
}
