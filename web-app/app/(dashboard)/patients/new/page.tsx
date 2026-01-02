'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Stethoscope, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientForm } from '@/components/patients/patient-form';
import { useCreatePatient } from '@/lib/hooks/use-patients-enhanced';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientCreateData, Patient } from '@/lib/types/patient';

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createPatient = useCreatePatient();
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);

  const handleSubmit = async (data: PatientCreateData) => {
    try {
      const patient = await createPatient.mutateAsync(data);
      setRegisteredPatient(patient);
      toast({
        title: 'Patient registered',
        description: `Successfully registered ${data.first_name} ${data.last_name} (${patient.mrn})`,
      });
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

  // Show success screen after registration
  if (registeredPatient) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/patients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Patient Registered</h1>
            <p className="text-muted-foreground">
              Registration completed successfully
            </p>
          </div>
        </div>

        {/* Success Card */}
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-green-600">Registration Successful</CardTitle>
                <CardDescription>
                  Patient has been registered in the system
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Patient summary */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="font-medium">
                  {registeredPatient.first_name} {registeredPatient.last_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">MRN</span>
                <span className="font-mono font-medium">{registeredPatient.mrn}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Date of Birth</span>
                <span className="font-medium">{registeredPatient.date_of_birth}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href={`/encounters/new?patient=${registeredPatient.id}`}>
                <Button className="w-full" size="lg">
                  <Stethoscope className="mr-2 h-5 w-5" />
                  Start Encounter
                </Button>
              </Link>
              
              <Link href={`/patients/${registeredPatient.id}`}>
                <Button variant="outline" className="w-full" size="lg">
                  <User className="mr-2 h-5 w-5" />
                  View Profile
                </Button>
              </Link>

              <Button 
                variant="outline" 
                className="w-full" 
                size="lg"
                onClick={() => setRegisteredPatient(null)}
              >
                <Plus className="mr-2 h-5 w-5" />
                Register Another
              </Button>

              <Link href="/patients">
                <Button variant="ghost" className="w-full" size="lg">
                  Back to Patients
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
