'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SystemBanner from '@/components/ui/system-banner';
import { useFacility } from '@/lib/context/facility-context';
import { useAuth } from '@/lib/auth/context';

/** Routes where facility banner should not render */
const HIDDEN_PATHS = ['/login', '/signup', '/onboarding', '/setup'];

/**
 * Facility Banner
 *
 * Displays a persistent banner showing the facility the user is operating in.
 * - Normal (assigned facility): subtle teal banner with facility name
 * - Override (dev/superuser): purple warning banner to prevent mistakes
 * Hidden on login, signup, onboarding, and setup pages.
 */
export function FacilityBanner() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { facility, isUsingFacilityOverride, isLoading } = useFacility();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hide on public/auth pages or when not authenticated
  if (!mounted || isLoading || !isAuthenticated || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) {
    return null;
  }

  // No facility assigned — warn the user
  if (!facility) {
    return (
      <SystemBanner
        text="No facility assigned — some modules are hidden. Contact your administrator."
        color="bg-amber-600"
        size="xs"
        show={true}
      />
    );
  }

  const isOverride = isUsingFacilityOverride;

  return (
    <SystemBanner
      text={isOverride ? `⚠ Override: ${facility.name}` : facility.name}
      color={isOverride ? 'bg-purple-600' : 'bg-teal-600'}
      size="xs"
      show={true}
    />
  );
}
