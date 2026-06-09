'use client';

/**
 * LicenseGuard — redirects to /activate when:
 * 1. Running in desktop mode (Tauri)
 * 2. No license token is stored
 *
 * Renders nothing visually. Add inside the dashboard layout.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isDesktop } from '@/lib/desktop';
import { licensingApi } from '@/lib/api/licensing';

export function LicenseGuard() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isDesktop()) {
      setChecked(true);
      return;
    }

    // Check if we have a license token (async to check keystore)
    licensingApi.getStoredTokenAsync().then((token) => {
      if (!token) {
        router.replace('/activate');
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  // Don't block rendering — this is advisory, not a hard gate
  if (!checked && isDesktop()) {
    return null;
  }

  return null;
}
