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
  ArrowRight,
  Users,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import { CriticalAlertBanner } from '@/components/emergency/critical-alert-banner';
import { useZonesSummary, useCriticalPatients } from '@/lib/hooks/use-triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { cn } from '@/lib/utils/cn';
import type { TriageCategory } from '@/lib/types/triage';

// Zone route mapping
const ZONE_ROUTES: Record<string, string> = {
  ER_RESUS: 'resus',
  ER_ACUTE: 'acute',
  TRAUMA: 'trauma',
  ER_FAST_TRACK: 'fast-track',
  OBSERVATION: 'observation',
  PEDIATRIC_ER: 'pediatric',
  MATERNITY: 'maternity',
};

// Category colors
const CATEGORY_COLORS: Record<TriageCategory, { bg: string; text: string; border: string }> = {
  RED: {
    bg: 'bg-red-100 dark:bg-red-950/50',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  ORANGE: {
    bg: 'bg-orange-100 dark:bg-orange-950/50',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
  },
  YELLOW: {
    bg: 'bg-yellow-100 dark:bg-yellow-950/50',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  GREEN: {
    bg: 'bg-green-100 dark:bg-green-950/50',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  BLUE: {
    bg: 'bg-blue-100 dark:bg-blue-950/50',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
};

// Category emoji indicators
const CATEGORY_EMOJI: Record<TriageCategory, string> = {
  RED: '🔴',
  ORANGE: '🟠',
  YELLOW: '🟡',
  GREEN: '🟢',
  BLUE: '🔵',
};

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

  const { data: polledCriticalData, refetch: refetchCritical } = useCriticalPatients({
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

  const handleViewPatient = (patientId: number) => {
    // Navigate to triage queue with the patient highlighted
    router.push(`/triage?highlight=${patientId}`);
  };

  // Format last update time
  const lastUpdateText = useMemo(() => {
    if (!lastUpdate) return null;
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  }, [lastUpdate]);

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        {/* Page Header with Live Status */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Emergency Department"
            helpContent="Real-time overview of all ER zones. Critical patients are highlighted at the top. Click any zone card to view its queue."
          />
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border">
              <WebSocketStatus
                connectionState={connectionState}
                showLabel={false}
                size="sm"
              />
              <span className="text-sm font-medium">
                {isConnected ? (
                  <span className="text-green-600 dark:text-green-400">
                    Live
                    {lastUpdateText && (
                      <span className="text-muted-foreground font-normal ml-1">
                        · {lastUpdateText}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {connectionState === 'connecting' || connectionState === 'reconnecting'
                      ? 'Connecting...'
                      : 'Polling'}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Critical Alert Banner */}
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
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {zonesData?.zones.map((zone) => {
                const primaryCategory = zone.primary_category as TriageCategory;
                const categoryColors = CATEGORY_COLORS[primaryCategory] || CATEGORY_COLORS.GREEN;
                const hasPatients = zone.total > 0;

                return (
                  <Card
                    key={zone.code}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      'border-2',
                      hasPatients ? categoryColors.border : 'border-muted'
                    )}
                    onClick={() => handleZoneClick(zone.code)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>{zone.name}</span>
                        {hasPatients && (
                          <span className="text-lg">
                            {CATEGORY_EMOJI[primaryCategory] || '⚪'}
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Patient count */}
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'text-2xl font-bold',
                            hasPatients ? categoryColors.text : 'text-muted-foreground'
                          )}
                        >
                          {zone.total} pts
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Cap: {zone.capacity}
                        </span>
                      </div>

                      {/* Category breakdown (if patients) */}
                      {hasPatients && (
                        <div className="flex flex-wrap gap-1">
                          {(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'] as TriageCategory[]).map(
                            (cat) =>
                              zone.by_category[cat] > 0 && (
                                <Badge
                                  key={cat}
                                  variant="secondary"
                                  className={cn(
                                    'text-xs',
                                    CATEGORY_COLORS[cat].bg,
                                    CATEGORY_COLORS[cat].text
                                  )}
                                >
                                  {CATEGORY_EMOJI[cat]} {zone.by_category[cat]}
                                </Badge>
                              )
                          )}
                        </div>
                      )}

                      {/* Enter button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleZoneClick(zone.code);
                        }}
                      >
                        Enter
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
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
