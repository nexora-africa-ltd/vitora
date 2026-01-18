'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LabOrderForm } from '@/components/laboratory/lab-order-form';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientContext } from '@/lib/context/patient-context';
import { useEncounterContext } from '@/lib/context/encounter-context';

export default function NewLabOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const encounterId = searchParams.get('encounter');
  const patientId = searchParams.get('patient');

  // Try to get from context first (if within patient/encounter shell)
  let contextPatient: { id?: number; first_name?: string; last_name?: string; mrn?: string; gender?: string; date_of_birth?: string } | null = null;
  let contextEncounter: { id?: number; encounter_type?: string; encounter_date?: string; chief_complaint?: string } | null = null;
  let canPlaceOrders = true;

  try {
    const patientCtx = usePatientContext();
    contextPatient = patientCtx.patient;
  } catch {
    // Not in patient context
  }

  try {
    const encounterCtx = useEncounterContext();
    contextEncounter = encounterCtx.encounter;
    canPlaceOrders = encounterCtx.canPlaceOrders;
  } catch {
    // Not in encounter context
  }

  // If encounter is provided via URL, fetch encounter details (fallback)
  const { data: encounter, isLoading: loadingEncounter } = useEncounter(
    !contextEncounter && encounterId ? parseInt(encounterId) : 0
  );

  // Use context data if available, otherwise fall back to fetched/URL data
  const effectiveEncounter = contextEncounter || encounter;
  const effectivePatient = contextPatient;

  // Determine patient info - encounter from API has patient, context encounter doesn't
  const resolvedPatientId = effectivePatient?.id || encounter?.patient || (patientId ? parseInt(patientId) : null);
  const resolvedEncounterId = contextEncounter?.id || (encounterId ? parseInt(encounterId) : null);

  const handleSuccess = (orderNumber: string) => {
    router.push(`/laboratory/orders/${orderNumber}`);
  };

  // If no patient/encounter context, show a message to select
  if (!resolvedPatientId || !resolvedEncounterId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Lab Order</h1>
            <p className="text-muted-foreground">Create a laboratory order</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Patient Context Required</h3>
              <p className="text-muted-foreground mb-4">
                Lab orders must be created within the context of a patient encounter.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => router.push('/patients')}
                >
                  Select Patient
                </Button>
                <Button onClick={() => router.push('/encounters')}>
                  View Encounters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingEncounter) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Check if orders can be placed (encounter is active)
  if (!canPlaceOrders && resolvedEncounterId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Lab Order</h1>
            <p className="text-muted-foreground">Create a laboratory order</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Encounter Not Active</h3>
              <p className="text-muted-foreground mb-4">
                Lab orders can only be created for active encounters. This encounter has been completed or cancelled.
              </p>
              <Button onClick={() => router.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Lab Order</h1>
          <p className="text-muted-foreground">
            Create a laboratory order for {effectivePatient?.first_name || encounter?.patient_name || 'patient'}
          </p>
        </div>
      </div>

      {/* Form */}
      <LabOrderForm
        patientId={resolvedPatientId}
        encounterId={resolvedEncounterId}
        patientName={effectivePatient ? `${effectivePatient.first_name} ${effectivePatient.last_name}` : encounter?.patient_name}
        patientMrn={effectivePatient?.mrn || encounter?.patient_mrn}
        patientGender={effectivePatient?.gender || encounter?.patient_gender}
        patientDateOfBirth={effectivePatient?.date_of_birth || encounter?.patient_date_of_birth}
        encounterType={contextEncounter?.encounter_type || encounter?.encounter_type}
        encounterDate={contextEncounter?.encounter_date || encounter?.encounter_date}
        chiefComplaint={contextEncounter?.chief_complaint || encounter?.chief_complaint}
        onSuccess={handleSuccess}
        onCancel={() => router.back()}
      />
    </div>
  );
}
