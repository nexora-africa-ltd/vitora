'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, User, ExternalLink, Globe, Database, Loader2,
  Shield, ShieldCheck, ShieldX, Users, UserPlus, ChevronDown, ChevronUp,
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
import { shaApi } from '@/lib/api/sha';
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
              {client.county && (
                <>
                  <span>•</span>
                  <span>{client.county}</span>
                </>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleRegister(client)}>
            Register
          </Button>
        </div>
      </CardContent>

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
              {crDependants.length > 0 && crDependants.map((dep, i) => (
                <div
                  key={`cr-${i}`}
                  className="flex items-center gap-3 rounded-md border p-2.5 bg-muted/30"
                >
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {[dep.first_name, dep.middle_name, dep.last_name].filter(Boolean).join(' ') || 'Unknown'}
                      </span>
                      {dep.relationship && (
                        <Badge variant="secondary" size="sm">{dep.relationship}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5">
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
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 w-7 p-0"
                    title="Register this dependant"
                    onClick={() => {
                      // Build a minimal CR-like object for the dependant
                      const depClient: ClientRegistryClient = {
                        client_number: '',
                        first_name: dep.first_name || '',
                        last_name: dep.last_name || '',
                        middle_name: dep.middle_name,
                        date_of_birth: dep.date_of_birth || '',
                        gender: dep.gender || '',
                        national_id: dep.identification_type === 'national_id' ? dep.identification_number : null,
                        phone_number: dep.phone,
                        county: dep.county,
                        sub_county: dep.sub_county,
                        ward: dep.ward,
                        citizenship: dep.citizenship,
                        place_of_birth: dep.place_of_birth,
                      };
                      handleRegister(depClient);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

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
