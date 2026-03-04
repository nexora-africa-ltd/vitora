/**
 * Emergency Department Layout
 *
 * Provides horizontal zone tabs for quick navigation between ER zones.
 * Tabs show badge counts per zone from WebSocket/polling data.
 * Mobile: horizontal scroll for tab overflow.
 *
 * Phase 2: Zone-Specific Views
 */
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { ZONE_METADATA, CATEGORY_COLORS } from '@/lib/config/emergency';
import { useZonesSummary } from '@/lib/hooks/use-triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import type { TriageCategory } from '@/lib/types/triage';

export default function EmergencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Real-time zone counts via WebSocket, polling fallback
  const {
    isConnected,
    zonesData: wsZonesData,
  } = useEmergencySocket();

  const { data: polledZonesData } = useZonesSummary({ enabled: !isConnected });

  const zonesData = useMemo(() => {
    if (isConnected && wsZonesData) return wsZonesData;
    return polledZonesData;
  }, [isConnected, wsZonesData, polledZonesData]);

  // Build zone count map from API data
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (zonesData?.zones) {
      for (const zone of zonesData.zones) {
        counts[zone.code] = zone.total;
      }
    }
    return counts;
  }, [zonesData]);

  // Determine the active zone from pathname
  const activeSegment = useMemo(() => {
    // /emergency → 'dashboard', /emergency/resus → 'resus', etc.
    const parts = pathname.split('/');
    const emergencyIdx = parts.indexOf('emergency');
    if (emergencyIdx >= 0 && parts.length > emergencyIdx + 1) {
      return parts[emergencyIdx + 1];
    }
    return 'dashboard';
  }, [pathname]);

  const isOnZonePage = activeSegment !== 'dashboard';

  return (
    <div className="space-y-0">
      {/* Zone Tabs - only show when we're in a zone page or always for navigation */}
      {isOnZonePage && (
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <div className="overflow-x-auto scrollbar-hide">
            <nav
              className="flex gap-1 px-2 py-1.5 min-w-max"
              aria-label="Emergency zone tabs"
            >
              {/* Dashboard tab */}
              <button
                onClick={() => router.push('/emergency')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  activeSegment === 'dashboard'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                Overview
                {zonesData && (
                  <Badge variant="secondary" className="h-5 min-w-[1.25rem] px-1 text-xs">
                    {zonesData.total_patients}
                  </Badge>
                )}
              </button>

              {/* Zone tabs */}
              {ZONE_METADATA.map((zone) => {
                const isActive = activeSegment === zone.route;
                const count = zoneCounts[zone.code] ?? 0;
                const categoryColor = CATEGORY_COLORS[zone.primaryCategory];

                return (
                  <button
                    key={zone.route}
                    onClick={() => router.push(`/emergency/${zone.route}`)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {/* Short label on mobile, full on sm+ */}
                    <span className="sm:hidden">{zone.shortLabel}</span>
                    <span className="hidden sm:inline">{zone.label}</span>
                    {count > 0 && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'h-5 min-w-[1.25rem] px-1 text-xs',
                          !isActive && categoryColor.bg,
                          !isActive && categoryColor.text,
                        )}
                      >
                        {count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Page content */}
      <div className={cn(isOnZonePage && 'pt-4')}>
        {children}
      </div>
    </div>
  );
}
