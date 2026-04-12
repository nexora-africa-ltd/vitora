/**
 * New Encounter - Review Step
 *
 * Final step in the new encounter workflow.
 * Shows a summary of all entered data and allows creating the encounter.
 *
 * Route: /encounters/new/review
 */
'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
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
  Sparkles,
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
import { ShiftGate } from '@/components/shared/shift-gate';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useCreateAdmission } from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useAISuggestionAudit } from '@/lib/hooks/use-ai';
import { useSmartSuggestions } from '@/lib/hooks/use-smart-suggestions';
import { SmartSuggestionBatch } from '@/components/shared/smart-suggestion-batch';
import { LEGACY_TRIAGE_FLOW } from '@/lib/utils/constants';
import { encountersApi } from '@/lib/api/encounters';
import type { DiagnosisFormData } from '@/lib/types/encounter-form';
import type { CreateDiagnosisData } from '@/lib/api/encounters';

/**
 * Map form certainty values to the API-accepted values.
 * The form allows 'probable' but the API only accepts
 * 'suspected' | 'provisional' | 'confirmed' | 'ruled_out'.
 */
function toApiCertainty(
  certainty: DiagnosisFormData['certainty'],
): CreateDiagnosisData['certainty'] {
  return certainty === 'probable' ? 'provisional' : certainty;
}

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
    getVitals,
    hasVitals,
    getSectionCompletion,
    getFormData,
    getAdmission,
    clearSession,
  } = useNewEncounterStore();

  const createEncounter = useCreateEncounterWithValidation();
  const checkInPatient = useCheckInPatient();
  const createAdmission = useCreateAdmission();
  const user = useUser();
  const { mutate: auditSuggestionAction } = useAISuggestionAudit();

  const [showTriageModal, setShowTriageModal] = useState(false);
  const [createdEncounterId, setCreatedEncounterId] = useState<number | null>(null);
  const [showAutopopulate, setShowAutopopulate] = useState(false);

  // Smart suggestions (AI autopopulate)
  const {
    suggestions: smartSuggestions,
    pendingSuggestions,
    accept: acceptSuggestion,
    fetchSuggestions,
    isLoading: isSuggestionsLoading,
    isAvailable: isAutopopulateAvailable,
  } = useSmartSuggestions();

  const { data: patientData } = getPatient();
  const details = getDetails();
  const history = getHistory();
  const notes = getNotes();
  const diagnoses = getDiagnoses();
  const vitals = getVitals();
  const vitalsRecorded = hasVitals();
  const completion = getSectionCompletion();
  const admission = getAdmission();
  const isIPD = details.encounter_type === 'IPD';

  // Check if required sections are complete
  const canCreate = useMemo(() => {
    const baseReady = patientData !== null && details.chief_complaint.trim() !== '';
    if (isIPD) {
      return baseReady && !!admission.wardId && !!admission.bedId;
    }
    return baseReady;
  }, [patientData, details, isIPD, admission]);

  // Check if encounter type requires immediate attention (skip triage prompt)
  const isUrgentEncounterType =
    details.encounter_type === 'EMERGENCY' || details.encounter_type === 'IPD';

  // Navigate to previous step
  const handlePrevious = useCallback(() => {
    if (isIPD) {
      router.push('/encounters/new/admission');
    } else {
      router.push('/encounters/new/diagnosis');
    }
  }, [router, isIPD]);

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
      const draft = await createEncounter.mutateAsync({
        ...formData,
        status: 'CREATED',
      });

      // Save diagnoses collected during the wizard
      if (diagnoses.length > 0) {
        await Promise.all(
          diagnoses.map((dx: DiagnosisFormData) =>
            encountersApi.createDiagnosis(draft.id, {
              icd10_code: dx.icd10_code,
              diagnosis_type: dx.diagnosis_type,
              free_text_diagnosis: dx.free_text_diagnosis,
              notes: dx.notes,
              is_confirmed: dx.is_confirmed,
              certainty: toApiCertainty(dx.certainty),
            }).catch((err) => {
              console.error('Failed to save diagnosis:', err);
            })
          )
        );
      }

      clearSession();
      toast({
        title: 'Draft Saved',
        description: 'Encounter has been saved as draft.',
        action: <ToastAction altText="View encounter" onClick={() => router.push(`/encounters/${draft.id}`)}>View</ToastAction>,
      });

      router.push('/encounters');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save encounter',
        variant: 'destructive',
      });
    }
  }, [getFormData, createEncounter, diagnoses, toast, clearSession, router]);

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

      // Save diagnoses collected during the wizard
      if (diagnoses.length > 0) {
        await Promise.all(
          diagnoses.map((dx: DiagnosisFormData) =>
            encountersApi.createDiagnosis(result.id, {
              icd10_code: dx.icd10_code,
              diagnosis_type: dx.diagnosis_type,
              free_text_diagnosis: dx.free_text_diagnosis,
              notes: dx.notes,
              is_confirmed: dx.is_confirmed,
              certainty: toApiCertainty(dx.certainty),
            }).catch((err) => {
              console.error('Failed to save diagnosis:', err);
            })
          )
        );
      }

      // For EMERGENCY or IPD encounters, skip triage modal
      if (isUrgentEncounterType) {
        // For IPD, also create the admission record with ward/bed
        if (isIPD && admission.wardId && admission.bedId && user) {
          try {
            // Extract primary diagnosis for admission record
            const primaryDx = diagnoses.find((d) => d.diagnosis_type === 'PRIMARY') ?? diagnoses[0];
            await createAdmission.mutateAsync({
              patient: patientData!.id,
              ward: admission.wardId,
              bed: admission.bedId,
              payer_type: admission.payerType,
              admission_date: new Date().toISOString(),
              admitting_diagnosis: primaryDx?.icd10_display?.split(' - ')[0] || primaryDx?.free_text_diagnosis || 'Pending',
              admitting_diagnosis_text: primaryDx?.icd10_display?.split(' - ').slice(1).join(' - ') || primaryDx?.free_text_diagnosis || 'Pending assessment',
              admitting_officer: user.id,
              source_encounter: result.id,
              ...(admission.requiresIsolation ? { requires_isolation: true } : {}),
            });
            toast({
              title: 'IPD Encounter & Admission Created',
              description: `Patient admitted to ${admission.wardName || 'ward'}, bed ${admission.bedNumber || admission.bedId}.`,
              action: <ToastAction altText="View encounter" onClick={() => router.push(`/encounters/${result.id}`)}>View</ToastAction>,
            });
          } catch {
            // Encounter created but admission failed — still redirect
            toast({
              title: 'Encounter Created',
              description: 'Encounter created but admission failed. Please create admission separately.',
              variant: 'destructive',
            });
          }
        } else if (isIPD) {
          // IPD without admission details — redirect to admission recommendations
          toast({
            title: 'IPD Encounter Created',
            description: 'Encounter created. Redirecting to create admission record.',
          });
          const encId = result.id;
          const ptId = patientData!.id;
          clearSession();
          router.push(`/admissions/new?patient=${ptId}&encounter=${encId}`);
          return;
        } else {
          toast({
            title: 'Encounter Created',
            description: `${details.encounter_type} encounter created. Vitals can be recorded later.`,
            action: <ToastAction altText="View encounter" onClick={() => router.push(`/encounters/${result.id}`)}>View</ToastAction>,
          });
        }
        clearSession();
        router.push(`/encounters/${result.id}`);
        return;
      }

      // If vitals were already recorded during registration, skip triage prompt
      if (vitalsRecorded) {
        toast({
          title: 'Encounter Created',
          description: 'Encounter created successfully with vital signs.',
          action: <ToastAction altText="View encounter" onClick={() => router.push(`/encounters/${result.id}`)}>View</ToastAction>,
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
  }, [getFormData, createEncounter, checkInPatient, toast, isUrgentEncounterType, vitalsRecorded, details, patientData, clearSession, router]);

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
      action: createdEncounterId
        ? <ToastAction altText="View encounter" onClick={() => router.push(`/encounters/${createdEncounterId}`)}>View</ToastAction>
        : undefined,
    });
    router.push('/encounters');
  }, [clearSession, createdEncounterId, toast, router]);

  // Handle AI autopopulate
  const handleAutopopulate = useCallback(() => {
    fetchSuggestions({
      chief_complaint: details.chief_complaint,
      clinical_notes: notes.history_of_present_illness || '',
      allergies: history.allergies ? [history.allergies] : [],
      current_medications: history.current_medications ? [history.current_medications] : [],
      encounter_type: details.encounter_type,
    });
    setShowAutopopulate(true);
  }, [fetchSuggestions, details, notes, history]);

  // Apply selected AI suggestions to the encounter store
  const handleApplyAutopopulate = useCallback(
    (accepted: Array<{
      id: string;
      field_name: string;
      value: unknown;
      source: string;
      confidence: number;
    }>) => {
      const store = useNewEncounterStore.getState();
      for (const item of accepted) {
        acceptSuggestion(item.id);
        // Apply to the appropriate store section
        if (item.field_name === 'assessment' && typeof item.value === 'string') {
          store.setNotes({ assessment: item.value });
        } else if (item.field_name === 'allergies' && typeof item.value === 'string') {
          store.setHistory({ allergies: item.value });
        } else if (item.field_name === 'chronic_conditions' && typeof item.value === 'string') {
          store.setHistory({ chronic_conditions: item.value });
        }
      }
      if (accepted.length > 0) {
        auditSuggestionAction({
          suggestion_type: 'autopopulate',
          event_type: 'applied',
          encounter_type: details.encounter_type,
          suggestions: accepted.map((item) => ({
            suggestion_id: item.id,
            field_name: item.field_name,
            source: item.source === 'cds' || item.source === 'history' ? item.source : 'ai',
            confidence: item.confidence,
            accepted_value: item.value,
          })),
        });
      }
      toast({
        title: 'Suggestions Applied',
        description: `Applied ${accepted.length} AI suggestion${accepted.length !== 1 ? 's' : ''} to the encounter.`,
      });
    },
    [acceptSuggestion, auditSuggestionAction, details.encounter_type, toast]
  );

  // Redirect if missing required data
  useEffect(() => {
    if (!patientData) {
      router.push('/encounters/new/patient');
    }
  }, [patientData, router]);

  if (!patientData) {
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                Review & Create
              </CardTitle>
              {isAutopopulateAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutopopulate}
                  disabled={isSuggestionsLoading || !details.chief_complaint?.trim()}
                  className="gap-1.5 text-xs"
                >
                  {isSuggestionsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isSuggestionsLoading ? 'Analyzing...' : 'AI Autopopulate'}
                  </span>
                  <span className="sm:hidden">
                    {isSuggestionsLoading ? '...' : 'AI Fill'}
                  </span>
                </Button>
              )}
            </div>
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
                  {details.encounter_type === 'IPD' && details.admission_urgency && (
                    <Badge
                      variant="secondary"
                      className={`ml-2 text-xs ${
                        details.admission_urgency === 'EMERGENCY'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                          : details.admission_urgency === 'URGENT'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                      }`}
                    >
                      {details.admission_urgency === 'ROUTINE' ? 'Elective' : details.admission_urgency}
                    </Badge>
                  )}
                </div>
                <div>
                  <span className="font-medium text-foreground">Date:</span>{' '}
                  {details.encounter_date}
                </div>
                {details.chief_complaint_category && (
                  <div>
                    <span className="font-medium text-foreground">Category:</span>{' '}
                    {details.chief_complaint_category}
                  </div>
                )}
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

            {/* Admission Section (IPD only) */}
            {isIPD && (
              <SummarySection
                icon={<Activity className="h-4 w-4" />}
                title="Admission"
                isComplete={!!completion?.admission}
              >
                {admission.wardId ? (
                  <div className="space-y-1">
                    <div>
                      <span className="font-medium text-foreground">Ward:</span>{' '}
                      {admission.wardName || `Ward #${admission.wardId}`}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Bed:</span>{' '}
                      {admission.bedNumber || (admission.bedId ? `Bed #${admission.bedId}` : 'Not selected')}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Payer:</span>{' '}
                      {admission.payerType}
                    </div>
                    {(admission.requiresIsolation || admission.requiresOxygen || admission.requiresVentilator) && (
                      <div className="flex gap-1 mt-1">
                        {admission.requiresIsolation && <Badge variant="outline" className="text-xs">Isolation</Badge>}
                        {admission.requiresOxygen && <Badge variant="outline" className="text-xs">O₂</Badge>}
                        {admission.requiresVentilator && <Badge variant="outline" className="text-xs">Ventilator</Badge>}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-destructive">Ward and bed not selected</span>
                )}
              </SummarySection>
            )}
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
        {vitalsRecorded ? (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800 dark:text-green-200">
              Vital Signs Recorded
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {vitals.temperature && <span>Temp: {vitals.temperature}°C</span>}
                {vitals.pulse && <span>HR: {vitals.pulse} bpm</span>}
                {(vitals.blood_pressure_systolic && vitals.blood_pressure_diastolic) && (
                  <span>BP: {vitals.blood_pressure_systolic}/{vitals.blood_pressure_diastolic} mmHg</span>
                )}
                {vitals.spo2 && <span>SpO₂: {vitals.spo2}%</span>}
                {vitals.respiratory_rate && <span>RR: {vitals.respiratory_rate}/min</span>}
                {vitals.weight && <span>Weight: {vitals.weight} kg</span>}
                {vitals.height && <span>Height: {vitals.height} cm</span>}
              </div>
            </AlertDescription>
          </Alert>
        ) : (
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
        )}

        {/* Navigation & Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={handlePrevious}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ShiftGate>
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
            </ShiftGate>
            <ShiftGate>
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
            </ShiftGate>
          </div>
        </div>

        {/* AI Autopopulate Dialog */}
        <SmartSuggestionBatch
          open={showAutopopulate}
          onOpenChange={setShowAutopopulate}
          suggestions={smartSuggestions}
          onApply={handleApplyAutopopulate}
          title="AI Autopopulate Suggestions"
        />
    </div>
  );
}
