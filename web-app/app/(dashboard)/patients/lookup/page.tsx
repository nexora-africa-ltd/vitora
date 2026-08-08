'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, User, ExternalLink, Globe, Database, Loader2,
  Shield, ShieldCheck, ShieldX, Users, UserPlus, ChevronDown, ChevronUp,
  Fingerprint, Accessibility, AlertTriangle, CheckCircle2,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { BenefitsPanel } from '@/components/billing/sha';
import { HealthcloudEligibilityCards } from '@/components/insurance/healthcloud-eligibility-cards';
import { usePatients } from '@/lib/hooks/use-patients';
import { useFetchFromCR } from '@/lib/hooks/use-sha';
import {
  useCreateEnrollment,
  usePatientInsurances,
  useInsurancePlans,
  useProviderConfigs,
  useStartHealthcloudSession,
  useVerifyEnrollmentViaHealthcloudPreview,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import { shaApi, type CapitationValidationResult } from '@/lib/api/sha';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { Patient } from '@/lib/types/patient';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
  CRDependantPerson,
  SHAPayloadPerson,
} from '@/lib/types/sha';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';

const ILM_LOOKUP_ID_OPTIONS = [
  { value: 'national_id', label: 'National ID' },
  { value: 'refugee_id', label: 'Refugee ID' },
  { value: 'mandate_number', label: 'Mandate Number' },
  { value: 'alien_id', label: 'Alien ID' },
  { value: 'birth_certificate', label: 'Birth Certificate' },
  { value: 'client_registry_id', label: 'ClientRegistry ID' },
  { value: 'birth_notification', label: 'Birth Notification' },
] as const;

type IlmLookupIdType = (typeof ILM_LOOKUP_ID_OPTIONS)[number]['value'];

