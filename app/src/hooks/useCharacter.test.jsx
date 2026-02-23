import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCharacter } from './useCharacter';
import { mockCharacter, mockSkills, mockSpells, mockUser, mockAdminUser, mockCharacters } from '../test/mockData';

// Mock supabase module
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}));

import { supabase } from '../lib/supabase';

describe('useCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch character for regular user', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockCharacter,
            error: null
          })
        })
      })
    });

    supabase.from.mockImplementation(mockFrom);

    const { result } = renderHook(() => 
      useCharacter({ user: mockUser, isAdmin: false })
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.character).toEqual(mockCharacter);
    expect(result.current.error).toBeNull();
  });

  it('should fetch all characters for admin user', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockCharacters,
            error: null
          })
        }),
        single: vi.fn().mockResolvedValue({
          data: mockCharacter,
          error: null
        })
      })
    });

    supabase.from.mockImplementation(mockFrom);

    const { result } = renderHook(() => 
      useCharacter({ user: mockAdminUser, isAdmin: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.characters).toEqual(mockCharacters);
  });

  it('should handle character fetch error', async () => {
    const mockError = { message: 'Database connection failed' };
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        })
      })
    });

    supabase.from.mockImplementation(mockFrom);

    const { result } = renderHook(() => 
      useCharacter({ user: mockUser, isAdmin: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Database connection failed');
    expect(result.current.character).toBeNull();
  });

  it('should fetch related data after character loads', async () => {
    const mockFrom = vi.fn((table) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockCharacter,
                error: null
              })
            })
          })
        };
      } else if (table === 'character_skills') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockSkills,
              error: null
            })
          })
        };
      } else if (table === 'character_spells') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockSpells,
              error: null
            })
          })
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      };
    });

    supabase.from.mockImplementation(mockFrom);

    const { result } = renderHook(() => 
      useCharacter({ user: mockUser, isAdmin: false })
    );

    await waitFor(() => {
      expect(result.current.relatedLoading).toBe(false);
    });

    expect(result.current.character.skills).toEqual(mockSkills);
    expect(result.current.character.spells).toEqual(mockSpells);
  });

  it('should allow selecting different character (admin)', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockCharacters,
            error: null
          }),
          single: vi.fn().mockResolvedValue({
            data: mockCharacter,
            error: null
          })
        })
      })
    });

    supabase.from.mockImplementation(mockFrom);

    const { result } = renderHook(() => 
      useCharacter({ user: mockAdminUser, isAdmin: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newCharacterId = 'test-char-789';
    result.current.setSelectedCharacterId(newCharacterId);

    await waitFor(() => {
      expect(result.current.selectedCharacterId).toBe(newCharacterId);
    });
  });

  it('should return null character when no user provided', () => {
    const { result } = renderHook(() => 
      useCharacter({ user: null, isAdmin: false })
    );

    expect(result.current.character).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
