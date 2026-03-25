'use client';

import { useEffect, useState } from 'react';
import SystemBanner from '@/components/ui/system-banner';
import { useFacility } from '@/lib/context/facility-context';

/**
 * Facility Banner
 *
 * Displays a persistent banner showing the facility the user is operating in.
 * - Normal (assigned facility): subtle teal banner with facility name
 * - Override (dev/superuser): purple warning banner to prevent mistakes
 */
export function FacilityBanner() {
  const [mounted, setMounted] = useState(false);
  const { facility, isUsingFacilityOverride } = useFacility();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !facility) {
    return null;
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
