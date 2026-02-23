import { vi } from 'vitest';

// Mock character data for testing
export const mockCharacter = {
  id: 'test-char-123',
  user_id: 'test-user-456',
  name: 'Test Character',
  full_name: 'Test Character the Brave',
  level: 5,
  classes: [
    { class: 'Fighter', subclass: 'Battle Master', level: 3 },
    { class: 'Wizard', subclass: 'Evocation', level: 2 }
  ],
  species: 'Human',
  background: 'Soldier',
  image_url: '/test-portrait.jpg',
  bio: 'Test character bio',
  max_hp: 45,
  current_hp: 35,
  speed: 30,
  strength: 16,
  dexterity: 14,
  constitution: 15,
  intelligence: 13,
  wisdom: 10,
  charisma: 8,
  save_strength: true,
  save_dexterity: false,
  save_constitution: true,
  save_intelligence: false,
  save_wisdom: false,
  save_charisma: false,
  spellcasting_ability: 'intelligence',
  conditions: [
    { name: 'Poisoned', icon: null }
  ],
  speeds: {
    walk: 30,
    climb: 15
  },
  senses: [
    { sense_type: 'darkvision', range: 60 }
  ]
};

export const mockSkills = [
  { id: '1', character_id: 'test-char-123', skill_name: 'Athletics', expertise: false },
  { id: '2', character_id: 'test-char-123', skill_name: 'Perception', expertise: false },
  { id: '3', character_id: 'test-char-123', skill_name: 'Stealth', expertise: true },
];

export const mockSpells = [
  {
    id: '1',
    character_id: 'test-char-123',
    spell_id: 'spell-1',
    is_prepared: true,
    always_prepared: false,
    spell: {
      id: 'spell-1',
      name: 'Fireball',
      level: 3,
      school: 'Evocation',
      casting_time: '1 action',
      range: '150 feet',
      components: 'V, S, M',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger...'
    }
  },
  {
    id: '2',
    character_id: 'test-char-123',
    spell_id: 'spell-2',
    is_prepared: true,
    always_prepared: false,
    spell: {
      id: 'spell-2',
      name: 'Shield',
      level: 1,
      school: 'Abjuration',
      casting_time: '1 reaction',
      range: 'Self',
      components: 'V, S',
      duration: '1 round',
      description: 'An invisible barrier of magical force appears...'
    }
  }
];

export const mockFeatures = [
  {
    id: '1',
    character_id: 'test-char-123',
    name: 'Second Wind',
    source: 'Fighter 1',
    description: 'You have a limited well of stamina...',
    max_uses: 1,
    current_uses: 1,
    reset_on: 'short rest'
  }
];

export const mockUser = {
  id: 'test-user-456',
  email: 'test@example.com'
};

export const mockAdminUser = {
  id: 'admin-user-789',
  email: 'admin@candlekeep.sc'
};

export const mockCharacters = [
  mockCharacter,
  {
    ...mockCharacter,
    id: 'test-char-789',
    name: 'Another Character',
    level: 3
  }
];

// Mock Supabase responses
export const createMockSupabaseClient = () => {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null
      }),
      signOut: vi.fn().mockResolvedValue({ error: null })
    },
    from: vi.fn((table) => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        order: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      };

      // Configure responses based on table
      if (table === 'characters') {
        mockChain.single.mockResolvedValue({
          data: mockCharacter,
          error: null
        });
      } else if (table === 'character_skills') {
        mockChain.single.mockResolvedValue({
          data: mockSkills,
          error: null
        });
      } else if (table === 'character_spells') {
        mockChain.single.mockResolvedValue({
          data: mockSpells,
          error: null
        });
      }

      return mockChain;
    })
  };
};
