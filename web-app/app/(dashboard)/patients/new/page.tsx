'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, User } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientForm } from '@/components/patients/patient-form';
import { PatientRegistrationSuccess } from '@/components/patients/patient-registration-success';
import { SHAVerificationModal } from '@/components/billing/sha';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { useCreatePatient } from '@/lib/hooks/use-patients';
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
  const registerInCR = useRegisterInCR();
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
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

  const handleRegisterAnother = useCallback(() => {
    setRegisteredPatient(null);
    setCrClient(null);
    setEligibility(null);
  }, []);

  const handleCancel = () => {
    router.back();
  };

  // Show success screen after registration
  if (registeredPatient) {
    return (
      <PatientRegistrationSuccess
        patient={registeredPatient}
        onRegisterAnother={handleRegisterAnother}
      />
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
