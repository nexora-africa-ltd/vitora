'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientForm } from '@/components/patients/patient-form';
import { useCreatePatient } from '@/lib/hooks/use-patients-enhanced';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientCreateData } from '@/lib/types/patient';

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createPatient = useCreatePatient();

  const handleSubmit = async (data: PatientCreateData) => {
    try {
      const patient = await createPatient.mutateAsync(data);
      toast({
        title: 'Patient registered',
        description: `Successfully registered ${data.first_name} ${data.last_name}`,
      });
      router.push(`/patients/${patient.id}`);
    } catch (error) {
      toast({
        title: 'Registration failed',
        description: error instanceof Error ? error.message : 'Failed to register patient',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Register New Patient</h1>
          <p className="text-muted-foreground">
            Enter patient information to create a new record
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
          <CardDescription>
            Fields marked with * are required. Patient data is encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={createPatient.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
