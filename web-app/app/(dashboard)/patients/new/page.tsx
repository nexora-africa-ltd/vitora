'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Search, User } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientForm } from '@/components/patients/patient-form';
import { PatientRegistrationSuccess } from '@/components/patients/patient-registration-success';
import { SHAVerificationModal } from '@/components/billing/sha';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { patientsApi } from '@/lib/api/patients';
import { useCreatePatient } from '@/lib/hooks/use-patients';
import { useRegisterInCR } from '@/lib/hooks/use-sha';
import { useCreateEnrollment, useInsurancePlans } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import { getOrCreateIdempotencyKey, clearIdempotencyKey } from '@/lib/utils/idempotency';
import { getApiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import type { PatientCreateData, Patient } from '@/lib/types/patient';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
  SHAPayloadPerson,
} from '@/lib/types/sha';

const IDEMPOTENCY_FORM_ID = 'patient-registration';

type HealthcloudDefaults = {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender?: 'M' | 'F' | 'O';
  date_of_birth?: Date;
};

type HealthcloudEnrollmentContext = {
  provider_id: number;
  provider_name: string;
  member_number: string;
  policy_number?: string;
  eligible?: boolean;
  plan_name?: string;
  annual_balance?: string | null;
  valid_to?: string;
};

function isDuplicateRegistrationError(error: unknown): boolean {
  const message = getApiErrorMessage(error).toLowerCase();
  if (
    message.includes('already exists') ||
    message.includes('already registered') ||
    message.includes('duplicate')
  ) {
    return true;
  }

  if (
    error instanceof AxiosError &&
    error.response?.data &&
    typeof error.response.data === 'object'
  ) {
    const data = error.response.data as Record<string, unknown>;
    return Object.entries(data).some(([, value]) => {
      if (!Array.isArray(value)) {
        return false;
      }

      return value.some(
        (item) =>
          typeof item === 'string' &&
          (item.toLowerCase().includes('already exists') ||
            item.toLowerCase().includes('duplicate'))
      );
    });
  }

  return false;
}

