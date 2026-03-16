'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bed,
  Building2,
  Plus,
  User,
  Settings,
  AlertCircle,
  Shield,
  Info
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/hooks/use-toast';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useWardCompatibilityUpdates } from '@/lib/hooks';
import type { BedStatus } from '@/lib/types/inpatient';
import {
  useInpatientWard,
  useWardBeds,
  useAdmissions,
  useBedUtilization,
  usePredictedDischarges,
  useUpdateBed,
  useGenerateWardBeds,
} from '@/lib/hooks/use-inpatient';
import { formatDateTime } from '@/lib/utils/format';

const BED_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RESERVED', label: 'Reserved' },
];

export default function WardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const wardId = Number(params.id);
  const { refresh, isRefreshing } = usePageRefresh();

  const updateBed = useUpdateBed();

  const [selectedBed, setSelectedBed] = useState<any>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const { data: ward, isLoading: wardLoading } = useInpatientWard(wardId);
  const { data: beds, isLoading: bedsLoading, refetch: refetchBeds } = useWardBeds(wardId);
  const { data: admissions, isLoading: admissionsLoading } = useAdmissions({
    ward: wardId,
    admission_status: 'ACTIVE',
    page_size: 100
  });
  const { data: bedUtilization } = useBedUtilization(wardId);
  const { data: predictedDischarges } = usePredictedDischarges(wardId, 24);
  const {
    events: wardEvents,
    connectionState,
    lastUpdated,
  } = useWardCompatibilityUpdates(Number.isNaN(wardId) ? null : wardId);

  const isLoading = wardLoading || bedsLoading || admissionsLoading;

  const bedsList = useMemo(() => {
    return (Array.isArray(beds) ? beds : beds?.results ?? []);
  }, [beds]);

  const admissionsList = useMemo(() => {
    return admissions?.results ?? [];
  }, [admissions]);

  const handleBedClick = (bed: any) => {
    // Don't allow status change for occupied beds
    if (bed.status === 'OCCUPIED') {
      toast({
        title: 'Bed Occupied',
        description: 'Cannot change status of an occupied bed. Discharge or transfer the patient first.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedBed(bed);
    setStatusDialogOpen(true);
  };

  const handleStatusSave = async (bedId: number, status: BedStatus, notes: string) => {
    try {
      await updateBed.mutateAsync({
        id: bedId,
        data: {
          status,
          notes,
        },
      });

      await refetchBeds();

      toast({
        title: 'Bed Status Updated',
        description: `Bed status has been changed to ${status.toLowerCase()}.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update bed status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const stats = useMemo(() => {
    if (bedUtilization) {
      return {
        available: bedUtilization.available,
        occupied: bedUtilization.occupied,
        maintenance: bedUtilization.maintenance,
        cleaning: bedUtilization.cleaning,
        reserved: bedUtilization.reserved,
        total: bedUtilization.capacity,
        occupancyRate: bedUtilization.occupancy_rate,
        effectiveAvailable: bedUtilization.effective_available,
        emergencyBufferBeds: bedUtilization.emergency_buffer_beds,
        emergencyBufferPercent: bedUtilization.emergency_buffer_percent,
        predictedNext4h: bedUtilization.predicted_discharges_next_4h,
        predictedNext24h: bedUtilization.predicted_discharges_next_24h,
        workloadScore: bedUtilization.workload_score,
        averageLengthOfStay: bedUtilization.avg_length_of_stay_days,
      };
    }

    // Use ward's computed properties (based on capacity) for totals
    const total = ward?.total_beds ?? 0;
    const available = ward?.available_beds ?? 0;
    const occupied = ward?.occupied_beds ?? 0;
    const occupancyRate = ward?.occupancy_rate ?? 0;

    // Count maintenance/reserved from actual bed records for display
    const maintenance = bedsList.filter((b: any) => b.status === 'MAINTENANCE').length;
    const cleaning = bedsList.filter((b: any) => b.status === 'CLEANING').length;
    const reserved = bedsList.filter((b: any) => b.status === 'RESERVED').length;

    return {
      available,
      occupied,
      cleaning,
      maintenance,
      reserved,
      total,
      occupancyRate,
      effectiveAvailable: available,
      emergencyBufferBeds: 0,
      emergencyBufferPercent: 0,
      predictedNext4h: 0,
      predictedNext24h: 0,
      workloadScore: 0,
      averageLengthOfStay: null,
    };
  }, [ward, bedsList, bedUtilization]);

  if (isLoading) {
    return <WardDetailSkeleton />;
  }

  if (!ward) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Ward not found</h2>
        <p className="text-muted-foreground mt-2">
          The ward you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push('/wards')} className="mt-4">
          Back to Wards
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh
      onRefresh={refresh}
      isRefreshing={isRefreshing}
      className="min-h-full"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <PageHeader
          title={ward.name}
          helpContent={ward.description || 'View ward details, current patients, and bed layout.'}
          actions={
            <>
              <PermissionGate action="inpatient.manage_ward">
                <Button variant="outline" size="sm" asChild className="gap-2 w-full sm:w-auto">
                  <Link href={`/wards/${wardId}/edit`}>
                    <Settings className="h-4 w-4" />
                    Manage
                  </Link>
                </Button>
              </PermissionGate>
              <PermissionGate action="inpatient.create_admission">
                <Button size="sm" asChild disabled={stats.available === 0} className="gap-2 w-full sm:w-auto">
                  <Link href={`/admissions/new?ward=${wardId}`}>
                    <Plus className="h-4 w-4" />
                    Admit
                  </Link>
                </Button>
              </PermissionGate>
            </>
          }
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {ward.name}
              </span>
              <span className="text-muted-foreground"> • {ward.code}</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {stats.occupied} of {stats.total} beds occupied ({stats.occupancyRate}%)
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <WebSocketStatus
              connectionState={connectionState}
              lastUpdate={lastUpdated}
              showLabel
              size="sm"
            />
            <Badge
              variant={ward.ward_type === 'ICU' ? 'destructive' : 'outline'}
              className="shrink-0 w-fit self-start sm:self-auto"
            >
              {ward.ward_type_display || ward.ward_type}
            </Badge>
          </div>
        </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Beds</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Available</p>
            <p className="text-2xl font-bold">{stats.available}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Occupied</p>
            <p className="text-2xl font-bold">{stats.occupied}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Maintenance</p>
            <p className="text-2xl font-bold">{stats.maintenance}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Occupancy</p>
            <p className="text-2xl font-bold">{stats.occupancyRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Bed Occupancy</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={stats.occupancyRate} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {stats.occupied} of {stats.total} beds occupied
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardHeader className="relative pb-3">
            <CardTitle className="text-base">Smart allocation snapshot</CardTitle>
            <CardDescription>Real-time capacity and allocation insights.</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Effective available beds</span>
              <span className="font-semibold">{stats.effectiveAvailable}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Emergency buffer</span>
              <span className="font-semibold">{stats.emergencyBufferBeds} beds ({stats.emergencyBufferPercent}%)</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Predicted releases in 4h</span>
              <span className="font-semibold">{stats.predictedNext4h}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Predicted releases in 24h</span>
              <span className="font-semibold">{stats.predictedNext24h}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Beds in cleaning</span>
              <span className="font-semibold">{stats.cleaning}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardHeader className="relative pb-3">
            <CardTitle className="text-base">Workload and stay profile</CardTitle>
            <CardDescription>Use these values when deciding whether to override or hold beds.</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Workload score</span>
              <span className="font-semibold">{stats.workloadScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">Average length of stay</span>
              <span className="font-semibold">
                {stats.averageLengthOfStay == null ? 'N/A' : `${stats.averageLengthOfStay.toFixed(1)} days`}
              </span>
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              Emergency admissions can still use the reserved buffer, but non-emergency placements should not consume it unless staff intentionally override the recommendation path.
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardHeader className="relative pb-3">
            <CardTitle className="text-base">Predicted discharges</CardTitle>
            <CardDescription>Near-term bed releases based on expected discharge dates and LOS estimates.</CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-3">
            {!predictedDischarges || predictedDischarges.predictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No predicted discharges in the next 24 hours.</p>
            ) : (
              predictedDischarges.predictions.slice(0, 4).map((prediction) => (
                <div key={prediction.admission_id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{prediction.bed_number} • {prediction.patient_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {prediction.expected_discharge_date
                          ? `Expected ${formatDateTime(prediction.expected_discharge_date)}`
                          : 'Estimated from average length of stay'}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit shrink-0">
                      {prediction.hours_until_available == null ? 'Timing unavailable' : `${prediction.hours_until_available}h`}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Live ward activity</CardTitle>
            <HelpPopover content="Real-time ward constraint and capacity events stream here. When the socket is unavailable, the page falls back to polling." />
          </div>
        </CardHeader>
        <CardContent>
          {wardEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No live ward events captured yet for this session.</p>
          ) : (
            <div className="space-y-2">
              {wardEvents.slice(0, 5).map((event, index) => (
                <div key={`${event.timestamp}-${event.type}-${index}`} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{event.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.patient_name ? `${event.patient_name} • ` : ''}{formatDateTime(event.timestamp)}
                      </p>
                    </div>
                    {event.violations && event.violations.length > 0 && (
                      <Badge variant="outline" className="w-fit shrink-0">
                        {event.violations.length} violation{event.violations.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>
                  {event.violations && event.violations.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{event.violations.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Compatibility Rules */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Patient Compatibility Rules</CardTitle>
            <HelpPopover content="These rules determine which patients can be admitted to this ward. Violations show warnings during admission but can be overridden with justification." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Gender Restriction */}
            <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
              <span className="text-muted-foreground">Gender</span>
              <Badge variant="outline" className="shrink-0 w-fit self-start sm:self-auto">
                {ward.gender_restriction === 'MALE_ONLY' 
                  ? 'Male Only' 
                  : ward.gender_restriction === 'FEMALE_ONLY' 
                    ? 'Female Only' 
                    : 'Any Gender'}
              </Badge>
            </div>

            {/* Age Range */}
            <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
              <span className="text-muted-foreground">Age Range</span>
              <span className="font-medium">
                {ward.min_age_years ?? 0} – {ward.max_age_years ?? '∞'} years
              </span>
            </div>

            {/* Isolation Capable */}
            <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
              <span className="text-muted-foreground">Isolation</span>
              <Badge
                variant={ward.isolation_capable ? 'default' : 'secondary'}
                className="shrink-0 w-fit self-start sm:self-auto"
              >
                {ward.isolation_capable ? 'Yes' : 'No'}
              </Badge>
            </div>

            {/* Oxygen Equipped */}
            <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
              <span className="text-muted-foreground">Oxygen</span>
              <Badge
                variant={ward.oxygen_equipped ? 'default' : 'secondary'}
                className="shrink-0 w-fit self-start sm:self-auto"
              >
                {ward.oxygen_equipped ? 'Yes' : 'No'}
              </Badge>
            </div>

            {/* Ventilator Capable */}
            <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
              <span className="text-muted-foreground">Ventilator</span>
              <Badge
                variant={ward.ventilator_capable ? 'default' : 'secondary'}
                className="shrink-0 w-fit self-start sm:self-auto"
              >
                {ward.ventilator_capable ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="beds" className="space-y-4">
        <TabsList>
          <TabsTrigger value="beds">Bed Layout</TabsTrigger>
          <TabsTrigger value="patients">Current Patients ({admissionsList.length})</TabsTrigger>
        </TabsList>

        {/* Bed Layout Tab */}
        <TabsContent value="beds" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="shrink-0 w-fit">Available</Badge>
            <Badge variant="default" className="shrink-0 w-fit">Occupied</Badge>
            <Badge variant="outline" className="shrink-0 w-fit">Cleaning</Badge>
            <Badge variant="outline" className="shrink-0 w-fit">Maintenance</Badge>
            <Badge variant="outline" className="shrink-0 w-fit">Reserved</Badge>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {bedsList.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center space-y-4">
                  <Bed className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No beds configured for this ward.</p>
                  {ward && ward.capacity > 0 && (
                    <GenerateBedsButton wardId={Number(wardId)} />
                  )}
                </CardContent>
              </Card>
            ) : (
              bedsList.map((bed: any) => (
                <BedCard key={bed.id} bed={bed} onStatusChange={handleBedClick} />
              ))
            )}
          </div>
        </TabsContent>

        {/* Patients Tab */}
        <TabsContent value="patients" className="space-y-4">
          {admissionsList.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No patients currently admitted to this ward.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {admissionsList.map((admission: any) => (
                <Card key={admission.id}>
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-full bg-muted">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{admission.patient_name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                            <span className="truncate">Bed {admission.bed_number}</span>
                            {(admission.admitting_diagnosis_text || admission.admitting_diagnosis) && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-full p-1 hover:bg-muted transition-colors shrink-0"
                                    aria-label="View admitting diagnosis"
                                  >
                                    <Info className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="bottom" align="start" className="max-w-xs p-3">
                                  <p className="text-sm font-medium">Admitting diagnosis</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {admission.admitting_diagnosis_text || admission.admitting_diagnosis}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <Badge variant="outline" className="shrink-0 w-fit self-start sm:self-auto">
                          Day {Math.ceil(
                            (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
                          )}
                        </Badge>
                        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                          <Link href={`/admissions/${admission.id}`}>
                            View
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bed Status Change Dialog */}
      {selectedBed && (
        <BedStatusDialog
          bed={selectedBed}
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          onSave={handleStatusSave}
          isSaving={updateBed.isPending}
        />
      )}
      </div>
    </PullToRefresh>
  );
}

function BedCard({ bed, onStatusChange }: { bed: any; onStatusChange?: (bed: any) => void }) {
  const statusVariant: 'default' | 'secondary' | 'outline' =
    bed.status === 'OCCUPIED'
      ? 'default'
      : bed.status === 'AVAILABLE'
        ? 'secondary'
        : 'outline';

  return (
    <Card
      className="border cursor-pointer hover:bg-muted/50 transition-colors"
      data-testid="bed-card"
      onClick={() => onStatusChange?.(bed)}
    >
      <CardContent className="p-3 text-center">
        <Bed className="h-6 w-6 mx-auto mb-1" />
        <p className="font-medium">{bed.bed_number}</p>
        <div className="mt-1 flex justify-center">
          <Badge variant={statusVariant} className="shrink-0 w-fit text-xs">
            {bed.status_display || bed.status}
          </Badge>
        </div>
        {bed.current_patient_name && (
          <p className="text-xs mt-1 truncate" title={bed.current_patient_name}>
            {bed.current_patient_name}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BedStatusDialog({
  bed,
  open,
  onOpenChange,
  onSave,
  isSaving
}: {
  bed: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (bedId: number, status: BedStatus, notes: string) => void;
  isSaving?: boolean;
}) {
  const [status, setStatus] = useState<BedStatus>((bed?.status as BedStatus) || 'AVAILABLE');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    await onSave(bed.id, status, notes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Change Bed Status</DialogTitle>
            <HelpPopover content={`Update the status for bed ${bed?.bed_number}. Occupied beds cannot be changed until the patient is discharged or transferred.`} />
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as BedStatus)}>
              <SelectTrigger id="status" aria-label="Status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {BED_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add notes about this status change..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button to generate missing beds for a ward */
function GenerateBedsButton({ wardId }: { wardId: number }) {
  const generateBeds = useGenerateWardBeds();
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      disabled={generateBeds.isPending}
      onClick={async () => {
        try {
          const result = await generateBeds.mutateAsync(wardId);
          toast({
            title: 'Beds Generated',
            description: `Created ${result.created} bed(s) (total: ${result.total})`,
          });
        } catch {
          toast({
            title: 'Failed to generate beds',
            variant: 'destructive',
          });
        }
      }}
    >
      <Plus className="h-4 w-4 mr-2" />
      {generateBeds.isPending ? 'Generating...' : 'Generate Beds'}
    </Button>
  );
}

function WardDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {[...Array(12)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
