/**
 * SHA Benefits & Interventions Panel
 *
 * Architecture (per DHA docs - Benefits & Intervention Codes):
 *   Level 1: Benefit Package (SHA-XX) — 14 broad categories
 *   Level 2: Intervention (SHA-XX-YYY) — specific billable services
 *
 * Flow:
 *   1. Fetch benefit packages via ilmBenefits (is_unique_benefit=true)
 *   2. On expand, fetch interventions via ilmBenefitInterventions(sub_benefit_code=SHA-XX)
 *
 * Used on: Patient detail page (below EligibilityBanner), Lookup page
 */
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Layers,
  Activity,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { billingApi } from '@/lib/api/billing';
import { parseUtilization } from '@/lib/sha/ilm-parsers';
import type { ParsedUtilizationEntry } from '@/lib/sha/ilm-parsers';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useFacility } from '@/lib/context/facility-context';
import { extractSHAErrorInfo } from '@/lib/sha/error-utils';

/**
 * DHA returns HTTP 400 with "No result found for ID ... ClientRegistry ID"
 * whenever a patient has no benefits coverage on file. That is an expected
 * empty state for many patients, not a real error — render it accordingly
 * and don't pollute the console via the global query error handler.
 */
function isNoCoverageError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.response?.status !== 400) return false;
  const data = err.response?.data as { message?: string; detail?: string } | undefined;
  const text = `${data?.message ?? ''} ${data?.detail ?? ''}`.toLowerCase();
  return text.includes('no result found');
}

/**
 * Normalize an internal SHA member number to the DHA Client Registry id.
 * Local convention stores numbers as `SHA-XXXXX-N`; DHA expects `CRXXXXX-N`.
 * Already-CR ids and other shapes are returned unchanged.
 */
function toCrId(value: string): string {
  if (!value) return value;
  if (value.startsWith('SHA-')) return `CR${value.slice(4)}`;
  return value;
}

function isCapitationPaymentMechanism(value: string): boolean {
  return value.trim().toUpperCase().replaceAll('_', ' ') === 'CAPITATION';
}

// ============================================================================
// Types
// ============================================================================

export type BenefitsEmptyReason = 'no_coverage' | 'no_benefits';

interface BenefitsPanelProps {
  /** DHA Client Registry number (patient_id for ILM calls) */
  crNumber: string;
  /** Local patient PK (for snapshot audit) */
  patientPk?: number;
  /** SHA member ID (for snapshot audit) */
  shaMemberId?: number;
  /** Custom className */
  className?: string;
  /** Compact layout (no card wrapper) */
  compact?: boolean;
  /** Called when benefits are empty (no coverage or zero benefit packages) */
  onEmpty?: (reason: BenefitsEmptyReason) => void;
  /** Called when benefits data is available (non-empty) */
  onHasBenefits?: () => void;
  /** How to render utilization eligibility in summary rows */
  utilizationEligibilityDisplay?: 'dot' | 'inline';
}

/** Benefit package from is_unique_benefit=true response */
interface BenefitPackageItem {
  parentBenefit?: string;
  parentBenefitCode?: string;
  code?: string;
  name?: string;
  [key: string]: unknown;
}

/** Sub-benefit from sub-benefits endpoint */
interface SubBenefitItem {
  code?: string;
  name?: string;
  parentBenefit?: string;
  parentBenefitCode?: string;
  accessPoint?: string;
  active?: boolean;
  status?: string;
  [key: string]: unknown;
}

/** Intervention from benefit-interventions endpoint */
interface InterventionItem {
  code?: string;
  name?: string;
  benefitCode?: string;
  benefitName?: string;
  parentBenefitCode?: string;
  parentBenefitName?: string;
  paymentMechanism?: string;
  overallTariff?: number;
  accessPoint?: string;
  needsPreauth?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract array items from DHA/ILM response payloads.
 * Handles: direct array, { results: [...] }, { data: [...] },
 * and the double-nested { results: [{ results: [...] }] } from is_unique_benefit.
 */
function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) {
      const results = obj.results as unknown[];
      // Handle double-nested: { results: [{ results: [...] }] }
      if (
        results.length === 1 &&
        typeof results[0] === 'object' &&
        results[0] !== null &&
        Array.isArray((results[0] as Record<string, unknown>).results)
      ) {
        return (results[0] as Record<string, unknown>).results as T[];
      }
      return results as T[];
    }
    if (Array.isArray(obj.benefits)) return obj.benefits as T[];
    if (Array.isArray(obj.interventions)) return obj.interventions as T[];
    if (Object.keys(obj).length > 0 && !obj.error) return [obj as T];
  }
  return [];
}