export default function PatientLookupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [lookupIdType, setLookupIdType] = useState<IlmLookupIdType | ''>('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    const storedType = window.localStorage.getItem('patient_lookup_id_type');
    if (!storedType) return;
    const valid = ILM_LOOKUP_ID_OPTIONS.some((option) => option.value === storedType);
    if (valid) {
      setLookupIdType(storedType as IlmLookupIdType);
    }
  }, []);

  useEffect(() => {
    if (lookupIdType) {
      window.localStorage.setItem('patient_lookup_id_type', lookupIdType);
    } else {
      window.localStorage.removeItem('patient_lookup_id_type');
    }
  }, [lookupIdType]);

  // Local search — numeric-only queries are treated as a national-ID exact
  // lookup (PII is HMAC-indexed, so substring search can't reach it). All
  // other queries use the standard fuzzy `search=` over name/MRN.
  const isNumericOnlyQuery = /^\d+$/.test(debouncedQuery.trim());
  const localParams =
    debouncedQuery.length >= 2
      ? isNumericOnlyQuery
        ? { national_id: debouncedQuery.trim(), page_size: 20 }
        : { search: debouncedQuery, page_size: 20 }
      : undefined;
  const { data, isLoading, isError, error } = usePatients(localParams);

  // CR/SHA lookup (mutation — user triggers explicitly)
  const crMutation = useFetchFromCR();
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [healthcloudProviderId, setHealthcloudProviderId] = useState('');
  const [healthcloudMemberNumber, setHealthcloudMemberNumber] = useState('');
  const [healthcloudEligibility, setHealthcloudEligibility] = useState<VerifyViaHealthcloudResult | null>(null);
  const healthcloudPreview = useVerifyEnrollmentViaHealthcloudPreview();
  const { data: providerConfigsData } = useProviderConfigs({ page: 1, page_size: 200 });
  const { data: plansData } = useInsurancePlans({ page: 1, page_size: 500 });
  const createEnrollment = useCreateEnrollment();

  const patients = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const hasSearched = debouncedQuery.length >= 2;

  const handlePatientSelect = (patient: Patient) => {
    router.push(`/patients/${patient.id}`);
  };

  const handleCRLookup = () => {
    if (!debouncedQuery || debouncedQuery.length < 2 || !lookupIdType) return;

    // Reset eligibility
    setEligibility(null);

    const query = debouncedQuery.trim();
    const idTypeLabel = ILM_LOOKUP_ID_OPTIONS.find((opt) => opt.value === lookupIdType)?.label || 'National ID';
    const crParams = lookupIdType === 'national_id'
      ? { national_id: query }
      : { identification_type: idTypeLabel, identification_number: query };

    crMutation.mutate(crParams, {
      onSuccess: (result) => {
        // Also check eligibility if we have a national_id
        const nationalId = result?.client?.national_id || (lookupIdType === 'national_id' ? query : null);
        if (nationalId) {
          setEligibilityLoading(true);
          shaApi.checkDirectEligibility({ national_id: nationalId })
            .then(setEligibility)
            .catch(() => setEligibility(null))
            .finally(() => setEligibilityLoading(false));
        }
      },
    });
  };

  const crResult = crMutation.data;
  const crClient = crResult?.found ? crResult.client : null;
  const matchedLocalPatient = crClient
    ? patients.find(
        (patient) =>
          (Boolean(crClient.national_id) && patient.national_id === crClient.national_id) ||
          (Boolean(crClient.client_number) && patient.cr_number === crClient.client_number)
      )
    : undefined;
  const healthcloudProviderOptions = (providerConfigsData?.results ?? []).filter(
    (cfg) => cfg.healthcloud_enabled && cfg.api_enabled
  );
  const selectedHealthcloudProvider = healthcloudProviderOptions.find(
    (cfg) => String(cfg.provider) === healthcloudProviderId
  );

  const handleHealthcloudLookup = async () => {
    if (!healthcloudProviderId || !healthcloudMemberNumber.trim()) return;
    try {
      const result = await healthcloudPreview.mutateAsync({
        provider: Number(healthcloudProviderId),
        member_number: healthcloudMemberNumber.trim(),
      });
      setHealthcloudEligibility(result);
      toast({
        title: result.eligible ? 'HealthCloud eligible' : 'HealthCloud not eligible',
        description: result.message,
        variant: result.eligible ? 'default' : 'destructive',
      });
    } catch {
      setHealthcloudEligibility(null);
      toast({
        title: 'HealthCloud lookup failed',
        description: 'Could not fetch eligibility for that provider/member number.',
        variant: 'destructive',
      });
    }
  };

  const splitNames = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', middle: '', last: '' };
    if (parts.length === 1) return { first: parts[0] || '', middle: '', last: '' };
    if (parts.length === 2) return { first: parts[0] || '', middle: '', last: parts[1] || '' };
    return {
      first: parts[0] || '',
      middle: parts.slice(1, -1).join(' '),
      last: parts[parts.length - 1] || '',
    };
  };

  const handleRegisterFromHealthcloud = () => {
    if (!healthcloudEligibility || !selectedHealthcloudProvider) return;
    const raw = healthcloudEligibility.raw_response as Record<string, unknown>;
    const member = raw.member && typeof raw.member === 'object'
      ? (raw.member as Record<string, unknown>)
      : {};
    const cover = raw.cover && typeof raw.cover === 'object'
      ? (raw.cover as Record<string, unknown>)
      : {};

    const names = splitNames(String(member.names || ''));
    const prefill = {
      source: 'healthcloud_lookup',
      provider_id: selectedHealthcloudProvider.provider,
      provider_name: selectedHealthcloudProvider.provider_name,
      member_number: healthcloudMemberNumber.trim(),
      policy_number: String(cover.policyNumber || ''),
      eligible: healthcloudEligibility.eligible,
      plan_name: healthcloudEligibility.plan_name,
      eligibility_status: healthcloudEligibility.status,
      annual_balance: healthcloudEligibility.annual_balance,
      valid_to: String(cover.validTo || ''),
      first_name: names.first,
      middle_name: names.middle,
      last_name: names.last,
      gender: String(member.gender || ''),
      date_of_birth: String(member.dateOfBirth || ''),
      beneficiary_country: String(member.beneficiaryCountry || ''),
      payment_mode: 'insurance_private',
      insurance_provider: selectedHealthcloudProvider.provider_name,
      insurance_member_number: healthcloudMemberNumber.trim(),
    };

    sessionStorage.setItem('healthcloud_prepopulate', JSON.stringify(prefill));
    router.push('/patients/new?from_healthcloud=1');
  };

  const handleCreateEnrollmentDraft = async () => {
    if (!healthcloudEligibility || !selectedHealthcloudProvider || !matchedLocalPatient) {
      toast({
        title: 'Cannot create enrollment',
        description: 'Need a local patient match, provider, and HealthCloud eligibility result.',
        variant: 'destructive',
      });
      return;
    }

    const plans = (plansData?.results ?? []).filter(
      (plan) => plan.provider === selectedHealthcloudProvider.provider
    );
    const plan = plans[0];
    if (!plan) {
      toast({
        title: 'No insurance plan found',
        description: 'No plan was returned for this provider. Refresh plan data and retry.',
        variant: 'destructive',
      });
      return;
    }

    const raw = healthcloudEligibility.raw_response as Record<string, unknown>;
    const cover = raw.cover && typeof raw.cover === 'object'
      ? (raw.cover as Record<string, unknown>)
      : {};
    const validToRaw = String(cover.validTo || '');
    const validTo = validToRaw ? validToRaw.slice(0, 10) : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);

    try {
      await createEnrollment.mutateAsync({
        patient: matchedLocalPatient.id,
        plan: plan.id,
        member_number: healthcloudMemberNumber.trim(),
        policy_number: String(cover.policyNumber || ''),
        status: healthcloudEligibility.eligible ? 'active' : 'pending_verification',
        annual_balance: healthcloudEligibility.annual_balance ?? undefined,
        valid_from: new Date().toISOString().slice(0, 10),
        valid_to: validTo,
      });

      toast({
        title: 'Enrollment draft created',
        description: `${matchedLocalPatient.first_name} ${matchedLocalPatient.last_name} linked to ${selectedHealthcloudProvider.provider_name}.`,
      });
    } catch {
      toast({
        title: 'Enrollment creation failed',
        description: 'Could not create enrollment draft. It may already exist.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Patient Lookup"
        helpContent="Search for patients locally by MRN, phone, or name. Use the CR/SHA lookup button to search the national Client Registry by ID number."
      />

      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <KenyaCoatOfArms size={28} className="shrink-0 hidden sm:block" />
            <div className="w-[180px] shrink-0 hidden md:block">
              <Select
                value={lookupIdType || undefined}
                onValueChange={(value) => setLookupIdType(value as IlmLookupIdType)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="ID type" />
                </SelectTrigger>
                <SelectContent>
                  {ILM_LOOKUP_ID_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by MRN, National ID, phone number, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCRLookup();
                  }
                }}
                className="pl-10"
                autoFocus
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCRLookup}
              disabled={!hasSearched || !lookupIdType || crMutation.isPending}
              className="shrink-0 gap-1.5"
            >
              {crMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">CR/SHA Lookup</span>
            </Button>
          </div>
          <div className="mt-3 md:hidden">
            <Select
              value={lookupIdType || undefined}
              onValueChange={(value) => setLookupIdType(value as IlmLookupIdType)}
            >
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="ID type" />
              </SelectTrigger>
              <SelectContent>
                {ILM_LOOKUP_ID_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Local search is automatic. Click &ldquo;CR/SHA Lookup&rdquo; to query the national Client Registry by ID number.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">HealthCloud Eligibility (Member Number)</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2">
            <Select value={healthcloudProviderId || undefined} onValueChange={setHealthcloudProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {healthcloudProviderOptions.map((cfg) => (
                  <SelectItem key={`${cfg.id}-${cfg.provider}`} value={String(cfg.provider)}>
                    {cfg.provider_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={healthcloudMemberNumber}
              onChange={(e) => setHealthcloudMemberNumber(e.target.value)}
              placeholder="Enter member number (e.g. JUB/001, Case Sensitive)"
            />
            <Button
              variant="outline"
              onClick={() => void handleHealthcloudLookup()}
              disabled={
                !healthcloudProviderId ||
                !healthcloudMemberNumber.trim() ||
                healthcloudPreview.isPending
              }
            >
              {healthcloudPreview.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                'Check HealthCloud'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            HealthCloud eligibility uses provider + member number only.
          </p>
          {healthcloudEligibility && (
            <div className="space-y-3">
              <HealthcloudEligibilityCards eligibility={healthcloudEligibility} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  onClick={handleRegisterFromHealthcloud}
                  disabled={!selectedHealthcloudProvider}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Register New Patient
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleCreateEnrollmentDraft()}
                  disabled={!matchedLocalPatient || createEnrollment.isPending || !selectedHealthcloudProvider}
                >
                  {createEnrollment.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Enrollment...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Create Enrollment for Matched Local Patient
                    </>
                  )}
                </Button>
              </div>
              {matchedLocalPatient ? (
                <p className="text-xs text-muted-foreground">
                  Matched local patient: {matchedLocalPatient.first_name} {matchedLocalPatient.last_name} ({matchedLocalPatient.mrn}).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No local patient match from the current CR result. Use "Register New Patient" to prefill a new record.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error States */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to search patients locally.'}
          </AlertDescription>
        </Alert>
      )}
      {crMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {(() => {
              const err = crMutation.error as { response?: { data?: { error?: string } } };
              return err?.response?.data?.error || (crMutation.error instanceof Error ? crMutation.error.message : 'CR/SHA lookup failed. Please try again.');
            })()}
          </AlertDescription>
        </Alert>
      )}

      {/* CR/SHA Result */}
      {crClient && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Client Registry & SHA Result</p>
          </div>
          <CRResultCard
            client={crClient}
            eligibility={eligibility}
            eligibilityLoading={eligibilityLoading}
            matchedLocalPatient={matchedLocalPatient}
          />
        </div>
      )}
      {!crClient && (eligibilityLoading || eligibility) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Coverage Result</p>
          </div>
          <EligibilityOnlyCard
            eligibility={eligibility}
            eligibilityLoading={eligibilityLoading}
          />
        </div>
      )}
      {crResult && !crResult.found && (
        <Alert>
          <Globe className="h-4 w-4" />
          <AlertDescription>
            No record found in the Client Registry.{crResult.message ? ` ${crResult.message}` : ''}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && hasSearched && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Local Results */}
      {hasSearched && !isLoading && patients.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {totalCount} local record{totalCount !== 1 ? 's' : ''} found
            </p>
          </div>
          <div className="space-y-2">
            {patients.map((patient) => (
              <Card
                key={patient.id}
                className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
                onClick={() => handlePatientSelect(patient)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {patient.full_name || `${patient.first_name} ${patient.last_name}`}
                        </span>
                        <Badge variant="outline" size="sm" className="font-mono">
                          {patient.mrn}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                          {patient.age ? `, ${patient.age}y` : ''}
                        </span>
                        {patient.phone_number && (
                          <>
                            <span>•</span>
                            <span>{patient.phone_number}</span>
                          </>
                        )}
                        {patient.county_name && (
                          <>
                            <span>•</span>
                            <span>{patient.county_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {hasSearched && !isLoading && patients.length === 0 && !crClient && !eligibility && !eligibilityLoading && (
        <Card>
          <CardContent className="py-8 text-center">
            <User className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No local patients found matching &ldquo;{debouncedQuery}&rdquo;
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCRLookup}
                disabled={crMutation.isPending}
              >
                <Globe className="h-4 w-4 mr-1.5" />
                Search Client Registry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/patients/new')}
              >
                Register New Patient
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Initial State */}
      {!hasSearched && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center">
            <KenyaCoatOfArms size={48} className="mx-auto opacity-40" />
            <p className="mt-3 text-sm text-muted-foreground">
              Enter a search term to find a patient
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EligibilityOnlyCard({
  eligibility,
  eligibilityLoading,
}: {
  eligibility: DirectEligibilityCheckResponse | null;
  eligibilityLoading: boolean;
}) {
  return (
    <Card className="border-primary/30 overflow-hidden">
      <CardContent className="py-4 bg-primary/5 space-y-3">
        <Tabs defaultValue="sha" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sha" className="gap-2">
              <Shield className="h-3.5 w-3.5" /> SHA
            </TabsTrigger>
            <TabsTrigger value="healthcloud" className="gap-2">
              <ShieldCheck className="h-3.5 w-3.5" /> HealthCloud
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sha" className="mt-3 space-y-3">
            {eligibilityLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking SHA eligibility...
              </div>
            )}

            {eligibility && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {eligibility.is_eligible ? (
                    <Badge variant="default" className="gap-1.5 bg-green-600 hover:bg-green-600 text-white">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Eligible
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1.5">
                      <ShieldX className="h-3.5 w-3.5" />
                      Not Eligible
                    </Badge>
                  )}
                  {eligibility.sha_number && (
                    <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                      SHA: {eligibility.sha_number}
                    </Badge>
                  )}
                  {eligibility.member_cr_number && (
                    <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                      CR: {eligibility.member_cr_number}
                    </Badge>
                  )}
                </div>

                {(eligibility.full_name || eligibility.gender || eligibility.date_of_birth || eligibility.age != null) && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-1">
                    {eligibility.full_name && <span className="font-medium text-foreground">{eligibility.full_name}</span>}
                    {eligibility.gender && <span>{eligibility.gender === 'M' ? 'Male' : eligibility.gender === 'F' ? 'Female' : eligibility.gender}</span>}
                    {eligibility.date_of_birth && <span>DOB: {eligibility.date_of_birth}</span>}
                    {eligibility.age != null && <span>{eligibility.age}y</span>}
                  </div>
                )}

                {eligibility.reason && (
                  <p className="text-xs text-muted-foreground">{eligibility.reason}</p>
                )}
              </>
            )}

            {eligibility?.is_eligible && eligibility.sha_number && (
              <BenefitsPanel crNumber={eligibility.sha_number} />
            )}
          </TabsContent>

          <TabsContent value="healthcloud" className="mt-3">
            <p className="text-xs text-muted-foreground">
              HealthCloud session requires a successful CR match linked to a local patient enrollment.
              Run CR/SHA lookup and open the HealthCloud tab in the full CR result card.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Helpers
// =============================================================================

/** Render a label + value pair; returns null when value is falsy. */
function DetailItem({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-xs truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

/** Build a location string from parts, e.g. "KIAMBU • LIMURU • LIMURU EAST" */
function locationChain(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' • ');
}

// =============================================================================
// CR Result Card (with eligibility + dependants)
// =============================================================================

function CRResultCard({
  client,
  eligibility,
  eligibilityLoading,
  matchedLocalPatient,
}: {
  client: ClientRegistryClient;
  eligibility: DirectEligibilityCheckResponse | null;
  eligibilityLoading: boolean;
  matchedLocalPatient?: Patient;
}) {
  const router = useRouter();
  const [showDependants, setShowDependants] = useState(false);
  const [openDependantBenefitsKey, setOpenDependantBenefitsKey] = useState<string | null>(null);
  const [capitationWarning, setCapitationWarning] = useState<CapitationValidationResult | null>(null);
  const [benefitsEmpty, setBenefitsEmpty] = useState(false);
  const [benefitsChecked, setBenefitsChecked] = useState(false);
  const [privateEligibility, setPrivateEligibility] = useState<VerifyViaHealthcloudResult | null>(null);
  const startHealthcloudSession = useStartHealthcloudSession();
  const { data: enrollmentData, isLoading: enrollmentLoading } = usePatientInsurances(
    matchedLocalPatient?.id
      ? { patient: matchedLocalPatient.id, page: 1, page_size: 20 }
      : undefined,
    { enabled: !!matchedLocalPatient?.id }
  );
  const enrollments = enrollmentData?.results ?? [];

  const handleStartInsuranceSession = async (enrollmentId: number) => {
    try {
      const result = await startHealthcloudSession.mutateAsync(enrollmentId);
      setPrivateEligibility(result.eligibility);
    } catch {
      setPrivateEligibility(null);
    }
  };

  // Validate capitation provider match when eligibility data arrives
  useEffect(() => {
    if (!eligibility || !eligibility.is_eligible) {
      setCapitationWarning(null);
      setBenefitsEmpty(false);
      setBenefitsChecked(false);
      return;
    }
    // Build the eligibility response object for the validation endpoint
    const eligibilityResponse: Record<string, unknown> = {
      ...eligibility,
    };
    if (eligibility.raw_response) {
      eligibilityResponse.raw_response = eligibility.raw_response;
    }
    shaApi.validateCapitationDirect(eligibilityResponse)
      .then(setCapitationWarning)
      .catch(() => setCapitationWarning(null));
  }, [eligibility]);

  // Flatten CR dependants from groups
  const crDependants: Array<CRDependantPerson & { relationship?: string }> = [];
  if (client.dependants) {
    for (const group of client.dependants) {
      if (group.result) {
        for (const dep of group.result) {
          crDependants.push({ ...dep, relationship: group.relationship ?? undefined });
        }
      }
    }
  }

  // SHA dependants (simplified)
  const shaDependants = eligibility?.dependents ?? [];
  const totalDependants = crDependants.length || shaDependants.length;

  const handleRegister = (crData: ClientRegistryClient) => {
    sessionStorage.setItem('cr_prepopulate', JSON.stringify(crData));
    router.push('/patients/new?from_cr=1');
  };

  // Collect other-IDs & secondary IDs for the principal into badge-friendly tuples
  const principalIds: { label: string; value: string }[] = [];
  if (client.other_identifications) {
    for (const oid of client.other_identifications) {
      if (oid.identification_number) {
        // Shorten well-known types
        const shortLabel = oid.identification_type
          ?.replace('Household Number', 'HH')
          .replace('SHA Number', 'SHA') ?? 'ID';
        principalIds.push({ label: shortLabel, value: oid.identification_number });
      }
    }
  }
  if (client.huduma_number) principalIds.push({ label: 'Huduma', value: client.huduma_number });
  if (client.passport_number) principalIds.push({ label: 'Passport', value: client.passport_number });
  if (client.alien_id) principalIds.push({ label: 'Alien ID', value: client.alien_id });
  if (client.kra_pin) principalIds.push({ label: 'KRA', value: client.kra_pin });

  const hasExtraLocation = client.sub_county || client.ward || client.village_estate;
  const hasContactInfo = client.email || client.address || client.zip_code;
  const hasDemographics = client.citizenship || client.civil_status || client.employment_type || client.place_of_birth || client.is_person_with_disability;
  const hasDetailSection = hasExtraLocation || hasContactInfo || hasDemographics || principalIds.length > 0;

  const totalDependantsDisplay = totalDependants || eligibility?.dependents_covered || 0;
  const showDependentsSection = totalDependantsDisplay > 0;

  const getCRDependantLookupId = (dep: CRDependantPerson): string | null => {
    if (dep.id && dep.id.startsWith('CR')) return dep.id;
    if (dep.other_identifications?.length) {
      const preferred = dep.other_identifications.find((oid) => {
        const label = oid.identification_type?.toLowerCase() ?? '';
        return label.includes('sha') || label.includes('hie patient id') || label.includes('cr number');
      });
      if (preferred?.identification_number) return preferred.identification_number;
    }
    if (dep.identification_number && dep.identification_type?.toLowerCase().includes('sha')) {
      return dep.identification_number;
    }
    return null;
  };

  return (
    <Card className="border-primary/30 overflow-hidden">
      {/* Main patient info */}
      <CardContent className="py-4 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">
                {client.first_name} {client.middle_name ? `${client.middle_name} ` : ''}{client.last_name}
              </span>
              <Badge variant="default" size="sm">
                CR: {client.client_number}
              </Badge>
              {client.is_person_with_disability && (
                <Badge variant="outline" size="sm" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
                  <Accessibility className="h-3 w-3" />
                  PWD
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
              <span>{client.gender === 'M' ? 'Male' : client.gender === 'F' ? 'Female' : client.gender}</span>
              {client.date_of_birth && (
                <>
                  <span>•</span>
                  <span>DOB: {client.date_of_birth}</span>
                </>
              )}
              {client.national_id && (
                <>
                  <span>•</span>
                  <span>ID: {client.national_id}</span>
                </>
              )}
              {client.phone_number && (
                <>
                  <span>•</span>
                  <span>{client.phone_number}</span>
                </>
              )}
              {/* Full location chain */}
              {client.county && (
                <>
                  <span>•</span>
                  <span>{locationChain(client.county, client.sub_county, client.ward)}</span>
                </>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleRegister(client)}>
            Register
          </Button>
        </div>
      </CardContent>

      {/* Detailed CR Data */}
      {hasDetailSection && (
        <CardContent className="py-3 border-t space-y-3">
          {/* Other Identifications */}
          {principalIds.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Other Identifications</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {principalIds.map((oid, i) => (
                  <Badge key={i} variant="outline" size="sm" className="font-mono text-[11px]">
                    {oid.label}: {oid.value}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Demographics + Contact + Location detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
            {/* Demographics */}
            <DetailItem label="Citizenship" value={client.citizenship} />
            <DetailItem label="Civil Status" value={client.civil_status} />
            <DetailItem label="Employment" value={client.employment_type} />
            <DetailItem label="Place of Birth" value={client.place_of_birth} />
            {/* Contact */}
            <DetailItem label="Email" value={client.email} />
            <DetailItem label="Address" value={client.address} />
            <DetailItem label="Village/Estate" value={client.village_estate} />
            <DetailItem label="Zip Code" value={client.zip_code} mono />
            <DetailItem label="Country" value={client.country} />
            {client.id_serial && <DetailItem label="ID Serial" value={client.id_serial} mono />}
          </div>
        </CardContent>
      )}

      <CardContent className="py-3 border-t">
        <Tabs defaultValue="sha" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sha" className="gap-2">
              <Shield className="h-3.5 w-3.5" /> SHA
            </TabsTrigger>
            <TabsTrigger value="healthcloud" className="gap-2">
              <ShieldCheck className="h-3.5 w-3.5" /> HealthCloud
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sha" className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">SHA Eligibility</span>
            </div>
            {eligibilityLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking SHA coverage...
              </div>
            )}
            {eligibility && (
              <div className="space-y-2">
            {/* Status badge row */}
            <div className="flex items-center gap-2 flex-wrap">
              {eligibility.is_eligible ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Covered
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <ShieldX className="h-3 w-3" />
                  Not Covered
                </Badge>
              )}
              {eligibility.sha_number && (
                <Badge variant="outline" size="sm" className="font-mono">
                  SHA: {eligibility.sha_number}
                </Badge>
              )}
              {eligibility.copay_percentage > 0 && (
                <Badge variant="secondary" size="sm">
                  Copay: {eligibility.copay_percentage}%
                </Badge>
              )}
              {eligibility.coverage_end_date && (
                <span className="text-xs text-muted-foreground">
                  Expires: {eligibility.coverage_end_date}
                </span>
              )}
              {eligibility.whitelisted_for_otp && (
                <Badge variant="outline" size="sm" className="border-green-300 text-green-600 dark:text-green-400">OTP Whitelisted</Badge>
              )}
            </div>

            {/* Reason (ineligible) */}
            {eligibility.reason && !eligibility.is_eligible && (
              <p className="text-xs text-muted-foreground">{eligibility.reason}</p>
            )}

            {/* Possible solution */}
            {eligibility.possible_solution && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-2">
                <p className="text-xs text-blue-700 dark:text-blue-300">{eligibility.possible_solution}</p>
              </div>
            )}

            {/* Verified name + demographics from SHA */}
            {(eligibility.full_name || eligibility.gender || eligibility.date_of_birth) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {eligibility.full_name && (
                  <span className="font-medium text-foreground">{eligibility.full_name}</span>
                )}
                {eligibility.gender && (
                  <span>{eligibility.gender === 'M' ? 'Male' : eligibility.gender === 'F' ? 'Female' : eligibility.gender}</span>
                )}
                {eligibility.date_of_birth && (
                  <span>DOB: {eligibility.date_of_birth}</span>
                )}
                {eligibility.age != null && <span>{eligibility.age}y</span>}
              </div>
            )}

            {/* Member CR + status codes */}
            {(eligibility.member_cr_number || eligibility.status_code) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {eligibility.member_cr_number && (
                  <Badge variant="outline" size="sm" className="font-mono text-[10px]">CR: {eligibility.member_cr_number}</Badge>
                )}
                {eligibility.status_code && (
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    Status: {eligibility.status_code}{eligibility.status_desc ? ` — ${eligibility.status_desc}` : ''}
                  </Badge>
                )}
                {eligibility.nhif_transition_status && (
                  <Badge variant="outline" size="sm" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">
                    NHIF: {eligibility.nhif_transition_status}
                  </Badge>
                )}
              </div>
            )}

            {/* Schemes — expanded with coverage dates */}
            {eligibility.schemes && eligibility.schemes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Coverage Schemes:</p>
                <div className="space-y-1">
                  {eligibility.schemes.map((scheme, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-md border px-2.5 py-1.5 text-xs',
                        scheme.coverage?.status === 'ACTIVE'
                          ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20'
                          : 'border-muted bg-muted/20'
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{scheme.schemeName || `Scheme ${i + 1}`}</span>
                        {scheme.memberType && (
                          <Badge variant="secondary" className="text-[10px]">{scheme.memberType}</Badge>
                        )}
                        {scheme.coverage?.status && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              scheme.coverage.status === 'ACTIVE'
                                ? 'border-green-300 text-green-700 dark:text-green-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            {typeof scheme.coverage.status === 'string'
                              ? scheme.coverage.status
                              : String(scheme.coverage.status)}
                          </Badge>
                        )}
                      </div>
                      {(scheme.policy?.startDate || scheme.policy?.endDate || scheme.policy?.number) && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {scheme.policy.startDate && <>From: {scheme.policy.startDate}</>}
                          {scheme.policy.endDate && <> • To: {scheme.policy.endDate}</>}
                          {scheme.policy.number && <> • #{scheme.policy.number}</>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Employment */}
            {eligibility.employer_name && (
              <p className="text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3 inline mr-1" />
                {eligibility.is_employed ? 'Employed' : 'Unemployed'}
                {eligibility.employer_name && <> • Employer: {eligibility.employer_name}</>}
                {eligibility.employment_type && <> ({eligibility.employment_type})</>}
              </p>
            )}

            {/* Means testing — expanded */}
            {eligibility.means_testing && eligibility.means_testing.monthly_contribution != null && (
              <div className="rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Means Testing</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  {eligibility.means_testing.monthly_contribution != null && (
                    <span>Monthly: <span className="font-medium text-foreground">KES {eligibility.means_testing.monthly_contribution.toLocaleString()}</span></span>
                  )}
                  {eligibility.means_testing.annual_contribution != null && (
                    <span>Annual: <span className="font-medium text-foreground">KES {eligibility.means_testing.annual_contribution.toLocaleString()}</span></span>
                  )}
                  {eligibility.means_testing.income_prediction_category && (
                    <span>Category: <span className="font-medium text-foreground">{eligibility.means_testing.income_prediction_category}</span></span>
                  )}
                  {eligibility.means_testing.mt_date && (
                    <span>Date: {eligibility.means_testing.mt_date}</span>
                  )}
                  {eligibility.means_testing.appeal_status && (
                    <span>Appeal: {eligibility.means_testing.appeal_status}</span>
                  )}
                </div>
              </div>
            )}
              </div>
            )}
            {!eligibility && !eligibilityLoading && (
              <p className="text-xs text-muted-foreground">No eligibility data available.</p>
            )}
          </TabsContent>

          <TabsContent value="healthcloud" className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Private Insurance (HealthCloud)</span>
            </div>

            {!matchedLocalPatient ? (
              <p className="text-xs text-muted-foreground">
                Register this CR client locally to run private-insurance eligibility and start a HealthCloud session.
              </p>
            ) : enrollmentLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading insurance enrollments...
              </div>
            ) : enrollments.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  No private insurance enrollment found for this patient.
                </p>
                <Button size="sm" variant="outline" onClick={() => router.push('/insurance/enrollments/new')}>
                  Create Enrollment
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="rounded border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {enrollment.provider_name} - {enrollment.plan_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Member: {enrollment.member_number}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleStartInsuranceSession(enrollment.id)}
                        disabled={startHealthcloudSession.isPending}
                      >
                        Start Session
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {privateEligibility && (
              <HealthcloudEligibilityCards
                eligibility={privateEligibility}
                patientName={`${client.first_name} ${client.last_name}`}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Eligible to be treated at this facility — benefits available */}
      {eligibility?.is_eligible && benefitsChecked && !benefitsEmpty && eligibility?.sha_number && (
        <CardContent className="py-3 border-t">
          <div className="flex gap-2 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-700 dark:bg-green-950/40">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-green-800 dark:text-green-300">
                Eligible for Treatment at This Facility
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                This patient has active SHA benefit packages at this facility. Check the benefits
                section below for specific packages, interventions, and utilization details.
              </p>
            </div>
          </div>
        </CardContent>
      )}

      {/* Capitation Provider Validation */}
      {capitationWarning && (capitationWarning.details || !capitationWarning.is_valid) && (
        <CardContent className="py-3 border-t">
          {capitationWarning.is_valid ? (
            <div className="flex gap-2 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-700 dark:bg-green-950/40">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-green-800 dark:text-green-300">
                  Capitation Provider Matched
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  This facility is the patient&apos;s selected outpatient provider. PHC/capitation claims can be submitted.
                  {capitationWarning.warning && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Note: {capitationWarning.warning}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Provider Mismatch
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {capitationWarning.warning}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* SHA Benefits & Interventions */}
      {eligibility?.is_eligible && eligibility?.sha_number && (
        <CardContent className="py-3 border-t">
          <BenefitsPanel
            crNumber={eligibility.sha_number}
            compact
            onEmpty={() => { setBenefitsEmpty(true); setBenefitsChecked(true); }}
            onHasBenefits={() => { setBenefitsEmpty(false); setBenefitsChecked(true); }}
          />
        </CardContent>
      )}

      {/* SHA eligible but no benefits — cannot be treated at this facility */}
      {eligibility?.is_eligible && benefitsEmpty && (
        <CardContent className="py-3 border-t">
          <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950/40">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-800 dark:text-red-300">
                Cannot Be Treated at This Facility
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                This patient is enrolled in SHA but has no active benefit packages at this
                facility. SHA claims cannot be submitted. The patient should be directed to
                a facility compatible with their scheme/fund or registered as a private/cash patient.
              </p>
            </div>
          </div>
        </CardContent>
      )}

      {/* Dependants */}
      {showDependentsSection && (
        <CardContent className="py-3 border-t">
          <button
            type="button"
            onClick={() => setShowDependants(!showDependants)}
            className="flex items-center gap-2 w-full text-left"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Dependants ({totalDependantsDisplay})
            </span>
            {showDependants ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
            )}
          </button>
          {showDependants && (
            <div className="mt-2 space-y-2">
              {/* CR dependants (full details) */}
              {crDependants.length > 0 && crDependants.map((dep, i) => {
                const depBenefitKey = dep.id || dep.identification_number || `${dep.first_name || 'dep'}-${dep.last_name || i}-${i}`;
                const depLookupId = getCRDependantLookupId(dep);
                const showDepBenefits = openDependantBenefitsKey === depBenefitKey;
                // Collect dependant other IDs as badges
                const depOtherIds: { label: string; value: string }[] = [];
                if (dep.other_identifications) {
                  for (const oid of dep.other_identifications) {
                    if (oid.identification_number) {
                      const shortLabel = oid.identification_type
                        ?.replace('Household Number', 'HH')
                        .replace('SHA Number', 'SHA') ?? 'ID';
                      depOtherIds.push({ label: shortLabel, value: oid.identification_number });
                    }
                  }
                }
                const depLocationStr = locationChain(dep.county, dep.sub_county, dep.ward);

                return (
                  <div
                    key={`cr-${dep.id || i}`}
                    className="rounded-md border p-3 bg-muted/30 space-y-2"
                  >
                    {/* Row 1: Name + relationship badge + register button */}
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {[dep.first_name, dep.middle_name, dep.last_name].filter(Boolean).join(' ') || 'Unknown'}
                          </span>
                          {dep.relationship && (
                            <Badge variant="secondary" size="sm">{dep.relationship}</Badge>
                          )}
                          {dep.id && (
                            <Badge variant="outline" size="sm" className="font-mono text-[11px]">
                              CR: {dep.id}
                            </Badge>
                          )}
                        </div>
                        {/* Row 2: Key metadata line */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                          {dep.gender && <span>{dep.gender === 'M' ? 'Male' : dep.gender === 'F' ? 'Female' : dep.gender}</span>}
                          {dep.date_of_birth && (
                            <>
                              <span>•</span>
                              <span>DOB: {dep.date_of_birth}</span>
                            </>
                          )}
                          {dep.identification_number && (
                            <>
                              <span>•</span>
                              <span>ID: {dep.identification_number}</span>
                            </>
                          )}
                          {dep.phone && (
                            <>
                              <span>•</span>
                              <span>{dep.phone}</span>
                            </>
                          )}
                          {depLocationStr && (
                            <>
                              <span>•</span>
                              <span>{depLocationStr}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant={showDepBenefits ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 px-2"
                          title={showDepBenefits ? 'Hide dependant benefits' : 'See dependant benefits'}
                          onClick={() => {
                            setOpenDependantBenefitsKey((prev) => (prev === depBenefitKey ? null : depBenefitKey));
                          }}
                        >
                          {showDepBenefits ? 'Hide benefits' : 'See benefits'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Register this dependant"
                          onClick={() => {
                          const principalContributor = eligibility?.schemes?.find((scheme) => scheme.principalContributor?.idNumber)?.principalContributor;
                          const principalNationalId = principalContributor?.idType?.toUpperCase() === 'NATIONAL_ID'
                            ? principalContributor.idNumber
                            : (client.national_id ?? undefined);
                          const depShaNumber = dep.other_identifications?.find((oid) => oid.identification_type?.toLowerCase().includes('sha'))?.identification_number;
                          const depHouseholdNumber = dep.other_identifications?.find((oid) => oid.identification_type?.toLowerCase().includes('household'))?.identification_number;

                          const depPerson: SHAPayloadPerson = {
                            source: 'dependent',
                            relationship: dep.relationship,
                            id: dep.id ?? undefined,
                            resourceType: dep.resourceType ?? undefined,
                            first_name: dep.first_name ?? undefined,
                            middle_name: dep.middle_name ?? undefined,
                            last_name: dep.last_name ?? undefined,
                            gender: dep.gender ?? undefined,
                            date_of_birth: dep.date_of_birth ?? undefined,
                            place_of_birth: dep.place_of_birth ?? undefined,
                            citizenship: dep.citizenship ?? undefined,
                            employment_type: dep.employment_type ?? undefined,
                            civil_status: dep.civil_status ?? undefined,
                            identification_type: dep.identification_type ?? undefined,
                            identification_number: dep.identification_number ?? undefined,
                            other_identifications: dep.other_identifications?.map((oid) => ({
                              identification_type: oid.identification_type,
                              identification_number: oid.identification_number,
                            })),
                            phone: dep.phone ?? undefined,
                            country: dep.country ?? undefined,
                            county: dep.county ?? undefined,
                            sub_county: dep.sub_county ?? undefined,
                            ward: dep.ward ?? undefined,
                            village_estate: dep.village_estate ?? undefined,
                            province_state_country: dep.province_state_country ?? undefined,
                            zip_code: dep.zip_code ?? undefined,
                            postal_address: dep.postal_address ?? undefined,
                            id_serial: dep.id_serial ?? undefined,
                            sha_number: depShaNumber,
                            cr_number: dep.id ?? undefined,
                            household_number: depHouseholdNumber,
                            principal_national_id: principalNationalId,
                          };

                          sessionStorage.removeItem('cr_prepopulate');
                          sessionStorage.setItem('sha_person_prepopulate', JSON.stringify(depPerson));
                          router.push('/patients/new?from_sha=1');
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Row 3: Other IDs + extra detail */}
                    {(depOtherIds.length > 0 || dep.citizenship || dep.civil_status || dep.employment_type || dep.village_estate) && (
                      <div className="pl-7 space-y-1.5">
                        {depOtherIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {depOtherIds.map((oid, j) => (
                              <Badge key={j} variant="outline" size="sm" className="font-mono text-[11px]">
                                {oid.label}: {oid.value}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {dep.citizenship && <span>Citizenship: {dep.citizenship}</span>}
                          {dep.civil_status && <span>Status: {dep.civil_status}</span>}
                          {dep.employment_type && <span>Employment: {dep.employment_type}</span>}
                          {dep.village_estate && <span>Village: {dep.village_estate}</span>}
                        </div>
                      </div>
                    )}

                    {showDepBenefits && (
                      <div className="pl-7 pt-1">
                        {depLookupId ? (
                          <BenefitsPanel crNumber={depLookupId} compact />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No SHA/CR identifier found for this dependant. Register first or verify from the SHA modal to load benefits.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* SHA dependants (if no CR dependants available) */}
              {crDependants.length === 0 && shaDependants.length > 0 && shaDependants.map((dep, i) => {
                const depBenefitKey = dep.sha_number || dep.name || `sha-${i}`;
                const showDepBenefits = openDependantBenefitsKey === depBenefitKey;
                return (
                <div
                  key={`sha-${i}`}
                  className="rounded-md border p-2.5 bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{dep.name}</span>
                      {dep.relationship && (
                        <Badge variant="secondary" size="sm">{dep.relationship}</Badge>
                      )}
                      {dep.is_active ? (
                        <Badge variant="outline" size="sm" className="border-green-300 text-green-700 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="outline" size="sm" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5">
                      {dep.age != null && <span>Age: {dep.age}</span>}
                      {dep.sha_number && (
                        <>
                          <span>•</span>
                          <span className="font-mono">SHA: {dep.sha_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={showDepBenefits ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2"
                    title={showDepBenefits ? 'Hide dependant benefits' : 'See dependant benefits'}
                    onClick={() => {
                      setOpenDependantBenefitsKey((prev) => (prev === depBenefitKey ? null : depBenefitKey));
                    }}
                  >
                    {showDepBenefits ? 'Hide benefits' : 'See benefits'}
                  </Button>
                  </div>
                  {showDepBenefits && (
                    <div className="mt-2 pl-7">
                      {dep.sha_number ? (
                        <BenefitsPanel crNumber={dep.sha_number} compact />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No SHA number found for this dependant yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
