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
  BedDouble,
  ArrowRight,
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
  WaitTimeBreachBanner,
} from '@/components/emergency';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useZonesSummary, useCriticalPatients, useERBedSummary, useWaitTimeBreaches, useBreachActions } from '@/lib/hooks/use-triage';
import { ER_BED_STATUS_CONFIG } from '@/lib/types/triage';
import type { ERBedStatus } from '@/lib/types/triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { cn } from '@/lib/utils/cn';
import { ZONE_ROUTES } from '@/lib/config/emergency';

// =============================================================================
// BED BOARD PANEL (inline overview section)
// =============================================================================

function BedBoardPanel() {
  const router = useRouter();
  const { data: summaryData, isLoading } = useERBedSummary();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-16 ml-auto" />
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!summaryData || summaryData.length === 0) return null;

  const totals = summaryData.reduce(
    (acc, z) => ({
      beds: acc.beds + z.total_beds,
      available: acc.available + z.available,
      occupied: acc.occupied + z.occupied,
      cleaning: acc.cleaning + z.cleaning,
      oos: acc.oos + z.out_of_service,
    }),
    { beds: 0, available: 0, occupied: 0, cleaning: 0, oos: 0 }
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BedDouble className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Bed Board</h2>
        <Badge variant="secondary" className="ml-1 tabular-nums">
          {totals.occupied}/{totals.beds}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1 text-xs"
          onClick={() => router.push('/emergency/bed-board')}
        >
          <span className="hidden sm:inline">View full board</span>
          <span className="sm:hidden">View</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Per-zone occupancy bars */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {summaryData.map((zone) => {
          const pct = zone.total_beds > 0 ? Math.round((zone.occupied / zone.total_beds) * 100) : 0;
          return (
            <Card
              key={zone.zone}
              className="p-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push('/emergency/bed-board')}
            >
              <p className="text-xs font-medium truncate">{zone.zone_display}</p>
              <div className="flex items-end justify-between mt-1.5">
                <span className="text-lg font-bold tabular-nums leading-none">
                  {zone.occupied}<span className="text-xs font-normal text-muted-foreground">/{zone.total_beds}</span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
              </div>
              {/* Mini bar */}
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {/* Status chips */}
              <div className="flex gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                <span>{zone.available} free</span>
                {zone.cleaning > 0 && <span>· {zone.cleaning} clean</span>}
                {zone.out_of_service > 0 && <span>· {zone.out_of_service} OOS</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

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

  // Breach data
  const {
    data: breachesData,
    isLoading: breachesLoading,
  } = useWaitTimeBreaches({ activeOnly: true, refetchInterval: 30_000 });

  const { acknowledgeBreach, isLoading: ackLoading } = useBreachActions();

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

        {/* Wait Time Breach Banner */}
        {breachesLoading ? null : breachesData && breachesData.results.length > 0 && (
          <WaitTimeBreachBanner
            breaches={breachesData.results.map((b) => ({
              id: b.id,
              triage_assessment: b.triage_assessment,
              patient_name: b.patient_name,
              patient_mrn: b.patient_mrn,
              triage_category: b.triage_category,
              severity: b.severity as import('@/lib/types/triage').BreachSeverity,
              target_wait_minutes: b.target_wait_minutes,
              actual_wait_minutes: b.actual_wait_minutes,
              assigned_area: b.assigned_area,
              assigned_area_display: b.assigned_area_display || '',
              acknowledged: !!b.acknowledged_at,
            }))}
            isLoading={breachesLoading}
            onViewPatient={(triageId) => router.push(`/triage/${triageId}`)}
            onAcknowledge={(breachId) => acknowledgeBreach({ breachId, notes: 'Acknowledged from dashboard' })}
            acknowledgeLoading={ackLoading}
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

        {/* ER Bed Board Panel */}
        <BedBoardPanel />

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
