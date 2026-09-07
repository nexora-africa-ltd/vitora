/**
 * Encounter Edit - Review Step
 *
 * Final step in the encounter edit workflow.
 * Shows SOAP summary and allows finalization.
 *
 * Route: /encounters/[id]/edit/review
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Loader2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterEditInsights } from '@/components/encounters/encounter-edit-insights';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useUpdateEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useAuth } from '@/lib/auth/context';
import { useToast } from '@/lib/hooks/use-toast';
import { useEncounterCDSAlerts } from '@/lib/hooks/use-cds';
import { CDSAlertsPanel } from '@/components/encounters/cds-alerts-panel';
import { CDSCriticalDialog } from '@/components/encounters/cds-critical-dialog';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import { AlertTriangle, CheckSquare } from 'lucide-react';
import {
  ENCOUNTER_DISPOSITION_DISPLAY,
  DISPOSITIONS_REQUIRING_NOTES,
  type EncounterDisposition,
} from '@/lib/types/encounter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { getApiErrorMessage } from '@/lib/api/client';
import { AxiosError } from 'axios';

type FieldErrorMap = Record<string, string[]>;

function toFieldLabel(field: string): string {
  return field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function normalizeFinalizeError(error: unknown): { message: string; fieldErrors: FieldErrorMap } {
  const message = getApiErrorMessage(error) || 'Failed to finalize encounter.';
  const fieldErrors: FieldErrorMap = {};

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (['detail', 'error', 'message', 'code'].includes(key)) {
          continue;
        }

        if (Array.isArray(value)) {
          const messages = value.filter((v): v is string => typeof v === 'string');
          if (messages.length > 0) {
            fieldErrors[key] = messages;
          }
        } else if (typeof value === 'string') {
          fieldErrors[key] = [value];
        }
      }
    }
  }

  return { message, fieldErrors };
}

function mapFieldToSection(field: string): 'vitals' | 'history' | 'notes' | 'diagnosis' | null {
  const vitalsFields = new Set([
    'temperature',
    'pulse',
    'blood_pressure',
    'respiratory_rate',
    'spo2',
    'weight',
    'height',
  ]);
  const historyFields = new Set([
    'allergies',
    'chronic_conditions',
    'current_medications',
    'past_surgeries',
    'family_history',
    'social_history',
  ]);
  const notesFields = new Set(['notes', 'history_of_present_illness', 'physical_examination', 'assessment']);
  const diagnosisFields = new Set([
    'icd10_code',
    'icd11_code',
    'icd11_display',
    'snomed_code',
    'snomed_display',
    'free_text_diagnosis',
  ]);

  if (vitalsFields.has(field)) return 'vitals';
  if (historyFields.has(field)) return 'history';
  if (notesFields.has(field)) return 'notes';
  if (diagnosisFields.has(field)) return 'diagnosis';
  return null;
}

export default function EncounterEditReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const encounterRouteId = String(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const encounterStoreId = encounter?.id ?? 0;
  const { getSession, getFormData, clearSession, getSectionCompletion } = useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();

  // Fetch diagnoses, lab orders, prescriptions for SOAP summary
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterRouteId);
  const { data: labOrders } = useEncounterLabOrders(encounterStoreId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterStoreId);

  const session = getSession(encounterStoreId);
  const completion = getSectionCompletion(encounterStoreId);

  // CDS alerts — check for unresolved critical/high alerts
  const { data: cdsData } = useEncounterCDSAlerts(encounterStoreId);
  const [showCDSDialog, setShowCDSDialog] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState<EncounterDisposition>('');
  const [dispositionNotes, setDispositionNotes] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeErrorMessage, setFinalizeErrorMessage] = useState<string | null>(null);
  const [finalizeFieldErrors, setFinalizeFieldErrors] = useState<FieldErrorMap>({});
  const hasUnresolvedCritical = useMemo(() => {
    const alerts = cdsData?.results || [];
    return alerts.some((a) => {
      const p = a.priority.toUpperCase();
      return (p === 'CRITICAL' || p === 'HIGH') && a.is_pending;
    });
  }, [cdsData]);

  // Get provider name
  const providerName = user
    ? user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username
    : undefined;

  // Build form data for SOAP summary
  const formData = useMemo((): EncounterFormData | null => {
    return getFormData(encounterStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterStoreId, getFormData, session]);

  // Convert diagnoses to form format
  const diagnosisFormData = useMemo((): DiagnosisFormData[] => {
    if (!existingDiagnoses) return [];
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];

    return diagnosisArray.map((d) => {
      // Build display: prefer description over bare code, include coding system label
      let icd10Display: string | null = null;
      if (d.icd10_description) {
        icd10Display = d.icd10_code_display
          ? `${d.icd10_description} (ICD-10: ${d.icd10_code_display})`
          : d.icd10_description;
      } else if (d.icd10_code_display) {
        icd10Display = `ICD-10: ${d.icd10_code_display}`;
      }

      const icd11Display = d.icd11_display
        ? d.icd11_code
          ? `${d.icd11_display} (ICD-11: ${d.icd11_code})`
          : d.icd11_display
        : d.icd11_code
          ? `ICD-11: ${d.icd11_code}`
          : null;

      const snomedDisplay = d.snomed_display
        ? d.snomed_code
          ? `${d.snomed_display} (SNOMED: ${d.snomed_code})`
          : d.snomed_display
        : d.snomed_code
          ? `SNOMED: ${d.snomed_code}`
          : null;

      return {
        icd10_code: d.icd10_code,
        icd10_display: icd10Display,
        icd11_code: d.icd11_code || null,
        icd11_display: icd11Display,
        snomed_code: d.snomed_code || null,
        snomed_display: snomedDisplay,
        diagnosis_type: d.diagnosis_type,
        free_text_diagnosis: d.free_text_diagnosis || '',
        notes: d.notes || '',
        is_confirmed: d.is_confirmed,
        certainty: d.certainty,
      };
    });
  }, [existingDiagnoses]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Count completed sections
  const completedCount = completion ? Object.values(completion).filter(Boolean).length : 0;
  const erroredSections = useMemo(() => {
    const sections = new Set<'vitals' | 'history' | 'notes' | 'diagnosis'>();
    for (const field of Object.keys(finalizeFieldErrors)) {
      const section = mapFieldToSection(field);
      if (section) {
        sections.add(section);
      }
    }
    return Array.from(sections);
  }, [finalizeFieldErrors]);

  useEffect(() => {
    setSelectedDisposition((encounter?.disposition ?? '') as EncounterDisposition);
    setDispositionNotes(encounter?.disposition_notes ?? '');
  }, [encounter?.disposition, encounter?.disposition_notes]);

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterRouteId}/edit/referrals`);
  }, [encounterRouteId, router]);

  // Save and stay
  const handleSave = useCallback(async () => {
    if (!formData) return;

    setFinalizeErrorMessage(null);
    setFinalizeFieldErrors({});

    try {
      const bp =
        formData.blood_pressure_systolic && formData.blood_pressure_diastolic
          ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
          : '';

      await updateEncounter.mutateAsync({
        id: encounterRouteId,
        data: {
          encounter_type: formData.encounter_type,
          encounter_date: formData.encounter_date,
          chief_complaint: formData.chief_complaint,
          temperature: formData.temperature,
          pulse: formData.pulse,
          blood_pressure: bp,
          respiratory_rate: formData.respiratory_rate,
          spo2: formData.spo2,
          weight: formData.weight,
          height: formData.height,
          allergies: formData.allergies,
          chronic_conditions: formData.chronic_conditions,
          current_medications: formData.current_medications,
          past_surgeries: formData.past_surgeries,
          family_history: formData.family_history,
          social_history: formData.social_history,
          notes: formData.notes,
          history_of_present_illness: formData.history_of_present_illness,
          physical_examination: formData.physical_examination,
          assessment: formData.assessment,
          clinical_template: formData.clinical_template,
          clinical_template_data: formData.clinical_template_data,
        },
      });

      toast({
        title: 'Encounter Saved',
        description: 'All changes have been saved successfully.',
      });
    } catch (err) {
      const normalized = normalizeFinalizeError(err);
      setFinalizeErrorMessage(normalized.message);
      setFinalizeFieldErrors(normalized.fieldErrors);

      toast({
        title: 'Save failed',
        description: normalized.message,
        variant: 'destructive',
      });
    }
  }, [formData, encounterRouteId, updateEncounter, toast]);

  // Actual finalize logic
  const handleFinalize = useCallback(async () => {
    if (!formData) return;
    setShowCDSDialog(false);
    setShowFinalizeDialog(false);
    setIsFinalizing(true);
    setFinalizeErrorMessage(null);
    setFinalizeFieldErrors({});

    try {
      // First save all the data
      const bp =
        formData.blood_pressure_systolic && formData.blood_pressure_diastolic
          ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
          : null;

      await updateEncounter.mutateAsync({
        id: encounterRouteId,
        data: {
          encounter_type: formData.encounter_type,
          encounter_date: formData.encounter_date,
          chief_complaint: formData.chief_complaint,
          temperature: formData.temperature,
          pulse: formData.pulse,
          blood_pressure: bp,
          respiratory_rate: formData.respiratory_rate,
          spo2: formData.spo2,
          weight: formData.weight,
          height: formData.height,
          allergies: formData.allergies,
          chronic_conditions: formData.chronic_conditions,
          current_medications: formData.current_medications,
          past_surgeries: formData.past_surgeries,
          family_history: formData.family_history,
          social_history: formData.social_history,
          notes: formData.notes,
          history_of_present_illness: formData.history_of_present_illness,
          physical_examination: formData.physical_examination,
          assessment: formData.assessment,
          clinical_template: formData.clinical_template,
          clinical_template_data: formData.clinical_template_data,
          disposition: selectedDisposition || null,
          disposition_notes: dispositionNotes || '',
        },
      });

      // Then finalize
      const { encountersApi } = await import('@/lib/api/encounters');
      await encountersApi.finalize(encounterRouteId);

      // Clear the edit session
      clearSession(encounterStoreId);

      toast({
        title: 'Encounter Finalized',
        description: 'The encounter has been marked as completed.',
      });

      // Navigate to encounter detail
      router.push(`/encounters/${encounterRouteId}`);
    } catch (err) {
      const normalized = normalizeFinalizeError(err);
      setFinalizeErrorMessage(normalized.message);
      setFinalizeFieldErrors(normalized.fieldErrors);

      toast({
        title: 'Finalize failed',
        description: normalized.message,
        variant: 'destructive',
      });
    } finally {
      setIsFinalizing(false);
    }
  }, [
    formData,
    encounterRouteId,
    encounterStoreId,
    updateEncounter,
    clearSession,
    toast,
    router,
    selectedDisposition,
    dispositionNotes,
  ]);

  // Finalize encounter — if unresolved critical alerts exist, show dialog first
  const handleFinalizeClick = useCallback(() => {
    if (hasUnresolvedCritical) {
      setShowCDSDialog(true);
      return;
    }
    setShowFinalizeDialog(true);
  }, [hasUnresolvedCritical]);

  const handleConfirmFinalize = useCallback(() => {
    setFinalizeErrorMessage(null);
    setFinalizeFieldErrors({});

    if (!selectedDisposition) {
      toast({
        title: 'Disposition required',
        description: 'Select a disposition before finalizing the encounter.',
        variant: 'destructive',
      });
      return;
    }

    if (
      DISPOSITIONS_REQUIRING_NOTES.includes(selectedDisposition) &&
      dispositionNotes.trim().length === 0
    ) {
      toast({
        title: 'Disposition notes required',
        description: `${ENCOUNTER_DISPOSITION_DISPLAY[selectedDisposition]} requires disposition notes.`,
        variant: 'destructive',
      });
      return;
    }

    handleFinalize();
  }, [selectedDisposition, dispositionNotes, handleFinalize, toast]);

  if (isLoading || !session || !formData) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Review & Finalize"
        helpContent="Review the SOAP note summary and finalize the encounter when complete. Finalized encounters cannot be edited."
      />

      {/* Proactive AI Insights */}
      <EncounterEditInsights />

      {/* Non-editable warning */}
      {!isEditable && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription className="text-sm">
            This encounter is {encounter?.status?.toLowerCase()} and cannot be edited.
          </AlertDescription>
        </Alert>
      )}

      {/* Finalize Error Summary */}
      {(finalizeErrorMessage || Object.keys(finalizeFieldErrors).length > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Finalize blocked by validation errors</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            {finalizeErrorMessage && <p>{finalizeErrorMessage}</p>}
            {Object.keys(finalizeFieldErrors).length > 0 && (
              <div className="space-y-1">
                {Object.entries(finalizeFieldErrors).map(([field, errors]) => (
                  <p key={field}>
                    <span className="font-medium">{toFieldLabel(field)}:</span> {errors.join(' ')}
                  </p>
                ))}
              </div>
            )}
            {erroredSections.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {erroredSections.map((section) => (
                  <Button
                    key={section}
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/encounters/${encounterRouteId}/edit/${section}`)}
                  >
                    Fix in {toFieldLabel(section)}
                  </Button>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Documentation Progress
          </CardTitle>
          <CardDescription>{completedCount} of 6 sections completed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'vitals', label: 'Vitals' },
              { key: 'history', label: 'History' },
              { key: 'notes', label: 'Notes' },
              { key: 'diagnosis', label: 'Diagnosis' },
              { key: 'orders', label: 'Orders' },
              { key: 'referrals', label: 'Referrals' },
            ].map(({ key, label }) => {
              const isComplete = completion?.[key as keyof typeof completion];
              return (
                <Badge
                  key={key}
                  variant={isComplete ? 'default' : 'outline'}
                  className={isComplete ? 'bg-green-600' : ''}
                >
                  {isComplete && <CheckCircle className="mr-1 h-3 w-3" />}
                  {label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Disposition Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Disposition</CardTitle>
          <CardDescription>
            Read-only snapshot of the saved encounter disposition before finalization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Disposition:</span>
            <Badge variant={encounter?.disposition ? 'default' : 'secondary'}>
              {encounter?.disposition
                ? ENCOUNTER_DISPOSITION_DISPLAY[
                    encounter.disposition as Exclude<EncounterDisposition, ''>
                  ]
                : 'Not set'}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Notes:</span>{' '}
            {encounter?.disposition_notes?.trim()
              ? encounter.disposition_notes
              : 'No disposition notes saved yet.'}
          </div>
        </CardContent>
      </Card>

      {/* CDS Alerts Panel — advisory alerts for this encounter */}
      <CDSAlertsPanel encounterId={encounterStoreId} />

      {/* SOAP Note Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            SOAP Note Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SOAPNoteSummary
            formData={formData}
            diagnoses={diagnosisFormData}
            labOrders={labOrders || []}
            prescriptions={prescriptions || []}
            patientName={encounter?.patient_name ?? undefined}
            patientMrn={encounter?.patient_mrn ?? undefined}
            encounterDate={encounter?.encounter_date ?? undefined}
            providerName={providerName}
            disabled={true}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Step 7 of 7 — Ready for finalization</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateEncounter.isPending || !isEditable}
              >
                {updateEncounter.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save & Continue Later
              </Button>
              {isEditable && encounter?.status !== 'CLOSED' && (
                <Button
                  onClick={handleFinalizeClick}
                  disabled={updateEncounter.isPending || isFinalizing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {updateEncounter.isPending || isFinalizing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Finalize Encounter
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CDS Critical Alert Resolution Dialog */}
      <CDSCriticalDialog
        encounterId={encounterStoreId}
        open={showCDSDialog}
        onOpenChange={setShowCDSDialog}
        onProceed={() => setShowFinalizeDialog(true)}
        isFinalizePending={updateEncounter.isPending || isFinalizing}
      />

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Encounter</DialogTitle>
            <DialogDescription>
              Set disposition before finalizing. This improves handoff clarity and KENHDD compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="encounter-disposition">Disposition</Label>
              <Select
                value={selectedDisposition}
                onValueChange={(value) => setSelectedDisposition(value as EncounterDisposition)}
              >
                <SelectTrigger id="encounter-disposition">
                  <SelectValue placeholder="Select disposition" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENCOUNTER_DISPOSITION_DISPLAY)
                    .filter(([value]) => value !== '')
                    .map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {finalizeFieldErrors.disposition?.length ? (
                <p className="text-xs text-destructive">{finalizeFieldErrors.disposition[0]}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="encounter-disposition-notes">
                Disposition Notes
                {selectedDisposition && DISPOSITIONS_REQUIRING_NOTES.includes(selectedDisposition)
                  ? ' (Required)'
                  : ' (Optional)'}
              </Label>
              <Textarea
                id="encounter-disposition-notes"
                placeholder="Document referral/advice details or relevant discharge instructions."
                value={dispositionNotes}
                onChange={(event) => setDispositionNotes(event.target.value)}
                rows={4}
              />
              {finalizeFieldErrors.disposition_notes?.length ? (
                <p className="text-xs text-destructive">{finalizeFieldErrors.disposition_notes[0]}</p>
              ) : null}
            </div>

            {Object.keys(finalizeFieldErrors).length > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1 text-xs">
                  {Object.entries(finalizeFieldErrors).map(([field, errors]) => (
                    <p key={`dialog-${field}`}>
                      <span className="font-medium">{toFieldLabel(field)}:</span> {errors.join(' ')}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFinalizeDialog(false)}
              disabled={updateEncounter.isPending || isFinalizing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFinalize}
              disabled={updateEncounter.isPending || isFinalizing}
              className="bg-green-600 hover:bg-green-700"
            >
              {updateEncounter.isPending || isFinalizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Confirm & Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
