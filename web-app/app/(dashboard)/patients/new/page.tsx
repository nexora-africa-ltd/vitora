'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Stethoscope, User, Plus, UserPlus, ArrowRight, Clock, Activity, FileText } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PatientForm } from '@/components/patients/patient-form';
import { SHAVerificationModal } from '@/components/billing/sha';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCreatePatient } from '@/lib/hooks/use-patients-enhanced';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useRegisterInCR } from '@/lib/hooks/use-sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { PatientCreateData, Patient } from '@/lib/types/patient';
import type { ClientRegistryClient, DirectEligibilityCheckResponse } from '@/lib/types/sha';

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createPatient = useCreatePatient();
  const checkInPatient = useCheckInPatient();
  const registerInCR = useRegisterInCR();
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [crClient, setCrClient] = useState<ClientRegistryClient | null>(null);
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);

  // Handle CR client found from modal
  const handleCRClientFound = useCallback((client: ClientRegistryClient) => {
    setCrClient(client);
    toast({
      title: 'Client Registry Record Found',
      description: `Found record for ${client.first_name} ${client.last_name}`,
    });
  }, [toast]);

  // Handle eligibility verification from modal
  const handleEligibilityVerified = useCallback((result: DirectEligibilityCheckResponse) => {
    setEligibility(result);
  }, []);

  const handleSubmit = async (data: PatientCreateData) => {
    try {
      const patient = await createPatient.mutateAsync(data);
      setRegisteredPatient(patient);
      toast({
        title: 'Patient registered',
        description: `Successfully registered ${data.first_name} ${data.last_name} (${patient.mrn})`,
      });

      // If no CR record exists, register in Client Registry
      if (!crClient && !data.cr_number && data.identification_number) {
        try {
          const crResponse = await registerInCR.mutateAsync({
            patient_id: patient.id,
          });

          if (crResponse.success && crResponse.client_number) {
            toast({
              title: 'Client Registry Registration Successful',
              description: `CR Number: ${crResponse.client_number}`,
            });
          }
        } catch (crError) {
          // CR registration is optional, don't fail the whole process
          console.error('CR registration failed:', crError);
          toast({
            title: 'Client Registry Registration',
            description: 'Patient registered locally. CR registration will be attempted later.',
            variant: 'default',
          });
        }
      }
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
        reason_for_visit: '',
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
            <TooltipProvider delayDuration={200}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleCheckInToQueue}
                      disabled={isCheckingIn}
                      title="Adds the patient to the triage waiting queue so vitals/triage can begin."
                    >
                      <UserPlus className="mr-2 h-5 w-5" />
                      {isCheckingIn ? 'Checking In...' : 'Check In to Triage Queue'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Adds the patient to the triage waiting queue so vitals/triage can begin.
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="outline"
                      className="w-full"
                      size="lg"
                      title="Skip the triage queue and start clinical documentation now."
                    >
                      <Link href={`/encounters/new?patient=${registeredPatient.id}`}>
                        <Stethoscope className="mr-2 h-5 w-5" />
                        Start Encounter Directly
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Skip the triage queue and start clinical documentation now.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

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
                onClick={() => {
                  setRegisteredPatient(null);
                  setCrClient(null);
                }}
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

      {/* Kenya Digital Health Verification */}
      <Card className="border-muted">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left side - info */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <SHALogo size="md" muted />
              </div>
              <div>
                <p className="font-medium">Kenya Digital Health Services</p>
                <p className="text-sm text-muted-foreground">
                  Verify patient information before registration
                </p>
              </div>
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2">
              <SHAVerificationModal
                trigger={
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    Client Registry
                  </Button>
                }
                defaultTab="cr"
                onClientFound={handleCRClientFound}
                onEligibilityVerified={handleEligibilityVerified}
              />
              <SHAVerificationModal
                trigger={
                  <Button variant="outline" size="sm">
                    <SHALogo size="sm" className="mr-2" />
                    SHA Eligibility
                  </Button>
                }
                defaultTab="eligibility"
                onClientFound={handleCRClientFound}
                onEligibilityVerified={handleEligibilityVerified}
              />
            </div>
          </div>

          {/* Verification results - only show if we have data */}
          {(eligibility || crClient) && (
            <div className="mt-4 pt-4 border-t space-y-3">
              {eligibility && (
                <div className={`p-3 rounded-md ${
                  eligibility.is_eligible
                    ? 'bg-success/10 border border-success/30'
                    : 'bg-warning/10 border border-warning/30'
                }`}>
                  <div className={`flex items-center gap-2 text-sm ${
                    eligibility.is_eligible ? 'text-success' : 'text-warning-foreground'
                  }`}>
                    {eligibility.is_eligible ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="flex-1">
                          <strong>SHA Eligible</strong>
                          {eligibility.copay_percentage === 0 ? ' • Full coverage' : ` • ${eligibility.copay_percentage}% copay`}
                        </span>
                      </>
                    ) : (
                      <>
                        <SHALogo size="sm" />
                        <span className="flex-1">
                          <strong>Not SHA Eligible</strong>
                        </span>
                      </>
                    )}
                  </div>

                  {/* Additional details for ineligible patients */}
                  {!eligibility.is_eligible && (
                    <div className="mt-2 text-sm space-y-1">
                      {eligibility.sha_number && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">SHA Number:</span> {eligibility.sha_number}
                        </p>
                      )}
                      {eligibility.reason && (
                        <p className="text-warning-foreground">
                          <span className="font-medium">Reason:</span> {eligibility.reason}
                        </p>
                      )}
                      {eligibility.possible_solution && (
                        <p className="text-blue-600 dark:text-blue-400">
                          <span className="font-medium">Solution:</span> {eligibility.possible_solution}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {crClient && (
                <div className="p-2 rounded-md bg-primary/10 text-primary flex items-center gap-2 text-sm">
                  <User className="h-4 w-4" />
                  <span className="flex-1">
                    <strong>CR Verified:</strong> {crClient.first_name} {crClient.last_name} • {crClient.client_number}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Information</CardTitle>
          <CardDescription>
            {crClient
              ? 'Form pre-populated from SHA Client Registry. Review and update if needed.'
              : 'Fields marked with * are required. Patient data is encrypted and stored securely.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={createPatient.isPending}
            prePopulatedClient={crClient}
          />
        </CardContent>
      </Card>
    </div>
  );
}
