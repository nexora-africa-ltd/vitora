'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Stethoscope, User, Plus, UserPlus, ArrowRight, Clock, Activity, FileText } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PatientForm } from '@/components/patients/patient-form';
import { SHAVerificationModal } from '@/components/billing/sha';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCreatePatient } from '@/lib/hooks/use-patients';
import { useCheckInPatient } from '@/lib/hooks/use-triage';
import { useRegisterInCR } from '@/lib/hooks/use-sha';
import { useToast } from '@/lib/hooks/use-toast';
import { getOrCreateIdempotencyKey, clearIdempotencyKey } from '@/lib/utils/idempotency';
import type { PatientCreateData, Patient } from '@/lib/types/patient';
import type { ClientRegistryClient, DirectEligibilityCheckResponse } from '@/lib/types/sha';

const IDEMPOTENCY_FORM_ID = 'patient-registration';

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

  // Generate idempotency key for form submission (Sprint 1.7)
  const idempotencyKey = useMemo(() => getOrCreateIdempotencyKey(IDEMPOTENCY_FORM_ID), []);

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
      // Use idempotency key to prevent duplicate creation (Sprint 1.7)
      const patient = await createPatient.mutateAsync({ data, idempotencyKey });
      setRegisteredPatient(patient);

      // Clear idempotency key after successful creation
      clearIdempotencyKey(IDEMPOTENCY_FORM_ID);

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
      // On error, idempotency key persists for retry
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
        <PageHeader
          title="Patient Registered"
          helpContent="Registration completed successfully. Choose your next step: check in to triage, start an encounter, or register another patient."
        />

        {/* Success Card */}
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-green-600">Registration Successful</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Patient has been registered in the system
                </p>
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
              {/* Mobile: simplified view showing current + next step */}
              <div className="flex sm:hidden items-center justify-center gap-3">
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-1">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-xs font-medium">Registered</span>
                  <Badge variant="default" className="mt-1 text-[10px]">Done</Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-1">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <span className="text-xs font-medium">Triage</span>
                  <Badge variant="outline" className="mt-1 text-[10px]">Next</Badge>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">+2 more</span>
              </div>
              {/* Desktop: full flow */}
              <div className="hidden sm:flex items-center justify-between">
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
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleCheckInToQueue}
                      disabled={isCheckingIn}
                      title="Adds the patient to the triage waiting queue so vitals/triage can begin."
                    >
                      <UserPlus className="h-5 w-5 sm:mr-2" />
                      <span className="ml-2 sm:ml-0">
                        {isCheckingIn ? 'Checking In...' : (
                          <>
                            <span className="sm:hidden">Check In</span>
                            <span className="hidden sm:inline">Check In to Triage Queue</span>
                          </>
                        )}
                      </span>
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
                        <Stethoscope className="h-5 w-5 sm:mr-2" />
                        <span className="ml-2 sm:ml-0">
                          <span className="sm:hidden">Start Encounter</span>
                          <span className="hidden sm:inline">Start Encounter Directly</span>
                        </span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Skip the triage queue and start clinical documentation now.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
              <Link href={`/patients/${registeredPatient.id}`}>
                <Button variant="outline" className="w-full" size="lg">
                  <User className="h-5 w-5 sm:mr-2" />
                  <span className="ml-2 sm:ml-0">
                    <span className="sm:hidden">Profile</span>
                    <span className="hidden sm:inline">View Profile</span>
                  </span>
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
                <Plus className="h-5 w-5 sm:mr-2" />
                <span className="ml-2 sm:ml-0">
                  <span className="sm:hidden">Add New</span>
                  <span className="hidden sm:inline">Register Another</span>
                </span>
              </Button>

              <Link href="/patients" className="col-span-2 sm:col-span-1">
                <Button variant="secondary" className="w-full" size="lg">
                  <span className="sm:hidden">Back</span>
                  <span className="hidden sm:inline">Back to Patients</span>
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
      <PageHeader
        title="Register New Patient"
        helpContent="Enter patient information to create a new record. Verify patient in Kenya Digital Health services before registration for faster processing."
      />

      {/* Kenya Digital Health Verification */}
      <Card className="border-muted">
        <CardContent className="py-3 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            {/* Left side - info */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <KenyaCoatOfArms size={20} className="sm:hidden" />
                <KenyaCoatOfArms size={24} className="hidden sm:block" />
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-medium truncate">
                  <span className="sm:hidden">Digital Health</span>
                  <span className="hidden sm:inline">Kenya Digital Health Services</span>
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Verify patient information before registration
                </p>
              </div>
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2">
              <SHAVerificationModal
                trigger={
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none h-8 text-xs sm:text-sm">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Client Registry</span>
                    <span className="sm:hidden ml-1">CR</span>
                  </Button>
                }
                defaultTab="cr"
                onClientFound={handleCRClientFound}
                onEligibilityVerified={handleEligibilityVerified}
              />
              <SHAVerificationModal
                trigger={
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none h-8 text-xs sm:text-sm">
                    <SHALogo size="sm" className="sm:mr-2" />
                    <span className="hidden sm:inline">SHA Eligibility</span>
                    <span className="sm:hidden ml-1">SHA</span>
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
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t space-y-2 sm:space-y-3">
              {eligibility && (
                <div className={`p-2 sm:p-3 rounded-md ${
                  eligibility.is_eligible
                    ? 'bg-success/10 border border-success/30'
                    : 'bg-warning/10 border border-warning/30'
                }`}>
                  <div className={`flex items-start gap-1.5 sm:gap-2 text-[11px] sm:text-sm ${
                    eligibility.is_eligible ? 'text-success' : 'text-warning-foreground'
                  }`}>
                    {eligibility.is_eligible ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm">SHA Eligible</p>
                          <p className="text-[10px] sm:text-xs mt-0.5 opacity-90">
                            {eligibility.copay_percentage === 0 ? 'Full coverage' : `${eligibility.copay_percentage}% copay`}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <SHALogo size="sm" className="shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm">Not SHA Eligible</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Additional details for ineligible patients */}
                  {!eligibility.is_eligible && (
                    <div className="mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs ml-5 sm:ml-6">
                      {eligibility.sha_number && (
                        <p className="text-muted-foreground break-all">
                          <span className="font-medium">SHA:</span> {eligibility.sha_number}
                        </p>
                      )}
                      {eligibility.reason && (
                        <p className="text-warning-foreground">
                          {eligibility.reason}
                        </p>
                      )}
                      {eligibility.possible_solution && (
                        <p className="text-blue-600 dark:text-blue-400">
                          💡 {eligibility.possible_solution}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {crClient && (
                <div className="p-2 rounded-md bg-primary/10 text-primary text-[11px] sm:text-sm">
                  <div className="flex items-start gap-1.5 sm:gap-2">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm">CR Verified</p>
                      <p className="text-[10px] sm:text-xs opacity-90 truncate">
                        {crClient.first_name} {crClient.last_name} • {crClient.client_number}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Patient Information</CardTitle>
            <HelpPopover
              content={crClient
                ? 'Form pre-populated from SHA Client Registry. Review and update if needed.'
                : 'Fields marked with * are required. Patient data is encrypted and stored securely.'
              }
            />
          </div>
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
