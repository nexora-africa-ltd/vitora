/**
 * PreVisitChecksPanel — Proactive DHA HIE pre-visit verification dashboard.
 *
 * All four checks run **automatically in parallel** as soon as the panel
 * mounts — we already know the patient, the facility, and the practitioner
 * from claim/auth context. The user sees a single "N/4 verified" summary
 * and can expand any card for details, instead of filling forms manually.
 *
 *   1. Patient coverage   — eligibility check (auto, uses SHA member ID number)
 *   2. Benefits & interventions — BenefitsPanel (auto, uses DHA CR number)
 *   3. Facility contract  — facility lookup (auto, uses claim.facility_code or user.facility.mfl_code)
 *   4. Practitioner licence — health-worker lookup (auto, uses user.license_number)
 *
 * An "Ad-hoc lookup" section at the bottom remains for one-off searches
 * (different facility, different patient, different practitioner).
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Stethoscope,
  UserCheck,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BenefitsPanel } from '@/components/billing/sha/BenefitsPanel';
import {
  EligibilityResultCard,
  FacilityResultCard,
  PatientLookupResultCard,
  ProfessionalResultCard,
  UtilizationResultCard,
} from '@/components/billing/sha/IlmResultCards';
import { shaApi } from '@/lib/api/sha';
import { useAuth } from '@/lib/auth/context';
import { useSHAMember } from '@/lib/hooks/use-sha';
import { usePatient } from '@/lib/hooks/use-patients';
import {
  parseEligibility,
  parseFacility,
  parseProfessional,
  parseUtilization,
  toCrId,
} from '@/lib/sha/ilm-parsers';
import { cn } from '@/lib/utils';

interface PreVisitChecksPanelProps {
  /** Local Patient PK — when supplied, eligibility/benefit calls persist a SHACoverageSnapshot. */
  patientPk?: number;
  /** Local SHAMember PK for cross-linking the snapshot. */
  shaMemberId?: number;
  /** Patient's national/SHA identification number — overrides member-derived value. */
  defaultIdentificationNumber?: string;
  defaultIdentificationType?: string;
  /** DHA Client-Registry CR number for benefits/utilisation queries. */
  defaultDhaPatientId?: string;
  /** Facility code (MFL/FID) to pre-fill the facility registry lookup. */
  defaultFacilityCode?: string;
  /** Local SHA member number (`SHA-XXXXX-N`) used as a CR fallback. */
  shaMemberNumber?: string;
}

const ID_TYPES = ['National ID', 'Passport', 'Birth Certificate', 'Alien ID', 'SHA Number'];
const FACILITY_ID_TYPES = [
  { value: 'mfl', label: 'MFL code' },
  { value: 'fr', label: 'FR code' },
  { value: 'uuid', label: 'UUID' },
];
const REGULATORS = ['KMPDC', 'NCK', 'COC', 'PPB', 'KMLTTB', 'KNDI'];

// ============================================================================
// Status pill (used by every check card)
// ============================================================================

type CheckStatus = 'loading' | 'ok' | 'warn' | 'fail' | 'skipped';

function StatusPill({ status, label }: { status: CheckStatus; label: string }) {
  const styles: Record<CheckStatus, string> = {
    loading: 'border-muted-foreground/30 text-muted-foreground',
    ok: 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30',
    warn: 'border-amber-400 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30',
    fail: 'border-destructive/40 text-destructive bg-destructive/10',
    skipped: 'border-muted-foreground/20 text-muted-foreground',
  };
  const icons: Record<CheckStatus, React.ReactNode> = {
    loading: <Loader2 className="h-3 w-3 animate-spin" />,
    ok: <CheckCircle2 className="h-3 w-3" />,
    warn: <ShieldAlert className="h-3 w-3" />,
    fail: <XCircle className="h-3 w-3" />,
    skipped: <AlertCircle className="h-3 w-3" />,
  };
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px] font-medium', styles[status])}>
      {icons[status]}
      {label}
    </Badge>
  );
}

// ============================================================================
// Generic check card wrapper
// ============================================================================

