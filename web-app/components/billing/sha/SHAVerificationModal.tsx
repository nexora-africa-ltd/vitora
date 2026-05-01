/**
 * SHA Verification Modal
 *
 * A unified lookup that runs both Client Registry and SHA Eligibility checks
 * in parallel from a single search input. Displays eligibility status first,
 * then CR demographics below, with UserPlus buttons to populate the patient form.
 */
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AxiosError } from 'axios';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  Search,
  Loader2,

  AlertCircle,
  UserCheck,
  ShieldOff,
  Info,
  Database,
  ShieldQuestionMark,
  Users,
  FileJson,
  Briefcase,
  CalendarDays,
  CreditCard,
  HeartPulse,
  UserRound,
  UserPlus,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';
import type {
  ClientRegistryClient,
  DirectEligibilityCheckResponse,
  SHAEligibilityScheme,
  SHAPayloadPerson,
} from '@/lib/types/sha';

// -----------------------------------------------------------------------------
// Responsive helpers
// -----------------------------------------------------------------------------

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQueryList = window.matchMedia(query);
    const update = () => setMatches(mediaQueryList.matches);
    update();

    // Safari < 14 fallback
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', update);
      return () => mediaQueryList.removeEventListener('change', update);
    }

    mediaQueryList.addListener(update);
    return () => mediaQueryList.removeListener(update);
  }, [query]);

  return matches;
}

// ============================================================================
// Types
// ============================================================================

interface SHAVerificationModalProps {
  /** Trigger element (button, etc.) */
  trigger?: React.ReactNode;
  /** Default national ID to pre-fill */
  defaultNationalId?: string;
  /** Callback when CR client is found */
  onClientFound?: (client: ClientRegistryClient) => void;
  /** Callback when eligibility is verified */
  onEligibilityVerified?: (eligibility: DirectEligibilityCheckResponse) => void;
  /** Callback when a SHA member/dependant should prefill the patient form */
  onAddPersonToForm?: (person: SHAPayloadPerson) => void;
  /** Whether modal is open (controlled) */
  open?: boolean;
  /** Callback when modal open state changes */
  onOpenChange?: (open: boolean) => void;
}

type LookupStatus = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

type RecordValue = string | number | boolean | null | undefined;

type EligibilityIdentifierOption = {
  value: string;
  label: string;
  placeholder: string;
};

type CRIdentifierOption = {
  value: string;
  label: string;
  placeholder: string;
};

type SchemeCoverageTone = 'covered' | 'mixed' | 'not-covered';

const ELIGIBILITY_IDENTIFIER_OPTIONS: EligibilityIdentifierOption[] = [
  { value: 'National ID', label: 'National ID', placeholder: 'Enter National ID' },
  { value: 'SHA Number', label: 'SHA Number', placeholder: 'Enter SHA Number / CR Number' },
  { value: 'Passport Number', label: 'Passport Number', placeholder: 'Enter Passport Number' },
  { value: 'Alien ID', label: 'Alien ID', placeholder: 'Enter Alien ID' },
  { value: 'Huduma Number', label: 'Huduma Number', placeholder: 'Enter Huduma Number' },
];

function formatRecordValue(value: RecordValue): string {
  if (value === null || value === undefined || value === '') {
    return 'Not provided';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

function DetailItem({ label, value }: { label: string; value: RecordValue }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{formatRecordValue(value)}</p>
    </div>
  );
}

function isCoveredSchemeStatus(status: string | number | boolean | null | undefined): boolean {
  if (status === true || status === 1 || status === '1') {
    return true;
  }

  if (typeof status === 'string') {
    const normalizedStatus = status.trim().toLowerCase();
    return ['active', 'covered', 'eligible'].includes(normalizedStatus);
  }

  return false;
}

function formatSchemeCoverageStatus(status: string | number | boolean | null | undefined): string {
  if (status === null || status === undefined || status === '') {
    return 'Unknown';
  }

  if (status === true || status === 1 || status === '1') {
    return 'Covered';
  }

  if (status === false || status === 0 || status === '0') {
    return 'Not Covered';
  }

  if (typeof status === 'string') {
    return status.replace(/_/g, ' ');
  }

  return String(status);
}

function getEligibilitySchemeSummary(eligibility: DirectEligibilityCheckResponse): {
  tone: SchemeCoverageTone;
  title: string;
  description: string;
  coveredSchemes: string[];
  uncoveredSchemes: string[];
} {
  const schemes = Array.isArray(eligibility.schemes) ? eligibility.schemes : [];
  const coveredSchemes = schemes
    .filter((scheme) => isCoveredSchemeStatus(scheme.coverage?.status))
    .map((scheme) => scheme.schemeName)
    .filter((schemeName): schemeName is string => typeof schemeName === 'string' && schemeName.trim().length > 0);
  const uncoveredSchemes = schemes
    .filter((scheme) => !isCoveredSchemeStatus(scheme.coverage?.status))
    .map((scheme) => scheme.schemeName)
    .filter((schemeName): schemeName is string => typeof schemeName === 'string' && schemeName.trim().length > 0);
  const uniqueCoveredSchemes = Array.from(new Set(coveredSchemes));
  const uniqueUncoveredSchemes = Array.from(new Set(uncoveredSchemes));
  const shifCovered = schemes.some(
    (scheme) => scheme.schemeName?.trim().toUpperCase() === 'SHIF' && isCoveredSchemeStatus(scheme.coverage?.status)
  );
  const shifUncovered = schemes.some(
    (scheme) => scheme.schemeName?.trim().toUpperCase() === 'SHIF' && !isCoveredSchemeStatus(scheme.coverage?.status)
  );

  if (shifUncovered && uniqueCoveredSchemes.length > 0) {
    return {
      tone: 'mixed',
      title: 'SHIF Not Covered',
      description: `SHIF is not covered, while ${uniqueCoveredSchemes.join(', ')} ${uniqueCoveredSchemes.length === 1 ? 'is' : 'are'} covered.`,
      coveredSchemes: uniqueCoveredSchemes,
      uncoveredSchemes: uniqueUncoveredSchemes,
    };
  }

  if (shifCovered || eligibility.is_eligible) {
    return {
      tone: 'covered',
      title: 'SHA Eligible',
      description:
        eligibility.reason ||
        `Active coverage found${uniqueCoveredSchemes.length > 0 ? ` in ${uniqueCoveredSchemes.join(', ')}` : ''}.`,
      coveredSchemes: uniqueCoveredSchemes,
      uncoveredSchemes: uniqueUncoveredSchemes,
    };
  }

  return {
    tone: 'not-covered',
    title: 'Not SHA Eligible',
    description:
      eligibility.reason ||
      `No active cover was returned${uniqueUncoveredSchemes.length > 0 ? ` for ${uniqueUncoveredSchemes.join(', ')}` : ''}.`,
    coveredSchemes: uniqueCoveredSchemes,
    uncoveredSchemes: uniqueUncoveredSchemes,
  };
}

function getEligibilityErrorPresentation(error: unknown): { title: string; message: string } {
  const fallbackMessage = getApiErrorMessage(error);

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    const status = error.response?.status;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const errorTitle = typeof data.error_title === 'string' ? data.error_title : null;
      const detail = typeof data.detail === 'string' ? data.detail : null;
      const message = typeof data.message === 'string' ? data.message : null;
      const payloadError = typeof data.error === 'string' ? data.error : null;

      if (errorTitle) {
        return {
          title: errorTitle,
          message: detail || message || payloadError || fallbackMessage,
        };
      }
    }

    if (status === 502) {
      return {
        title: 'SHA auth failed',
        message: 'Unable to authenticate with the upstream SHA service. Please verify the SHA credentials or try again later.',
      };
    }

    if (status === 503) {
      return {
        title: 'SHA API currently unavailable',
        message: 'The upstream SHA service is currently unavailable. Please try the eligibility check again later.',
      };
    }

    if (status === 504) {
      return {
        title: 'SHA API timed out',
        message: 'The upstream SHA service did not respond in time. Please retry the eligibility check.',
      };
    }
  }

  return {
    title: 'Verification Failed',
    message: fallbackMessage || 'Unable to verify eligibility',
  };
}

