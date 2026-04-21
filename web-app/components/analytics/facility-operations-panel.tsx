'use client';

import { useMemo } from 'react';
import { AlertTriangle, ArrowRightLeft, BedDouble, FileClock } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Skeleton } from '@/components/ui/skeleton';
import { usePharmacyQueueProjection, useWardOccupancyProjection } from '@/lib/hooks/use-analytics';
import type { WardOccupancyProjectionRow } from '@/lib/types/analytics';

function getOccupancyTone(rate: number) {
  if (rate >= 90) return 'text-destructive';
  if (rate >= 75) return 'text-warning';
  return 'text-success';
}

export function FacilityOperationsPanel() {
  const { data: wards = [], isLoading: wardsLoading } = useWardOccupancyProjection();
  const { data: pharmacyRows = [], isLoading: pharmacyLoading } = usePharmacyQueueProjection();

  const wardSummary = useMemo(() => {
    return wards.reduce(
      (acc, ward) => {
        acc.totalBeds += ward.total_beds;
        acc.occupiedBeds += ward.occupied_beds;
        acc.availableBeds += ward.available_beds;
        acc.admissionsToday += ward.admissions_today;
        acc.dischargesToday += ward.discharges_today;
        return acc;
      },
      {
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        admissionsToday: 0,
        dischargesToday: 0,
      }
    );
  }, [wards]);

  const averageOccupancy = wardSummary.totalBeds > 0
    ? Number(((wardSummary.occupiedBeds / wardSummary.totalBeds) * 100).toFixed(1))
    : 0;

  const pharmacy = pharmacyRows[0];

  return (
    <section className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold sm:text-xl">Bed & Pharmacy Snapshot</h2>
        <p className="text-sm text-muted-foreground">
          Live facility-level projections for ward occupancy and the dispensing backlog.
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Avg Ward Occupancy"
          value={wardsLoading ? '—' : `${averageOccupancy}%`}
          description="Occupied beds across tracked wards"
          icon={BedDouble}
          variant={averageOccupancy >= 85 ? 'warning' : 'info'}
          loading={wardsLoading}
          showTrendIndicator={false}
          href="/inpatient/bed-board"
        />
        <StatsCard
          title="Available Beds"
          value={wardsLoading ? '—' : wardSummary.availableBeds}
          meta={wardsLoading ? undefined : `${wardSummary.totalBeds} total beds`}
          description="Capacity open for new admissions"
          icon={ArrowRightLeft}
          variant="success"
          loading={wardsLoading}
          showTrendIndicator={false}
          href="/inpatient/bed-board"
        />
        <StatsCard
          title="Pending Prescriptions"
          value={pharmacyLoading ? '—' : pharmacy?.pending_prescriptions ?? 0}
          meta={pharmacyLoading ? undefined : `${pharmacy?.dispensed_today ?? 0} dispensed today`}
          description="Current pharmacy dispensing queue"
          icon={FileClock}
          variant={(pharmacy?.pending_prescriptions ?? 0) > 0 ? 'warning' : 'default'}
          loading={pharmacyLoading}
          showTrendIndicator={false}
          href="/pharmacy"
        />
        <StatsCard
          title="Critical Stock Alerts"
          value={pharmacyLoading ? '—' : pharmacy?.critical_stock_count ?? 0}
          meta={pharmacyLoading ? undefined : `${pharmacy?.low_stock_count ?? 0} low stock items`}
          description="Items needing urgent pharmacy action"
          icon={AlertTriangle}
          variant={(pharmacy?.critical_stock_count ?? 0) > 0 ? 'destructive' : 'default'}
          loading={pharmacyLoading}
          showTrendIndicator={false}
          href="/pharmacy"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Ward occupancy</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable<WardOccupancyProjectionRow>
              data={wards}
              keyExtractor={(ward) => `${ward.ward_id}-${ward.last_updated}`}
              isLoading={wardsLoading}
              emptyMessage="No ward occupancy projections are available yet."
              columns={[
                {
                  key: 'ward_id',
                  header: 'Ward',
                  sortable: true,
                  sortType: 'number',
                  cell: (ward) => <span className="font-medium">Ward {ward.ward_id}</span>,
                },
                {
                  key: 'occupancy_rate',
                  header: 'Occupancy',
                  sortable: true,
                  sortType: 'number',
                  cell: (ward) => (
                    <div className="min-w-[9rem] space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className={getOccupancyTone(ward.occupancy_rate)}>{ward.occupancy_rate}%</span>
                        <span className="font-medium">{ward.occupied_beds}/{ward.total_beds}</span>
                      </div>
                      <Progress value={ward.occupancy_rate} className="h-2" />
                    </div>
                  ),
                },
                {
                  key: 'available_beds',
                  header: 'Available Beds',
                  sortable: true,
                  sortType: 'number',
                },
                {
                  key: 'admissions_today',
                  header: 'Admissions',
                  sortable: true,
                  sortType: 'number',
                },
                {
                  key: 'discharges_today',
                  header: 'Discharges',
                  sortable: true,
                  sortType: 'number',
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(ward) => (
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">Ward {ward.ward_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {ward.occupied_beds} occupied of {ward.total_beds}
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${getOccupancyTone(ward.occupancy_rate)}`}>
                        {ward.occupancy_rate}%
                      </span>
                    </div>
                    <Progress value={ward.occupancy_rate} className="h-2" />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Available</div>
                        <div className="font-medium">{ward.available_beds}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Admissions</div>
                        <div className="font-medium">{ward.admissions_today}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Discharges</div>
                        <div className="font-medium">{ward.discharges_today}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Pharmacy queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pharmacyLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !pharmacy ? (
              <p className="text-sm text-muted-foreground">
                Pharmacy queue metrics will appear once dispensing activity starts publishing projections.
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-border/60 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Dispensing backlog</div>
                  <div className="mt-2 text-3xl font-semibold">{pharmacy.pending_prescriptions}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {pharmacy.dispensed_today} prescriptions dispensed today
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Critical stock</div>
                    <div className="mt-2 text-2xl font-semibold text-destructive">{pharmacy.critical_stock_count}</div>
                  </div>
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Low stock</div>
                    <div className="mt-2 text-2xl font-semibold">{pharmacy.low_stock_count}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Projection updated {new Date(pharmacy.last_updated).toLocaleTimeString('en-KE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
