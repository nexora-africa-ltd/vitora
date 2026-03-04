/**
 * Triage Assess Layout
 *
 * Wraps all /triage/assess/[patientId]/[encounterId]/* routes with
 * PatientProvider and EncounterProvider.
 *
 * Flow:
 * 1. Validate patientId and encounterId from params
 * 2. Wrap with PatientProvider for patient context
 * 3. Wrap with EncounterProvider for encounter context
 * 4. Display compact PatientShellHeader with patient/encounter info
 * 5. Display TriageAssessTabs for tab navigation
 *
 * Usage:
 * - Automatically applied to all routes under /triage/assess/[patientId]/[encounterId]/
 * - Children have access to both usePatientContext() and useEncounterContext()
 */
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PatientProvider, usePatientContext } from '@/lib/context/patient-context';
import { EncounterProvider, useEncounterContext } from '@/lib/context/encounter-context';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { calculateAge } from '@/lib/utils/format';
import { calculateMAP, parseBPAndCalculateMAP } from '@/lib/vitals';
import { PatientShellHeader } from '@/components/layout/patient-shell-header';
import { TriageAssessTabs } from '@/components/triage/triage-assess-tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { AIQuickAction } from '@/lib/types/ai';

// =============================================================================
// Error Component
// =============================================================================

function TriageLayoutError({ message }: { message: string }) {
  return (
    <div className="container mx-auto px-3 py-6 sm:px-4 sm:py-8">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/triage">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Triage Queue
          </Link>
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Component
// =============================================================================

function TriageLayoutLoading() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-card border-b px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full" />
          <div className="space-y-1.5 sm:space-y-2">
            <Skeleton className="h-4 w-24 sm:w-32" />
            <Skeleton className="h-3 w-36 sm:w-48" />
          </div>
        </div>
      </header>
      {/* Tab skeleton */}
      <div className="border-b px-4 py-2">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
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
// Triage Quick Actions
// =============================================================================

const TRIAGE_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'triage-priority',
    label: 'Suggest triage priority',
    query:
      'Based on this patient\'s current vital signs, chief complaint, and clinical presentation, what KETA triage category (RED/ORANGE/YELLOW/GREEN/BLUE) would you recommend and why?',
    userMessage: '🚦 Requesting triage priority recommendation...',
  },
  {
    id: 'triage-red-flags',
    label: 'Red flags to watch',
    query:
      'What are the critical red flags and warning signs I should watch for with this patient\'s presentation? Include any vital sign trends that would require immediate escalation.',
    userMessage: '🚩 Checking for clinical red flags...',
  },
  {
    id: 'triage-ddx',
    label: 'Differential diagnosis',
    query:
      'Provide a differential diagnosis for this patient\'s triage presentation. Consider the chief complaint, vital signs, age, and any risk factors. Rank by likelihood.',
    userMessage: '🩺 Requesting differential diagnosis...',
  },
  {
    id: 'triage-workup',
    label: 'Recommended workup',
    query:
      'What initial investigations and workup would you recommend for this patient based on their triage presentation? Include labs, imaging, and point-of-care tests.',
    userMessage: '🔬 Requesting recommended initial workup...',
  },
];

// =============================================================================
// Layout Content (wrapped in providers)
// =============================================================================

