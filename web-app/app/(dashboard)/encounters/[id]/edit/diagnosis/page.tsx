/**
 * Encounter Edit - Diagnosis Step
 *
 * Fourth step in the encounter edit workflow.
 * Captures ICD-10/ICD-11 diagnoses.
 *
 * Route: /encounters/[id]/edit/diagnosis
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { DiagnosisFormContent } from '@/components/encounters/diagnosis-form';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import {
  useEncounterDiagnoses,
  useAddDiagnosis,
  useDeleteDiagnosis,
  useUpdateDiagnosis,
} from '@/lib/hooks/use-encounters';
import { useToast } from '@/lib/hooks/use-toast';
import type { DiagnosisFormData } from '@/lib/types/encounter-form';
import { AlertTriangle } from 'lucide-react';

export default function EncounterEditDiagnosisPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getSession, getDiagnoses, setDiagnoses, markSectionComplete } = useEncounterEditStore();

  // Use API hooks for diagnosis CRUD (saves immediately to backend)
  const { data: existingDiagnoses, isLoading: isLoadingDiagnoses } = useEncounterDiagnoses(encounterId);
  const addDiagnosis = useAddDiagnosis(encounterId);
  const deleteDiagnosis = useDeleteDiagnosis(encounterId);
  const updateDiagnosis = useUpdateDiagnosis(encounterId);

  const session = getSession(encounterId);
  const storeDiagnoses = getDiagnoses(encounterId);

  // Use existing diagnoses from API, fallback to store
  const diagnoses = useMemo((): DiagnosisFormData[] => {
    if (existingDiagnoses && existingDiagnoses.length > 0) {
      const diagnosisArray = Array.isArray(existingDiagnoses)
        ? existingDiagnoses
        : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];

      return diagnosisArray.map((d) => ({
        icd10_code: d.icd10_code,
        icd10_display: d.icd10_code_display || d.icd10_description,
        icd11_code: d.icd11_code,
        icd11_display: d.icd11_display,
        diagnosis_type: d.diagnosis_type,
        free_text_diagnosis: d.free_text_diagnosis || '',
        notes: d.notes || '',
        is_confirmed: d.is_confirmed,
        certainty: d.certainty,
      }));
    }
    return storeDiagnoses;
  }, [existingDiagnoses, storeDiagnoses]);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Handle adding a diagnosis (saves to backend immediately)
  const handleAddDiagnosis = useCallback(async (diagnosis: DiagnosisFormData) => {
    try {
      const savedDiagnosis = await addDiagnosis.mutateAsync({
        icd10_code: diagnosis.icd10_code,
        icd11_code: diagnosis.icd11_code || '',
        icd11_display: diagnosis.icd11_display || '',
        diagnosis_type: diagnosis.diagnosis_type,
        free_text_diagnosis: diagnosis.free_text_diagnosis || '',
        notes: diagnosis.notes || '',
        is_confirmed: diagnosis.is_confirmed || false,
        certainty: (diagnosis.certainty?.toLowerCase() || 'suspected') as 'confirmed' | 'provisional' | 'ruled_out' | 'suspected',
      });

      // Update local store
      setDiagnoses(encounterId, [
        ...diagnoses,
        {
          icd10_code: savedDiagnosis.icd10_code,
          icd10_display: savedDiagnosis.icd10_code_display || savedDiagnosis.icd10_description,
          icd11_code: savedDiagnosis.icd11_code,
          icd11_display: savedDiagnosis.icd11_display,
          diagnosis_type: savedDiagnosis.diagnosis_type,
          free_text_diagnosis: savedDiagnosis.free_text_diagnosis || '',
          notes: savedDiagnosis.notes || '',
          is_confirmed: savedDiagnosis.is_confirmed,
          certainty: savedDiagnosis.certainty,
        },
      ]);

      toast({
        title: 'Diagnosis Added',
        description: 'Diagnosis has been saved successfully.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save diagnosis. Please try again.',
        variant: 'destructive',
      });
    }
  }, [addDiagnosis, diagnoses, encounterId, setDiagnoses, toast]);

  // Handle removing a diagnosis
  const handleRemoveDiagnosis = useCallback(async (index: number) => {
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];
    const diagnosisToRemove = diagnosisArray[index];

    if (diagnosisToRemove?.id) {
      try {
        await deleteDiagnosis.mutateAsync(diagnosisToRemove.id);
        setDiagnoses(encounterId, diagnoses.filter((_, i) => i !== index));
        toast({
          title: 'Diagnosis Removed',
          description: 'Diagnosis has been removed successfully.',
        });
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to remove diagnosis. Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      // Local only, just remove from store
      setDiagnoses(encounterId, diagnoses.filter((_, i) => i !== index));
    }
  }, [existingDiagnoses, deleteDiagnosis, diagnoses, encounterId, setDiagnoses, toast]);

  // Handle updating a diagnosis
  const handleUpdateDiagnosis = useCallback(async (index: number, diagnosis: DiagnosisFormData) => {
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];
    const diagnosisToUpdate = diagnosisArray[index];

    if (diagnosisToUpdate?.id) {
      try {
        await updateDiagnosis.mutateAsync({
          diagnosisId: diagnosisToUpdate.id,
          data: {
            icd10_code: diagnosis.icd10_code,
            diagnosis_type: diagnosis.diagnosis_type,
            free_text_diagnosis: diagnosis.free_text_diagnosis || '',
            notes: diagnosis.notes || '',
            is_confirmed: diagnosis.is_confirmed || false,
            certainty: (diagnosis.certainty?.toLowerCase() || 'suspected') as 'confirmed' | 'provisional' | 'ruled_out' | 'suspected',
          },
        });

        setDiagnoses(encounterId, diagnoses.map((d, i) => (i === index ? diagnosis : d)));

        toast({
          title: 'Diagnosis Updated',
          description: 'Diagnosis has been updated successfully.',
        });
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to update diagnosis. Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      // Local only
      setDiagnoses(encounterId, diagnoses.map((d, i) => (i === index ? diagnosis : d)));
    }
  }, [existingDiagnoses, updateDiagnosis, diagnoses, encounterId, setDiagnoses, toast]);

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/notes`);
  }, [encounterId, router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    markSectionComplete(encounterId, 'diagnosis');
    router.push(`/encounters/${encounterId}/edit/orders`);
  }, [encounterId, markSectionComplete, router]);

  if (isLoading || !session || isLoadingDiagnoses) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Diagnosis"
        helpContent="Add ICD-10 coded diagnoses for this encounter. Search for diagnoses using keywords or ICD-10 codes. Multiple diagnoses can be added."
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

      {/* Diagnosis Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            ICD-10 Diagnoses ({diagnoses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DiagnosisFormContent
            diagnoses={diagnoses}
            onAdd={handleAddDiagnosis}
            onRemove={handleRemoveDiagnosis}
            onUpdate={handleUpdateDiagnosis}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 4 of 7 — Diagnoses recorded ({diagnoses.length} added)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext}>
                Next: Orders
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
