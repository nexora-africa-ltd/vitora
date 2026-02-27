/**
 * Encounter Edit Flow Layout
 *
 * Wraps all /encounters/[id]/edit/* routes with:
 * - EncounterEditTabs for step navigation
 * - Store initialization from encounter data
 * - Auto-save status indicator
 *
 * Parent layout already provides:
 * - PatientProvider (patient context)
 * - EncounterProvider (encounter context)
 * - PatientShellHeader
 *
 * Usage:
 * - Automatically applied to all routes under /encounters/[id]/edit/
 * - Children have access to useEncounterContext() and useEncounterEditStore()
 */
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { EncounterEditTabs } from '@/components/encounters/encounter-edit-tabs';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { DiagnosisFormData } from '@/lib/types/encounter-form';

// =============================================================================
// Helper: Parse blood pressure string
// =============================================================================

function parseBP(bp: string | null | undefined): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null };
  const parts = bp.split('/');
  if (parts.length !== 2) return { systolic: null, diastolic: null };
  return {
    systolic: parseInt(parts[0] || '') || null,
    diastolic: parseInt(parts[1] || '') || null,
  };
}

// =============================================================================
// Error Component
// =============================================================================

function EditLayoutError({ message }: { message: string }) {
  const params = useParams();
  const encounterId = params.id;

  return (
    <div className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href={`/encounters/${encounterId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Encounter
          </Link>
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Component
// =============================================================================

function EditLayoutLoading() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Tab skeleton */}
      <div className="border-b px-4 py-2">
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-8 w-16 sm:w-20 shrink-0" />
          ))}
        </div>
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <Skeleton className="h-6 w-48 sm:h-8 sm:w-64 mb-4" />
        <Skeleton className="h-48 sm:h-64 w-full" />
      </main>
    </div>
  );
}

// =============================================================================
// Layout Content
// =============================================================================

function EditLayoutContent({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const encounterId = Number(params.id);
  const { encounter, isLoading, error } = useEncounterContext();
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterId);
  const { initSession, getSession } = useEncounterEditStore();

  // Initialize store session when encounter data is available
  useEffect(() => {
    if (!encounter || isLoading) return;

    // Check if session already exists
    const existingSession = getSession(encounterId);
    if (existingSession) return;

    // Parse blood pressure
    const bp = parseBP(encounter.blood_pressure);

    // Convert existing diagnoses to form format
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];

    const diagnoses: DiagnosisFormData[] = diagnosisArray.map((d) => ({
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

    // Initialize session with encounter data
    initSession(encounterId, encounter.patient, {
      encounter_type: encounter.encounter_type,
      encounter_date: encounter.encounter_date,
      chief_complaint: encounter.chief_complaint || '',
      status: encounter.status === 'CANCELLED' ? 'CREATED' : encounter.status,
      // Vitals
      temperature: encounter.temperature,
      pulse: encounter.pulse,
      blood_pressure_systolic: bp.systolic,
      blood_pressure_diastolic: bp.diastolic,
      respiratory_rate: encounter.respiratory_rate,
      spo2: encounter.spo2,
      weight: encounter.weight,
      height: encounter.height,
      // History
      allergies: encounter.allergies || '',
      chronic_conditions: encounter.chronic_conditions || '',
      current_medications: encounter.current_medications || '',
      past_surgeries: encounter.past_surgeries || '',
      family_history: encounter.family_history || '',
      social_history: encounter.social_history || '',
      // Notes
      history_of_present_illness: encounter.history_of_present_illness || '',
      physical_examination: encounter.physical_examination || '',
      assessment: encounter.assessment || '',
      notes: encounter.notes || '',
      clinical_template: encounter.clinical_template || null,
      clinical_template_data: encounter.clinical_template_data || null,
    }, diagnoses);
  }, [encounter, isLoading, encounterId, existingDiagnoses, initSession, getSession]);

  if (isLoading) {
    return <EditLayoutLoading />;
  }

  if (error) {
    return <EditLayoutError message={error.message} />;
  }

  if (!encounter) {
    return <EditLayoutError message="Encounter not found" />;
  }

  return (
    <div className="flex flex-col min-h-full -m-4 md:-m-6 lg:-m-8">
      <EncounterEditTabs />
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function EncounterEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EditLayoutContent>{children}</EditLayoutContent>;
}