function TriageLayoutContent({ children }: { children: React.ReactNode }) {
  const { encounter, error, isLoading } = useEncounterContext();
  const { patient } = usePatientContext();
  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;

  // Subscribe to in-progress triage data from the Zustand store.
  // This updates on every field change so TibaBot sees the latest input
  // even before the triage assessment is submitted.
  const encounterId = encounter?.id;
  const triageSession = useTriageAssessStore((s) =>
    encounterId ? s.sessions[encounterId] ?? null : null
  );

  // Wire encounter + patient + in-progress triage data into AI chat context.
  // In-progress Zustand store values take priority over saved encounter values
  // because the nurse may have entered fresher data that hasn't been submitted yet.
  useEffect(() => {
    if (!setEncounterAwareContext) return;

    if (patient && encounter) {
      // --- Patient context: merge saved encounter data + in-progress history ---
      const savedAllergies = encounter.allergies
        ?.split(',')
        .map((s: string) => s.trim())
        .filter(Boolean) ?? [];
      const savedComorbidities = encounter.chronic_conditions
        ?.split(',')
        .map((s: string) => s.trim())
        .filter(Boolean) ?? [];
      const savedMeds = encounter.current_medications
        ?.split(',')
        .map((s: string) => s.trim())
        .filter(Boolean) ?? [];

      // In-progress history from triage store overrides saved data when present
      const triageHistory = triageSession?.history;
      const allergies = triageHistory?.allergies_noted
        ? triageHistory.allergies_noted.split(',').map((s) => s.trim()).filter(Boolean)
        : savedAllergies;
      const comorbidities = triageHistory?.past_medical_history
        ? triageHistory.past_medical_history.split(',').map((s) => s.trim()).filter(Boolean)
        : savedComorbidities;
      const currentMeds = triageHistory?.current_medications
        ? triageHistory.current_medications.split(',').map((s) => s.trim()).filter(Boolean)
        : savedMeds;

      // --- Encounter context: merge saved vitals + in-progress vitals ---
      const triageVitals = triageSession?.vitals;
      const triageAssessment = triageSession?.assessment;

      // In-progress vitals override saved encounter vitals when present
      const spo2 = triageVitals?.spo2
        ?? (encounter.spo2 != null ? Number(encounter.spo2) : undefined);
      const pulse = triageVitals?.heart_rate ?? encounter.pulse ?? undefined;
      const temperature = triageVitals?.temperature
        ?? (encounter.temperature != null ? Number(encounter.temperature) : undefined);
      const rr = triageVitals?.respiratory_rate ?? encounter.respiratory_rate ?? undefined;

      // Calculate MAP: prefer in-progress BP, fall back to saved BP string
      const map = (triageVitals?.systolic_bp != null && triageVitals?.diastolic_bp != null)
        ? (calculateMAP(triageVitals.systolic_bp, triageVitals.diastolic_bp) ?? undefined)
        : (parseBPAndCalculateMAP(encounter.blood_pressure) ?? undefined);

      // Chief complaint: prefer in-progress assessment, fall back to saved
      const chiefComplaint = triageAssessment?.chief_complaint
        ?? encounter.chief_complaint
        ?? undefined;

      setEncounterAwareContext(
        {
          patient_age: calculateAge(patient.date_of_birth),
          patient_sex: patient.gender,
          allergies,
          comorbidities,
          current_medications: currentMeds,
        },
        {
          chief_complaint: chiefComplaint,
          vitals: { spo2, pulse, temperature, rr, map },
        }
      );
    }

    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [patient, encounter, triageSession, setEncounterAwareContext]);

  // Register triage-specific quick actions
  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(TRIAGE_QUICK_ACTIONS);
    return () => {
      setQuickActions([]);
    };
  }, [setQuickActions]);

  if (isLoading) {
    return <TriageLayoutLoading />;
  }

  if (error) {
    return <TriageLayoutError message={error.message} />;
  }

  return (
    <div className="flex flex-col min-h-full -m-4 md:-m-6 lg:-m-8">
      <PatientShellHeader compact />
      <TriageAssessTabs />
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

// =============================================================================
// Main Layout
// =============================================================================

export default function TriageAssessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const patientIdParam = params.patientId;
  const encounterIdParam = params.encounterId;

  // Validate IDs from params
  const patientId =
    typeof patientIdParam === 'string' ? parseInt(patientIdParam, 10) : null;
  const encounterId =
    typeof encounterIdParam === 'string' ? parseInt(encounterIdParam, 10) : null;

  const isValidPatientId =
    patientId !== null && !isNaN(patientId) && patientId > 0;
  const isValidEncounterId =
    encounterId !== null && !isNaN(encounterId) && encounterId > 0;

  // Invalid patient ID
  if (!isValidPatientId) {
    return (
      <TriageLayoutError message="Invalid patient ID. Please select a patient from the triage queue." />
    );
  }

  // Invalid encounter ID
  if (!isValidEncounterId) {
    return (
      <TriageLayoutError message="Invalid encounter ID. Please select a valid encounter." />
    );
  }

  return (
    <PatientProvider patientId={patientId}>
      <EncounterProvider encounterId={encounterId}>
        <TriageLayoutContent>{children}</TriageLayoutContent>
      </EncounterProvider>
    </PatientProvider>
  );
}
