/**
 * Triage Module - New Triage Assessment Page
 *
 * Create a new triage assessment for a patient encounter.
 *
 * Route: /triage/new?patientId=X&encounterId=Y
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TriageAssessmentForm } from '@/components/triage';
import { useCreateTriageAssessment } from '@/lib/hooks/use-triage';
import { usePatient } from '@/lib/hooks/use-patients-enhanced';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageAssessmentCreateData } from '@/lib/types/triage';

export default function NewTriagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get patient/encounter from query params (required)
  const patientId = searchParams.get('patientId');
  const encounterId = searchParams.get('encounterId');

  // Parse IDs
  const parsedPatientId = patientId ? parseInt(patientId, 10) : 0;
  const parsedEncounterId = encounterId ? parseInt(encounterId, 10) : 0;

  // Fetch patient and encounter data
  const { data: patient, isLoading: isPatientLoading } = usePatient(parsedPatientId);
  const { data: encounter, isLoading: isEncounterLoading } = useEncounter(parsedEncounterId);

  // Mutations
  const { mutateAsync: createAssessment, isPending: isCreating } = useCreateTriageAssessment();

  // Handle form submission
  const handleSubmit = useCallback(
    async (data: TriageAssessmentCreateData) => {
      try {
        const assessment = await createAssessment({
          ...data,
          encounter_id: parsedEncounterId,
        });

        toast({
          title: 'Triage Assessment Created',
          description: `Patient triaged as ${assessment.triage_category}`,
        });

        // Navigate back to queue
        router.push('/triage');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create triage assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [createAssessment, parsedEncounterId, router]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // Loading state
  const isLoading = isPatientLoading || isEncounterLoading;

  // Missing required params
  if (!patientId || !encounterId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          description="Create a new triage assessment"
          actions={
            <Button variant="ghost" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Missing Information</AlertTitle>
          <AlertDescription>
            Patient and encounter information is required to create a triage assessment.
            Please select a patient from the triage queue or start from an encounter.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/triage')}>
            Go to Triage Queue
          </Button>
          <Button variant="outline" onClick={() => router.push('/patients')}>
            Find Patient
          </Button>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Triage Assessment"
          description="Loading patient information..."
          actions={
            <Button variant="ghost" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          }
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
          description="Create a new triage assessment"
          actions={
            <Button variant="ghost" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Found</AlertTitle>
          <AlertDescription>
            {!patient ? 'Patient not found.' : 'Encounter not found.'} 
            Please verify the patient and encounter exist.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={handleCancel}>
          Go Back
        </Button>
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
    allergies: patient.allergies || '',
  };

  // Transform encounter data to match form interface
  const encounterForForm = {
    id: encounter.id,
    patient: encounter.patient,
    encounter_type: encounter.encounter_type as 'OPD' | 'IPD' | 'EMERGENCY',
    spo2: encounter.spo2 ?? undefined,
    pulse: encounter.pulse ?? undefined,
    blood_pressure: encounter.blood_pressure ?? undefined,
    temperature: encounter.temperature ?? undefined,
    respiratory_rate: encounter.respiratory_rate ?? undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Triage Assessment"
        description={`Triaging: ${patient.first_name} ${patient.last_name} (${patient.mrn})`}
        actions={
          <Button variant="ghost" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
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
    </div>
  );
}
