'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SystemBanner from '@/components/ui/system-banner';
import { APP_ENV } from '@/lib/utils/constants';

/** Routes where banners should not render */
const HIDDEN_PATHS = ['/login', '/signup', '/onboarding', '/setup'];

/**
 * Demo Mode Banner
 *
 * Displays a minimal banner when the app is running in staging/demo mode.
 * Uses the system-banner component for a less distracting UI.
 * Hidden on login, signup, onboarding, and setup pages.
 */
export function DemoBanner() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine if we should show the banner
  const isDemo = APP_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  if (!mounted || !isDemo || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) {
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
