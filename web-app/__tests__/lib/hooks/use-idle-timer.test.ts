/**
 * TDD Tests for useIdleTimer Hook
 *
 * DHA Compliance: Frontend Auto-Logoff (P1)
 * Tests the idle timer functionality for automatic session timeout
 */
import { renderHook, act } from '@testing-library/react';
import { useIdleTimer, formatCountdown } from '@/lib/hooks/use-idle-timer';

// Mock timers
jest.useFakeTimers();

// Mock localStorage
const localStorageMock = (() => {
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
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useIdleTimer', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should initialize with warning state as false', () => {
    const { result } = renderHook(() => useIdleTimer({ enabled: true }));

    expect(result.current.isWarning).toBe(false);
    expect(result.current.isIdle).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);
  });

  it('should trigger warning after configured timeout', () => {
    const onWarning = jest.fn();
    const warningTimeout = 5000; // 5 seconds for testing

    const { result } = renderHook(() =>
      useIdleTimer({
        warningTimeout,
        logoutTimeout: 10000, // 10 seconds
        onWarning,
        enabled: true,
      })
    );

    // Initially not warning
    expect(result.current.isWarning).toBe(false);

    // Advance time past warning threshold
    act(() => {
      jest.advanceTimersByTime(warningTimeout + 100);
    });

    // Should now be in warning state
    expect(result.current.isWarning).toBe(true);
    expect(result.current.isIdle).toBe(true);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it('should trigger logout after logout timeout', () => {
    const onLogout = jest.fn();
    const onWarning = jest.fn();
    const warningTimeout = 5000;
    const logoutTimeout = 10000;

    renderHook(() =>
      useIdleTimer({
        warningTimeout,
        logoutTimeout,
        onLogout,
        onWarning,
        enabled: true,
      })
    );

    // Advance time past the full logout timeout in one go
    act(() => {
      jest.advanceTimersByTime(logoutTimeout + 1000);
    });

    // Should have called both onWarning and onLogout
    expect(onWarning).toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('should reset timer when resetTimer is called', () => {
    const onWarning = jest.fn();
    const onLogout = jest.fn();
    const warningTimeout = 5000;
    const logoutTimeout = 10000;

    const { result } = renderHook(() =>
      useIdleTimer({
        warningTimeout,
        logoutTimeout,
        onWarning,
        onLogout,
        enabled: true,
      })
    );

    // Advance to warning state
    act(() => {
      jest.advanceTimersByTime(warningTimeout + 100);
    });

    expect(result.current.isWarning).toBe(true);
    const warningCallsAfterFirst = onWarning.mock.calls.length;

    // Reset the timer
    act(() => {
      result.current.resetTimer();
    });

    // Warning should be dismissed
    expect(result.current.isWarning).toBe(false);
    expect(result.current.isIdle).toBe(false);

    // localStorage should be updated with dismissed timestamp
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'vitora_idle_warning_dismissed',
      expect.any(String)
    );
  });

  it('should persist last activity to localStorage for cross-tab sync', () => {
    renderHook(() =>
      useIdleTimer({
        warningTimeout: 5000,
        logoutTimeout: 10000,
        enabled: true,
      })
    );

    // Simulate user activity
    act(() => {
      window.dispatchEvent(new Event('mousedown'));
    });

    // Should have stored last activity
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'vitora_last_activity',
      expect.any(String)
    );
  });
});

describe('formatCountdown', () => {
  it('should format seconds correctly', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(30)).toBe('0:30');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(900)).toBe('15:00');
  });

  it('should handle edge cases', () => {
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(61)).toBe('1:01');
    expect(formatCountdown(119)).toBe('1:59');
    expect(formatCountdown(3599)).toBe('59:59');
  });
});