function getSHAServiceErrorPresentation(
  error: unknown,
  options?: {
    unavailableTitle?: string;
    unavailableMessage?: string;
    timeoutTitle?: string;
    timeoutMessage?: string;
    authTitle?: string;
    authMessage?: string;
    fallbackTitle?: string;
    fallbackMessage?: string;
  }
): { title: string; message: string } {
  const fallbackMessage = getApiErrorMessage(error);

  if (error instanceof AxiosError) {
    const data = error.response?.data;
    const status = error.response?.status;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const errorTitle = typeof data.error_title === 'string' ? data.error_title : null;
      const detail = typeof data.detail === 'string' ? data.detail : null;
      const message = typeof data.message === 'string' ? data.message : null;
      const payloadError = typeof data.error === 'string' ? data.error : null;

      if (errorTitle) {
        return {
          title: errorTitle,
          message: detail || message || payloadError || fallbackMessage,
        };
      }
    }

    if (status === 502) {
      return {
        title: options?.authTitle || 'SHA auth failed',
        message:
          options?.authMessage ||
          'Unable to authenticate with the upstream SHA service. Please verify the SHA credentials or try again later.',
      };
    }

    if (status === 503) {
      return {
        title: options?.unavailableTitle || 'SHA API currently unavailable',
        message:
          options?.unavailableMessage ||
          'The upstream SHA service is currently unavailable. Please try again later.',
      };
    }

    if (status === 504) {
      return {
        title: options?.timeoutTitle || 'SHA API timed out',
        message:
          options?.timeoutMessage ||
          'The upstream SHA service did not respond in time. Please retry in a moment.',
      };
    }
  }

  return {
    title: options?.fallbackTitle || 'Request Failed',
    message: fallbackMessage || options?.fallbackMessage || 'Unable to complete the request.',
  };
}

function extractShaNumberFromIdentifiers(identifiers: Array<Record<string, unknown>>): string | undefined {
  const shaIdentifier = identifiers.find((identifier) => {
    const identificationType = identifier.identification_type;
    return typeof identificationType === 'string' && identificationType.toLowerCase().includes('sha');
  });

  return typeof shaIdentifier?.identification_number === 'string'
    ? shaIdentifier.identification_number
    : undefined;
}

function extractIdentifierByLabel(
  identifiers: Array<Record<string, unknown>>,
  matcher: (label: string) => boolean
): string | undefined {
  const match = identifiers.find((identifier) => {
    const identificationType = identifier.identification_type;
    return typeof identificationType === 'string' && matcher(identificationType.toLowerCase());
  });

  return typeof match?.identification_number === 'string' ? match.identification_number : undefined;
}

/** Map SHA numeric ID type codes to human-readable identification type strings */
function mapShaIdTypeCode(code: unknown): string | undefined {
  const SHA_ID_TYPE_CODES: Record<string, string> = {
    '1': 'passport',
    '2': 'national id',
    '3': 'alien id',
    '4': 'mandate number',
    '5': 'birth certificate',
  };
  if (typeof code === 'string') return SHA_ID_TYPE_CODES[code];
  if (typeof code === 'number') return SHA_ID_TYPE_CODES[String(code)];
  return undefined;
}

