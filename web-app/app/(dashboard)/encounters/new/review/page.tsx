/**
 * New Encounter - Review Step
 *
 * Final step in the new encounter workflow.
 * Shows a summary of all entered data and allows creating the encounter.
 *
 * Route: /encounters/new/review
 */
'use client';

import { useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  User,
  Stethoscope,
  FileText,
  ClipboardList,
  Activity,
  AlertTriangle,
  Loader2,
  SendHorizontal,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import { useCreateEncounterWithValidation } from '@/lib/hooks/use-encounter-form';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useToast } from '@/lib/hooks/use-toast';
import { LEGACY_TRIAGE_FLOW } from '@/lib/utils/constants';

// =============================================================================
// Summary Section Component
// =============================================================================

interface SummarySectionProps {
  icon: React.ReactNode;
  title: string;
  isComplete: boolean;
  children: React.ReactNode;
}

function SummarySection({ icon, title, isComplete, children }: SummarySectionProps) {
  return (
    <div className="border rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="font-medium text-sm sm:text-base">{title}</h3>
        {isComplete && (
          <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
        )}
      </div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

// =============================================================================
// Page Component
// =============================================================================

export default function NewEncounterReviewPage() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    getPatient,
    getDetails,
    getHistory,
    getNotes,
    getDiagnoses,
    getSectionCompletion,
    getFormData,
    clearSession,
  } = useNewEncounterStore();

  const createEncounter = useCreateEncounterWithValidation();
  const checkInPatient = useCheckInPatient();

  const [showTriageModal, setShowTriageModal] = useState(false);
  const [createdEncounterId, setCreatedEncounterId] = useState<number | null>(null);

  const { data: patientData } = getPatient();
  const details = getDetails();
  const history = getHistory();
  const notes = getNotes();
  const diagnoses = getDiagnoses();
  const completion = getSectionCompletion();

  // Check if required sections are complete
  const canCreate = useMemo(() => {
    return (
      patientData !== null &&
      details.chief_complaint.trim() !== ''
    );
  }, [patientData, details]);

  // Check if encounter type requires immediate attention (skip triage prompt)
  const isUrgentEncounterType =
    details.encounter_type === 'EMERGENCY' || details.encounter_type === 'IPD';

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/diagnosis');
  }, [router]);

  // Save as draft
  const handleSaveDraft = useCallback(async () => {
    const formData = getFormData();
    if (!formData) {
      toast({
        title: 'Error',
        description: 'Unable to retrieve form data',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createEncounter.mutateAsync({
        ...formData,
        status: 'CREATED',
      });

      toast({
        title: 'Draft Saved',
        description: 'Encounter has been saved as draft',
      });

      clearSession();
      router.push('/encounters');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save encounter',
        variant: 'destructive',
      });
    }
  }, [getFormData, createEncounter, toast, clearSession, router]);

  // Create encounter
  const handleCreate = useCallback(async () => {
    const formData = getFormData();
    if (!formData) {
      toast({
        title: 'Error',
        description: 'Unable to retrieve form data',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await createEncounter.mutateAsync({
        ...formData,
        status: 'IN_PROGRESS',
      });

      // For EMERGENCY or IPD encounters, skip triage modal
      if (isUrgentEncounterType) {
        toast({
          title: 'Encounter Created',
          description: `${details.encounter_type} encounter created. Vitals can be recorded later.`,
        });
        clearSession();
        router.push(`/encounters/${result.id}`);
        return;
      }

      // For OPD encounters, add patient to triage waiting queue
      // This ensures they appear in "Patients Awaiting Triage"
      try {
        await checkInPatient.mutateAsync({
          patient_id: patientData!.id,
          encounter_id: result.id,
          reason_for_visit: details.chief_complaint,
          create_encounter: false, // We already created the encounter
        });
      } catch (checkInError) {
        // If patient is already in queue, that's fine - continue with the flow
        console.log('Check-in note:', checkInError);
      }

      // Show triage modal
      setCreatedEncounterId(result.id);
      setShowTriageModal(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create encounter',
        variant: 'destructive',
      });
    }
  }, [getFormData, createEncounter, checkInPatient, toast, isUrgentEncounterType, details, patientData, clearSession, router]);

  // Handle triage modal response
  const handleGoToTriage = useCallback(() => {
    if (createdEncounterId && patientData) {
      clearSession();
      if (LEGACY_TRIAGE_FLOW) {
        router.push(`/triage/new?patientId=${patientData.id}&encounterId=${createdEncounterId}`);
      } else {
        router.push(`/triage/assess/${patientData.id}/${createdEncounterId}/vitals`);
      }
    }
  }, [createdEncounterId, patientData, clearSession, router]);

  const handleSkipTriage = useCallback(() => {
    setShowTriageModal(false);
    clearSession();
    toast({
      title: 'Encounter Created',
      description: 'Encounter has been created. You can record vitals later in Triage.',
    });
    router.push('/encounters');
  }, [clearSession, toast, router]);

  // Redirect if missing required data
  if (!patientData) {
    router.push('/encounters/new/patient');
    return null;
  }

  // Check if history has data
  const hasHistory =
    history.allergies?.trim() ||
    history.chronic_conditions?.trim() ||
    history.current_medications?.trim() ||
    history.past_surgeries?.trim() ||
    history.family_history?.trim() ||
    history.social_history?.trim();

  // Check if notes have data
  const hasNotes =
    notes.history_of_present_illness?.trim() ||
    notes.physical_examination?.trim() ||
    notes.assessment?.trim() ||
    notes.notes?.trim();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Triage Redirect Modal */}
      <Dialog open={showTriageModal} onOpenChange={setShowTriageModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Record Vital Signs?
            </DialogTitle>
            <DialogDescription>
              The encounter has been created successfully. Vital signs have not been recorded
              yet. Would you like to record vitals now through Triage?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vitals Required</AlertTitle>
              <AlertDescription>
                Vital signs are essential for proper patient assessment and triage
                prioritization.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSkipTriage}>
              Skip for Now
            </Button>
            <Button onClick={handleGoToTriage}>
              <Activity className="h-4 w-4 mr-2" />
              Record Vitals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Review Card */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              Review & Create
            </CardTitle>
            <CardDescription>
              Review the encounter details before creating.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-4">
            {/* Patient Section */}
            <SummarySection
              icon={<User className="h-4 w-4" />}
              title="Patient"
              isComplete={!!completion?.patient}
            >
              <div className="font-medium text-foreground">
                {patientData.first_name} {patientData.last_name}
              </div>
              <div className="text-xs">{patientData.mrn}</div>
            </SummarySection>

            {/* Details Section */}
            <SummarySection
              icon={<Stethoscope className="h-4 w-4" />}
              title="Encounter Details"
              isComplete={!!completion?.details}
            >
              <div className="space-y-1">
                <div>
                  <span className="font-medium text-foreground">Type:</span>{' '}
                  {details.encounter_type}
                </div>
                <div>
                  <span className="font-medium text-foreground">Date:</span>{' '}
                  {details.encounter_date}
                </div>
                <div>
                  <span className="font-medium text-foreground">Chief Complaint:</span>{' '}
                  {details.chief_complaint || (
                    <span className="text-destructive">Not provided</span>
                  )}
                </div>
              </div>
            </SummarySection>

            {/* History Section */}
            <SummarySection
              icon={<FileText className="h-4 w-4" />}
              title="Medical History"
              isComplete={!!completion?.history}
            >
              {hasHistory ? (
                <div className="space-y-1">
                  {history.allergies && (
                    <div>
                      <span className="font-medium text-foreground">Allergies:</span>{' '}
                      {history.allergies}
                    </div>
                  )}
                  {history.chronic_conditions && (
                    <div>
                      <span className="font-medium text-foreground">Chronic:</span>{' '}
                      {history.chronic_conditions}
                    </div>
                  )}
                  {history.current_medications && (
                    <div>
                      <span className="font-medium text-foreground">Medications:</span>{' '}
                      {history.current_medications}
                    </div>
                  )}
                </div>
              ) : (
                <span className="italic">No history recorded</span>
              )}
            </SummarySection>

            {/* Notes Section */}
            <SummarySection
              icon={<ClipboardList className="h-4 w-4" />}
              title="Clinical Notes"
              isComplete={!!completion?.notes}
            >
              {hasNotes ? (
                <div className="space-y-1">
                  {notes.history_of_present_illness && (
                    <div>
                      <span className="font-medium text-foreground">HPI:</span>{' '}
                      {notes.history_of_present_illness.slice(0, 100)}
                      {notes.history_of_present_illness.length > 100 && '...'}
                    </div>
                  )}
                  {notes.assessment && (
                    <div>
                      <span className="font-medium text-foreground">Assessment:</span>{' '}
                      {notes.assessment.slice(0, 100)}
                      {notes.assessment.length > 100 && '...'}
                    </div>
                  )}
                </div>
              ) : (
                <span className="italic">No notes recorded</span>
              )}
            </SummarySection>

            {/* Diagnoses Section */}
            <SummarySection
              icon={<Stethoscope className="h-4 w-4" />}
              title="Diagnoses"
              isComplete={!!completion?.diagnosis}
            >
              {diagnoses.length > 0 ? (
                <div className="space-y-1">
                  {diagnoses.map((dx, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {dx.icd10_code || dx.icd11_code || 'N/A'}
                      </Badge>
                      <span>{dx.icd10_display || dx.icd11_display || dx.free_text_diagnosis}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="italic">No diagnoses added</span>
              )}
            </SummarySection>
          </CardContent>
        </Card>

        {/* Validation Warning */}
        {!canCreate && (
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Cannot Create Encounter</AlertTitle>
            <AlertDescription>
              Please complete all required fields: Patient selection and Chief complaint.
            </AlertDescription>
          </Alert>
        )}

        {/* Vitals Info Banner */}
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <Activity className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">
            Vital Signs Recording
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            After creating the encounter, you&apos;ll be prompted to record vital signs through
            the Triage module for proper patient prioritization.
          </AlertDescription>
        </Alert>

        {/* Navigation & Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={createEncounter.isPending || !canCreate}
            >
              {createEncounter.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              <span className="sm:hidden">Draft</span>
              <span className="hidden sm:inline">Save Draft</span>
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createEncounter.isPending || !canCreate}
            >
              {createEncounter.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4 mr-2" />
              )}
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create Encounter</span>
            </Button>
          </div>
        </div>
    </div>
  );
}
