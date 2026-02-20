/**
 * Triage Module - New Triage Assessment Page
 *
 * Create a new triage assessment for a patient encounter.
 * If no patient is selected, shows a patient search interface.
 *
 * Route: /triage/new?patientId=X&encounterId=Y
 */
'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Search, UserPlus, Clock, User, Stethoscope, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TriageAssessmentForm, AlreadyTriagedWarning, TriageInProgressWarning } from '@/components/triage';
import { CheckinSuccessModal, type CheckinSuccessData } from '@/components/patients/checkin-success-modal';
import { useCreateTriageAssessment, useCompleteTriageAssessment, useWaitingQueue, useCheckInPatient, useTriageAssessmentByEncounter } from '@/lib/hooks/use-triage';
import { usePatient, usePatients } from '@/lib/hooks/use-patients';
import { useEncounter, useCreateEncounter } from '@/lib/hooks/use-encounters';
import { toast } from '@/lib/hooks/use-toast';
import { useIdempotencyKey } from '@/lib/utils';
import type { TriageAssessmentCreateData } from '@/lib/types/triage';
import type { Patient } from '@/lib/types/patient';

export default function NewTriagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get patient/encounter from query params
  const patientIdParam = searchParams.get('patientId');
  const encounterIdParam = searchParams.get('encounterId');

  // Local state for patient selection flow
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    patientIdParam ? parseInt(patientIdParam, 10) : null
  );
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(
    encounterIdParam ? parseInt(encounterIdParam, 10) : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingEncounter, setIsCreatingEncounter] = useState(false);
  // Track if user has explicitly chosen to take over an in-progress triage
  const [hasOverriddenInProgress, setHasOverriddenInProgress] = useState(false);
  // Success modal state for clinic routing
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);

  // Fetch waiting queue for quick selection
  const { data: waitingQueue, isLoading: isWaitingLoading } = useWaitingQueue({});

  // Patient search
  const { data: patientsData, isLoading: isSearching } = usePatients({
    search: searchQuery.length >= 2 ? searchQuery : undefined,
    page_size: 10,
  });

  // Fetch selected patient and encounter data
  const { data: patient, isLoading: isPatientLoading } = usePatient(selectedPatientId || 0);
  const { data: encounter, isLoading: isEncounterLoading } = useEncounter(selectedEncounterId || 0);

  // Check if triage assessment already exists for this encounter
  // This is a direct check that doesn't rely on encounter.triage_status (which can be out of sync)
  const {
    data: existingAssessment,
    isLoading: isCheckingExisting,
    isError: existingCheckError,
  } = useTriageAssessmentByEncounter(selectedEncounterId || undefined);

  // Idempotency key for duplicate submission prevention
  // Key is scoped to the encounter to prevent duplicate triage submissions
  const [idempotencyKey, clearIdempotencyKey] = useIdempotencyKey(
    selectedEncounterId ? `triage-${selectedEncounterId}` : 'triage-new'
  );

  // Mutations
  const { mutateAsync: createAssessment, isPending: isCreating } = useCreateTriageAssessment();
  const { mutateAsync: completeAssessment, isPending: isCompleting } = useCompleteTriageAssessment();
  const { mutateAsync: createEncounter } = useCreateEncounter();
  const { mutateAsync: checkInPatient } = useCheckInPatient();

  // Handle selecting a patient from search
  const handleSelectPatient = useCallback(async (patientToSelect: Patient) => {
    setSelectedPatientId(patientToSelect.id);
    setSearchQuery('');

    // Create a new encounter for this patient
    setIsCreatingEncounter(true);
    try {
      const newEncounter = await createEncounter({
        patient: patientToSelect.id,
        encounter_type: 'OPD',
        encounter_date: new Date().toISOString().split('T')[0],
        chief_complaint: 'Triage assessment',
      });
      setSelectedEncounterId(newEncounter.id);

      // Update URL params
      router.replace(`/triage/new?patientId=${patientToSelect.id}&encounterId=${newEncounter.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create encounter. Please try again.',
        variant: 'destructive',
      });
      setSelectedPatientId(null);
    } finally {
      setIsCreatingEncounter(false);
    }
  }, [createEncounter, router]);

  // Handle selecting from waiting queue
  const handleSelectFromWaiting = useCallback((waitingEntry: {
    patient: number;
    encounter: number | null;
    patient_name: string;
  }) => {
    if (waitingEntry.encounter) {
      setSelectedPatientId(waitingEntry.patient);
      setSelectedEncounterId(waitingEntry.encounter);
      router.replace(`/triage/new?patientId=${waitingEntry.patient}&encounterId=${waitingEntry.encounter}`);
    } else {
      toast({
        title: 'No Encounter',
        description: 'This patient has no encounter. Please create one first.',
        variant: 'destructive',
      });
    }
  }, [router]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (data: TriageAssessmentCreateData) => {
      if (!selectedEncounterId) return;

      try {
        // Create the assessment (sets triage_start_time, status = IN_PROGRESS)
        const assessment = await createAssessment({
          ...data,
          encounter: selectedEncounterId,
        });

        // Complete the assessment (sets triage_end_time, status = COMPLETED)
        await completeAssessment(assessment.id);

        // Clear idempotency key on successful submission
        clearIdempotencyKey();

        // Check if patient was routed to a clinic
        if (assessment.assigned_clinic && assessment.assigned_clinic_name) {
          // Show success modal with navigation options
          setSuccessData({
            patientName: patient?.first_name + ' ' + patient?.last_name || 'Patient',
            patientMrn: patient?.mrn || '',
            destination: 'clinic',
            destinationName: assessment.assigned_clinic_name,
            destinationUrl: `/clinics/${assessment.assigned_clinic}/queue`,
          });
          setShowSuccessModal(true);
        } else {
          // No clinic routing - show toast and navigate to triage queue
          toast({
            title: 'Triage Assessment Created',
            description: `Patient triaged as ${assessment.triage_category}`,
          });
          router.push('/triage');
        }
      } catch (error: unknown) {
        // Extract error message from API response
        let errorMessage = 'Failed to create triage assessment. Please try again.';

        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: Record<string, string[]> } };
          const errorData = axiosError.response?.data;

          if (errorData) {
            // Get first error message from response
            const firstKey = Object.keys(errorData)[0];
            if (firstKey && Array.isArray(errorData[firstKey])) {
              errorMessage = errorData[firstKey][0] || errorMessage;
            } else if (typeof errorData === 'string') {
              errorMessage = errorData;
            }
          }
        }

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    },
    [createAssessment, completeAssessment, selectedEncounterId, router, clearIdempotencyKey, patient]
  );

  const handleCancel = useCallback(() => {
    router.push('/triage');
  }, [router]);

  const handleClearSelection = useCallback(() => {
    setSelectedPatientId(null);
    setSelectedEncounterId(null);
    setHasOverriddenInProgress(false); // Reset override when changing patient
    router.replace('/triage/new');
  }, [router]);

  // Loading state
  const isLoading = isPatientLoading || isEncounterLoading || isCreatingEncounter || isCheckingExisting;

  // Show patient selection if no patient selected
  if (!selectedPatientId || !selectedEncounterId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          helpContent="Select a patient to begin triage assessment. You can search for patients or pick from the waiting queue."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Waiting Queue Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Waiting for Triage
              </CardTitle>
              <CardDescription>
                Patients who have checked in and are waiting to be triaged
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isWaitingLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : waitingQueue?.results?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No patients in waiting queue</p>
                  <p className="text-sm mt-1">Search for a patient below or register a new one</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {waitingQueue?.results?.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => handleSelectFromWaiting(entry)}
                        className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{entry.patient_name}</span>
                              <Badge variant="outline" className="text-xs">{entry.patient_mrn}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {entry.reason_for_visit || 'No reason specified'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">
                              {entry.wait_time_minutes} min wait
                            </div>
                            {entry.priority_hint && (
                              <Badge variant={entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'} className="text-xs">
                                {entry.priority_hint}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Patient Search Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Find Patient
              </CardTitle>
              <CardDescription>
                Search for an existing patient by name, MRN, or phone number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {searchQuery.length >= 2 && (
                <ScrollArea className="h-[250px]">
                  {isSearching ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : patientsData?.results?.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <User className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>No patients found for "{searchQuery}"</p>
                      <Button
                        variant="default"
                        size="sm"
                        className="mt-3"
                        onClick={() => router.push('/patients/new')}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Register New Patient
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {patientsData?.results?.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectPatient(p)}
                          disabled={isCreatingEncounter}
                          className="w-full p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{p.first_name} {p.last_name}</span>
                                <Badge variant="outline" className="text-xs">{p.mrn}</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other'} • {p.date_of_birth}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}

              {searchQuery.length < 2 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Type at least 2 characters to search</p>
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => router.push('/patients/new')}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Register New Patient
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading skeleton while fetching patient/encounter
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
        />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Patient or encounter not found
  if (!patient || !encounter) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Found</AlertTitle>
          <AlertDescription>
            {!patient ? 'Patient not found.' : 'Encounter not found.'}
            Please verify the patient and encounter exist.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={handleClearSelection}>
          Select Different Patient
        </Button>
      </div>
    );
  }

  // Error checking for existing assessment - couldn't verify if triage exists
  // Show warning but still allow proceeding if user is confident
  if (existingCheckError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          helpContent="Unable to verify if this encounter already has a triage assessment."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Verification Failed</AlertTitle>
          <AlertDescription>
            Could not verify if this encounter already has a triage assessment.
            This may be due to a network error or data issue.
            Please try again or select a different patient.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClearSelection}>
            Select Different Patient
          </Button>
          <Button variant="outline" onClick={() => router.push('/triage')}>
            Back to Queue
          </Button>
        </div>
      </div>
    );
  }

  // Pre-check: Triage assessment already exists for this encounter
  // This is the PRIMARY check - directly queries for existing assessment
  // Handles data inconsistency where triage_status is PENDING but assessment exists
  if (existingAssessment) {
    // Determine if it's completed or in-progress based on completed_at
    const isCompleted = !!existingAssessment.triage_end_time; // Use triage_end_time to determine completion

    if (isCompleted) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="New Triage Assessment"
            helpContent="This encounter has already been triaged. You can view the existing assessment or select a different patient."
          />
          <AlreadyTriagedWarning
            encounterId={encounter.id}
            patientName={`${patient.first_name} ${patient.last_name}`}
            onSelectDifferentPatient={handleClearSelection}
          />
        </div>
      );
    }

    // In-progress (started but not completed) - show warning unless user chose to take over
    if (!hasOverriddenInProgress) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="New Triage Assessment"
            helpContent="This encounter is currently being triaged by another user. You can wait or take over."
          />
          <TriageInProgressWarning
            encounterId={encounter.id}
            patientName={`${patient.first_name} ${patient.last_name}`}
            onSelectDifferentPatient={handleClearSelection}
            onTakeOver={() => {
              // User explicitly chooses to take over
              setHasOverriddenInProgress(true);
            }}
          />
        </div>
      );
    }
  }

  // Secondary check: Use encounter.triage_status for cases where assessment record
  // doesn't exist yet but status indicates triage state
  if (encounter.triage_status === 'COMPLETED' && !existingAssessment) {
    // Edge case: status is COMPLETED but no assessment found
    // This shouldn't happen, but handle gracefully
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          helpContent="This encounter has already been triaged. You can view the existing assessment or select a different patient."
        />
        <AlreadyTriagedWarning
          encounterId={encounter.id}
          patientName={`${patient.first_name} ${patient.last_name}`}
          onSelectDifferentPatient={handleClearSelection}
        />
      </div>
    );
  }

  // Secondary check: triage_status IN_PROGRESS but no assessment record yet
  if (encounter.triage_status === 'IN_PROGRESS' && !existingAssessment && !hasOverriddenInProgress) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          helpContent="This encounter is currently being triaged by another user. You can wait or take over."
        />
        <TriageInProgressWarning
          encounterId={encounter.id}
          patientName={`${patient.first_name} ${patient.last_name}`}
          onSelectDifferentPatient={handleClearSelection}
          onTakeOver={() => {
            setHasOverriddenInProgress(true);
          }}
        />
      </div>
    );
  }

  // Transform patient data to match form interface
  const patientForForm = {
    id: patient.id,
    mrn: patient.mrn,
    first_name: patient.first_name,
    last_name: patient.last_name,
    date_of_birth: patient.date_of_birth,
    gender: patient.gender as 'M' | 'F' | 'O',
    allergies: encounter.allergies || '',
  };

  // Transform encounter data to match form interface
  const encounterForForm = {
    id: encounter.id,
    patient: encounter.patient,
    encounter_type: encounter.encounter_type,
    spo2: encounter.spo2 ?? undefined,
    pulse: encounter.pulse ?? undefined,
    blood_pressure: encounter.blood_pressure ?? undefined,
    temperature: encounter.temperature ?? undefined,
    respiratory_rate: encounter.respiratory_rate ?? undefined,
    created_at: encounter.created_at,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Triage Assessment"
        helpContent={`Triaging: ${patient.first_name} ${patient.last_name} (${patient.mrn}). Complete the assessment and assign a triage category.`}
        actions={
          <Button variant="outline" onClick={handleClearSelection}>
            Change Patient
          </Button>
        }
      />

      <TriageAssessmentForm
        patient={patientForForm}
        encounter={encounterForForm}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isCreating}
      />

      {/* Success Modal for clinic routing */}
      <CheckinSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        checkInResult={successData}
        onDismiss={() => {
          setSuccessData(null);
          router.push('/triage');
        }}
      />
    </div>
  );
}
