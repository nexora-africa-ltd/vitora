/**
 * Encounter Edit - Review Step
 *
 * Final step in the encounter edit workflow.
 * Shows SOAP summary and allows finalization.
 *
 * Route: /encounters/[id]/edit/review
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Loader2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import {
  useUpdateEncounter,
  useEncounterDiagnoses,
} from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useAuth } from '@/lib/auth/context';
import { useToast } from '@/lib/hooks/use-toast';
import { useEncounterCDSAlerts } from '@/lib/hooks/use-cds';
import { CDSAlertsPanel } from '@/components/encounters/cds-alerts-panel';
import { CDSCriticalDialog } from '@/components/encounters/cds-critical-dialog';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import { AlertTriangle, CheckSquare } from 'lucide-react';

export default function EncounterEditReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getSession, getFormData, clearSession, getSectionCompletion } = useEncounterEditStore();
  const updateEncounter = useUpdateEncounter();

  // Fetch diagnoses, lab orders, prescriptions for SOAP summary
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);

  const session = getSession(encounterId);
  const completion = getSectionCompletion(encounterId);

  // CDS alerts — check for unresolved critical/high alerts
  const { data: cdsData } = useEncounterCDSAlerts(encounterId);
  const [showCDSDialog, setShowCDSDialog] = useState(false);
  const hasUnresolvedCritical = useMemo(() => {
    const alerts = cdsData?.results || [];
    return alerts.some((a) => {
      const p = a.priority.toUpperCase();
      return (p === 'CRITICAL' || p === 'HIGH') && a.is_pending;
    });
  }, [cdsData]);

  // Get provider name
  const providerName = user
    ? (user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.username)
    : undefined;

  // Build form data for SOAP summary
  const formData = useMemo((): EncounterFormData | null => {
    return getFormData(encounterId);
  }, [encounterId, getFormData]);

  // Convert diagnoses to form format
  const diagnosisFormData = useMemo((): DiagnosisFormData[] => {
    if (!existingDiagnoses) return [];
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];

    return diagnosisArray.map((d) => ({
      icd10_code: d.icd10_code,
      icd10_display: d.icd10_code_display || d.icd10_description,
      diagnosis_type: d.diagnosis_type,
      free_text_diagnosis: d.free_text_diagnosis || '',
      notes: d.notes || '',
      is_confirmed: d.is_confirmed,
      certainty: d.certainty,
    }));
  }, [existingDiagnoses]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Count completed sections
  const completedCount = completion
    ? Object.values(completion).filter(Boolean).length
    : 0;

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/referrals`);
  }, [encounterId, router]);

  // Save and stay
  const handleSave = useCallback(async () => {
    if (!formData) return;

    try {
      const bp = formData.blood_pressure_systolic && formData.blood_pressure_diastolic
        ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
        : '';

      await updateEncounter.mutateAsync({
        id: encounterId,
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
      toast({
        title: 'Error',
        description: 'Failed to save encounter.',
        variant: 'destructive',
      });
    }
  }, [formData, encounterId, updateEncounter, toast]);

  // Finalize encounter — if unresolved critical alerts exist, show dialog first
  const handleFinalizeClick = useCallback(() => {
    if (hasUnresolvedCritical) {
      setShowCDSDialog(true);
      return;
    }
    handleFinalize();
  }, [hasUnresolvedCritical]);

  // Actual finalize logic
  const handleFinalize = useCallback(async () => {
    if (!formData) return;
    setShowCDSDialog(false);

    try {
      // First save all the data
      const bp = formData.blood_pressure_systolic && formData.blood_pressure_diastolic
        ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
        : null;

      await updateEncounter.mutateAsync({
        id: encounterId,
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

      // Then finalize
      const { encountersApi } = await import('@/lib/api/encounters');
      await encountersApi.finalize(encounterId);

      // Clear the edit session
      clearSession(encounterId);

      toast({
        title: 'Encounter Finalized',
        description: 'The encounter has been marked as completed.',
      });

      // Navigate to encounter detail
      router.push(`/encounters/${encounterId}`);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to finalize encounter.',
        variant: 'destructive',
      });
    }
  }, [formData, encounterId, updateEncounter, clearSession, toast, router]);

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

      {/* Progress Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Documentation Progress
          </CardTitle>
          <CardDescription>
            {completedCount} of 6 sections completed
          </CardDescription>
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
                  {isComplete && <CheckCircle className="h-3 w-3 mr-1" />}
                  {label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* CDS Alerts Panel — advisory alerts for this encounter */}
      <CDSAlertsPanel encounterId={encounterId} />

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
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 7 of 7 — Ready for finalization
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={updateEncounter.isPending || !isEditable}
              >
                {updateEncounter.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save & Continue Later
              </Button>
              {isEditable && encounter?.status !== 'CLOSED' && (
                <Button
                  onClick={handleFinalizeClick}
                  disabled={updateEncounter.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {updateEncounter.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
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
        encounterId={encounterId}
        open={showCDSDialog}
        onOpenChange={setShowCDSDialog}
        onProceed={handleFinalize}
        isFinalizePending={updateEncounter.isPending}
      />
    </div>
  );
}
