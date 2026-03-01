/**
 * Theatre Module Layout
 *
 * Gates the theatre module behind the ENABLE_THEATRE feature flag.
 * When the flag is disabled (production default), users who navigate
 * to /theatre/* are redirected to the dashboard.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ENABLE_THEATRE } from '@/lib/utils/constants';

export default function TheatreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!ENABLE_THEATRE) {
      router.replace('/');
    }
  }, [router]);

  if (!ENABLE_THEATRE) {
    return null;
  }

  return <>{children}</>;
}
