'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Stethoscope, User, Plus, UserPlus, ArrowRight, Clock, Activity, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PatientForm } from '@/components/patients/patient-form';
import { useCreatePatient } from '@/lib/hooks/use-patients-enhanced';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientCreateData, Patient } from '@/lib/types/patient';

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createPatient = useCreatePatient();
  const checkInPatient = useCheckInPatient();
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

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

  const handleCheckInToQueue = async () => {
    if (!registeredPatient) return;
    
    setIsCheckingIn(true);
    try {
      await checkInPatient.mutateAsync({
        patient_id: registeredPatient.id,
        reason_for_visit: 'New patient registration',
        create_encounter: true,
      });
      toast({
        title: 'Patient Checked In',
        description: 'Patient has been added to the triage waiting queue.',
      });
      router.push('/triage');
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: error instanceof Error ? error.message : 'Failed to check in patient',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingIn(false);
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

            {/* Patient Flow Indicator */}
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium mb-3">Recommended Patient Flow</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-1">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-xs font-medium">Registered</span>
                  <Badge variant="default" className="mt-1 text-[10px]">Complete</Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-1">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <span className="text-xs font-medium">Awaiting Triage</span>
                  <Badge variant="outline" className="mt-1 text-[10px]">Next Step</Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Vitals Recorded</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Consultation</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleCheckInToQueue}
                disabled={isCheckingIn}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                {isCheckingIn ? 'Checking In...' : 'Check In to Triage Queue'}
              </Button>
              
              <Link href={`/encounters/new?patient=${registeredPatient.id}`}>
                <Button variant="outline" className="w-full" size="lg">
                  <Stethoscope className="mr-2 h-5 w-5" />
                  Start Encounter Directly
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
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
