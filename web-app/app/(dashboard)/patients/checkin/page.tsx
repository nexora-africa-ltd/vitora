'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FlaskConical,
  Pill,
  Search,
  User,
  UserCheck,
  ArrowRight,
  Activity,
  Stethoscope,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import { useToast } from '@/lib/hooks/use-toast';
import { usePatientLookup, useTodayCheckins, useCheckinPatient } from '@/lib/hooks/use-checkin';
import { useClinics } from '@/lib/hooks/use-clinics';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { VISIT_REASON_OPTIONS, type VisitReason, type PatientLookupResponse } from '@/lib/types/checkin';
import { cn } from '@/lib/utils';

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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">{patient.full_name}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>MRN: {patient.mrn}</span>
                <span>•</span>
                <span>
                  {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'},{' '}
                  {patient.age}y
                </span>
              </div>
            </div>
          </div>
          <Badge variant={patient.suggested_visit_type === 'NEW' ? 'default' : 'secondary'}>
            {patient.suggested_visit_type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
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
        <div className="grid gap-4 md:grid-cols-2">
          {/* Allergies */}
          {snapshot.allergies.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                <AlertCircle className="h-4 w-4" />
                Allergies
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
                <Activity className="h-4 w-4" />
                Active Conditions
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
                <Pill className="h-4 w-4" />
                Current Medications
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
                <FlaskConical className="h-4 w-4" />
                Pending Results
              </div>
              <div className="space-y-1">
                {snapshot.pending_results.slice(0, 3).map((result, index) => (
                  <div key={index} className="text-sm">
                    {result.test_name} - {result.status}
                  </div>
                ))}
                {snapshot.pending_results.length > 3 && (
                  <div className="text-sm text-muted-foreground">
                    +{snapshot.pending_results.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Last Visit Info */}
        {patient.last_encounter_date && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Last visit: {format(new Date(patient.last_encounter_date), 'MMM d, yyyy')}
              {snapshot.last_visit_clinic && ` at ${snapshot.last_visit_clinic}`}
            </span>
          </div>
        )}

        {/* Visit Reason Selection */}
        <div className="flex items-center gap-4 pt-2 border-t">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Visit Reason</label>
            <Select
              value={visitReason}
              onValueChange={(value) => setVisitReason(value as VisitReason)}
            >
              <SelectTrigger>
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
        </div>

        {/* Check-in Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleTriageCheckin} disabled={isLoading} className="flex-1">
            <Stethoscope className="mr-2 h-4 w-4" />
            Check-in to Triage
          </Button>

          <div className="flex items-center gap-2 flex-1">
            <Select
              value={selectedClinic?.toString() ?? ''}
              onValueChange={(value) => setSelectedClinic(parseInt(value, 10))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {clinics.map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id.toString()}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              onClick={handleDirectCheckin}
              disabled={isLoading || !selectedClinic}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {shouldSkipTriage && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            This visit reason will skip triage when going directly to clinic.
          </div>
        )}
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
        <CardHeader>
          <CardTitle className="text-base">Recent Check-ins Today</CardTitle>
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Check-ins Today
          {checkins.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {data?.count ?? 0}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {checkins.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No check-ins yet today
          </div>
        ) : (
          <div className="space-y-2">
            {checkins.map((checkin) => (
              <div
                key={checkin.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{checkin.patient_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {checkin.patient_mrn} • {checkin.destination}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="text-xs">
                    {checkin.visit_type}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
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
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 400);

  const {
    data: patientData,
    isLoading: isSearching,
    error: searchError,
    isFetched,
  } = usePatientLookup(debouncedQuery, {
    enabled: debouncedQuery.length >= 2,
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
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Patient Check-in"
        description="Quick check-in for returning and new patients"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Search and Patient Card */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Scan or enter MRN, National ID, or Phone Number..."
              className="pl-10 h-12 text-lg"
              autoFocus
            />
          </div>

          {/* Search Results */}
          {isSearching && (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground">Searching...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {searchError && debouncedQuery.length >= 2 && (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Patient not found</p>
                <Button
                  variant="link"
                  onClick={() => router.push('/patients/new')}
                  className="mt-2"
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
              <CardContent className="py-12 text-center">
                <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium text-lg mb-2">Ready to Check-in</h3>
                <p className="text-muted-foreground">
                  Enter a patient's MRN, National ID, or phone number to begin.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Recent Check-ins */}
        <div className="space-y-6">
          <RecentCheckinsCard />
        </div>
      </div>
    </div>
  );
}
