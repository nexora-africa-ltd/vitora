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

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Layers,
  Activity,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';

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

// ============================================================================
// Types
// ============================================================================

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

function getBenefitCode(item: BenefitPackageItem): string {
  return getField(item, 'parentBenefitCode', 'parent_benefit_code', 'code');
}

function getBenefitName(item: BenefitPackageItem): string {
  return getField(item, 'parentBenefit', 'parent_benefit', 'name') || getBenefitCode(item) || 'Unknown Benefit';
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
}: BenefitsPanelProps) {
  // Normalize SHA-XXX-N → CRXXX-N for ILM calls.
  const lookupId = toCrId(crNumber);
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

  if (isLoading) {
    return <BenefitsSkeleton compact={compact} className={className} />;
  }

  if (isError && !noCoverage) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load benefits: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (noCoverage || benefits.length === 0) {
    return null;
  }

  const content = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Benefits & Interventions ({benefits.length} package{benefits.length !== 1 ? 's' : ''})
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

      <div className="space-y-1.5">
        {benefits.map((benefit, idx) => (
          <BenefitAccordion
            key={getBenefitCode(benefit) || idx}
            benefit={benefit}
            crNumber={lookupId}
            patientPk={patientPk}
            shaMemberId={shaMemberId}
          />
        ))}
      </div>
    </div>
  );

  if (compact) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardContent className="py-4">
        {content}
      </CardContent>
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
}: {
  benefit: BenefitPackageItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getBenefitCode(benefit);
  const name = getBenefitName(benefit);

  // Fetch sub-benefits filtered by this parent benefit code
  const {
    data: subBenefitsResponse,
    isLoading,
  } = useQuery({
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

  const subBenefits = expanded
    ? extractItems<SubBenefitItem>(subBenefitsResponse?.data)
    : [];

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-md"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{name}</span>
        {code && (
          <Badge variant="outline" size="sm" className="font-mono shrink-0">
            {code}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/50">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading sub-benefits...
            </div>
          ) : subBenefits.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No sub-benefits available for this package.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground mb-1">
                {subBenefits.length} sub-benefit{subBenefits.length !== 1 ? 's' : ''}
              </p>
              {subBenefits.map((sub, idx) => (
                <SubBenefitAccordion
                  key={sub.code || idx}
                  subBenefit={sub}
                  crNumber={crNumber}
                  patientPk={patientPk}
                  shaMemberId={shaMemberId}
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
}: {
  subBenefit: SubBenefitItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getField(subBenefit as Record<string, unknown>, 'code', 'benefit_code', 'benefitCode');
  const name = getField(subBenefit as Record<string, unknown>, 'name', 'benefit_name', 'benefitName') || code || 'Unknown Sub-Benefit';

  const {
    data: interventionsResponse,
    isLoading,
  } = useQuery({
    queryKey: ['sha-benefit-interventions', crNumber, code, patientPk],
    queryFn: () =>
      shaApi.ilmBenefitInterventions({
        patient_id: crNumber,
        sub_benefit_code: code,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: expanded && !!crNumber && !!code,
    staleTime: 5 * 60 * 1000,
  });

  const interventions = expanded
    ? extractItems<InterventionItem>(interventionsResponse?.data)
    : [];

  return (
    <div className="rounded border border-border/50 bg-background">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors rounded"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium truncate flex-1">{name}</span>
        {code && code !== name && (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{code}</span>
        )}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-border/30">
          {isLoading ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading interventions...
            </div>
          ) : interventions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No interventions available.
            </p>
          ) : (
            <div className="space-y-1">
              {interventions.map((intervention, idx) => (
                <InterventionRow
                  key={intervention.code || idx}
                  intervention={intervention}
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
// Intervention Row
// ============================================================================

function InterventionRow({ intervention }: { intervention: InterventionItem }) {
  const item = intervention as Record<string, unknown>;
  const code = getField(item, 'code', 'intervention_code', 'interventionCode');
  const name = getField(item, 'name', 'intervention_name', 'interventionName') || code || 'Unknown Intervention';
  const paymentMech = getField(item, 'paymentMechanism', 'payment_mechanism');
  const tariff = (item.overallTariff ?? item.overall_tariff) as number | undefined;
  const needsPreauth = (item.needsPreauth ?? item.needs_preauth) as boolean | undefined;

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/20 text-xs">
      <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="truncate flex-1">{name}</span>
      {code && (
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{code}</span>
      )}
      {needsPreauth && (
        <Badge variant="outline" size="sm" className="text-[10px] h-4 shrink-0 border-amber-400 text-amber-600 dark:text-amber-400">
          Preauth
        </Badge>
      )}
      {paymentMech && (
        <Badge variant="outline" size="sm" className="text-[10px] h-4 shrink-0">
          {paymentMech === 'FEE_FOR_SERVICE' ? 'FFS' : paymentMech === 'PER_DIEM' ? 'Per Diem' : paymentMech}
        </Badge>
      )}
      {tariff != null && tariff > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
          KES {tariff.toLocaleString()}
        </span>
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