function CheckCard({
  icon,
  title,
  subtitle,
  status,
  statusLabel,
  defaultOpen = false,
  onRefresh,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  status: CheckStatus;
  statusLabel: string;
  defaultOpen?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex flex-1 items-center gap-2 text-left hover:opacity-80"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="shrink-0">{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{title}</p>
                {subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          <StatusPill status={status} label={statusLabel} />
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              title="Re-check"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          )}
        </div>
        <CollapsibleContent>
          <div className="border-t px-3 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================================================
// Main panel
// ============================================================================

export function PreVisitChecksPanel({
  patientPk,
  shaMemberId,
  defaultIdentificationNumber = '',
  defaultIdentificationType = 'National ID',
  defaultDhaPatientId = '',
  defaultFacilityCode = '',
  shaMemberNumber = '',
}: PreVisitChecksPanelProps) {
  const { user } = useAuth();

  // Resolve identification from the SHA member or patient record.
  const { data: member } = useSHAMember(shaMemberId);
  const { data: patient } = usePatient(patientPk ?? 0);

  // Fallback chain: explicit prop → SHA member national_id → patient identification_number.
  // NOTE: SHA numbers (SHA-XXXXX) are NOT accepted by DHA ILM v1 eligibility,
  // so we do not use sha_number as a fallback here.
  const idNumber =
    defaultIdentificationNumber ||
    member?.national_id ||
    patient?.identification_number ||
    patient?.national_id ||
    '';
  const idType =
    defaultIdentificationType ||
    (patient?.identification_type === 'national_id' ? 'National ID' : undefined) ||
    'National ID';
  const memberNumber = shaMemberNumber || member?.sha_member_number || '';
  const dhaPatientId = defaultDhaPatientId || toCrId(memberNumber);
  const facilityCode = defaultFacilityCode || user?.facility?.mfl_code || '';
  const licenseNumber = user?.license_number || '';
  const regulator = user?.licensing_body || '';
  const practitionerIdNumber = user?.national_id || '';

  // -------------------------------------------------------------------------
  // 1. Patient coverage (eligibility)
  // -------------------------------------------------------------------------
  const eligibilityQuery = useQuery({
    queryKey: ['ilm-eligibility', idNumber, idType, patientPk, shaMemberId],
    queryFn: () =>
      shaApi.ilmEligibility({
        identification_number: idNumber,
        identification_type: idType,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: !!idNumber && !!idType,
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });

  const parsedEligibility = useMemo(
    () => parseEligibility(eligibilityQuery.data),
    [eligibilityQuery.data],
  );

  // -------------------------------------------------------------------------
  // 3. Facility contract
  // -------------------------------------------------------------------------
  const facilityQuery = useQuery({
    queryKey: ['ilm-facility', facilityCode],
    queryFn: () =>
      shaApi.ilmFacilitySearch({
        identifier: facilityCode,
        identifier_type: 'mfl',
      }),
    enabled: !!facilityCode,
    staleTime: 30 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });

  const parsedFacility = useMemo(() => parseFacility(facilityQuery.data), [facilityQuery.data]);

  // -------------------------------------------------------------------------
  // 4. Practitioner licence
  // -------------------------------------------------------------------------
  const practitionerEnabled = !!licenseNumber && !!regulator && !!practitionerIdNumber;
  const practitionerQuery = useQuery({
    queryKey: ['ilm-practitioner', practitionerIdNumber, regulator],
    queryFn: () =>
      shaApi.ilmProfessionalSearch({
        identification_number: practitionerIdNumber,
        identification_type: 'National ID',
        regulator,
      }),
    enabled: practitionerEnabled,
    staleTime: 60 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });

  const parsedPractitioner = useMemo(
    () => parseProfessional(practitionerQuery.data),
    [practitionerQuery.data],
  );

  // -------------------------------------------------------------------------
  // Derive statuses
  // -------------------------------------------------------------------------
  const eligibilityStatus: CheckStatus = !idNumber
    ? 'skipped'
    : eligibilityQuery.isLoading
      ? 'loading'
      : eligibilityQuery.isError
        ? 'fail'
        : parsedEligibility?.isActive
          ? 'ok'
          : 'warn';

  const benefitsStatus: CheckStatus = dhaPatientId ? 'ok' : 'skipped';

  const facilityStatus: CheckStatus = !facilityCode
    ? 'skipped'
    : facilityQuery.isLoading
      ? 'loading'
      : facilityQuery.isError
        ? 'fail'
        : parsedFacility?.shaContractStatus === 'ACTIVE' ||
            parsedFacility?.shaContractStatus === 'CONTRACTED'
          ? 'ok'
          : 'warn';

  const practitionerStatus: CheckStatus = !practitionerEnabled
    ? 'skipped'
    : practitionerQuery.isLoading
      ? 'loading'
      : practitionerQuery.isError
        ? 'fail'
        : parsedPractitioner?.licenseStatus === 'ACTIVE' ||
            parsedPractitioner?.licenseStatus === 'VALID' ||
            parsedPractitioner?.licenseStatus === 'LICENSED'
          ? 'ok'
          : 'warn';

  const allStatuses = [eligibilityStatus, benefitsStatus, facilityStatus, practitionerStatus];
  const okCount = allStatuses.filter((s) => s === 'ok').length;
  const totalRun = allStatuses.filter((s) => s !== 'skipped').length;
  const anyLoading = allStatuses.some((s) => s === 'loading');
  const anyFail = allStatuses.some((s) => s === 'fail' || s === 'warn');

  const summaryTone: CheckStatus = anyLoading
    ? 'loading'
    : anyFail
      ? 'warn'
      : okCount === totalRun
        ? 'ok'
        : 'skipped';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Pre-visit DHA HIE Checks
          </div>
          <StatusPill
            status={summaryTone}
            label={
              anyLoading
                ? 'Verifying…'
                : totalRun === 0
                  ? 'Awaiting data'
                  : `${okCount}/${totalRun} verified`
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 1. Patient coverage */}
        <CheckCard
          icon={
            eligibilityStatus === 'ok' ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            ) : eligibilityStatus === 'warn' || eligibilityStatus === 'fail' ? (
              <ShieldOff className="h-4 w-4 text-amber-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            )
          }
          title="Patient SHA coverage"
          subtitle={
            !idNumber
              ? 'No national ID on patient or SHA member — add one to auto-check, or use manual lookup below.'
              : parsedEligibility
                ? `${parsedEligibility.fullName || 'Member'} · ${parsedEligibility.schemes.length} scheme${parsedEligibility.schemes.length !== 1 ? 's' : ''}`
                : `Checking ${idType} ${idNumber}…`
          }
          status={eligibilityStatus}
          statusLabel={
            eligibilityStatus === 'ok'
              ? 'Active'
              : eligibilityStatus === 'warn'
                ? 'Inactive'
                : eligibilityStatus === 'fail'
                  ? 'Failed'
                  : eligibilityStatus === 'loading'
                    ? 'Checking…'
                    : 'No ID'
          }
          defaultOpen={eligibilityStatus === 'warn' || eligibilityStatus === 'fail'}
          loading={eligibilityQuery.isFetching}
          onRefresh={idNumber ? () => eligibilityQuery.refetch() : undefined}
        >
          {eligibilityQuery.isError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="text-xs">
                {extractError(eligibilityQuery.error)}
              </AlertDescription>
            </Alert>
          )}
          {!idNumber ? (
            <ManualEligibilityLookup patientPk={patientPk} shaMemberId={shaMemberId} />
          ) : parsedEligibility ? (
            <EligibilityResultCard result={parsedEligibility} />
          ) : (
            <p className="text-xs text-muted-foreground">No result yet.</p>
          )}
        </CheckCard>

        {/* 2. Benefits & interventions */}
        <CheckCard
          icon={<Package className="h-4 w-4 text-primary" />}
          title="Benefits & interventions"
          subtitle={
            dhaPatientId
              ? `CR ${dhaPatientId} — expand to browse packages`
              : 'No DHA CR number — provide one to load benefits'
          }
          status={benefitsStatus}
          statusLabel={dhaPatientId ? 'Loaded' : 'Skipped'}
          defaultOpen={false}
        >
          {dhaPatientId ? (
            <BenefitsPanel
              crNumber={dhaPatientId}
              patientPk={patientPk}
              shaMemberId={shaMemberId}
              compact
            />
          ) : (
            <ManualBenefitsLookup patientPk={patientPk} shaMemberId={shaMemberId} />
          )}
        </CheckCard>

        {/* 3. Facility contract */}
        <CheckCard
          icon={<Building2 className="h-4 w-4 text-primary" />}
          title="Facility SHA contract"
          subtitle={
            !facilityCode
              ? 'No facility code on this claim'
              : parsedFacility?.officialName
                ? `${parsedFacility.officialName} (MFL ${facilityCode})`
                : `Verifying MFL ${facilityCode}…`
          }
          status={facilityStatus}
          statusLabel={
            facilityStatus === 'ok'
              ? 'Contracted'
              : facilityStatus === 'warn'
                ? 'Not contracted'
                : facilityStatus === 'fail'
                  ? 'Failed'
                  : facilityStatus === 'loading'
                    ? 'Checking…'
                    : 'No MFL'
          }
          defaultOpen={facilityStatus === 'warn' || facilityStatus === 'fail'}
          loading={facilityQuery.isFetching}
          onRefresh={facilityCode ? () => facilityQuery.refetch() : undefined}
        >
          {facilityQuery.isError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="text-xs">
                {extractError(facilityQuery.error)}
              </AlertDescription>
            </Alert>
          )}
          {parsedFacility ? (
            <FacilityResultCard result={parsedFacility} />
          ) : facilityCode ? (
            <p className="text-xs text-muted-foreground">No result yet.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add an MFL code to this claim to enable auto-verification.
            </p>
          )}
        </CheckCard>

        {/* 4. Practitioner licence */}
        <CheckCard
          icon={<Stethoscope className="h-4 w-4 text-primary" />}
          title="Practitioner licence"
          subtitle={
            !practitionerEnabled
              ? 'No practitioner credentials on your staff profile'
              : parsedPractitioner?.fullName
                ? `${parsedPractitioner.fullName} · ${parsedPractitioner.regulator || regulator}`
                : `Verifying ${regulator} ${licenseNumber}…`
          }
          status={practitionerStatus}
          statusLabel={
            practitionerStatus === 'ok'
              ? 'Licensed'
              : practitionerStatus === 'warn'
                ? 'Check licence'
                : practitionerStatus === 'fail'
                  ? 'Failed'
                  : practitionerStatus === 'loading'
                    ? 'Checking…'
                    : 'No licence'
          }
          defaultOpen={practitionerStatus === 'warn' || practitionerStatus === 'fail'}
          loading={practitionerQuery.isFetching}
          onRefresh={practitionerEnabled ? () => practitionerQuery.refetch() : undefined}
        >
          {practitionerQuery.isError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="text-xs">
                {extractError(practitionerQuery.error)}
              </AlertDescription>
            </Alert>
          )}
          {parsedPractitioner ? (
            <ProfessionalResultCard result={parsedPractitioner} />
          ) : practitionerEnabled ? (
            <p className="text-xs text-muted-foreground">No result yet.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a licence number and licensing body to your staff profile to enable
              auto-verification.
            </p>
          )}
        </CheckCard>

        {/* Ad-hoc lookups (collapsed by default) */}
        <AdHocLookups
          defaultCrNumber={dhaPatientId}
          patientPk={patientPk}
          shaMemberId={shaMemberId}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Manual fallback forms (rendered inside cards when auto-data is missing)
// ============================================================================

function ManualEligibilityLookup({
  patientPk,
  shaMemberId,
}: {
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState('National ID');
  const [result, setResult] = useState<ReturnType<typeof parseEligibility>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const resp = await shaApi.ilmEligibility({
        identification_number: idNumber,
        identification_type: idType,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      });
      setResult(parseEligibility(resp));
    } catch (e) {
      setErr(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="manual-elig-id">Identification number</Label>
          <Input
            id="manual-elig-id"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="manual-elig-type">Type</Label>
          <Select value={idType} onValueChange={setIdType}>
            <SelectTrigger id="manual-elig-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" disabled={!idNumber || busy} onClick={run}>
        {busy ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : (
          <Search className="mr-2 h-3 w-3" />
        )}
        Check eligibility
      </Button>
      {err && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{err}</AlertDescription>
        </Alert>
      )}
      {result && <EligibilityResultCard result={result} />}
    </div>
  );
}

function ManualBenefitsLookup({
  patientPk,
  shaMemberId,
}: {
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [cr, setCr] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!submitted) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={cr} onChange={(e) => setCr(e.target.value)} placeholder="CR-12345-0" />
        <Button size="sm" disabled={!cr} onClick={() => setSubmitted(true)}>
          <Search className="mr-2 h-3 w-3" />
          Load benefits
        </Button>
      </div>
    );
  }
  return <BenefitsPanel crNumber={cr} patientPk={patientPk} shaMemberId={shaMemberId} compact />;
}

