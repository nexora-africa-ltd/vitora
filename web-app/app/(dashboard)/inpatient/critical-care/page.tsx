'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BedDouble, Baby, HeartPulse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { inpatientApi } from '@/lib/api/inpatient';
import { useFacility } from '@/lib/context/facility-context';
import { useCriticalCareWorkflowHealth } from '@/lib/hooks/use-inpatient';
import type { Admission, CriticalCareTransferMatrixRow, CriticalCareWardLoad } from '@/lib/types/inpatient';

function WardTypeBadge({ wardType }: { wardType: string }) {
  const variant = wardType === 'ICU' ? 'destructive' : wardType === 'HDU' ? 'default' : 'secondary';
  return <Badge variant={variant}>{wardType}</Badge>;
}

export default function CriticalCareWorkflowPage() {
  const { hasModule } = useFacility();
  const { data, isLoading } = useCriticalCareWorkflowHealth(30);
  const [selectedTransferRow, setSelectedTransferRow] = useState<CriticalCareTransferMatrixRow | null>(null);
  const [selectedWard, setSelectedWard] = useState<CriticalCareWardLoad | null>(null);

  const transferRows = useMemo(
    () => (data?.transfer_matrix ?? []).slice(0, 12),
    [data?.transfer_matrix]
  );

  const transferDrilldown = useQuery({
    queryKey: ['critical-care-transfer-drilldown', selectedTransferRow?.from_ward_type, selectedTransferRow?.to_ward_type],
    enabled: Boolean(selectedTransferRow),
    queryFn: () => inpatientApi.listTransfers({
      source_ward_type: selectedTransferRow?.from_ward_type,
      destination_ward_type: selectedTransferRow?.to_ward_type,
      ordering: '-transfer_date',
      page_size: 20,
    }),
  });

  const wardAdmissionsDrilldown = useQuery({
    queryKey: ['critical-care-ward-drilldown', selectedWard?.ward_id],
    enabled: Boolean(selectedWard),
    queryFn: () => inpatientApi.listAdmissions({
      ward: selectedWard?.ward_id,
      admission_status: 'ACTIVE',
      ordering: '-admission_date',
      page_size: 20,
    }),
  });

  const transferDetails = transferDrilldown.data?.results ?? [];
  const wardAdmissions = wardAdmissionsDrilldown.data?.results ?? [];
  const criticalCareEnabled = hasModule('icu') || hasModule('hdu') || hasModule('nbu');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Critical Care Workflow Health"
        helpContent="Phase 3 monitoring dashboard for ICU/HDU/NBU transfer safety, review backlogs, and current ward load."
      />

      {!criticalCareEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Critical care modules are disabled</CardTitle>
            <CardDescription>
              Enable ICU, HDU, or NBU in facility settings to access this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/settings?tab=facility">Open Facility Settings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Critical Admissions"
              value={data?.totals.critical_admissions ?? 0}
              icon={Activity}
              variant="info"
              description="Active ICU/HDU/NBU census"
              href="/inpatient/bed-board"
              showTrendIndicator={false}
            />

            <StatsCard
              title="Step-Up Transfers"
              value={data?.totals.step_up_transfers ?? 0}
              icon={ArrowUpRight}
              variant="warning"
              description={`Last ${data?.period_days ?? 30} days`}
              showTrendIndicator={false}
            />

            <StatsCard
              title="Step-Down Transfers"
              value={data?.totals.step_down_transfers ?? 0}
              icon={ArrowDownRight}
              variant="success"
              description={`Last ${data?.period_days ?? 30} days`}
              showTrendIndicator={false}
            />

            <StatsCard
              title="Overdue Reviews"
              value={data?.totals.review_requests_overdue ?? 0}
              icon={AlertTriangle}
              variant={(data?.totals.review_requests_overdue ?? 0) > 0 ? 'destructive' : 'default'}
              description="Pending requests past SLA"
              href="/inpatient/reviews"
              showTrendIndicator={false}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current ICU/HDU/NBU Load</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm"><span>ICU</span><span>{data?.totals.current_icu ?? 0}</span></div>
                <div className="flex justify-between text-sm"><span>HDU</span><span>{data?.totals.current_hdu ?? 0}</span></div>
                <div className="flex justify-between text-sm"><span>NBU</span><span>{data?.totals.current_nbu ?? 0}</span></div>
                <div className="flex justify-between text-sm font-medium pt-2 border-t"><span>Total Critical</span><span>{data?.totals.critical_admissions ?? 0}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transfer Mix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm"><span>Total</span><span>{data?.totals.transfers_total ?? 0}</span></div>
                <div className="flex justify-between text-sm items-center"><span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> Step-Up</span><span>{data?.totals.step_up_transfers ?? 0}</span></div>
                <div className="flex justify-between text-sm items-center"><span className="inline-flex items-center gap-1"><ArrowDownRight className="h-3.5 w-3.5" /> Step-Down</span><span>{data?.totals.step_down_transfers ?? 0}</span></div>
                <div className="flex justify-between text-sm"><span>Lateral</span><span>{data?.totals.lateral_transfers ?? 0}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm items-center"><span className="inline-flex items-center gap-1"><HeartPulse className="h-3.5 w-3.5" /> Pending</span><span>{data?.totals.review_requests_pending ?? 0}</span></div>
                <div className="flex justify-between text-sm items-center"><span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Overdue</span><span>{data?.totals.review_requests_overdue ?? 0}</span></div>
                <p className="text-xs text-muted-foreground pt-2 border-t">Tracks urgent/STAT review backlogs across critical-care admissions.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfer Transition Matrix</CardTitle>
              <CardDescription>Most frequent source-to-destination transitions. Click a transfer count to open drill-down details.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Transfers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">No transfers recorded for this period.</TableCell>
                    </TableRow>
                  ) : transferRows.map((row) => (
                    <TableRow key={`${row.from_ward_type}-${row.to_ward_type}`}>
                      <TableCell><WardTypeBadge wardType={row.from_ward_type} /></TableCell>
                      <TableCell><WardTypeBadge wardType={row.to_ward_type} /></TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-medium"
                          onClick={() => setSelectedTransferRow(row)}
                        >
                          {row.count}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Critical-Care Ward Load</CardTitle>
              <CardDescription>Current occupancy pressure in ICU/HDU/NBU wards. Click active count to inspect current admissions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ward</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Occupancy %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.ward_load ?? []).map((ward) => (
                    <TableRow key={ward.ward_id}>
                      <TableCell className="font-medium">{ward.ward_name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          {ward.ward_type === 'ICU' ? <BedDouble className="h-3.5 w-3.5" /> : ward.ward_type === 'NBU' ? <Baby className="h-3.5 w-3.5" /> : <HeartPulse className="h-3.5 w-3.5" />}
                          <WardTypeBadge wardType={ward.ward_type} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setSelectedWard(ward)}
                        >
                          {ward.active_admissions}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">{ward.occupancy_rate.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </>
      )}

      <Dialog open={Boolean(selectedTransferRow)} onOpenChange={(open) => !open && setSelectedTransferRow(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Transfer Drill-Down</DialogTitle>
            <DialogDescription>
              {selectedTransferRow
                ? `Latest transfers from ${selectedTransferRow.from_ward_type} to ${selectedTransferRow.to_ward_type}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {transferDrilldown.isFetching ? (
            <Skeleton className="h-28" />
          ) : transferDetails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching transfers found in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferDetails.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>
                      <Link href={`/admissions/${transfer.admission}`} className="text-primary hover:underline">
                        {transfer.admission_number || `Admission #${transfer.admission}`}
                      </Link>
                    </TableCell>
                    <TableCell>{transfer.source_ward_name || '-'}</TableCell>
                    <TableCell>{transfer.destination_ward_name || '-'}</TableCell>
                    <TableCell>{new Date(transfer.transfer_date).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedWard)} onOpenChange={(open) => !open && setSelectedWard(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ward Census Drill-Down</DialogTitle>
            <DialogDescription>
              {selectedWard
                ? `Active admissions currently in ${selectedWard.ward_name} (${selectedWard.ward_type}).`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {wardAdmissionsDrilldown.isFetching ? (
            <Skeleton className="h-28" />
          ) : wardAdmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active admissions in this ward right now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wardAdmissions.map((admission: Admission) => (
                  <TableRow key={admission.id}>
                    <TableCell>
                      <Link href={`/admissions/${admission.id}`} className="text-primary hover:underline">
                        {admission.admission_number}
                      </Link>
                    </TableCell>
                    <TableCell>{admission.patient_name || '-'}</TableCell>
                    <TableCell>{admission.bed_number || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={admission.admission_status === 'ACTIVE' ? 'secondary' : 'outline'}>
                        {admission.admission_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
