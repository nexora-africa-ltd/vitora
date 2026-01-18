/**
 * Tests for useAutoSave hook
 * Verifies auto-save functionality with debouncing and network awareness
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoSave } from '@/lib/hooks/use-auto-save';

// Mock the dependencies
jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T, _delay: number) => value,
}));

let mockIsOnline = true;
jest.mock('@/lib/hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline, wasOffline: false }),
}));

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsOnline = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start with idle status', () => {
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        enabled: true,
      })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.lastSaved).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should call saveNow immediately and update status', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        onSuccess,
        enabled: true,
      })
    );

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.saveNow();
    });

    expect(onSave).toHaveBeenCalledWith({ name: 'test' });
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSaved).not.toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it('should handle save errors and set error status', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('Network error'));
    const onError = jest.fn();

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        onError,
        enabled: true,
      })
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(onSave).toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should reset state when reset is called', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        enabled: true,
      })
    );

    // Trigger an error
    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Failed');

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.pendingCount).toBe(0);
  });

  it('should queue save when offline and set offline status', async () => {
    mockIsOnline = false;
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        enabled: true,
      })
    );

    await act(async () => {
      await result.current.saveNow();
    });

    // Should NOT call onSave when offline
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.status).toBe('offline');
    expect(result.current.pendingCount).toBe(1);
  });

  it('should not save when disabled', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        enabled: false,
      })
    );

    // Even with saveNow, it should work (saveNow bypasses enabled check for manual saves)
    // But auto-save shouldn't trigger
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('should provide pendingCount for offline queue', async () => {
    mockIsOnline = false;
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'queued' },
        onSave,
        enabled: true,
      })
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.status).toBe('offline');
  });

  it('should expose lastSaved timestamp after successful save', async () => {
    mockIsOnline = true;
    const onSave = jest.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutoSave({
        data: { name: 'test' },
        onSave,
        enabled: true,
      })
    );

    // Initially null
    expect(result.current.lastSaved).toBeNull();

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.lastSaved).toBeInstanceOf(Date);
    expect(result.current.lastSaved!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
