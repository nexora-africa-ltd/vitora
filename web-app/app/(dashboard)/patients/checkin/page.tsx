'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { formatDate } from '@/lib/utils/format';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FlaskConical,
  HelpCircle,
  Pill,
  Scissors,
  Search,
  User,
  UserCheck,
  Activity,
  Stethoscope,
  Siren,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/lib/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/api/client';
import { proceduresApi } from '@/lib/api/procedures';
import { usePatientSearch, usePatientLookup, useTodayCheckins, useCheckinPatient } from '@/lib/hooks/use-checkin';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { VISIT_REASON_OPTIONS, type VisitReason, type PatientLookupResponse, type PatientSearchResult } from '@/lib/types/checkin';
import { cn } from '@/lib/utils';
import { CheckinSuccessModal, type CheckinSuccessData } from '@/components/patients/checkin-success-modal';
import { QRScannerDialog } from '@/components/patients/qr-scanner-dialog';
import { RouteToClinicDialog, type DirectRouteToClinicPayload } from '@/components/triage/route-to-clinic-dialog';
import { SHAStatusIndicator } from '@/components/patients/sha-status-indicator';

// =============================================================================
// Constants
// =============================================================================

const CHRONIC_CARE_CLINIC_TYPES = ['CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'MENTAL_HEALTH', 'ONCOLOGY', 'DIALYSIS'];

// =============================================================================
// Help Popover Component
// =============================================================================

function HelpPopover({ content }: { content: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 hover:bg-muted transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="max-w-xs p-3">
        <p className="text-sm text-muted-foreground">{content}</p>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// PatientCheckinCard - Displays patient info with clinical snapshot
// =============================================================================

function PatientCheckinCard({
  patient,
  onTriageCheckin,
  onOpenDirectRoute,
  onEmergencyCheckin,
  isLoading,
}: {
  patient: PatientLookupResponse;
  onTriageCheckin: (visitReason: VisitReason) => void;
  onOpenDirectRoute: (context: { visitReason: VisitReason; skipTriage: boolean; referralFacility?: string; chronicClinicId?: number; procedureOrderId?: number; scheduledClinicId?: number }) => void;
  onEmergencyCheckin: (visitReason: VisitReason, chiefComplaint: string) => void;
  isLoading: boolean;
}) {
  const [visitReason, setVisitReason] = useState<VisitReason>(patient.suggested_visit_reason);
  const [erComplaint, setErComplaint] = useState('');
  const [referralFacility, setReferralFacility] = useState('');
  const [chronicClinicId, setChronicClinicId] = useState<number | undefined>(undefined);
  const [procedureOrderId, setProcedureOrderId] = useState<number | undefined>(undefined);

  const isEmergency = visitReason === 'EMERGENCY';
  const isReferral = visitReason === 'REFERRAL_VISIT';
  const isChronicCare = visitReason === 'CHRONIC_CARE';
  const isScheduledProcedure = visitReason === 'SCHEDULED_PROCEDURE';

  // Determine if this reason should skip triage
  const shouldSkipTriage = useMemo(() => {
    const option = VISIT_REASON_OPTIONS.find((o) => o.value === visitReason);
    return option?.skipTriage ?? false;
  }, [visitReason]);

  // Chronic care clinic types (stable reference outside component render)

  // Fetch clinics for chronic care dropdown
  const { data: chronicClinicsData } = useClinics({ status: 'ACTIVE', page_size: 100 });
  const chronicClinics = useMemo(
    () => (chronicClinicsData?.results ?? []).filter((c) => CHRONIC_CARE_CLINIC_TYPES.includes(c.clinic_type)),
    [chronicClinicsData]
  );

  // Referral validation: facility name is required
  const isReferralValid = !isReferral || referralFacility.trim().length > 0;
  // Chronic care validation: clinic selection is required
  const isChronicCareValid = !isChronicCare || chronicClinicId !== undefined;
  // Scheduled procedure validation: procedure order selection is required
  const isProcedureValid = !isScheduledProcedure || procedureOrderId !== undefined;

  // Fetch scheduled/ordered procedure orders for this patient (today)
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: procedureOrdersData } = useQuery({
    queryKey: ['procedure-orders', 'checkin', patient.id, today],
    queryFn: () =>
      proceduresApi.listOrders({
        patient: String(patient.id),
        status: 'SCHEDULED',
        page_size: '20',
      }),
    enabled: isScheduledProcedure,
  });
  const scheduledProcedures = procedureOrdersData?.results ?? [];

  const handleTriageCheckin = () => {
    onTriageCheckin(visitReason);
  };

  const handleDirectCheckin = () => {
    // If a scheduled procedure has an assigned clinic, pass it so the dialog can be skipped
    const selectedOrder = scheduledProcedures.find((p) => p.id === procedureOrderId);
    const scheduledClinicId = selectedOrder?.scheduled_clinic ?? undefined;

    onOpenDirectRoute({
      visitReason,
      skipTriage: shouldSkipTriage,
      ...(isReferral && referralFacility.trim() ? { referralFacility: referralFacility.trim() } : {}),
      ...(isChronicCare && chronicClinicId ? { chronicClinicId } : {}),
      ...(isScheduledProcedure && procedureOrderId ? { procedureOrderId } : {}),
      ...(scheduledClinicId ? { scheduledClinicId } : {}),
    });
  };

  const snapshot = patient.clinical_snapshot;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg sm:text-xl truncate">{patient.full_name}</CardTitle>
              <Badge
                variant={patient.suggested_visit_type === 'NEW' ? 'default' : 'secondary'}
                size="sm"
                aria-label={`Visit type: ${patient.suggested_visit_type}`}
                data-testid="visit-type-badge"
              >
                {patient.suggested_visit_type}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-muted-foreground">
              <span className="font-mono">{patient.mrn}</span>
              <span className="hidden xs:inline">•</span>
              <span>
                {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'},{' '}
                {patient.age}y
              </span>
              <span className="hidden xs:inline">•</span>
              <SHAStatusIndicator
                patientId={patient.id}
                identificationNumber={patient.identification_number}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 sm:px-6">
        {/* Clinical Alerts */}
        {snapshot.alerts.length > 0 && (
          <div className="space-y-2">
            {snapshot.alerts.map((alert, index) => (
              <Alert
                key={index}
                variant={alert.includes('SEVERE') ? 'destructive' : 'default'}
                className="py-2 [&>svg]:top-2.5"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">{alert}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Clinical Snapshot Grid */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {/* Allergies */}
          {snapshot.allergies.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Allergies</span>
                <HelpPopover content="Known drug and food allergies recorded in the patient's medical history" />
              </div>
              <div className="flex flex-wrap gap-1">
                {snapshot.allergies.map((allergy, index) => (
                  <Badge key={index} variant="outline" className="bg-white dark:bg-red-950/40">
                    {allergy}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Active Conditions */}
          {snapshot.active_conditions.length > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">
                <Activity className="h-4 w-4 shrink-0" />
                <span>Active Conditions</span>
                <HelpPopover content="Current chronic conditions and active diagnoses from recent encounters" />
              </div>
              <div className="flex flex-wrap gap-1">
                {snapshot.active_conditions.map((condition, index) => (
                  <Badge key={index} variant="outline" className="bg-white dark:bg-blue-950/40">
                    {condition}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Current Medications */}
          {snapshot.current_medications.length > 0 && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                <Pill className="h-4 w-4 shrink-0" />
                <span>Medications</span>
                <HelpPopover content="Active prescriptions and ongoing medications the patient is currently taking" />
              </div>
              <div className="flex flex-wrap gap-1">
                {snapshot.current_medications.slice(0, 4).map((med, index) => (
                  <Badge key={index} variant="outline" className="bg-white dark:bg-green-950/40">
                    {med}
                  </Badge>
                ))}
                {snapshot.current_medications.length > 4 && (
                  <Badge variant="outline">+{snapshot.current_medications.length - 4} more</Badge>
                )}
              </div>
            </div>
          )}

          {/* Pending Results */}
          {snapshot.pending_results.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span>Pending Results</span>
                <HelpPopover content="Lab tests and investigations awaiting results from previous visits" />
              </div>
              <div className="space-y-1">
                {snapshot.pending_results.slice(0, 3).map((result, index) => (
                  <div key={index} className="text-xs">
                    {result.test_name} - {result.status}
                  </div>
                ))}
                {snapshot.pending_results.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{snapshot.pending_results.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Last Visit Info */}
        {patient.last_encounter_date && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Last visit: {formatDate(patient.last_encounter_date)}
              {snapshot.last_visit_clinic && ` at ${snapshot.last_visit_clinic}`}
            </span>
          </div>
        )}

        {/* Visit Reason Selection */}
        <div className="pt-3 border-t space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Visit Reason</label>
              <HelpPopover content="Select why the patient is visiting today. Some reasons (e.g., scheduled appointments) may skip triage." />
            </div>
            <Select
              value={visitReason}
              onValueChange={(value) => setVisitReason(value as VisitReason)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {VISIT_REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.emergency ? '🚨 ' : ''}{option.label}
                    {option.skipTriage && ' (Skip Triage)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shouldSkipTriage && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 p-2 rounded-md bg-muted/50">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This visit reason will skip triage when going directly to clinic.
            </div>
          )}
        </div>

        {/* Referral details (shown when Referral from Another Facility is selected) */}
        {isReferral && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Referring Facility Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={referralFacility}
              onChange={(e) => setReferralFacility(e.target.value)}
              placeholder="e.g., Kenyatta National Hospital, Moi Teaching & Referral..."
              className="text-sm h-9"
            />
            {!referralFacility.trim() && (
              <p className="text-xs text-destructive">Referral facility name is required</p>
            )}
          </div>
        )}

        {/* Chronic care clinic selection (shown when Chronic Care Review is selected) */}
        {isChronicCare && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Chronic Care Clinic <span className="text-destructive">*</span>
            </label>
            <Select
              value={chronicClinicId?.toString() ?? ''}
              onValueChange={(value) => setChronicClinicId(parseInt(value, 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select chronic care clinic" />
              </SelectTrigger>
              <SelectContent>
                {chronicClinics.map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id.toString()}>
                    {clinic.name}
                  </SelectItem>
                ))}
                {chronicClinics.length === 0 && (
                  <SelectItem value="_none">
                    No chronic care clinics available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!chronicClinicId && (
              <p className="text-xs text-destructive">Please select a chronic care clinic</p>
            )}
          </div>
        )}

        {/* Scheduled procedure selection (shown when Scheduled Procedure is selected) */}
        {isScheduledProcedure && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Scheduled Procedure <span className="text-destructive">*</span>
            </label>
            <Select
              value={procedureOrderId?.toString() ?? ''}
              onValueChange={(value) => setProcedureOrderId(parseInt(value, 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select scheduled procedure" />
              </SelectTrigger>
              <SelectContent>
                {scheduledProcedures.map((order) => (
                  <SelectItem key={order.id} value={order.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{order.procedure_name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({order.order_number})
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {scheduledProcedures.length === 0 && (
                  <SelectItem value="_none">
                    No scheduled procedures found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!procedureOrderId && scheduledProcedures.length > 0 && (
              <p className="text-xs text-destructive">Please select a procedure</p>
            )}
            {scheduledProcedures.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No scheduled procedures found for this patient. Check the procedures module or select a different visit reason.
              </p>
            )}
          </div>
        )}

        {/* Emergency chief complaint input (shown when Emergency is selected) */}
        {isEmergency && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-destructive">Chief Complaint</label>
            <Input
              value={erComplaint}
              onChange={(e) => setErComplaint(e.target.value)}
              placeholder="e.g., chest pain, difficulty breathing, trauma..."
              className="text-sm h-9 border-destructive/30 focus-visible:ring-destructive/30"
            />
          </div>
        )}

        {/* Check-in Actions */}
        <div className="space-y-3 pt-2">
          {/* Primary action - transforms between Triage, Emergency, or hidden for skip-triage */}
          {isEmergency ? (
            <Button
              variant="destructive"
              onClick={() => onEmergencyCheckin(visitReason, erComplaint)}
              disabled={isLoading}
              className="w-full h-10 sm:h-11 text-sm"
            >
              <Siren className="mr-2 h-4 w-4" />
              Check-in to Emergency
            </Button>
          ) : isScheduledProcedure ? (
            /* Scheduled procedure: route to procedure area / clinic */
            <Button
              onClick={handleDirectCheckin}
              disabled={isLoading || !isProcedureValid}
              className="w-full h-10 sm:h-11 text-sm"
            >
              <Scissors className="mr-2 h-4 w-4" />
              Route to Procedure Area
            </Button>
          ) : shouldSkipTriage ? (
            /* Skip-triage reasons: no triage button, promote direct route to primary */
            <Button
              onClick={handleDirectCheckin}
              disabled={isLoading || !isReferralValid || !isChronicCareValid}
              className="w-full h-10 sm:h-11 text-sm"
            >
              Select Clinic and Route
            </Button>
          ) : isChronicCare ? (
            /* Chronic care: route directly to selected chronic clinic */
            <Button
              onClick={handleDirectCheckin}
              disabled={isLoading || !isChronicCareValid}
              className="w-full h-10 sm:h-11 text-sm"
            >
              Route to Chronic Care Clinic
            </Button>
          ) : (
            <>
              <Button
                onClick={handleTriageCheckin}
                disabled={isLoading || !isReferralValid}
                className="w-full h-10 sm:h-11 text-sm"
              >
                <Stethoscope className="mr-2 h-4 w-4" />
                Check-in to Triage
              </Button>

              {/* Secondary action - Direct to clinic */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-[10px] sm:text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or send directly to</span>
                </div>
              </div>

              <Button
                variant="secondary"
                onClick={handleDirectCheckin}
                disabled={isLoading || !isReferralValid}
                aria-label="Direct to clinic"
                className="w-full h-10 sm:h-11 text-sm"
              >
                Select Clinic and Route
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// PatientSearchResultsList - Shows multiple matching patients for selection
// =============================================================================

function PatientSearchResultsList({
  patients,
  onSelect,
  selectedId,
  isLoadingDetails,
}: {
  patients: PatientSearchResult[];
  onSelect: (patient: PatientSearchResult) => void;
  selectedId?: number;
  isLoadingDetails?: boolean;
}) {
  if (patients.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground px-1">
        {patients.length} patient{patients.length !== 1 ? 's' : ''} found. Select one to check in.
      </p>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {patients.map((patient) => (
          <Card
            key={patient.id}
            className={cn(
              'cursor-pointer transition-colors hover:bg-muted/50',
              selectedId === patient.id && 'ring-2 ring-primary bg-muted/50'
            )}
            onClick={() => onSelect(patient)}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{patient.full_name}</span>
                    {selectedId === patient.id && isLoadingDetails && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span className="font-mono">{patient.mrn}</span>
                    {patient.phone_number && <span>{patient.phone_number}</span>}
                    {patient.identification_number && (
                      <span>{patient.identification_type}: {patient.identification_number}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="mb-1">
                    {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                  </Badge>
                    <div className="text-xs text-muted-foreground">
                    {patient.age} yrs
                  </div>
                </div>
              </div>
              {patient.last_visit_date && (
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last visit: {patient.last_visit_date}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// RecentCheckinsCard - Shows today's check-ins
// =============================================================================

function RecentCheckinsCard() {
  const { data, isLoading } = useTodayCheckins({ page_size: 10 });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Recent Check-ins</CardTitle>
            <HelpPopover content="Patients checked in today across all clinics and triage" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const checkins = data?.results ?? [];

  return (
    <Card>
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Recent Check-ins</CardTitle>
            <HelpPopover content="Patients checked in today across all clinics and triage" />
          </div>
          {checkins.length > 0 && (
            <Badge variant="secondary">
              {data?.count ?? 0}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {checkins.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No check-ins yet today
          </div>
        ) : (
          <div className="space-y-1">
            {checkins.map((checkin) => (
              <div
                key={checkin.id}
                className="flex items-center justify-between py-2.5 border-b last:border-0 gap-2"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{checkin.patient_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span className="font-mono">{checkin.patient_mrn}</span>
                      <span className="mx-1">•</span>
                      <span>{checkin.destination}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline">
                    {VISIT_REASON_OPTIONS.find((o) => o.value === checkin.visit_reason)?.label ?? checkin.visit_reason}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(checkin.checked_in_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function PatientCheckinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [checkInResult, setCheckInResult] = useState<CheckinSuccessData | null>(null);
  const [isRouteDialogOpen, setIsRouteDialogOpen] = useState(false);
  const [pendingDirectRoute, setPendingDirectRoute] = useState<{
    visitReason: VisitReason;
    skipTriage: boolean;
    referralFacility?: string;
    chronicClinicId?: number;
    procedureOrderId?: number;
    scheduledClinicId?: number;
  } | null>(null);
  const [resetAfterDirectRoute, setResetAfterDirectRoute] = useState(false);
  const debouncedQuery = useDebounce(searchQuery, 400);

  // Handle pre-selected patient from query param (e.g., from duplicate modal)
  const preSelectedPatientId = searchParams.get('select');

  // Auto-populate search with pre-selected patient ID
  useEffect(() => {
    if (preSelectedPatientId && !searchQuery) {
      setSearchQuery(preSelectedPatientId);
      // Clear the query param from URL after populating (clean URL)
      const url = new URL(window.location.href);
      url.searchParams.delete('select');
      router.replace(url.pathname, { scroll: false });
    }
  }, [preSelectedPatientId, searchQuery, router]);

  // Search for patients (returns multiple matches)
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = usePatientSearch(debouncedQuery, {
    enabled: debouncedQuery.length >= 2,
    limit: 20,
  });

  // Load clinical snapshot for selected patient
  const {
    data: patientDetails,
    isLoading: isLoadingDetails,
  } = usePatientLookup(selectedPatient?.mrn || '', {
    enabled: !!selectedPatient,
  });

  // Reset selection when search query changes
  useEffect(() => {
    setSelectedPatient(null);
  }, [debouncedQuery]);

  // Auto-select if only one result
  useEffect(() => {
    if (searchResults?.count === 1 && searchResults.results[0]) {
      setSelectedPatient(searchResults.results[0]);
    }
  }, [searchResults]);

  const checkinMutation = useCheckinPatient();

  const handlePatientSelect = (patient: PatientSearchResult) => {
    setSelectedPatient(patient);
  };

  const handleTriageCheckin = async (visitReason: VisitReason) => {
    if (!patientDetails) return;

    try {
      const result = await checkinMutation.mutateAsync({
        patientId: patientDetails.id,
        data: {
          destination: 'TRIAGE',
          visit_reason: visitReason,
          skip_triage: false,
        },
      });

      // Build success data with link to the patient's triage assessment
      const triageUrl = result.encounter_id
        ? `/triage/assess/${patientDetails.id}/${result.encounter_id}/vitals`
        : '/triage';

      setCheckInResult({
        patientName: result.patient_name,
        patientMrn: result.patient_mrn,
        destination: 'triage',
        destinationName: 'Triage',
        destinationUrl: triageUrl,
        queuePosition: result.queue_position,
        estimatedWaitMinutes: result.estimated_wait_minutes,
        warning: result.warning,
      });
      setShowSuccessModal(true);

      // Clear search and reset for next patient
      setSearchQuery('');
      setSelectedPatient(null);
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleOpenDirectRoute = (context: { visitReason: VisitReason; skipTriage: boolean; referralFacility?: string; chronicClinicId?: number; procedureOrderId?: number; scheduledClinicId?: number }) => {
    // If chronic care with a pre-selected clinic, route directly without dialog
    if (context.chronicClinicId) {
      handleDirectRouteToChronicClinic(context);
      return;
    }
    // If scheduled procedure already has an assigned clinic, route directly
    if (context.scheduledClinicId) {
      handleDirectRouteToProcedureClinic(context);
      return;
    }
    setPendingDirectRoute(context);
    setIsRouteDialogOpen(true);
  };

  const handleEmergencyCheckin = async (visitReason: VisitReason, chiefComplaint: string) => {
    if (!patientDetails) return;

    try {
      const result = await checkinMutation.mutateAsync({
        patientId: patientDetails.id,
        data: {
          destination: 'EMERGENCY',
          visit_reason: visitReason,
          skip_triage: false,
          chief_complaint: chiefComplaint,
        },
      });

      setCheckInResult({
        patientName: result.patient_name,
        patientMrn: result.patient_mrn,
        destination: 'triage',
        destinationName: 'Emergency',
        destinationUrl: '/emergency',
        queuePosition: result.queue_position,
        estimatedWaitMinutes: result.estimated_wait_minutes,
        warning: result.warning,
      });
      setShowSuccessModal(true);
      setSearchQuery('');
      setSelectedPatient(null);
    } catch (error) {
      toast({
        title: 'ER Check-in Failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDirectRouteToChronicClinic = async (context: { visitReason: VisitReason; skipTriage: boolean; chronicClinicId?: number }) => {
    if (!patientDetails || !context.chronicClinicId) return;

    try {
      const result = await checkinMutation.mutateAsync({
        patientId: patientDetails.id,
        data: {
          destination: context.chronicClinicId,
          visit_reason: context.visitReason,
          skip_triage: true,
        },
      });

      setCheckInResult({
        patientName: result.patient_name,
        patientMrn: result.patient_mrn,
        destination: 'clinic',
        destinationName: result.destination_clinic_name || result.destination,
        destinationUrl: result.destination_clinic_id
          ? `/clinics/${result.destination_clinic_id}/queue`
          : '/clinics',
        queuePosition: result.queue_position,
        estimatedWaitMinutes: result.estimated_wait_minutes,
        skippedTriage: true,
        warning: result.warning,
      });
      setShowSuccessModal(true);
      setSearchQuery('');
      setSelectedPatient(null);
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDirectRouteToProcedureClinic = async (context: { visitReason: VisitReason; skipTriage: boolean; procedureOrderId?: number; scheduledClinicId?: number }) => {
    if (!patientDetails || !context.scheduledClinicId) return;

    try {
      const result = await checkinMutation.mutateAsync({
        patientId: patientDetails.id,
        data: {
          destination: context.scheduledClinicId,
          visit_reason: context.visitReason,
          skip_triage: true,
          ...(context.procedureOrderId ? { procedure_order: context.procedureOrderId } : {}),
        },
      });

      setCheckInResult({
        patientName: result.patient_name,
        patientMrn: result.patient_mrn,
        destination: 'clinic',
        destinationName: result.destination_clinic_name || result.destination,
        destinationUrl: result.destination_clinic_id
          ? `/clinics/${result.destination_clinic_id}/queue`
          : '/clinics',
        queuePosition: result.queue_position,
        estimatedWaitMinutes: result.estimated_wait_minutes,
        skippedTriage: true,
        warning: result.warning,
      });
      setShowSuccessModal(true);
      setSearchQuery('');
      setSelectedPatient(null);
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDirectRoute = async ({ clinic, notes }: DirectRouteToClinicPayload) => {
    if (!patientDetails || !pendingDirectRoute) {
      return null;
    }

    // Prepend referral facility info to notes if present
    const referralNote = pendingDirectRoute.referralFacility
      ? `Referred from: ${pendingDirectRoute.referralFacility}`
      : '';
    const procedureNote = pendingDirectRoute.procedureOrderId
      ? `Procedure Order ID: ${pendingDirectRoute.procedureOrderId}`
      : '';
    const combinedNotes = [referralNote, procedureNote, notes].filter(Boolean).join('\n');

    const result = await checkinMutation.mutateAsync({
      patientId: patientDetails.id,
      data: {
        destination: clinic.id,
        visit_reason: pendingDirectRoute.visitReason,
        skip_triage: pendingDirectRoute.skipTriage,
        notes: combinedNotes,
        ...(pendingDirectRoute.procedureOrderId ? { procedure_order: pendingDirectRoute.procedureOrderId } : {}),
      },
    });

    setCheckInResult({
      patientName: result.patient_name,
      patientMrn: result.patient_mrn,
      destination: 'clinic',
      destinationName: clinic.name,
      destinationUrl: `/clinics/${clinic.id}/queue`,
      queuePosition: result.queue_position,
      estimatedWaitMinutes: result.estimated_wait_minutes,
      skippedTriage: pendingDirectRoute.skipTriage,
      warning: result.warning,
    });
    setShowSuccessModal(true);
    setResetAfterDirectRoute(true);

    return null;
  };

  const handleRouteDialogOpenChange = (nextOpen: boolean) => {
    setIsRouteDialogOpen(nextOpen);
    if (!nextOpen) {
      setPendingDirectRoute(null);
      if (resetAfterDirectRoute) {
        setSearchQuery('');
        setSelectedPatient(null);
        setResetAfterDirectRoute(false);
      }
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Page Header with Tooltip */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Patient Check-in</h1>
            <HelpPopover content="Search for patients by MRN, National ID, or phone number. View clinical alerts and history before routing to triage or directly to a clinic." />
          </div>
        </div>
      </div>

      {/* Mobile: Stack columns, Desktop: Side by side */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main Column - Search and Patient Card */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6 order-1">
          {/* Search Input + QR Scanner */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="MRN, National ID, or Phone..."
                className="pl-10 h-11 sm:h-12 text-base sm:text-lg"
                autoFocus
              />
            </div>
            <QRScannerDialog
              onScan={(mrn) => {
                setSearchQuery(mrn);
                setSelectedPatient(null);
              }}
              label="Scan QR"
            />
          </div>

          {/* Search Results */}
          {isSearching && (
            <Card>
              <CardContent className="py-6 sm:py-8">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">Searching...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {searchError && debouncedQuery.length >= 2 && (
            <Card>
              <CardContent className="py-6 sm:py-8 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-2">No patients found</p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/patients/new')}
                  size="sm"
                >
                  Register New Patient
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Show search results list (multiple patients) */}
          {searchResults && searchResults.count > 0 && !isSearching && !selectedPatient && (
            <PatientSearchResultsList
              patients={searchResults.results}
              onSelect={handlePatientSelect}
              isLoadingDetails={false}
            />
          )}

          {/* Show selected patient with check-in options */}
          {selectedPatient && !isSearching && (
            <>
              {/* Back to results button */}
              {searchResults && searchResults.count > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPatient(null)}
                  className="mb-2"
                >
                  ← Back to results ({searchResults.count} patients)
                </Button>
              )}

              {isLoadingDetails ? (
                <Card>
                  <CardContent className="py-6 sm:py-8">
                    <div className="flex items-center justify-center gap-3">
                      <div className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-sm text-muted-foreground">Loading patient details...</span>
                    </div>
                  </CardContent>
                </Card>
              ) : patientDetails ? (
                <PatientCheckinCard
                  patient={patientDetails}
                  onTriageCheckin={handleTriageCheckin}
                  onOpenDirectRoute={handleOpenDirectRoute}
                  onEmergencyCheckin={handleEmergencyCheckin}
                  isLoading={checkinMutation.isPending}
                />
              ) : null}
            </>
          )}

          {/* Empty state */}
          {!debouncedQuery && !selectedPatient && (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center">
                <User className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <h3 className="font-medium text-base sm:text-lg mb-1 sm:mb-2">Ready to Check-in</h3>
                <p className="text-sm text-muted-foreground">
                  Enter a patient's MRN, National ID, name, or phone number to begin.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Recent Check-ins (on mobile, shows below main content) */}
        <div className="space-y-4 sm:space-y-6 order-2 lg:order-2">
          <RecentCheckinsCard />
        </div>
      </div>

      {/* Check-in Success Modal */}
      <CheckinSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        checkInResult={checkInResult}
        onDismiss={() => setCheckInResult(null)}
      />

      <RouteToClinicDialog
        open={isRouteDialogOpen}
        onOpenChange={handleRouteDialogOpenChange}
        patient={patientDetails
          ? {
              id: patientDetails.id,
              first_name: patientDetails.first_name,
              last_name: patientDetails.last_name,
              mrn: patientDetails.mrn,
              gender: patientDetails.gender as 'M' | 'F' | 'O',
              age: patientDetails.age,
              date_of_birth: patientDetails.date_of_birth,
            }
          : null}
        onDirectRoute={handleDirectRoute}
      />
    </div>
  );
}
