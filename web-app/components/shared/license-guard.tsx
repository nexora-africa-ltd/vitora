'use client';

/**
 * LicenseGuard — blocks dashboard rendering and redirects to /activate when:
 * 1. Running in desktop mode (Tauri)
 * 2. No license token is stored
 *
 * In browser mode, passes through immediately.
 * Wrap children in this component to enforce the license gate.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isDesktop } from '@/lib/desktop';
import { licensingApi } from '@/lib/api/licensing';

export function LicenseGuard({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const [licensed, setLicensed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDesktop()) {
      setLicensed(true);
      return;
    }

    licensingApi.getStoredTokenAsync().then((token) => {
      if (!token) {
        router.replace('/activate');
      } else {
        setLicensed(true);
      }
    });
  }, [router]);

  // In browser mode or once licensed, render children
  if (licensed) {
    return <>{children}</>;
  }

  // Desktop mode, still checking or redirecting — block rendering
  return null;
}