function buildShaPayloadPerson(
  person: Record<string, unknown>,
  source: SHAPayloadPerson['source'],
  relationship?: string,
  /** Fallback full name to parse when first/last are absent (from eligibility.full_name) */
  fallbackFullName?: string,
): SHAPayloadPerson {
  const identifiers = Array.isArray(person.other_identifications)
    ? (person.other_identifications as Array<Record<string, unknown>>)
    : [];

  // Derive first/middle/last from explicit fields OR fallback full name
  let firstName = typeof person.first_name === 'string' ? person.first_name : undefined;
  let middleName = typeof person.middle_name === 'string' ? person.middle_name : undefined;
  let lastName = typeof person.last_name === 'string' ? person.last_name : undefined;

  if (!firstName && !lastName) {
    const fullName = fallbackFullName
      ?? (typeof person.full_name === 'string' ? person.full_name : undefined)
      ?? (typeof person.name === 'string' ? person.name : undefined);
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 3) {
        firstName = parts[0];
        middleName = parts.slice(1, -1).join(' ');
        lastName = parts[parts.length - 1];
      } else if (parts.length === 2) {
        firstName = parts[0];
        lastName = parts[1];
      } else if (parts.length === 1) {
        firstName = parts[0];
      }
    }
  }

  return {
    source,
    relationship,
    id: typeof person.id === 'string' ? person.id : undefined,
    resourceType: typeof person.resourceType === 'string' ? person.resourceType : undefined,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    gender: typeof person.gender === 'string' ? person.gender : undefined,
    date_of_birth: typeof person.date_of_birth === 'string' ? person.date_of_birth : undefined,
    place_of_birth: typeof person.place_of_birth === 'string' ? person.place_of_birth : undefined,
    citizenship: typeof person.citizenship === 'string' ? person.citizenship : undefined,
    employment_type: typeof person.employment_type === 'string' ? person.employment_type : undefined,
    civil_status: typeof person.civil_status === 'string' ? person.civil_status : undefined,
    identification_type: typeof person.identification_type === 'string' ? person.identification_type : undefined,
    identification_number: typeof person.identification_number === 'string' ? person.identification_number : undefined,
    other_identifications: identifiers.map((identifier) => ({
      identification_type: typeof identifier.identification_type === 'string' ? identifier.identification_type : undefined,
      identification_number: typeof identifier.identification_number === 'string' ? identifier.identification_number : undefined,
    })),
    phone: typeof person.phone === 'string' ? person.phone : undefined,
    country: typeof person.country === 'string' ? person.country : undefined,
    county: typeof person.county === 'string' ? person.county : undefined,
    sub_county: typeof person.sub_county === 'string' ? person.sub_county : undefined,
    ward: typeof person.ward === 'string' ? person.ward : undefined,
    village_estate: typeof person.village_estate === 'string' ? person.village_estate : undefined,
    province_state_country: typeof person.province_state_country === 'string' ? person.province_state_country : undefined,
    zip_code: typeof person.zip_code === 'string' ? person.zip_code : undefined,
    postal_address: typeof person.postal_address === 'string' ? person.postal_address : undefined,
    id_serial: typeof person.id_serial === 'string' ? person.id_serial : undefined,
    sha_number:
      extractShaNumberFromIdentifiers(identifiers) ??
      (typeof person.sha_number === 'string' ? person.sha_number : undefined),
    cr_number: typeof person.id === 'string' && person.id.startsWith('CR') ? person.id : undefined,
    household_number: extractIdentifierByLabel(identifiers, (label) => label.includes('household')),
  };
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-background/70 p-4">
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">{icon}</div>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function EligibilityDataPanel({
  eligibility,
  crClient,
  onAddPersonToForm,
}: {
  eligibility: DirectEligibilityCheckResponse;
  crClient?: ClientRegistryClient | null;
  onAddPersonToForm?: (person: SHAPayloadPerson) => void;
}) {
  const raw = eligibility.raw_response ?? {};
  const rawPatient = raw as Record<string, unknown>;
  const schemeSummary = getEligibilitySchemeSummary(eligibility);
  const otherIdentifications = Array.isArray(rawPatient.other_identifications)
    ? (rawPatient.other_identifications as Array<Record<string, unknown>>)
    : [];
  const dependantGroups = Array.isArray(rawPatient.dependants)
    ? (rawPatient.dependants as Array<Record<string, unknown>>)
    : [];
  const meta = rawPatient.meta && typeof rawPatient.meta === 'object'
    ? (rawPatient.meta as Record<string, unknown>)
    : null;
  const originSystem = rawPatient.originSystem && typeof rawPatient.originSystem === 'object'
    ? (rawPatient.originSystem as Record<string, unknown>)
    : null;
  const schemes = Array.isArray(eligibility.schemes) ? eligibility.schemes : [];

  return (
    <div className="space-y-4">
      <div className={cn(
        'rounded-2xl border p-4',
        schemeSummary.tone === 'covered' ? 'border-success/30 bg-success/10' : 'border-warning/30 bg-warning/10'
      )}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {schemeSummary.tone === 'covered' ? <SHALogo size="lg" /> : <ShieldOff className="h-6 w-6 text-warning-foreground" />}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">
                  {schemeSummary.tone === 'mixed' ? 'Mixed Scheme Coverage' : schemeSummary.tone === 'covered' ? 'SHA Coverage Found' : 'SHA Coverage Not Active'}
                </h3>
                <Badge variant="outline" className={cn(
                  schemeSummary.tone === 'covered' ? 'border-success text-success' : 'border-warning text-warning-foreground'
                )}>
                  {schemeSummary.tone === 'covered' ? 'Eligible' : schemeSummary.tone === 'mixed' ? 'Mixed' : 'Ineligible'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {schemeSummary.description}
              </p>
              {schemeSummary.tone === 'mixed' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {schemeSummary.uncoveredSchemes.map((schemeName) => (
                    <Badge key={`uncovered-${schemeName}`} variant="outline" className="border-warning text-warning-foreground">
                      {schemeName} not covered
                    </Badge>
                  ))}
                  {schemeSummary.coveredSchemes.map((schemeName) => (
                    <Badge key={`covered-${schemeName}`} variant="outline" className="border-success text-success">
                      {schemeName} covered
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="SHA Number" value={eligibility.sha_number} />
            <DetailItem label="Member CR Number" value={eligibility.member_cr_number} />
            <DetailItem label="Copay" value={eligibility.copay_percentage === 0 ? 'Full coverage' : `${eligibility.copay_percentage}%`} />
            <DetailItem label="Status Code" value={eligibility.status_code} />
          </div>
        </div>
      </div>

      {schemes.length > 0 && (
        <DetailSection title="Scheme Coverage" icon={<ShieldQuestionMark className="h-4 w-4" />}>
          <div className="space-y-3">
            {schemes.map((scheme: SHAEligibilityScheme, index) => {
              const coverage = scheme.coverage;
              const policy = scheme.policy;
              const principalContributor = scheme.principalContributor;
              const isCovered = isCoveredSchemeStatus(coverage?.status);
              const schemeKey = [
                scheme.schemeName,
                scheme.schemeId,
                scheme.memberType,
                policy?.number,
                principalContributor?.crNumber,
                index,
              ]
                .filter((value) => value !== null && value !== undefined && value !== '')
                .join('-');

              return (
                <div key={schemeKey} className="rounded-xl border bg-card/60 p-4">
                  <div className="border-b pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{scheme.schemeName ?? `Scheme ${index + 1}`}</p>
                      {scheme.schemeId !== undefined && <Badge variant="outline">ID {scheme.schemeId}</Badge>}
                      {scheme.memberType && <Badge variant="secondary">{scheme.memberType}</Badge>}
                      <Badge
                        variant="outline"
                        className={cn(
                          'sm:ml-auto',
                          isCovered ? 'border-success text-success' : 'border-warning text-warning-foreground'
                        )}
                      >
                        {formatSchemeCoverageStatus(coverage?.status)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {coverage?.message || coverage?.reason || 'Coverage details returned by SHA eligibility lookup.'}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailItem label="Policy Number" value={policy?.number} />
                    <DetailItem label="Policy Start" value={policy?.startDate} />
                    <DetailItem label="Policy End" value={policy?.endDate} />
                    <DetailItem label="Coverage Start" value={coverage?.startDate} />
                    <DetailItem label="Coverage End" value={coverage?.endDate} />
                    <DetailItem label="Coverage Reason" value={coverage?.reason} />
                  </div>

                  {principalContributor && (
                    <div className="mt-4 rounded-lg border bg-background/80 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Principal Contributor</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailItem label="Name" value={principalContributor.name} />
                        <DetailItem label="CR Number" value={principalContributor.crNumber} />
                        <DetailItem label="ID Type" value={principalContributor.idType} />
                        <DetailItem label="ID Number" value={principalContributor.idNumber} />
                        <DetailItem label="Relationship" value={principalContributor.relationship} />
                        <DetailItem label="Employment Type" value={principalContributor.employmentType} />
                        <DetailItem label="Employer" value={principalContributor.employerDetails?.name} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}

      {crClient && (
        <DetailSection title="Patient Profile (Client Registry)" icon={<UserRound className="h-4 w-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="First Name" value={crClient.first_name} />
            <DetailItem label="Middle Name" value={crClient.middle_name} />
            <DetailItem label="Last Name" value={crClient.last_name} />
            <DetailItem label="Gender" value={crClient.gender} />
            <DetailItem label="Date of Birth" value={crClient.date_of_birth} />
            <DetailItem label="National ID" value={crClient.national_id} />
            <DetailItem label="CR Number" value={crClient.client_number} />
            <DetailItem label="ID Serial No." value={crClient.id_serial} />
            <DetailItem label="Phone" value={crClient.phone_number} />
            <DetailItem label="Email" value={crClient.email} />
            <DetailItem label="County" value={crClient.county} />
            <DetailItem label="Sub County" value={crClient.sub_county} />
            <DetailItem label="Ward" value={crClient.ward} />
            <DetailItem label="Village/Estate" value={crClient.village_estate} />
            <DetailItem label="Postal Address" value={crClient.address} />
            <DetailItem label="Citizenship" value={crClient.citizenship} />
            <DetailItem label="Place of Birth" value={crClient.place_of_birth} />
            <DetailItem label="Civil Status" value={crClient.civil_status} />
            <DetailItem label="Employment" value={crClient.employment_type} />
          </div>

          {/* Other Identifications */}
          {crClient.other_identifications && crClient.other_identifications.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {crClient.other_identifications.map((oid, idx) => (
                <DetailItem key={idx} label={oid.identification_type} value={oid.identification_number} />
              ))}
            </div>
          )}

          {/* Dependants */}
          {crClient.dependants && crClient.dependants.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Dependants ({crClient.dependants.reduce((sum, g) => sum + (g.total ?? g.result?.length ?? 0), 0)})
              </p>
              {crClient.dependants.flatMap((group) =>
                (group.result ?? []).map((dep, idx) => (
                  <div key={dep.id ?? idx} className="rounded-lg border bg-card/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">
                        {[dep.first_name, dep.middle_name, dep.last_name].filter(Boolean).join(' ')}
                      </span>
                      {group.relationship && (
                        <Badge variant="outline" className="text-xs">{group.relationship}</Badge>
                      )}
                      {dep.gender && <span className="text-xs text-muted-foreground">{dep.gender}</span>}
                      {dep.date_of_birth && <span className="text-xs text-muted-foreground">DOB: {dep.date_of_birth}</span>}
                      {onAddPersonToForm && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6 ml-auto shrink-0"
                          title={`Use dependant ${[dep.first_name, dep.last_name].filter(Boolean).join(' ')} to populate form`}
                          onClick={() => {
                            const person = buildShaPayloadPerson(
                              dep as unknown as Record<string, unknown>,
                              'dependent',
                              typeof group.relationship === 'string' ? group.relationship : undefined
                            );
                            onAddPersonToForm(person);
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                      {dep.identification_number && (
                        <span>{dep.identification_type}: {dep.identification_number}</span>
                      )}
                      {dep.id && (
                        <span>CR: {dep.id}</span>
                      )}
                      {dep.phone && (
                        <span>Phone: {dep.phone}</span>
                      )}
                      {dep.county && (
                        <span>County: {dep.county}</span>
                      )}
                      {dep.sub_county && (
                        <span>Sub-County: {dep.sub_county}</span>
                      )}
                      {dep.ward && (
                        <span>Ward: {dep.ward}</span>
                      )}
                    </div>
                    {dep.other_identifications && dep.other_identifications.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {dep.other_identifications.map((oid, oidIdx) => (
                          <span key={oidIdx} className="text-xs rounded bg-muted px-1.5 py-0.5">
                            {oid.identification_type}: {oid.identification_number}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </DetailSection>
      )}

      <DetailSection title="Member Details" icon={<UserRound className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Full Name" value={eligibility.full_name} />
          <DetailItem label="Member CR Number" value={eligibility.member_cr_number} />
          <DetailItem label="Status Description" value={eligibility.status_desc} />
          <DetailItem label="First Name" value={rawPatient.first_name as RecordValue} />
          <DetailItem label="Middle Name" value={rawPatient.middle_name as RecordValue} />
          <DetailItem label="Last Name" value={rawPatient.last_name as RecordValue} />
          <DetailItem label="Identification Type" value={rawPatient.identification_type as RecordValue} />
          <DetailItem label="Identification Number" value={rawPatient.identification_number as RecordValue} />
          <DetailItem label="Gender" value={eligibility.gender ?? (rawPatient.gender as RecordValue)} />
          <DetailItem label="Date of Birth" value={eligibility.date_of_birth ?? (rawPatient.date_of_birth as RecordValue)} />
          <DetailItem label="Age" value={eligibility.age} />
          <DetailItem label="Citizenship" value={rawPatient.citizenship as RecordValue} />
          <DetailItem label="Civil Status" value={rawPatient.civil_status as RecordValue} />
          <DetailItem label="Coverage End Date" value={eligibility.coverage_end_date} />
          <DetailItem label="OTP Whitelisted" value={eligibility.whitelisted_for_otp} />
          <DetailItem label="Principal Record" value={rawPatient.resourceType as RecordValue} />
          <DetailItem label="Record ID" value={rawPatient.id as RecordValue} />
        </div>
        {onAddPersonToForm && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              title="Use member details to populate form"
              onClick={() => {
                const merged: Record<string, unknown> = {
                  ...rawPatient,
                  first_name: rawPatient.first_name ?? crClient?.first_name,
                  middle_name: rawPatient.middle_name ?? crClient?.middle_name,
                  last_name: rawPatient.last_name ?? crClient?.last_name,
                  gender: rawPatient.gender ?? crClient?.gender ?? eligibility.gender,
                  date_of_birth:
                    rawPatient.date_of_birth
                    ?? (rawPatient.dateOfBirth as string)
                    ?? crClient?.date_of_birth
                    ?? eligibility.date_of_birth,
                  phone: rawPatient.phone ?? crClient?.phone_number,
                  county: rawPatient.county ?? crClient?.county,
                  sub_county: rawPatient.sub_county ?? crClient?.sub_county,
                  ward: rawPatient.ward ?? crClient?.ward,
                  citizenship: rawPatient.citizenship ?? crClient?.citizenship,
                  place_of_birth: rawPatient.place_of_birth ?? crClient?.place_of_birth,
                  postal_address: rawPatient.postal_address ?? crClient?.address,
                  sha_number: rawPatient.sha_number ?? eligibility.sha_number,
                  identification_type:
                    rawPatient.identification_type
                    ?? mapShaIdTypeCode(rawPatient.requestIdType)
                    ?? 'national id',
                  identification_number:
                    rawPatient.identification_number
                    ?? (rawPatient.requestIdNumber as string)
                    ?? crClient?.national_id,
                };
                onAddPersonToForm(buildShaPayloadPerson(merged, 'principal', undefined, eligibility.full_name ?? undefined));
              }}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              Use Principal
            </Button>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Contact & Address" icon={<Database className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Phone" value={rawPatient.phone as RecordValue} />
          <DetailItem label="Country" value={rawPatient.country as RecordValue} />
          <DetailItem label="County" value={rawPatient.county as RecordValue} />
          <DetailItem label="Sub County" value={rawPatient.sub_county as RecordValue} />
          <DetailItem label="Ward" value={rawPatient.ward as RecordValue} />
          <DetailItem label="Village / Estate" value={rawPatient.village_estate as RecordValue} />
          <DetailItem label="Province / State" value={rawPatient.province_state_country as RecordValue} />
          <DetailItem label="Postal Address" value={rawPatient.postal_address as RecordValue} />
          <DetailItem label="ZIP Code" value={rawPatient.zip_code as RecordValue} />
          <DetailItem label="Place of Birth" value={rawPatient.place_of_birth as RecordValue} />
          <DetailItem label="ID Serial" value={rawPatient.id_serial as RecordValue} />
        </div>
      </DetailSection>

      <DetailSection title="Employment" icon={<Briefcase className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Employment Type" value={eligibility.employment_type ?? (rawPatient.employment_type as RecordValue)} />
          <DetailItem label="Employer Name" value={eligibility.employer_name} />
          <DetailItem label="Employed" value={eligibility.is_employed} />
          <DetailItem label="Transition Status" value={eligibility.nhif_transition_status} />
        </div>
      </DetailSection>

      {otherIdentifications.length > 0 && (
        <DetailSection title="Other Identifications" icon={<CreditCard className="h-4 w-4" />}>
          <div className="space-y-2">
            {otherIdentifications.map((item, index) => (
              <div key={`${String(item.identification_type)}-${index}`} className="rounded-lg border bg-card/60 p-3">
                <p className="text-sm font-medium">{formatRecordValue(item.identification_type as RecordValue)}</p>
                <p className="mt-1 text-sm text-muted-foreground break-all">{formatRecordValue(item.identification_number as RecordValue)}</p>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {eligibility.dependents && eligibility.dependents.length > 0 && (
        <DetailSection title="Dependants" icon={<Users className="h-4 w-4" />}>
          <div className="space-y-2">
            {eligibility.dependents.map((dependent, index) => (
              <div key={`${dependent.sha_number ?? dependent.name}-${index}`} className="rounded-lg border bg-card/60 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium break-words">{dependent.name}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {[dependent.relationship, dependent.sha_number].filter(Boolean).join(' • ') || 'Dependant'}
                    </p>
                  </div>
                  {dependent.is_active !== undefined && (
                    <Badge variant="outline" className={dependent.is_active ? 'border-success text-success' : 'border-warning text-warning-foreground'}>
                      {dependent.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {dependantGroups.length > 0 && (
        <DetailSection title="Dependants From SHA Payload" icon={<Users className="h-4 w-4" />}>
          <div className="space-y-3">
            {dependantGroups.map((group, groupIndex) => {
              const groupResults = Array.isArray(group.result)
                ? (group.result as Array<Record<string, unknown>>)
                : [];

              return (
                <div key={`${String(group.relationship)}-${groupIndex}`} className="rounded-xl border bg-card/60 p-3">
                  <div className="flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{formatRecordValue(group.relationship as RecordValue)}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {formatRecordValue(group.date_added as RecordValue)}
                      </p>
                    </div>
                    <Badge variant="outline">{formatRecordValue(group.total as RecordValue)} linked</Badge>
                  </div>

                  <div className="mt-3 space-y-3">
                    {groupResults.map((person, personIndex) => (
                      <div key={`${String(person.id)}-${personIndex}`} className="rounded-lg border bg-background/80 p-3">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold break-words">
                              {[person.first_name, person.middle_name, person.last_name]
                                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                                .join(' ')}
                            </p>
                            <p className="text-xs text-muted-foreground break-words">
                              {[
                                person.identification_type,
                                person.identification_number,
                                person.id,
                              ]
                                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                                .join(' • ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{formatRecordValue(person.resourceType as RecordValue)}</Badge>
                            {onAddPersonToForm && (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 shrink-0"
                                title={`Use dependant ${[person.first_name, person.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')} to populate form`}
                                onClick={() => onAddPersonToForm(buildShaPayloadPerson(person, 'dependent', typeof group.relationship === 'string' ? group.relationship : undefined))}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <DetailItem label="Gender" value={person.gender as RecordValue} />
                          <DetailItem label="Date of Birth" value={person.date_of_birth as RecordValue} />
                          <DetailItem label="Civil Status" value={person.civil_status as RecordValue} />
                          <DetailItem label="Employment Type" value={person.employment_type as RecordValue} />
                          <DetailItem label="Phone" value={person.phone as RecordValue} />
                          <DetailItem label="Country" value={person.country as RecordValue} />
                          <DetailItem label="County" value={person.county as RecordValue} />
                          <DetailItem label="Sub County" value={person.sub_county as RecordValue} />
                          <DetailItem label="Ward" value={person.ward as RecordValue} />
                          <DetailItem label="Village / Estate" value={person.village_estate as RecordValue} />
                          <DetailItem label="Province / State" value={person.province_state_country as RecordValue} />
                          <DetailItem label="Postal Address" value={person.postal_address as RecordValue} />
                          <DetailItem label="ZIP Code" value={person.zip_code as RecordValue} />
                          <DetailItem label="ID Serial" value={person.id_serial as RecordValue} />
                          <DetailItem label="Place of Birth" value={person.place_of_birth as RecordValue} />
                        </div>

                        {Array.isArray(person.other_identifications) && person.other_identifications.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Other Identifications
                            </p>
                            <div className="space-y-2">
                              {(person.other_identifications as Array<Record<string, unknown>>).map((identifier, identifierIndex) => (
                                <div key={`${String(identifier.identification_type)}-${identifierIndex}`} className="rounded-lg border bg-card/60 p-2.5">
                                  <p className="text-sm font-medium">
                                    {formatRecordValue(identifier.identification_type as RecordValue)}
                                  </p>
                                  <p className="mt-1 break-all text-sm text-muted-foreground">
                                    {formatRecordValue(identifier.identification_number as RecordValue)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}

      {eligibility.means_testing && (
        <DetailSection title="Means Testing" icon={<HeartPulse className="h-4 w-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="Monthly Contribution" value={eligibility.means_testing.monthly_contribution} />
            <DetailItem label="Annual Contribution" value={eligibility.means_testing.annual_contribution} />
            <DetailItem label="Income Category" value={eligibility.means_testing.income_prediction_category} />
            <DetailItem label="Appeal Status" value={eligibility.means_testing.appeal_status} />
            <DetailItem label="Means Testing Done" value={eligibility.means_testing.means_testing_done} />
            <DetailItem label="Assessment Date" value={eligibility.means_testing.mt_date} />
          </div>
        </DetailSection>
      )}

      {(meta || originSystem) && (
        <DetailSection title="Source Metadata" icon={<CalendarDays className="h-4 w-4" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="Version" value={meta?.versionId as RecordValue} />
            <DetailItem label="Created" value={meta?.creationTime as RecordValue} />
            <DetailItem label="Last Updated" value={meta?.lastUpdated as RecordValue} />
            <DetailItem label="Source" value={meta?.source as RecordValue} />
            <DetailItem label="Origin System" value={originSystem?.system as RecordValue} />
          </div>
        </DetailSection>
      )}

      {eligibility.possible_solution && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-300 text-sm">Suggested Resolution</AlertTitle>
          <AlertDescription className="text-sm text-blue-700 dark:text-blue-400">
            {eligibility.possible_solution}
          </AlertDescription>
        </Alert>
      )}

      <DetailSection title="Raw Payloads" icon={<FileJson className="h-4 w-4" />}>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">SHA Eligibility Response</p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
              {JSON.stringify(eligibility.raw_response ?? {}, null, 2)}
            </pre>
          </div>
          {crClient && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Client Registry Response</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                {JSON.stringify(crClient, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DetailSection>
    </div>
  );
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function SHAVerificationModal({
  trigger,
  defaultNationalId,
  onClientFound,
  onEligibilityVerified,
  onAddPersonToForm,
  open,
  onOpenChange,
}: SHAVerificationModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  // Search state
  const [identifierType, setIdentifierType] = useState<string>('National ID');
  const [identifierValue, setIdentifierValue] = useState(defaultNationalId || '');
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [errorTitle, setErrorTitle] = useState<string>('Verification Failed');

  // Results state
  const [eligibility, setEligibility] = useState<DirectEligibilityCheckResponse | null>(null);
  const [crClient, setCRClient] = useState<ClientRegistryClient | null>(null);
  const [crStatus, setCRStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [dependantLookupLoading, setDependantLookupLoading] = useState(false);

  const isMobile = useMediaQuery('(max-width: 768px)');

  const selectedIdentifierOption = ELIGIBILITY_IDENTIFIER_OPTIONS.find(
    (option) => option.value === identifierType
  ) ?? {
    value: 'National ID',
    label: 'National ID',
    placeholder: 'Enter National ID',
  };

  const handleSearch = useCallback(async () => {
    if (!identifierValue || identifierValue.trim().length < 5) {
      setErrorTitle('Verification Failed');
      setErrorMessage(`Please enter a valid ${identifierType} (at least 5 characters)`);
      setStatus('error');
      return;
    }

    setStatus('loading');
    setEligibility(null);
    setCRClient(null);
    setCRStatus('loading');
    setErrorTitle('Verification Failed');
    setErrorMessage(undefined);

    const trimmedValue = identifierValue.trim();

    // Run eligibility + CR lookup in parallel
    const eligibilityPromise = shaApi.checkDirectEligibility(
      identifierType === 'National ID'
        ? { national_id: trimmedValue }
        : identifierType === 'SHA Number'
          ? { sha_number: trimmedValue }
          : {
              identification_type: identifierType,
              identification_number: trimmedValue,
            }
    );

    const crPromise = shaApi.fetchFromClientRegistry({
      identification_type: identifierType,
      identification_number: trimmedValue,
    });

    // Handle eligibility result
    try {
      const eligResponse = await eligibilityPromise;
      setEligibility(eligResponse);

      if (eligResponse.error) {
        setStatus('error');
        setErrorTitle('Eligibility Check Failed');
        setErrorMessage(eligResponse.error);
      } else {
        setStatus('success');
        onEligibilityVerified?.(eligResponse);
      }
    } catch (error) {
      console.error('Eligibility check failed:', error);
      const presentation = getEligibilityErrorPresentation(error);
      setErrorTitle(presentation.title);
      setErrorMessage(presentation.message);
      setStatus('error');
    }

    // Handle CR result (non-blocking — shows whatever comes back)
    try {
      const crResponse = await crPromise;
      if (crResponse.found && crResponse.client) {
        setCRClient(crResponse.client);
        onClientFound?.(crResponse.client);
        setCRStatus('done');
      } else {
        setCRStatus('done');
      }
    } catch (err) {
      console.warn('CR enrichment failed (non-fatal):', err);
      setCRStatus('error');
    }
  }, [identifierType, identifierValue, onEligibilityVerified, onClientFound]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleAddPerson = useCallback(async (person: SHAPayloadPerson) => {
    // For dependants, inject the principal's national ID so downstream eligibility
    // checks can resolve coverage via the principal (DHA only resolves via principal).
    if (person.source === 'dependent' && !person.principal_national_id) {
      // Try from eligibility schemes first
      const principalIdFromScheme = eligibility?.schemes?.[0]?.principalContributor?.idNumber;
      if (principalIdFromScheme) {
        person = { ...person, principal_national_id: principalIdFromScheme };
      } else if (identifierType === 'National ID' && identifierValue.trim()) {
        // Fallback: the user searched with the principal's national ID
        person = { ...person, principal_national_id: identifierValue.trim() };
      }
    }

    // For dependants, attempt a secondary CR lookup to enrich demographics
    if (person.source === 'dependent') {
      // Extract the best identifier for CR lookup
      const crNumber = person.cr_number || person.id;
      const shaNumber = person.sha_number;
      const birthCert = person.other_identifications?.find(
        (oid) => oid.identification_type?.toLowerCase().includes('birth')
      );
      const primaryId = person.identification_number;
      const primaryIdType = person.identification_type;

      // Build lookup params — try CR number first, then SHA number, then birth cert, then primary ID
      let lookupParams: Record<string, string> | null = null;
      if (crNumber && typeof crNumber === 'string' && crNumber.startsWith('CR')) {
        lookupParams = { cr_number: crNumber };
      } else if (shaNumber) {
        lookupParams = { identification_type: 'SHA Number', identification_number: shaNumber };
      } else if (birthCert?.identification_number) {
        lookupParams = { identification_type: 'Birth Certificate', identification_number: birthCert.identification_number };
      } else if (primaryId && primaryIdType) {
        lookupParams = { identification_type: primaryIdType, identification_number: primaryId };
      }

      if (lookupParams) {
        setDependantLookupLoading(true);
        try {
          const crResponse = await shaApi.fetchFromClientRegistry(lookupParams);
          if (crResponse.found && crResponse.client) {
            const client = crResponse.client;
            // Merge CR data into the person payload (CR wins for missing fields)
            const enriched: SHAPayloadPerson = {
              ...person,
              first_name: person.first_name || client.first_name || undefined,
              middle_name: person.middle_name || client.middle_name || undefined,
              last_name: person.last_name || client.last_name || undefined,
              gender: person.gender || client.gender || undefined,
              date_of_birth: person.date_of_birth || client.date_of_birth || undefined,
              phone: person.phone || client.phone_number || undefined,
              county: person.county || client.county || undefined,
              sub_county: person.sub_county || client.sub_county || undefined,
              ward: person.ward || client.ward || undefined,
              cr_number: client.client_number || person.cr_number,
              identification_type: person.identification_type || (client.national_id ? 'National ID' : undefined),
              identification_number: person.identification_number || client.national_id || undefined,
              place_of_birth: person.place_of_birth || client.place_of_birth || undefined,
              citizenship: person.citizenship || client.citizenship || undefined,
              village_estate: person.village_estate || client.village_estate || undefined,
              postal_address: person.postal_address || client.address || undefined,
              id_serial: person.id_serial || client.id_serial || undefined,
              // Merge other_identifications from CR if the dependant had none
              other_identifications: (person.other_identifications?.length ?? 0) > 0
                ? person.other_identifications
                : client.other_identifications?.map((oid) => ({
                    identification_type: oid.identification_type,
                    identification_number: oid.identification_number,
                  })),
              // Re-extract SHA/household from enriched identifiers
              sha_number: person.sha_number || (client.other_identifications
                ? extractShaNumberFromIdentifiers(
                    client.other_identifications as unknown as Array<Record<string, unknown>>
                  )
                : undefined),
              household_number: person.household_number || (client.other_identifications
                ? extractIdentifierByLabel(
                    client.other_identifications as unknown as Array<Record<string, unknown>>,
                    (label) => label.includes('household')
                  )
                : undefined),
            };
            setDependantLookupLoading(false);
            onAddPersonToForm?.(enriched);
            setIsOpen(false);
            return;
          }
        } catch {
          // CR lookup failed — non-fatal, proceed with original data
          console.warn('Dependant CR enrichment failed (non-fatal), using original data');
        }
        setDependantLookupLoading(false);
      }
    }

    // Fallback: pass person as-is (principal, or dependant without enrichable identifiers)
    onAddPersonToForm?.(person);
    setIsOpen(false);
  }, [onAddPersonToForm, setIsOpen, eligibility, identifierType, identifierValue]);

  return (
    <Sheet open={isOpen} onOpenChange={(openState) => {
      if (!openState) {
        setEligibility(null);
        setCRClient(null);
        setStatus('idle');
        setCRStatus('idle');
        setErrorMessage(undefined);
      }
      setIsOpen(openState);
    }}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}

      <SheetContent
        side="right"
        className={cn(
          'flex h-full w-full flex-col gap-0 p-0',
          isMobile ? 'max-w-none' : 'sm:max-w-4xl xl:max-w-5xl'
        )}
      >
        {/* Dependant CR enrichment loading overlay */}
        {dependantLookupLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Looking up dependant in Client Registry...</span>
            </div>
          </div>
        )}
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Kenya Digital Health Verification
          </SheetTitle>
          <SheetDescription>
            Verify SHA eligibility and retrieve patient demographics from Kenya&apos;s Client Registry in a single lookup.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1">
            <div className="space-y-6 p-5">

              {/* Search Input */}
              <div className="space-y-2">
                <Label htmlFor="unified-identifier-value">Identification</Label>
                <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
                  <Select
                    value={identifierType}
                    onValueChange={(value) => {
                      setIdentifierType(value);
                      setStatus('idle');
                      setEligibility(null);
                      setCRClient(null);
                      setCRStatus('idle');
                      setErrorMessage(undefined);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select identifier type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ELIGIBILITY_IDENTIFIER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="unified-identifier-value"
                    value={identifierValue}
                    onChange={(e) => setIdentifierValue(e.target.value)}
                    placeholder={selectedIdentifierOption.placeholder}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      'flex-1',
                      status === 'success' && eligibility?.is_eligible && 'border-success',
                      status === 'success' && !eligibility?.is_eligible && 'border-warning',
                      status === 'error' && 'border-destructive'
                    )}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={status === 'loading' || !identifierValue.trim()}
                    className="w-full sm:w-auto"
                  >
                    {status === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2">Verify</span>
                  </Button>
                </div>
              </div>

              {/* Error Message */}
              {status === 'error' && errorMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{errorTitle}</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* Eligibility Result (compact card) */}
              {status === 'success' && eligibility && (
                (() => {
                  const schemeSummary = getEligibilitySchemeSummary(eligibility);
                  return (
                    <Card className={cn(
                      schemeSummary.tone === 'covered'
                        ? 'border-success bg-success/10'
                        : 'border-warning bg-warning/10'
                    )}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {schemeSummary.tone === 'covered' ? <SHALogo size="lg" /> : <ShieldOff className="h-6 w-6 text-warning-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={cn(
                                'font-semibold text-lg',
                                schemeSummary.tone === 'covered' ? 'text-success' : 'text-warning-foreground'
                              )}>
                                {schemeSummary.tone === 'covered' ? 'SHA Eligible' : schemeSummary.tone === 'mixed' ? 'SHIF Not Covered' : 'NOT SHA ELIGIBLE'}
                              </h4>
                              <Badge variant="outline" className={cn(
                                schemeSummary.tone === 'covered' ? 'border-success text-success' : 'border-warning text-warning-foreground'
                              )}>
                                {schemeSummary.tone === 'covered' ? 'Eligible' : schemeSummary.tone === 'mixed' ? 'Mixed' : 'Ineligible'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {schemeSummary.tone === 'not-covered'
                                ? (eligibility.reason || 'This individual does not have active SHA coverage')
                                : schemeSummary.description}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm mt-4">
                          {eligibility.full_name && (
                            <div className="min-w-0">
                              <Label className="text-muted-foreground text-xs">Name</Label>
                              <p className="font-medium break-words">{eligibility.full_name}</p>
                            </div>
                          )}
                          {eligibility.sha_number && (
                            <div className="min-w-0">
                              <Label className="text-muted-foreground text-xs">SHA Number</Label>
                              <p className="font-medium break-words">{eligibility.sha_number}</p>
                            </div>
                          )}
                          {eligibility.coverage_end_date && (
                            <div className="min-w-0">
                              <Label className="text-muted-foreground text-xs">Coverage Until</Label>
                              <p className="font-medium break-words">{eligibility.coverage_end_date}</p>
                            </div>
                          )}
                          <div className="min-w-0">
                            <Label className="text-muted-foreground text-xs">Copay</Label>
                            <div className="font-medium">
                              {eligibility.copay_percentage === 0 ? (
                                <Badge className="bg-success text-success-foreground">Full Coverage</Badge>
                              ) : (
                                <span>{eligibility.copay_percentage}%</span>
                              )}
                            </div>
                          </div>
                          {eligibility.employer_name && (
                            <div className="min-w-0">
                              <Label className="text-muted-foreground text-xs">Employer</Label>
                              <p className="font-medium break-words">{eligibility.employer_name}</p>
                            </div>
                          )}
                        </div>

                        {schemeSummary.tone === 'mixed' && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {schemeSummary.uncoveredSchemes.map((schemeName) => (
                              <Badge key={`uncovered-${schemeName}`} variant="outline" className="border-warning text-warning-foreground">
                                {schemeName} not covered
                              </Badge>
                            ))}
                            {schemeSummary.coveredSchemes.map((schemeName) => (
                              <Badge key={`covered-${schemeName}`} variant="outline" className="border-success text-success">
                                {schemeName} covered
                              </Badge>
                            ))}
                          </div>
                        )}

                        {eligibility.possible_solution && (
                          <Alert className="mt-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
                            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <AlertTitle className="text-blue-800 dark:text-blue-300 text-sm">How to Resolve</AlertTitle>
                            <AlertDescription className="text-sm text-blue-700 dark:text-blue-400">
                              {eligibility.possible_solution}
                            </AlertDescription>
                          </Alert>
                        )}

                        {schemeSummary.tone === 'not-covered' && (
                          <Alert className="mt-4 border-warning bg-warning/10">
                            <Info className="h-4 w-4 text-warning-foreground" />
                            <AlertDescription className="text-sm">
                              Patient will need to pay cash or use other payment methods.
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()
              )}

              {/* CR Demographics — shown once CR result arrives */}
              {crClient && (
                <Card className="border-success bg-success/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <UserCheck className="h-5 w-5 text-success" />
                      <h4 className="font-semibold text-success">
                        Client Registry Record
                      </h4>
                      <Badge variant="outline" className="ml-auto text-success border-success">
                        {crClient.client_number}
                      </Badge>
                      {onAddPersonToForm && (
                        <Button
                          variant="default"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Use principal details to populate form"
                          onClick={() => {
                            const principal = buildShaPayloadPerson(
                              {
                                ...crClient,
                                phone: crClient.phone_number,
                                id: crClient.client_number,
                                identification_type: crClient.national_id ? 'National ID' : undefined,
                                identification_number: crClient.national_id,
                              } as unknown as Record<string, unknown>,
                              'principal'
                            );
                            handleAddPerson(principal);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                      <div className="min-w-0">
                        <Label className="text-muted-foreground text-xs">Full Name</Label>
                        <p className="font-medium break-words">
                          {crClient.first_name} {crClient.middle_name && `${crClient.middle_name} `}{crClient.last_name}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-muted-foreground text-xs">Date of Birth</Label>
                        <p className="font-medium break-words">{crClient.date_of_birth}</p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-muted-foreground text-xs">Gender</Label>
                        <p className="font-medium break-words">
                          {crClient.gender === 'M' ? 'Male' : crClient.gender === 'F' ? 'Female' : crClient.gender || 'Other'}
                        </p>
                      </div>
                      {crClient.national_id && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">National ID</Label>
                          <p className="font-medium break-words">{crClient.national_id}</p>
                        </div>
                      )}
                      {crClient.phone_number && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Phone</Label>
                          <p className="font-medium break-words">{crClient.phone_number}</p>
                        </div>
                      )}
                      {crClient.email && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Email</Label>
                          <p className="font-medium break-words">{crClient.email}</p>
                        </div>
                      )}
                      {crClient.county && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">County</Label>
                          <p className="font-medium break-words">{crClient.county}</p>
                        </div>
                      )}
                      {crClient.sub_county && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Sub-County</Label>
                          <p className="font-medium break-words">{crClient.sub_county}</p>
                        </div>
                      )}
                      {crClient.ward && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Ward</Label>
                          <p className="font-medium break-words">{crClient.ward}</p>
                        </div>
                      )}
                      {crClient.citizenship && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Citizenship</Label>
                          <p className="font-medium break-words">{crClient.citizenship}</p>
                        </div>
                      )}
                      {crClient.village_estate && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">Village/Estate</Label>
                          <p className="font-medium break-words">{crClient.village_estate}</p>
                        </div>
                      )}
                      {crClient.id_serial && (
                        <div className="min-w-0">
                          <Label className="text-muted-foreground text-xs">ID Serial No.</Label>
                          <p className="font-medium break-words">{crClient.id_serial}</p>
                        </div>
                      )}
                    </div>

                    {/* Other Identifications (SHA Number, Household Number, etc.) */}
                    {crClient.other_identifications && crClient.other_identifications.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Other Identifiers</Label>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          {crClient.other_identifications.map((oid, idx) => (
                            <div key={idx} className="min-w-0 flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/40">
                              <span className="text-xs text-muted-foreground shrink-0">{oid.identification_type}:</span>
                              <span className="font-medium break-all">{oid.identification_number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dependants */}
                    {crClient.dependants && crClient.dependants.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                          Dependants ({crClient.dependants.reduce((sum, g) => sum + (g.total ?? g.result?.length ?? 0), 0)})
                        </Label>
                        <div className="mt-2 space-y-2">
                          {crClient.dependants.flatMap((group) =>
                            (group.result ?? []).map((dep, idx) => (
                              <div key={dep.id ?? idx} className="rounded-md border px-3 py-2 bg-muted/40 text-sm">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="font-medium">
                                    {[dep.first_name, dep.middle_name, dep.last_name].filter(Boolean).join(' ')}
                                  </span>
                                  {group.relationship && (
                                    <Badge variant="outline" className="text-xs">{group.relationship}</Badge>
                                  )}
                                  {dep.gender && (
                                    <span className="text-xs text-muted-foreground">{dep.gender}</span>
                                  )}
                                  {dep.date_of_birth && (
                                    <span className="text-xs text-muted-foreground">DOB: {dep.date_of_birth}</span>
                                  )}
                                  {onAddPersonToForm && (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-6 w-6 ml-auto shrink-0"
                                      title={`Use dependant ${[dep.first_name, dep.last_name].filter(Boolean).join(' ')} to populate form`}
                                      onClick={() => {
                                        const person = buildShaPayloadPerson(
                                          dep as unknown as Record<string, unknown>,
                                          'dependent',
                                          typeof group.relationship === 'string' ? group.relationship : undefined
                                        );
                                        handleAddPerson(person);
                                      }}
                                    >
                                      <UserPlus className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                                  {dep.identification_number && (
                                    <span>{dep.identification_type}: {dep.identification_number}</span>
                                  )}
                                  {dep.id && (
                                    <span>CR: {dep.id}</span>
                                  )}
                                  {dep.county && (
                                    <span>County: {dep.county}</span>
                                  )}
                                  {dep.sub_county && (
                                    <span>Sub-County: {dep.sub_county}</span>
                                  )}
                                  {dep.ward && (
                                    <span>Ward: {dep.ward}</span>
                                  )}
                                </div>
                                {dep.other_identifications && dep.other_identifications.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {dep.other_identifications.map((oid, oidIdx) => (
                                      <span key={oidIdx} className="text-xs rounded bg-muted px-1.5 py-0.5">
                                        {oid.identification_type}: {oid.identification_number}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* CR Loading indicator */}
              {crStatus === 'loading' && status === 'success' && !crClient && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Client Registry demographics...
                </div>
              )}

              {/* Full eligibility data panel (expand for deep details) */}
              {eligibility && (status === 'success' || eligibility.error) && (
                <EligibilityDataPanel
                  eligibility={eligibility}
                  crClient={crClient}
                  onAddPersonToForm={onAddPersonToForm ? handleAddPerson : undefined}
                />
              )}

            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SHAVerificationModal;