// ============================================================================
// Ad-hoc lookups — collapsed bottom drawer for one-off searches
// ============================================================================

function AdHocLookups({
  defaultCrNumber,
  patientPk,
  shaMemberId,
}: {
  defaultCrNumber: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-1 px-2">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Ad-hoc lookups (different facility, patient, practitioner, or intervention)
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <UtilizationLookup
          defaultCrNumber={defaultCrNumber}
          patientPk={patientPk}
          shaMemberId={shaMemberId}
        />
        <AdHocFacilityLookup />
        <AdHocPractitionerLookup />
        <AdHocPatientLookup patientPk={patientPk} shaMemberId={shaMemberId} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function UtilizationLookup({
  defaultCrNumber,
  patientPk,
  shaMemberId,
}: {
  defaultCrNumber: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [cr, setCr] = useState(defaultCrNumber);
  const [code, setCode] = useState('');
  const [entries, setEntries] = useState<ReturnType<typeof parseUtilization> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const resp = await shaApi.ilmUtilization({
        patient_id: cr,
        intervention_code: code,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      });
      setEntries(parseUtilization(resp));
    } catch (e) {
      setErr(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1 px-2 text-xs">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Activity className="h-3 w-3" />
          Check utilisation for an intervention
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-2 pt-2 pb-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="util-cr">CR number</Label>
            <Input id="util-cr" value={cr} onChange={(e) => setCr(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="util-code">Intervention code</Label>
            <Input
              id="util-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SHA-XX-YYY"
            />
          </div>
        </div>
        <Button size="sm" disabled={!cr || !code || busy} onClick={run}>
          {busy ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Search className="mr-2 h-3 w-3" />
          )}
          Check utilisation
        </Button>
        {err && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{err}</AlertDescription>
          </Alert>
        )}
        {entries && <UtilizationResultCard entries={entries} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AdHocFacilityLookup() {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState('mfl');
  const [result, setResult] = useState<ReturnType<typeof parseFacility>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const resp = await shaApi.ilmFacilitySearch({
        identifier,
        identifier_type: identifierType,
      });
      setResult(parseFacility(resp));
    } catch (e) {
      setErr(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1 px-2 text-xs">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Building2 className="h-3 w-3" />
          Look up a different facility
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-2 pt-2 pb-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="adhoc-fac-id">Identifier</Label>
            <Input
              id="adhoc-fac-id"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adhoc-fac-type">Type</Label>
            <Select value={identifierType} onValueChange={setIdentifierType}>
              <SelectTrigger id="adhoc-fac-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_ID_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" disabled={!identifier || busy} onClick={run}>
          {busy ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Search className="mr-2 h-3 w-3" />
          )}
          Search facility
        </Button>
        {err && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{err}</AlertDescription>
          </Alert>
        )}
        {result && <FacilityResultCard result={result} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AdHocPractitionerLookup() {
  const [open, setOpen] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState('National ID');
  const [regulator, setRegulator] = useState('KMPDC');
  const [result, setResult] = useState<ReturnType<typeof parseProfessional>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const resp = await shaApi.ilmProfessionalSearch({
        identification_number: idNumber,
        identification_type: idType,
        regulator,
      });
      setResult(parseProfessional(resp));
    } catch (e) {
      setErr(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1 px-2 text-xs">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Stethoscope className="h-3 w-3" />
          Look up a different practitioner
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-2 pt-2 pb-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label htmlFor="adhoc-pro-id">ID number</Label>
            <Input
              id="adhoc-pro-id"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adhoc-pro-type">ID type</Label>
            <Select value={idType} onValueChange={setIdType}>
              <SelectTrigger id="adhoc-pro-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ID_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="adhoc-pro-reg">Regulator</Label>
            <Select value={regulator} onValueChange={setRegulator}>
              <SelectTrigger id="adhoc-pro-reg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGULATORS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" disabled={!idNumber || busy} onClick={run}>
          {busy ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Search className="mr-2 h-3 w-3" />
          )}
          Search practitioner
        </Button>
        {err && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{err}</AlertDescription>
          </Alert>
        )}
        {result && <ProfessionalResultCard result={result} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AdHocPatientLookup({
  patientPk,
  shaMemberId,
}: {
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState('National ID');
  const [result, setResult] = useState<ReturnType<typeof parseEligibility>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const resp = await shaApi.ilmPatientLookup({
        identification_number: idNumber,
        identification_type: idType,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      });
      setResult(parseEligibility(resp));
    } catch (e) {
      setErr(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-1 px-2 text-xs">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <UserCheck className="h-3 w-3" />
          Look up a different patient (DHA Client Registry)
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-2 pt-2 pb-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="adhoc-pat-id">Identification number</Label>
            <Input
              id="adhoc-pat-id"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adhoc-pat-type">Type</Label>
            <Select value={idType} onValueChange={setIdType}>
              <SelectTrigger id="adhoc-pat-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ID_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" disabled={!idNumber || busy} onClick={run}>
          {busy ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Search className="mr-2 h-3 w-3" />
          )}
          Lookup patient
        </Button>
        {err && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{err}</AlertDescription>
          </Alert>
        )}
        {result && <PatientLookupResultCard result={result} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; detail?: string; message?: string } }; message?: string };
  return (
    e?.response?.data?.error ??
    e?.response?.data?.detail ??
    e?.response?.data?.message ??
    e?.message ??
    'Request failed'
  );
}
