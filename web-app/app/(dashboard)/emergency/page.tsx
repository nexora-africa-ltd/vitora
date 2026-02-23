/**
 * Emergency Department Dashboard
 * 
 * Landing page for the Emergency Module showing:
 * - Critical patient alerts (RED patients)
 * - Zone summary cards with patient counts by category
 * - Quick navigation to zone-specific views
 * 
 * Features:
 * - Real-time updates via WebSocket (5-second server push)
 * - Automatic fallback to polling if WebSocket unavailable
 * - Live status indicator
 * 
 * Route: /emergency
 */
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import {
  CriticalAlertBanner,
  CriticalAlertSkeleton,
  ZoneCard,
  ZoneCardSkeleton,
} from '@/components/emergency';
import { useZonesSummary, useCriticalPatients } from '@/lib/hooks/use-triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ZONE_ROUTES } from '@/lib/config/emergency';

export default function EmergencyDashboardPage() {
  const router = useRouter();
  const { isRefreshing, refresh } = usePageRefresh();

  // WebSocket for real-time updates (primary)
  const {
    connectionState,
    isConnected,
    criticalData: wsCriticalData,
    zonesData: wsZonesData,
    lastUpdate,
  } = useEmergencySocket();

  // Polling fallback - only fetch if WebSocket not connected
  // When WebSocket is connected, these queries are invalidated by WS events
  const {
    data: polledZonesData,
    isLoading: zonesLoading,
    refetch: refetchZones,
  } = useZonesSummary({ enabled: !isConnected });

  const { data: polledCriticalData, isLoading: criticalLoading, refetch: refetchCritical } = useCriticalPatients({
    enabled: !isConnected,
  });

  // Use WebSocket data when available, fall back to polled data
  const zonesData = useMemo(() => {
    if (isConnected && wsZonesData) {
      return wsZonesData;
    }
    return polledZonesData;
  }, [isConnected, wsZonesData, polledZonesData]);

  const criticalData = useMemo(() => {
    if (isConnected && wsCriticalData) {
      return wsCriticalData;
    }
    return polledCriticalData;
  }, [isConnected, wsCriticalData, polledCriticalData]);

  const handleZoneClick = (zoneCode: string) => {
    const route = ZONE_ROUTES[zoneCode];
    if (route) {
      router.push(`/emergency/${route}`);
    }
  };

  const handleRefresh = async () => {
    // Even with WebSocket, pull-to-refresh triggers a manual refetch
    await Promise.all([refetchZones(), refetchCritical()]);
    refresh();
  };

  const handleViewPatient = (patient: {
    id: number;
    encounter_id?: number;
    encounter_status?: string;
  }) => {
    // Route to encounter if it exists (all triaged patients have an encounter)
    // Fall back to triage assessment if encounter_id is missing (shouldn't happen)
    if (patient.encounter_id) {
      router.push(`/encounters/${patient.encounter_id}`);
    } else {
      router.push(`/triage/${patient.id}`);
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        {/* Page Header with Live Status */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Emergency Department"
            helpContent="Real-time overview of all ER zones. Critical patients are highlighted at the top. Click any zone card to view its queue."
          />
          {/* Live status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border">
            <WebSocketStatus
              connectionState={connectionState}
              showLabel
              size="sm"
              lastUpdate={lastUpdate}
            />
          </div>
        </div>

        {/* Critical Alert Banner */}
        {criticalLoading && !isConnected && <CriticalAlertSkeleton />}
        {criticalData && criticalData.count > 0 && (
          <CriticalAlertBanner
            patients={criticalData.patients}
            onViewPatient={handleViewPatient}
          />
        )}

        {/* Zone Summary Grid */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">ER Zones</h2>
            {zonesData && (
              <Badge variant="secondary" className="ml-auto">
                {zonesData.total_patients} total patients
              </Badge>
            )}
          </div>

          {zonesLoading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <ZoneCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {zonesData?.zones.map((zone) => (
                <ZoneCard
                  key={zone.code}
                  zone={zone}
                  onNavigate={handleZoneClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Empty state when no zones data */}
        {!zonesLoading && (!zonesData || zonesData.zones.length === 0) && (
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Zone Data Available</h3>
            <p className="text-muted-foreground">
              {isConnected
                ? 'Waiting for data from server...'
                : 'Unable to load ER zone information. Pull down to refresh.'}
            </p>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