export default function NewPatientPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { facility, facilityDetail } = useFacility();
  const isLISStandaloneProfile =
    facilityDetail?.operating_mode === 'STANDALONE_LAB' ||
    facility?.deployment_profile === 'lis_standalone';
  const resolvedOperatingMode = facilityDetail?.operating_mode || facility?.operating_mode;
  const facilityModules = facilityDetail?.modules || facility?.modules;
  const isStandaloneMode =
    (typeof resolvedOperatingMode === 'string' && resolvedOperatingMode.startsWith('STANDALONE_')) ||
    Boolean(
      facilityModules?.lis_standalone ||
        facilityModules?.pharmacy_standalone ||
        facilityModules?.imaging_standalone
    );
  const isKenyaFacility = (facilityDetail?.country_code || 'KE').toUpperCase() === 'KE';
  const canCreatePatient = hasPermission('patients.add_patient');
  const hasPatientCreateAccess = canCreatePatient;
  const { toast } = useToast();
  const createPatient = useCreatePatient();
  const createEnrollment = useCreateEnrollment();
  const { data: plansData } = useInsurancePlans({ page: 1, page_size: 500 });
  const registerInCR = useRegisterInCR();
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null);
  const [crClient, setCrClient] = useState<ClientRegistryClient | null>(null);
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);
  const [selectedShaPerson, setSelectedShaPerson] = useState<SHAPayloadPerson | null>(null);
  // Holds a SHA person waiting for ineligibility confirmation before being
  // pushed into the patient form.
  const [pendingIneligiblePerson, setPendingIneligiblePerson] = useState<SHAPayloadPerson | null>(
    null
  );
  const [healthcloudDefaults, setHealthcloudDefaults] = useState<HealthcloudDefaults | undefined>(
    undefined
  );
  const [healthcloudEnrollmentContext, setHealthcloudEnrollmentContext] =
    useState<HealthcloudEnrollmentContext | null>(null);

  // Generate idempotency key for form submission (Sprint 1.7)
  const idempotencyKey = useMemo(() => getOrCreateIdempotencyKey(IDEMPOTENCY_FORM_ID), []);

  // Pre-populate from CR data passed via Patient Lookup page
  useEffect(() => {
    const normalizeGender = (value?: string): 'M' | 'F' | 'O' | undefined => {
      const v = (value || '').trim().toLowerCase();
      if (!v) return undefined;
      if (v === 'm' || v === 'male') return 'M';
      if (v === 'f' || v === 'female') return 'F';
      if (v === 'o' || v === 'other') return 'O';
      return undefined;
    };

    try {
      const storedHealthcloud = sessionStorage.getItem('healthcloud_prepopulate');
      if (storedHealthcloud) {
        sessionStorage.removeItem('healthcloud_prepopulate');
        const data = JSON.parse(storedHealthcloud) as {
          provider_id?: number;
          provider_name?: string;
          member_number?: string;
          policy_number?: string;
          eligible?: boolean;
          plan_name?: string;
          annual_balance?: string | null;
          valid_to?: string;
          first_name?: string;
          middle_name?: string;
          last_name?: string;
          gender?: string;
          date_of_birth?: string;
        };
        setCrClient(null);
        setSelectedShaPerson(null);
        const dateString = (data.date_of_birth || '').slice(0, 10);
        const parsedDate = dateString ? new Date(`${dateString}T00:00:00`) : undefined;
        setHealthcloudDefaults({
          first_name: data.first_name || '',
          middle_name: data.middle_name || '',
          last_name: data.last_name || '',
          gender: normalizeGender(data.gender),
          date_of_birth: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined,
        });
        if (data.provider_id && data.member_number) {
          setHealthcloudEnrollmentContext({
            provider_id: Number(data.provider_id),
            provider_name: data.provider_name || '',
            member_number: data.member_number,
            policy_number: data.policy_number || '',
            eligible: data.eligible,
            plan_name: data.plan_name || '',
            annual_balance: data.annual_balance ?? null,
            valid_to: (data.valid_to || '').slice(0, 10),
          });
        }
        toast({
          title: 'HealthCloud record loaded',
          description: 'New patient form pre-populated from HealthCloud eligibility data.',
        });
        return;
      }

      const storedShaPerson = sessionStorage.getItem('sha_person_prepopulate');
      if (storedShaPerson) {
        sessionStorage.removeItem('sha_person_prepopulate');
        sessionStorage.removeItem('cr_prepopulate');

        const person = JSON.parse(storedShaPerson) as SHAPayloadPerson;
        setCrClient(null);
        setSelectedShaPerson(person);
        setHealthcloudDefaults(undefined);
        setHealthcloudEnrollmentContext(null);
        toast({
          title: 'Dependant Record Loaded',
          description: `Pre-populated from ${[person.first_name, person.last_name].filter(Boolean).join(' ') || 'selected dependant'}.`,
        });
        return;
      }

      const stored = sessionStorage.getItem('cr_prepopulate');
      if (stored) {
        sessionStorage.removeItem('cr_prepopulate');
        const client = JSON.parse(stored) as ClientRegistryClient;
        setCrClient(client);
        setHealthcloudDefaults(undefined);
        setHealthcloudEnrollmentContext(null);
        toast({
          title: 'Client Registry Record Loaded',
          description: `Pre-populated from ${client.first_name} ${client.last_name} (${client.client_number})`,
        });
      }
    } catch {
      // Ignore parse errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle CR client found from modal
  const handleCRClientFound = useCallback(
    (client: ClientRegistryClient) => {
      setCrClient(client);
      toast({
        title: 'Client Registry Record Found',
        description: `Found record for ${client.first_name} ${client.last_name}`,
      });
    },
    [toast]
  );

  // Handle eligibility verification from modal
  const handleEligibilityVerified = useCallback((result: DirectEligibilityCheckResponse) => {
    setEligibility(result);
  }, []);

  const handleAddShaPersonToForm = useCallback(
    (person: SHAPayloadPerson) => {
      // Ineligible → confirm with the user that an alternative payment method
      // (cash) will be applied before populating the form.
      if (eligibility && eligibility.is_eligible === false) {
        setPendingIneligiblePerson(person);
        return;
      }
      // Clear principal's CR record when selecting a different person (esp. dependant)
      // so the form doesn't show stale principal identification data
      if (person.source === 'dependent') {
        setCrClient(null);
      }
      setSelectedShaPerson(person);
      toast({
        title: 'Patient form updated',
        description: `Loaded ${[person.first_name, person.last_name].filter(Boolean).join(' ') || 'selected member'} into the registration form.`,
      });
    },
    [eligibility, toast]
  );

  const handleConfirmIneligible = useCallback(() => {
    if (!pendingIneligiblePerson) return;
    const person = pendingIneligiblePerson;
    setPendingIneligiblePerson(null);
    // Clear principal's CR record for dependants
    if (person.source === 'dependent') {
      setCrClient(null);
    }
    setSelectedShaPerson(person);
    toast({
      title: 'Patient form updated',
      description: `Loaded ${[person.first_name, person.last_name].filter(Boolean).join(' ') || 'selected member'} — payment method set to Cash because SHA coverage is unavailable.`,
    });
  }, [pendingIneligiblePerson, toast]);

  const handleCancelIneligible = useCallback(() => {
    setPendingIneligiblePerson(null);
  }, []);

  const handleSubmit = async (data: PatientCreateData) => {
    const resolveHealthcloudPlanId = () => {
      if (!healthcloudEnrollmentContext) return null;
      const providerPlans = (plansData?.results ?? []).filter(
        (plan) => plan.provider === healthcloudEnrollmentContext.provider_id
      );
      if (providerPlans.length === 0) return null;

      const requestedName = (healthcloudEnrollmentContext.plan_name || '').trim().toLowerCase();
      if (!requestedName) return providerPlans[0]?.id ?? null;

      const exact = providerPlans.find((plan) => plan.name.trim().toLowerCase() === requestedName);
      if (exact) return exact.id;

      const fuzzy = providerPlans.find((plan) =>
        plan.name.trim().toLowerCase().includes(requestedName)
      );
      if (fuzzy) return fuzzy.id;

      return providerPlans[0]?.id ?? null;
    };

    try {
      // Use idempotency key to prevent duplicate creation (Sprint 1.7)
      const patient = await createPatient.mutateAsync({ data, idempotencyKey });
      if (!patient) return; // Local write — data will sync later
      setRegisteredPatient(patient);

      // Clear idempotency key after successful creation
      clearIdempotencyKey(IDEMPOTENCY_FORM_ID);

      toast({
        title: 'Patient registered',
        description: `Successfully registered ${data.first_name} ${data.last_name} (${patient.mrn})`,
      });

      if (healthcloudEnrollmentContext) {
        const resolvedPlanId = resolveHealthcloudPlanId();
        if (!resolvedPlanId) {
          toast({
            title: 'Enrollment not created',
            description: `No plan was returned for payer ${healthcloudEnrollmentContext.provider_name || healthcloudEnrollmentContext.provider_id}.`,
            variant: 'destructive',
          });
        } else {
          const validTo = healthcloudEnrollmentContext.valid_to
            ? healthcloudEnrollmentContext.valid_to.slice(0, 10)
            : new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                .toISOString()
                .slice(0, 10);
          try {
            await createEnrollment.mutateAsync({
              patient: patient.id,
              plan: resolvedPlanId,
              member_number: healthcloudEnrollmentContext.member_number,
              policy_number: healthcloudEnrollmentContext.policy_number || undefined,
              status: healthcloudEnrollmentContext.eligible ? 'active' : 'pending_verification',
              annual_balance: healthcloudEnrollmentContext.annual_balance ?? undefined,
              valid_from: new Date().toISOString().slice(0, 10),
              valid_to: validTo,
            });
            toast({
              title: 'Insurance enrollment created',
              description: `Linked ${healthcloudEnrollmentContext.provider_name || 'payer'} coverage to ${patient.mrn}.`,
            });
          } catch {
            toast({
              title: 'Enrollment creation failed',
              description:
                'Patient is registered, but insurance enrollment could not be created automatically.',
              variant: 'destructive',
            });
          }
        }
      }

      // If no CR record exists, register in Client Registry (skip for standalone modes)
      if (!isStandaloneMode && !crClient && !data.cr_number && data.identification_number) {
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
      if (data.identification_number && isDuplicateRegistrationError(error)) {
        try {
          const duplicateResult = await patientsApi.checkDuplicate({
            identification_number: data.identification_number,
            identification_type: data.identification_type,
          });

          const existingPatient = duplicateResult.matches[0];
          if (duplicateResult.match_type === 'exact_id' && existingPatient) {
            clearIdempotencyKey(IDEMPOTENCY_FORM_ID);
            router.push(`/patients/checkin?select=${encodeURIComponent(existingPatient.mrn)}`);
            return;
          }
        } catch (duplicateError) {
          console.error('Duplicate redirect lookup failed:', duplicateError);
        }
      }

      // On error, idempotency key persists for retry
      toast({
        title: 'Registration failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleRegisterAnother = useCallback(() => {
    setRegisteredPatient(null);
    setCrClient(null);
    setEligibility(null);
    setSelectedShaPerson(null);
    setHealthcloudDefaults(undefined);
    setHealthcloudEnrollmentContext(null);
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

  if (!hasPatientCreateAccess) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Register New Patient" />
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to register patients.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <PageHeader
        title="Register New Patient"
        helpContent={
          isLISStandaloneProfile
            ? 'Register a patient quickly for laboratory workflows. Required fields are prioritized for faster intake.'
            : 'Enter patient information to create a new record. Verify patient in Kenya Digital Health services before registration for faster processing.'
        }
      />

      {/* Kenya Digital Health Verification */}
      {!isLISStandaloneProfile && (
        <Card className="border-muted">
          <CardContent className="py-3 sm:py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              {/* Left side - info */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted sm:h-10 sm:w-10">
                  <KenyaCoatOfArms size={20} className="sm:hidden" />
                  <KenyaCoatOfArms size={24} className="hidden sm:block" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium sm:text-base">
                    <span className="sm:hidden">Digital Health</span>
                    <span className="hidden sm:inline">Kenya Digital Health Services</span>
                  </p>
                  <p className="hidden text-xs text-muted-foreground sm:block sm:text-sm">
                    Verify patient information before registration
                  </p>
                </div>
              </div>

              {/* Right side - action buttons */}
              <div className="flex items-center gap-2">
                <SHAVerificationModal
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs sm:flex-none sm:text-sm"
                    >
                      <Search className="h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Verify Patient</span>
                      <span className="ml-1 sm:hidden">Verify</span>
                    </Button>
                  }
                  onClientFound={handleCRClientFound}
                  onEligibilityVerified={handleEligibilityVerified}
                  onAddPersonToForm={handleAddShaPersonToForm}
                />
              </div>
            </div>

            {/* Verification results - only show if we have data */}
            {(eligibility || crClient) && (
              <div className="mt-3 space-y-2 border-t pt-3 sm:mt-4 sm:space-y-3 sm:pt-4">
                {eligibility && (
                  <div
                    className={`rounded-md p-2 sm:p-3 ${
                      eligibility.is_eligible
                        ? 'border border-success/30 bg-success/10'
                        : 'border border-warning/30 bg-warning/10'
                    }`}
                  >
                    <div
                      className={`flex items-start gap-1.5 text-[11px] sm:gap-2 sm:text-sm ${
                        eligibility.is_eligible ? 'text-success' : 'text-warning-foreground'
                      }`}
                    >
                      {eligibility.is_eligible ? (
                        <>
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold sm:text-sm">SHA Eligible</p>
                            <p className="mt-0.5 text-[10px] opacity-90 sm:text-xs">
                              {eligibility.copay_percentage === 0
                                ? 'Full coverage'
                                : `${eligibility.copay_percentage}% copay`}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <SHALogo size="sm" className="mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold sm:text-sm">Not SHA Eligible</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Additional details for ineligible patients */}
                    {!eligibility.is_eligible && (
                      <div className="ml-5 mt-1.5 space-y-0.5 text-[10px] sm:ml-6 sm:mt-2 sm:space-y-1 sm:text-xs">
                        {eligibility.sha_number && (
                          <p className="break-all text-muted-foreground">
                            <span className="font-medium">SHA:</span> {eligibility.sha_number}
                          </p>
                        )}
                        {eligibility.reason && (
                          <p className="text-warning-foreground">{eligibility.reason}</p>
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
                  <div className="rounded-md bg-primary/10 p-2 text-[11px] text-primary sm:text-sm">
                    <div className="flex items-start gap-1.5 sm:gap-2">
                      <User className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold sm:text-sm">CR Verified</p>
                        <p className="truncate text-[10px] opacity-90 sm:text-xs">
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
      )}

      {/* Form Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Patient Information</CardTitle>
            <HelpPopover
              content={
                crClient
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
            defaultValues={healthcloudDefaults}
            prePopulatedClient={crClient}
            prePopulatedShaPerson={selectedShaPerson}
            prePopulatedShaEligibility={eligibility}
            isCompactMode={isLISStandaloneProfile}
            isKenyaContext={isKenyaFacility}
            locationFallback={
              !isKenyaFacility
                ? {
                    county: facilityDetail?.county,
                    sub_county: facilityDetail?.sub_county,
                    ward: facilityDetail?.ward,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingIneligiblePerson !== null}
        onOpenChange={(open) => {
          if (!open) handleCancelIneligible();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>SHA coverage not available</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingIneligiblePerson
                ? `${[pendingIneligiblePerson.first_name, pendingIneligiblePerson.last_name].filter(Boolean).join(' ') || 'This member'} is not currently covered by SHA${eligibility?.reason ? ` (${eligibility.reason})` : ''}. The patient form will be populated with their details and the payment method will be set to Cash. You can change the payment method later if needed.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelIneligible}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmIneligible}>
              Continue with Cash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
