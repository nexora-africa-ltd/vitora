'use client';

import { useEffect, useState } from 'react';
import SystemBanner from '@/components/ui/system-banner';
import { APP_ENV } from '@/lib/utils/constants';

/**
 * Demo Mode Banner
 *
 * Displays a minimal banner when the app is running in staging/demo mode.
 * Uses the system-banner component for a less distracting UI.
 */
export function DemoBanner() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine if we should show the banner
  const isDemo = APP_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  if (!mounted || !isDemo) {
    return null;
  }

  const demoFacility = process.env.NEXT_PUBLIC_DEMO_FACILITY || 'Demo';

  return (
    <SystemBanner
      text={`${demoFacility} - DEMO`}
      color="bg-amber-500"
      size="xs"
      show={true}
    />
  );
}

/**
 * Demo Watermark - kept minimal
 */
export function DemoWatermark() {
  return null; // Disabled for less distraction
}
