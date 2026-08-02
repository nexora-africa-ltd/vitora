'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFacility } from '@/lib/context/facility-context';

const STORAGE_KEY_PREFIX = 'vitora:interfacility-transfers:facility:';

function getStorageKey(facilityId: number | null): string | null {
  if (!facilityId) {
    return null;
  }
  return `${STORAGE_KEY_PREFIX}${facilityId}`;
}

export interface InterfacilityTransfersPreference {
  isEnabled: boolean;
  isSystemEnabled: boolean;
  localOverride: boolean;
  setLocalOverride: (enabled: boolean) => void;
}

export function useInterfacilityTransfersPreference(): InterfacilityTransfersPreference {
  const { hasModule, facility } = useFacility();
  const [localOverride, setLocalOverrideState] = useState(true);

  const storageKey = useMemo(() => getStorageKey(facility?.id ?? null), [facility?.id]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      setLocalOverrideState(true);
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (raw === 'false') {
      setLocalOverrideState(false);
      return;
    }

    setLocalOverrideState(true);
  }, [storageKey]);

  const setLocalOverride = useCallback(
    (enabled: boolean) => {
      setLocalOverrideState(enabled);
      if (!storageKey || typeof window === 'undefined') {
        return;
      }

      if (enabled) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(storageKey, 'false');
    },
    [storageKey]
  );

  const isSystemEnabled = hasModule('inpatient');

  return {
    isEnabled: isSystemEnabled && localOverride,
    isSystemEnabled,
    localOverride,
    setLocalOverride,
  };
}

export function useInterfacilityTransfersEnabled(): boolean {
  const { isEnabled } = useInterfacilityTransfersPreference();
  return isEnabled;
}
