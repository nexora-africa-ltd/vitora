'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { LabOrderForm } from '@/components/laboratory/lab-order-form';
import { useEncounter } from '@/lib/hooks/use-encounters';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewLabOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const encounterId = searchParams.get('encounter');
  const patientId = searchParams.get('patient');

  // If encounter is provided, fetch encounter details
  const { data: encounter, isLoading: loadingEncounter } = useEncounter(
    encounterId ? parseInt(encounterId) : 0
  );

  // Determine patient info
  const resolvedPatientId = encounter?.patient || (patientId ? parseInt(patientId) : null);
  const resolvedEncounterId = encounterId ? parseInt(encounterId) : null;

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
            Create a laboratory order for {encounter?.patient_name || 'patient'}
          </p>
        </div>
      </div>

      {/* Form */}
      <LabOrderForm
        patientId={resolvedPatientId}
        encounterId={resolvedEncounterId}
        patientName={encounter?.patient_name}
        patientMrn={encounter?.patient_mrn}
        patientGender={encounter?.patient_gender}
        patientDateOfBirth={encounter?.patient_date_of_birth}
        encounterType={encounter?.encounter_type}
        encounterDate={encounter?.encounter_date}
        chiefComplaint={encounter?.chief_complaint}
        onSuccess={handleSuccess}
        onCancel={() => router.back()}
      />
    </div>
  );
}
