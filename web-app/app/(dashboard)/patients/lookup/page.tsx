'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, User, ExternalLink, Globe, Database, Loader2,
  Shield, ShieldCheck, ShieldX, Users, UserPlus, ChevronDown, ChevronUp,
  Fingerprint, Accessibility, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { BenefitsPanel } from '@/components/billing/sha';
import { usePatients } from '@/lib/hooks/use-patients';
import { useFetchFromCR } from '@/lib/hooks/use-sha';
import { shaApi, type CapitationValidationResult } from '@/lib/api/sha';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { Patient } from '@/lib/types/patient';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
  CRDependantPerson,
} from '@/lib/types/sha';

export default function PatientLookupPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

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

  const patients = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const hasSearched = debouncedQuery.length >= 2;

  const handlePatientSelect = (patient: Patient) => {
    router.push(`/patients/${patient.id}`);
  };

  const handleCRLookup = () => {
    if (!debouncedQuery || debouncedQuery.length < 2) return;

    // Reset eligibility
    setEligibility(null);

    // Determine ID type from format
    const query = debouncedQuery.trim();
    const isNumericOnly = /^\d+$/.test(query);

    const crParams = isNumericOnly
      ? { national_id: query }
      : { identification_number: query };

    crMutation.mutate(crParams, {
      onSuccess: (result) => {
        // Also check eligibility if we have a national_id
        const nationalId = result?.client?.national_id || (isNumericOnly ? query : null);
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
              disabled={!hasSearched || crMutation.isPending}
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
          <p className="mt-2 text-xs text-muted-foreground">
            Local search is automatic. Click &ldquo;CR/SHA Lookup&rdquo; to query the national Client Registry by ID number.
          </p>
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
      {hasSearched && !isLoading && patients.length === 0 && !crClient && (
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
}: {
  client: ClientRegistryClient;
  eligibility: DirectEligibilityCheckResponse | null;
  eligibilityLoading: boolean;
}) {
  const router = useRouter();
  const [showDependants, setShowDependants] = useState(false);
  const [capitationWarning, setCapitationWarning] = useState<CapitationValidationResult | null>(null);

  // Validate capitation provider match when eligibility data arrives
  useEffect(() => {
    if (!eligibility || !eligibility.is_eligible) {
      setCapitationWarning(null);
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

      {/* SHA Eligibility */}
      <CardContent className="py-3 border-t">
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
            {/* Status badge */}
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
            </div>
            {eligibility.reason && !eligibility.is_eligible && (
              <p className="text-xs text-muted-foreground">{eligibility.reason}</p>
            )}

            {/* Schemes */}
            {eligibility.schemes && eligibility.schemes.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Coverage Schemes:</p>
                <div className="flex flex-wrap gap-1.5">
                  {eligibility.schemes.map((scheme, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      size="sm"
                      className={
                        scheme.coverage?.status === 'ACTIVE'
                          ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300'
                          : ''
                      }
                    >
                      {scheme.schemeName || `Scheme ${i + 1}`}
                      {scheme.memberType && ` (${scheme.memberType})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Employment info */}
            {eligibility.employer_name && (
              <p className="text-xs text-muted-foreground">
                Employer: {eligibility.employer_name}
                {eligibility.employment_type && ` (${eligibility.employment_type})`}
              </p>
            )}

            {/* Means testing */}
            {eligibility.means_testing && eligibility.means_testing.monthly_contribution != null && (
              <p className="text-xs text-muted-foreground">
                Monthly contribution: KES {eligibility.means_testing.monthly_contribution.toLocaleString()}
                {eligibility.means_testing.income_prediction_category && (
                  <> • Category: {eligibility.means_testing.income_prediction_category}</>
                )}
              </p>
            )}
          </div>
        )}
        {!eligibility && !eligibilityLoading && (
          <p className="text-xs text-muted-foreground">No eligibility data available.</p>
        )}
      </CardContent>

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
          />
        </CardContent>
      )}

      {/* Dependants */}
      {totalDependants > 0 && (
        <CardContent className="py-3 border-t">
          <button
            type="button"
            onClick={() => setShowDependants(!showDependants)}
            className="flex items-center gap-2 w-full text-left"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Dependants ({totalDependants})
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 w-7 p-0"
                        title="Register this dependant"
                        onClick={() => {
                          const isNationalId = dep.identification_type?.toLowerCase().replace(/[\s_-]/g, '') === 'nationalid';
                          const depClient: ClientRegistryClient = {
                            client_number: dep.id || '',
                            first_name: dep.first_name || '',
                            last_name: dep.last_name || '',
                            middle_name: dep.middle_name,
                            date_of_birth: dep.date_of_birth || '',
                            gender: dep.gender || '',
                            national_id: isNationalId ? dep.identification_number : null,
                            phone_number: dep.phone,
                            county: dep.county,
                            sub_county: dep.sub_county,
                            ward: dep.ward,
                            citizenship: dep.citizenship,
                            place_of_birth: dep.place_of_birth,
                            civil_status: dep.civil_status,
                            employment_type: dep.employment_type,
                            village_estate: dep.village_estate,
                            country: dep.country,
                            zip_code: dep.zip_code,
                            other_identifications: dep.other_identifications,
                          };
                          handleRegister(depClient);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
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
                  </div>
                );
              })}

              {/* SHA dependants (if no CR dependants available) */}
              {crDependants.length === 0 && shaDependants.length > 0 && shaDependants.map((dep, i) => (
                <div
                  key={`sha-${i}`}
                  className="flex items-center gap-3 rounded-md border p-2.5 bg-muted/30"
                >
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
