import CreaturesTab from './CharacterSheet/tabs/CreaturesTab';
import './CharacterSheet.css';

const mockSummon = {
  id: 'visual-white-python',
  name: 'White Python',
  size: 'Large',
  creature_type: 'Beast',
  alignment: 'Unaligned',
  challenge_rating: '2',
  armor_class_value: 14,
  armor_class_notes: 'natural armor',
  hit_points_value: 45,
  hit_points_formula: '6d10+12',
  speed: {
    walk: 30,
    swim: 30
  },
  strength: 16,
  dexterity: 14,
  constitution: 15,
  intelligence: 2,
  wisdom: 12,
  charisma: 5,
  saving_throws: {
    strength: 5,
    constitution: 4
  },
  skills: {
    perception: 3,
    stealth: 4
  },
  senses: {
    parsed: ['blindsight 10 ft.', 'passive perception 13']
  },
  languages: ['—'],
  traits: [
    {
      name: 'Constrictor Body',
      text: 'The python can **restrain** a Medium or smaller target when it hits with *Constrict*.'
    }
  ],
  actions: [
    {
      name: 'Bite',
      text: '*Melee Weapon Attack:* +5 to hit, reach 10 ft., one target. **Hit:** 8 (1d10 + 3) piercing damage.'
    },
    {
      name: 'Constrict',
      text: '*Melee Weapon Attack:* +5 to hit, reach 5 ft., one creature. **Hit:** 10 (2d6 + 3) bludgeoning damage, and the target is grappled (escape DC 13).'
    }
  ],
  bonus_actions: [],
  reactions: []
};

const mockCharacter = {
  id: 'visual-character',
  level: 5,
  spellcasting_ability: 'wisdom',
  strength: 10,
  dexterity: 14,
  constitution: 12,
  intelligence: 8,
  wisdom: 16,
  charisma: 11,
  spells: [
    {
      id: 'visual-spell-1',
      spell_id: 'visual-spell-1',
      spell: {
        id: 'visual-spell-1',
        name: 'Summon White Python',
        level: 2
      },
      summon_id: mockSummon.id,
      summon: mockSummon
    }
  ],
  inventory: []
};

export default function VisualCreaturesTest() {
  return (
    <div className="character-sheet" style={{ padding: '24px' }}>
      <CreaturesTab
        character={mockCharacter}
        proficiencyBonus={3}
        derivedMods={{
          strength: 0,
          dexterity: 2,
          constitution: 1,
          intelligence: -1,
          wisdom: 3,
          charisma: 0
        }}
      />
    </div>
  );
}
