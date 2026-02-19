'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FlaskConical,
  HelpCircle,
  Pill,
  Search,
  User,
  UserCheck,
  ArrowRight,
  Activity,
  Stethoscope,
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
import { usePatientLookup, useTodayCheckins, useCheckinPatient } from '@/lib/hooks/use-checkin';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { VISIT_REASON_OPTIONS, type VisitReason, type PatientLookupResponse } from '@/lib/types/checkin';
import { cn } from '@/lib/utils';

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
  onCheckin,
  isLoading,
}: {
  patient: PatientLookupResponse;
  onCheckin: (destination: 'TRIAGE' | number, visitReason: VisitReason, skipTriage: boolean) => void;
  isLoading: boolean;
}) {
  const [visitReason, setVisitReason] = useState<VisitReason>(patient.suggested_visit_reason);
  const [selectedClinic, setSelectedClinic] = useState<number | null>(null);

  const { data: clinicsData } = useClinics({});
  const clinics = clinicsData?.results ?? [];

  // Determine if this reason should skip triage
  const shouldSkipTriage = useMemo(() => {
    const option = VISIT_REASON_OPTIONS.find((o) => o.value === visitReason);
    return option?.skipTriage ?? false;
  }, [visitReason]);

  const handleTriageCheckin = () => {
    onCheckin('TRIAGE', visitReason, false);
  };

  const handleDirectCheckin = () => {
    if (selectedClinic) {
      onCheckin(selectedClinic, visitReason, shouldSkipTriage);
    }
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
                className="py-2"
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
                  <div key={index} className="text-xs sm:text-sm">
                    {result.test_name} - {result.status}
                  </div>
                ))}
                {snapshot.pending_results.length > 3 && (
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    +{snapshot.pending_results.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Last Visit Info */}
        {patient.last_encounter_date && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Last visit: {format(new Date(patient.last_encounter_date), 'MMM d, yyyy')}
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
                    {option.label}
                    {option.skipTriage && ' (Skip Triage)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shouldSkipTriage && (
            <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 p-2 rounded-md bg-muted/50">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This visit reason will skip triage when going directly to clinic.
            </div>
          )}
        </div>

        {/* Check-in Actions */}
        <div className="space-y-3 pt-2">
          {/* Primary action - Triage check-in */}
          <Button onClick={handleTriageCheckin} disabled={isLoading} className="w-full h-10 sm:h-11 text-sm sm:text-base">
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

          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
              <Select
                value={selectedClinic?.toString() ?? ''}
                onValueChange={(value) => setSelectedClinic(parseInt(value, 10))}
              >
                <SelectTrigger className="w-full h-10 sm:h-11 text-xs sm:text-sm" aria-label="Select clinic">
                  <SelectValue placeholder="Select clinic..." />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {clinics.map((clinic) => (
                    <SelectItem key={clinic.id} value={clinic.id.toString()}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              onClick={handleDirectCheckin}
              disabled={isLoading || !selectedClinic}
              aria-label="Direct to clinic"
              className="shrink-0 h-10 w-10 sm:h-11 sm:w-auto sm:px-4 p-0"
            >
              <ArrowRight className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Send</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
                    {checkin.visit_type}
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

  const {
    data: patientData,
    isLoading: isSearching,
    error: searchError,
    isFetched,
  } = usePatientLookup(debouncedQuery, {
    enabled: debouncedQuery.length >= 1, // Allow single digit for IDs
  });

  const checkinMutation = useCheckinPatient();

  const handleCheckin = async (
    destination: 'TRIAGE' | number,
    visitReason: VisitReason,
    skipTriage: boolean
  ) => {
    if (!patientData) return;

    try {
      const result = await checkinMutation.mutateAsync({
        patientId: patientData.id,
        data: {
          destination,
          visit_reason: visitReason,
          skip_triage: skipTriage,
        },
      });

      toast({
        title: 'Patient Checked In',
        description: `${patientData.full_name} is now in queue at ${result.destination}. Position: ${result.queue_position}`,
      });

      // Clear search and reset for next patient
      setSearchQuery('');

      // Optionally navigate to queue view
      if (destination === 'TRIAGE') {
        // Could navigate to triage queue
      }
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
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
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="MRN, National ID, or Phone..."
              className="pl-10 h-11 sm:h-12 text-base sm:text-lg"
              autoFocus
            />
          </div>

          {/* Search Results */}
          {isSearching && (
            <Card>
              <CardContent className="py-6 sm:py-8">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm sm:text-base text-muted-foreground">Searching...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {searchError && debouncedQuery.length >= 2 && (
            <Card>
              <CardContent className="py-6 sm:py-8 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-2">Patient not found</p>
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

          {patientData && !isSearching && (
            <PatientCheckinCard
              patient={patientData}
              onCheckin={handleCheckin}
              isLoading={checkinMutation.isPending}
            />
          )}

          {!debouncedQuery && !patientData && (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center">
                <User className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <h3 className="font-medium text-base sm:text-lg mb-1 sm:mb-2">Ready to Check-in</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Enter a patient's MRN, National ID, or phone number to begin.
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
    </div>
  );
}