function getField(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = item[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

/**
 * When DHA returns an intervention object whose standard name fields are all empty,
 * scan remaining string values for something displayable.
 * Common in sparse responses for sub-benefits that have no active interventions.
 */
function inferNameFromKeys(item: Record<string, unknown>): string {
  // Skip keys that are clearly not names
  const skipKeys = new Set([
    'code',
    'interventionCode',
    'intervention_code',
    'benefitCode',
    'benefit_code',
    'status',
    'active',
    'accessPoint',
    'access_point',
    'paymentMechanism',
    'payment_mechanism',
  ]);
  for (const [key, val] of Object.entries(item)) {
    if (skipKeys.has(key)) continue;
    if (typeof val === 'string' && val.trim().length > 3 && val.trim().length < 200) {
      return val.trim();
    }
  }
  return '';
}

function getBenefitCode(item: BenefitPackageItem): string {
  return getField(item, 'parentBenefitCode', 'parent_benefit_code', 'code');
}

function getBenefitName(item: BenefitPackageItem): string {
  return (
    getField(item, 'parentBenefit', 'parent_benefit', 'name') ||
    getBenefitCode(item) ||
    'Unknown Benefit'
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function BenefitsPanel({
  crNumber,
  patientPk,
  shaMemberId,
  className,
  compact = false,
  onEmpty,
  onHasBenefits,
  utilizationEligibilityDisplay = 'inline',
}: BenefitsPanelProps) {
  const { facility } = useFacility();
  // Normalize SHA-XXX-N → CRXXX-N for ILM calls.
  const lookupId = toCrId(crNumber);
  const { data: facilityBillingConfig } = useQuery({
    queryKey: ['facility-billing-config', facility?.id],
    queryFn: async () => {
      if (!facility?.id) return null;
      const response = await billingApi.getFacilityBillingConfigs({
        facility: facility.id,
        page_size: 1,
      });
      return response.results[0] ?? null;
    },
    enabled: !!facility?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const hideCapitationInterventions = facilityBillingConfig?.hide_capitation_interventions ?? false;
  const {
    data: benefitsResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sha-benefits', lookupId, patientPk],
    queryFn: () =>
      shaApi.ilmBenefits({
        patient_id: lookupId,
        is_unique_benefit: true,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: !!lookupId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });

  const benefits = extractItems<BenefitPackageItem>(benefitsResponse?.data);
  const noCoverage = isError && isNoCoverageError(error);

  useEffect(() => {
    if (isLoading || isFetching) return;
    if (noCoverage) {
      onEmpty?.('no_coverage');
    } else if (benefits.length === 0) {
      onEmpty?.('no_benefits');
    } else {
      onHasBenefits?.();
    }
  }, [noCoverage, benefits.length, isLoading, isFetching, onEmpty, onHasBenefits]);

  if (isLoading) {
    return <BenefitsSkeleton compact={compact} className={className} />;
  }

  if (isError && !noCoverage) {
    const shaError = extractSHAErrorInfo(error);
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1">
            <p className="font-medium">{shaError?.title || 'Failed to load benefits'}</p>
            <p>{shaError?.message || (error instanceof Error ? error.message : 'Unknown error')}</p>
            {shaError?.detail && shaError.detail !== shaError.message && (
              <p className="break-words text-xs">{shaError.detail}</p>
            )}
            {(shaError?.code || typeof shaError?.upstreamStatus === 'number') && (
              <p className="font-mono text-xs opacity-90">
                {shaError?.code || 'SHA_ERROR'}
                {typeof shaError?.upstreamStatus === 'number'
                  ? ` (upstream ${shaError.upstreamStatus})`
                  : ''}
              </p>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const content = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Benefits, Interventions &amp; Utilizations
            {benefits.length > 0 && (
              <>
                {' '}
                ({benefits.length} package{benefits.length !== 1 ? 's' : ''})
              </>
            )}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 w-7 p-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {(noCoverage || benefits.length === 0) && (
        <div className="rounded-md border border-dashed p-4 text-center">
          <Package className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1 text-xs text-muted-foreground">
            No eligible benefits found for this patient at this facility.
          </p>
        </div>
      )}

      {benefits.length > 0 && (
        <div className="space-y-1.5">
          {benefits.map((benefit, idx) => (
            <BenefitAccordion
              key={getBenefitCode(benefit) || idx}
              benefit={benefit}
              crNumber={lookupId}
              patientPk={patientPk}
              shaMemberId={shaMemberId}
              hideCapitationInterventions={hideCapitationInterventions}
              utilizationEligibilityDisplay={utilizationEligibilityDisplay}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardContent className="py-4">{content}</CardContent>
    </Card>
  );
}

// ============================================================================
// Benefit Accordion — expands to fetch sub-benefits, each with interventions
// ============================================================================

function BenefitAccordion({
  benefit,
  crNumber,
  patientPk,
  shaMemberId,
  hideCapitationInterventions,
  utilizationEligibilityDisplay,
}: {
  benefit: BenefitPackageItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
  hideCapitationInterventions: boolean;
  utilizationEligibilityDisplay: 'dot' | 'inline';
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getBenefitCode(benefit);
  const name = getBenefitName(benefit);

  // Fetch sub-benefits filtered by this parent benefit code
  const { data: subBenefitsResponse, isLoading } = useQuery({
    queryKey: ['sha-sub-benefits', crNumber, code, patientPk],
    queryFn: () =>
      shaApi.ilmSubBenefits({
        patient_id: crNumber,
        parent_benefit_code: code,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: expanded && !!crNumber && !!code,
    staleTime: 5 * 60 * 1000,
  });

  const subBenefits = expanded ? extractItems<SubBenefitItem>(subBenefitsResponse?.data) : [];

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex-1 truncate text-sm font-medium">{name}</span>
        {code && (
          <Badge variant="outline" size="sm" className="shrink-0 font-mono">
            {code}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 pb-2 pt-1">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading sub-benefits...
            </div>
          ) : subBenefits.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">
              No sub-benefits available for this package.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="mb-1 text-[10px] text-muted-foreground">
                {subBenefits.length} sub-benefit{subBenefits.length !== 1 ? 's' : ''}
              </p>
              {subBenefits.map((sub, idx) => (
                <SubBenefitAccordion
                  key={sub.code || idx}
                  subBenefit={sub}
                  crNumber={crNumber}
                  patientPk={patientPk}
                  shaMemberId={shaMemberId}
                  hideCapitationInterventions={hideCapitationInterventions}
                  utilizationEligibilityDisplay={utilizationEligibilityDisplay}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-Benefit Accordion — expands to fetch interventions
// ============================================================================

function SubBenefitAccordion({
  subBenefit,
  crNumber,
  patientPk,
  shaMemberId,
  hideCapitationInterventions,
  utilizationEligibilityDisplay,
}: {
  subBenefit: SubBenefitItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
  hideCapitationInterventions: boolean;
  utilizationEligibilityDisplay: 'dot' | 'inline';
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getField(
    subBenefit as Record<string, unknown>,
    'code',
    'benefit_code',
    'benefitCode'
  );
  const name =
    getField(subBenefit as Record<string, unknown>, 'name', 'benefit_name', 'benefitName') ||
    code ||
    'Unknown Sub-Benefit';

  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [utilizations, setUtilizations] = useState<Map<string, ParsedUtilizationEntry[]>>(
    new Map()
  );
  const [loadingUtilCodes, setLoadingUtilCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !crNumber || !code) return;
    let cancelled = false;
    setLoading(true);

    shaApi
      .ilmBenefitInterventions({
        patient_id: crNumber,
        sub_benefit_code: code,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      })
      .then((resp) => {
        if (cancelled) return;
        const rawItems = extractItems<InterventionItem>(resp.data);
        const filteredItems = rawItems.filter((i) => {
          const item = i as Record<string, unknown>;
          const hasCode = !!getField(
            item,
            'code',
            'intervention_code',
            'interventionCode',
            'benefitCode'
          );
          const hasName = !!getField(
            item,
            'name',
            'intervention_name',
            'interventionName',
            'benefit_name',
            'benefitName',
            'display_name',
            'displayName'
          );
          const paymentMechanism = getField(item, 'paymentMechanism', 'payment_mechanism');
          if (hideCapitationInterventions && isCapitationPaymentMechanism(paymentMechanism)) {
            return false;
          }
          return hasCode || hasName;
        });
        const items = filteredItems.length > 0 ? filteredItems : rawItems;
        setInterventions(items);
      })
      .catch(() => {
        if (!cancelled) setInterventions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, crNumber, code, patientPk, shaMemberId, hideCapitationInterventions]);

  const loadUtilizationForIntervention = useCallback(
    async (interventionCode: string) => {
      if (!interventionCode) return;
      if (utilizations.has(interventionCode)) return;
      if (loadingUtilCodes.has(interventionCode)) return;

      setLoadingUtilCodes((prev) => new Set(prev).add(interventionCode));
      try {
        const utilResp = await shaApi.ilmUtilization({
          patient_id: crNumber,
          intervention_code: interventionCode,
          patient_pk: patientPk,
          sha_member_id: shaMemberId,
        });
        const entries = parseUtilization(utilResp);
        setUtilizations((prev) => {
          const next = new Map(prev);
          next.set(interventionCode, entries);
          return next;
        });
      } catch {
        // Best effort — leave empty entries when DHA utilization is unavailable.
        setUtilizations((prev) => {
          const next = new Map(prev);
          next.set(interventionCode, []);
          return next;
        });
      } finally {
        setLoadingUtilCodes((prev) => {
          const next = new Set(prev);
          next.delete(interventionCode);
          return next;
        });
      }
    },
    [crNumber, patientPk, shaMemberId, utilizations, loadingUtilCodes]
  );

  return (
    <div className="rounded border border-border/50 bg-background">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors hover:bg-muted/30"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-xs font-medium">{name}</span>
        {code && code !== name && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{code}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-2.5 pb-2 pt-1">
          {loading ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading interventions &amp; utilization...
            </div>
          ) : interventions.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No interventions available.</p>
          ) : (
            <div className="space-y-1">
              {interventions.map((intervention, idx) => {
                const item = intervention as Record<string, unknown>;
                const displayCode = getField(
                  item,
                  'code',
                  'intervention_code',
                  'interventionCode',
                  'benefitCode'
                );
                // Utilization endpoint requires an intervention code (not benefit/sub-benefit code).
                const utilizationCode = getField(
                  item,
                  'code',
                  'intervention_code',
                  'interventionCode'
                );
                const utilEntries = utilizationCode ? utilizations.get(utilizationCode) : undefined;
                return (
                  <InterventionRow
                    key={displayCode || idx}
                    intervention={intervention}
                    utilization={utilEntries}
                    isUtilizationLoading={
                      !!(utilizationCode && loadingUtilCodes.has(utilizationCode))
                    }
                    onLoadUtilization={
                      utilizationCode
                        ? () => loadUtilizationForIntervention(utilizationCode)
                        : undefined
                    }
                    utilizationEligibilityDisplay={utilizationEligibilityDisplay}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Intervention Row
// ============================================================================

function InterventionRow({
  intervention,
  utilization,
  isUtilizationLoading,
  onLoadUtilization,
  utilizationEligibilityDisplay,
}: {
  intervention: InterventionItem;
  utilization?: ParsedUtilizationEntry[];
  isUtilizationLoading?: boolean;
  onLoadUtilization?: () => void;
  utilizationEligibilityDisplay: 'dot' | 'inline';
}) {
  const [showUtilizationDetails, setShowUtilizationDetails] = useState(false);
  const item = intervention as Record<string, unknown>;
  const code = getField(
    item,
    'code',
    'intervention_code',
    'interventionCode',
    'benefitCode',
    'benefit_code'
  );
  const name =
    getField(
      item,
      'name',
      'intervention_name',
      'interventionName',
      'benefit_name',
      'benefitName',
      'description',
      'display_name',
      'displayName'
    ) ||
    code ||
    inferNameFromKeys(item) ||
    'Unknown Intervention';
  const paymentMech = getField(item, 'paymentMechanism', 'payment_mechanism');
  const tariff = (item.overallTariff ?? item.overall_tariff) as number | undefined;
  const needsPreauth = (item.needsPreauth ?? item.needs_preauth) as boolean | undefined;

  const utilEntries = utilization ?? [];
  const util = utilEntries.length > 0 ? utilEntries[0] : null;
  const hasMultipleUtilRecords = utilEntries.length > 1;
  const utilEligibility = util?.eligibility || '';
  const utilEligibilityState = utilEligibility.toUpperCase();
  const showUtilEligibility = !!utilEligibility;

  useEffect(() => {
    if (showUtilizationDetails) {
      onLoadUtilization?.();
    }
  }, [showUtilizationDetails, onLoadUtilization]);

  return (
    <div className="space-y-1 rounded px-2 py-1.5 text-xs hover:bg-muted/20">
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-medium">{name}</span>
        {code && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{code}</span>
        )}
        {needsPreauth && (
          <Badge
            variant="outline"
            size="sm"
            className="h-4 shrink-0 border-amber-400 text-[10px] text-amber-600 dark:text-amber-400"
          >
            Preauth
          </Badge>
        )}
        {paymentMech && (
          <Badge variant="outline" size="sm" className="h-4 shrink-0 text-[10px]">
            {paymentMech === 'FEE_FOR_SERVICE'
              ? 'FFS'
              : paymentMech === 'PER_DIEM'
                ? 'Per Diem'
                : paymentMech}
          </Badge>
        )}
        {tariff != null && tariff > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
            KES {tariff.toLocaleString()}
          </span>
        )}
      </div>

      {/* Inline utilization (compact summary) */}
      <div className="ml-5 flex items-center gap-3 text-[10px] text-muted-foreground">
        {util ? (
          <>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-2.5 w-2.5" />
              {util.visitCount} visit{util.visitCount !== 1 ? 's' : ''}
              {typeof util.totalQuota === 'number' ? ` / ${util.totalQuota}` : ''}
            </span>
            {util.lastVisit && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Last: {util.lastVisit}
              </span>
            )}
            {typeof util.amountUsed === 'number' && (
              <span>
                KES {util.amountUsed.toLocaleString()} used
                {typeof util.amountRemaining === 'number'
                  ? ` (KES ${util.amountRemaining.toLocaleString()} left)`
                  : ''}
              </span>
            )}
            {typeof util.remainingQuota === 'number' && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {util.remainingQuota} remaining
              </span>
            )}
            {showUtilEligibility && (
              <span className="flex items-center gap-1" title={`Eligibility: ${utilEligibility}`}>
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    utilEligibilityState === 'ELIGIBLE' && 'bg-green-500',
                    utilEligibilityState === 'INELIGIBLE' && 'bg-red-500',
                    utilEligibilityState !== 'ELIGIBLE' &&
                      utilEligibilityState !== 'INELIGIBLE' &&
                      'bg-amber-500'
                  )}
                />
                {utilizationEligibilityDisplay === 'inline'
                  ? `Eligibility: ${utilEligibility}`
                  : null}
              </span>
            )}
            {hasMultipleUtilRecords && <span>{utilEntries.length} utilization records</span>}
          </>
        ) : (
          <span className="flex items-center gap-1">
            <BarChart3 className="h-2.5 w-2.5" />
            Utilization
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowUtilizationDetails((prev) => !prev)}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {showUtilizationDetails ? 'Hide details' : 'Details'}
        </button>
      </div>

      {util && showUtilizationDetails && (
        <div className="ml-5 mt-1.5 space-y-1.5">
          {utilEntries.map((entry, index) => (
            <div
              key={`${entry.interventionCode || code || 'util'}-${index}`}
              className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground"
            >
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {entry.periodStart && <span>Period start: {entry.periodStart}</span>}
                {entry.periodEnd && <span>Period end: {entry.periodEnd}</span>}
                {entry.eligibility && <span>Eligibility: {entry.eligibility}</span>}
                {entry.status && <span>Status: {entry.status}</span>}
                {entry.schemeCode && <span>Scheme code: {entry.schemeCode}</span>}
                {entry.schemeName && <span>Scheme: {entry.schemeName}</span>}
                {entry.benefitCode && <span>Benefit code: {entry.benefitCode}</span>}
                {entry.benefitName && <span>Benefit: {entry.benefitName}</span>}
                {entry.facilityName && <span>Facility: {entry.facilityName}</span>}
              </div>
              {entry.additionalDetails && entry.additionalDetails.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {entry.additionalDetails.map((detail) => (
                    <span key={`${detail.key}-${detail.value}`}>
                      {detail.key}: {detail.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showUtilizationDetails && isUtilizationLoading && (
        <div className="ml-5 mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Loading utilization details...
        </div>
      )}

      {showUtilizationDetails && !isUtilizationLoading && utilEntries.length === 0 && (
        <div className="ml-5 mt-1.5 text-[10px] text-muted-foreground">
          No utilization details available for this intervention.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function BenefitsSkeleton({ compact, className }: { compact?: boolean; className?: string }) {
  const content = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    </div>
  );

  if (compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardContent className="py-4">{content}</CardContent>
    </Card>
  );
}

export default BenefitsPanel;
