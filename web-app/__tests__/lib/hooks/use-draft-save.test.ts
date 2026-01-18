/**
 * Tests for useDraftSave hook
 * Verifies local storage draft saving functionality
 */

import { renderHook, act } from '@testing-library/react';
import { useDraftSave } from '@/lib/hooks/use-draft-save';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock useDebounce to return value immediately
jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T, _delay: number) => value,
}));

describe('useDraftSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
  });

  it('should start without a draft', () => {
    const { result } = renderHook(() =>
      useDraftSave({
        draftKey: 'test-form',
        data: { name: 'test' },
      })
    );

    expect(result.current.hasDraft).toBe(false);
    expect(result.current.recoveredDraft).toBeNull();
  });

  it('should clear draft when clearDraft is called', () => {
    const { result } = renderHook(() =>
      useDraftSave({
        draftKey: 'test-form',
        data: { name: 'test' },
      })
    );

    // Save a draft first
    act(() => {
      result.current.saveDraft();
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalled();

    // Clear the draft
    act(() => {
      result.current.clearDraft();
    });

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('vitora_draft_test-form');
    expect(result.current.isDirty).toBe(false);
  });

  it('should call saveDraft to manually save', () => {
    const { result } = renderHook(() =>
      useDraftSave({
        draftKey: 'test-form',
        data: { name: 'test' },
      })
    );

    act(() => {
      result.current.saveDraft();
    });

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'vitora_draft_test-form',
      expect.any(String)
    );
    expect(result.current.lastSaved).not.toBeNull();
  });

  it('should not save when disabled', () => {
    const { result } = renderHook(() =>
      useDraftSave({
        draftKey: 'test-form',
        data: { name: 'test' },
        enabled: false,
      })
    );

    act(() => {
      result.current.saveDraft();
    });

    // saveDraft should not save when disabled
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });
});
