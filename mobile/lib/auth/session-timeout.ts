import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/lib/auth/auth-context';
import { getBiometricStatus, promptForBiometricUnlock, setBiometricUnlockEnabled, type BiometricStatus } from '@/lib/auth/biometric';

const SESSION_TIMEOUT_KEY = 'vitora.mobile.session-timeout-ms';
const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60_000;
const SESSION_CHECK_INTERVAL_MS = 15_000;

type SessionTimeoutContextValue = {
  biometric: BiometricStatus | null;
  clearLock: () => void;
  isLocked: boolean;
  isUnlocking: boolean;
  lockSession: () => void;
  recordActivity: () => void;
  refreshSecurityState: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setTimeoutMs: (value: number) => Promise<void>;
  timeoutMs: number;
  unlockWithBiometrics: () => Promise<{ success: boolean; error?: string }>;
};

const SessionTimeoutContext = createContext<SessionTimeoutContextValue | undefined>(undefined);

export const SESSION_TIMEOUT_OPTIONS = [
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: DEFAULT_SESSION_TIMEOUT_MS },
  { label: '10 minutes', value: 10 * 60_000 },
  { label: '15 minutes', value: 15 * 60_000 },
] as const;

export function shouldAutoLock(lastActivityAt: number, now: number, timeoutMs: number): boolean {
  return now - lastActivityAt >= timeoutMs;
}

async function getStoredTimeoutMs(): Promise<number> {
  const rawValue = await AsyncStorage.getItem(SESSION_TIMEOUT_KEY);
  const parsed = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TIMEOUT_MS;
}

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrating } = useAuth();
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [timeoutMs, setTimeoutMsState] = useState(DEFAULT_SESSION_TIMEOUT_MS);
  const lastActivityAtRef = useRef(Date.now());
  const lastBackgroundedAtRef = useRef<number | null>(null);

  async function refreshSecurityState() {
    setBiometric(await getBiometricStatus());
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const [storedTimeout, biometricStatus] = await Promise.all([
        getStoredTimeoutMs(),
        getBiometricStatus(),
      ]);

      if (!active) {
        return;
      }

      setTimeoutMsState(storedTimeout);
      setBiometric(biometricStatus);
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    if (!isAuthenticated) {
      setIsLocked(false);
      lastActivityAtRef.current = Date.now();
      return;
    }

    lastActivityAtRef.current = Date.now();
  }, [isAuthenticated, isHydrating]);

  useEffect(() => {
    if (!isAuthenticated || isLocked) {
      return;
    }

    const intervalId = setInterval(() => {
      if (shouldAutoLock(lastActivityAtRef.current, Date.now(), timeoutMs)) {
        setIsLocked(true);
      }
    }, SESSION_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, isLocked, timeoutMs]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active') {
        const lastBackgroundedAt = lastBackgroundedAtRef.current;
        lastBackgroundedAtRef.current = null;

        if (lastBackgroundedAt != null && shouldAutoLock(lastBackgroundedAt, Date.now(), timeoutMs)) {
          setIsLocked(true);
          return;
        }

        lastActivityAtRef.current = Date.now();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, timeoutMs]);

  function recordActivity() {
    if (!isAuthenticated || isLocked) {
      return;
    }

    lastActivityAtRef.current = Date.now();
  }

  function clearLock() {
    setIsLocked(false);
    lastActivityAtRef.current = Date.now();
  }

  function lockSession() {
    if (!isAuthenticated) {
      return;
    }

    setIsLocked(true);
  }

  async function unlockWithBiometrics() {
    setIsUnlocking(true);

    try {
      const result = await promptForBiometricUnlock();
      if (result.success) {
        clearLock();
      }

      return result;
    } finally {
      setIsUnlocking(false);
    }
  }

  async function setTimeoutMs(value: number) {
    await AsyncStorage.setItem(SESSION_TIMEOUT_KEY, String(value));
    setTimeoutMsState(value);
    lastActivityAtRef.current = Date.now();
  }

  async function setBiometricEnabled(enabled: boolean) {
    await setBiometricUnlockEnabled(enabled);
    await refreshSecurityState();
  }

  const contextValue = useMemo<SessionTimeoutContextValue>(
    () => ({
      biometric,
      clearLock,
      isLocked,
      isUnlocking,
      lockSession,
      recordActivity,
      refreshSecurityState,
      setBiometricEnabled,
      setTimeoutMs,
      timeoutMs,
      unlockWithBiometrics,
    }),
    [biometric, isLocked, isUnlocking, timeoutMs]
  );

  return React.createElement(SessionTimeoutContext.Provider, { value: contextValue }, children);
}

export function useSessionTimeout(): SessionTimeoutContextValue {
  const context = useContext(SessionTimeoutContext);
  if (!context) {
    throw new Error('useSessionTimeout must be used within SessionTimeoutProvider');
  }

  return context;
}

export { DEFAULT_SESSION_TIMEOUT_MS };