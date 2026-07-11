/**
 * SHA Coverage & Utilization Panel
 *
 * Compact panel shown during IPD admission when payer is SHA.
 * Fetches benefit packages, inpatient interventions, and per-intervention
 * utilization data from the DHA HIE Middleware (ILM).
 *
 * Architecture:
 *   1. Fetch benefit packages (ilmBenefits with is_unique_benefit=true)
 *   2. On expand, fetch sub-benefits → interventions per benefit
 *   3. For IP-accessible interventions, fetch utilization data
 *
 * Used on: encounters/new/admission, admissions/new, encounters/new/review
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
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
import { parseUtilization } from '@/lib/sha/ilm-parsers';
import type { ParsedUtilizationEntry } from '@/lib/sha/ilm-parsers';
import { AxiosError } from 'axios';

// ============================================================================
// Types
// ============================================================================

interface SHACoveragePanelProps {
  /** DHA Client Registry number (patient_id for ILM calls) */
  crNumber: string;
  /** Local patient PK (for snapshot audit) */
  patientPk?: number;
  /** SHA member ID (for snapshot audit) */
  shaMemberId?: number;
  /** Compact layout (no card wrapper) */
  compact?: boolean;
  /** Custom className */
  className?: string;
  /** Filter to inpatient-only interventions (default: true for IPD) */
  inpatientOnly?: boolean;
}

interface BenefitPackageItem {
  parentBenefit?: string;
  parentBenefitCode?: string;
  code?: string;
  name?: string;
  [key: string]: unknown;
}

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

function isNoCoverageError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.response?.status !== 400) return false;
  const data = err.response?.data as { message?: string; detail?: string } | undefined;
  const text = `${data?.message ?? ''} ${data?.detail ?? ''}`.toLowerCase();
  return text.includes('no result found');
}

function toCrId(value: string): string {
  if (!value) return value;
  if (value.startsWith('SHA-')) return `CR${value.slice(4)}`;
  return value;
}

function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) {
      const results = obj.results as unknown[];
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
  return getField(item, 'parentBenefit', 'parent_benefit', 'name') || getBenefitCode(item) || 'Unknown';
}

function isIPIntervention(item: InterventionItem): boolean {
  const ap = getField(item as Record<string, unknown>, 'accessPoint', 'access_point');
  if (!ap) return false;
  const lower = ap.toLowerCase();
  return lower.includes('ip') || lower === 'inpatient';
}

// ============================================================================
// Main Component
// ============================================================================

export function SHACoveragePanel({
  crNumber,
  patientPk,
  shaMemberId,
  compact = false,
  className,
  inpatientOnly = true,
}: SHACoveragePanelProps) {
  const lookupId = toCrId(crNumber);

  const [benefits, setBenefits] = useState<BenefitPackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBenefits = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const resp = await shaApi.ilmBenefits({
        patient_id: lookupId,
        is_unique_benefit: true,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      });
      setBenefits(extractItems<BenefitPackageItem>(resp.data));
    } catch (err) {
      if (isNoCoverageError(err)) {
        setBenefits([]);
      } else {
        setFetchError(err instanceof Error ? err.message : 'Failed to load benefits');
      }
    } finally {
      setLoading(false);
    }
  }, [lookupId, patientPk, shaMemberId]);

  useEffect(() => {
    if (lookupId) fetchBenefits();
  }, [lookupId, fetchBenefits]);

  const noCoverage = !loading && benefits.length === 0 && !fetchError;

  if (loading) {
    return <CoverageSkeleton compact={compact} className={className} />;
  }

  if (fetchError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{fetchError}</AlertDescription>
      </Alert>
    );
  }

  if (noCoverage) {
    return null;
  }

  const content = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            SHA Benefits & Utilization ({benefits.length} package{benefits.length !== 1 ? 's' : ''})
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchBenefits()}
          disabled={loading}
          className="h-7 w-7 p-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="space-y-1.5">
        {benefits.map((benefit, idx) => (
          <BenefitCoverageRow
            key={getBenefitCode(benefit) || idx}
            benefit={benefit}
            crNumber={lookupId}
            patientPk={patientPk}
            shaMemberId={shaMemberId}
            inpatientOnly={inpatientOnly}
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
      <CardContent className="py-4">{content}</CardContent>
    </Card>
  );
}

// ============================================================================
// Benefit Row — expandable, fetches sub-benefits → interventions → utilization
// ============================================================================

function BenefitCoverageRow({
  benefit,
  crNumber,
  patientPk,
  shaMemberId,
  inpatientOnly,
}: {
  benefit: BenefitPackageItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
  inpatientOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getBenefitCode(benefit);
  const name = getBenefitName(benefit);

  // Manual fetch for sub-benefits
  const [subBenefits, setSubBenefits] = useState<SubBenefitItem[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !crNumber || !code) return;
    let cancelled = false;
    setSubLoading(true);
    shaApi
      .ilmSubBenefits({
        patient_id: crNumber,
        parent_benefit_code: code,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      })
      .then((resp) => {
        if (!cancelled) setSubBenefits(extractItems<SubBenefitItem>(resp.data));
      })
      .catch(() => {
        if (!cancelled) setSubBenefits([]);
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => { cancelled = true; };
  }, [expanded, crNumber, code, patientPk, shaMemberId]);

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
        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{name}</span>
        {code && (
          <Badge variant="outline" size="sm" className="font-mono shrink-0">
            {code}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/50">
          {subLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading sub-benefits...
            </div>
          ) : subBenefits.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No sub-benefits available.
            </p>
          ) : (
            <div className="space-y-1.5">
              {subBenefits.map((sub, idx) => (
                <SubBenefitCoverageRow
                  key={sub.code || idx}
                  subBenefit={sub}
                  crNumber={crNumber}
                  patientPk={patientPk}
                  shaMemberId={shaMemberId}
                  inpatientOnly={inpatientOnly}
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
// Sub-Benefit Row — expandable, fetches interventions + utilization
// ============================================================================

function SubBenefitCoverageRow({
  subBenefit,
  crNumber,
  patientPk,
  shaMemberId,
  inpatientOnly,
}: {
  subBenefit: SubBenefitItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
  inpatientOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const code = getField(subBenefit as Record<string, unknown>, 'code', 'benefit_code', 'benefitCode');
  const name = getField(subBenefit as Record<string, unknown>, 'name', 'benefit_name', 'benefitName') || code || 'Unknown';

  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [utilizations, setUtilizations] = useState<Map<string, ParsedUtilizationEntry[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !crNumber || !code) return;
    let cancelled = false;
    setLoading(true);

    shaApi.ilmBenefitInterventions({
      patient_id: crNumber,
      sub_benefit_code: code,
      patient_pk: patientPk,
      sha_member_id: shaMemberId,
    })
      .then(async (resp) => {
        if (cancelled) return;
        const items = extractItems<InterventionItem>(resp.data).filter((i) => {
          const item = i as Record<string, unknown>;
          const hasCode = !!getField(item, 'code', 'intervention_code', 'interventionCode');
          const hasName = !!getField(item, 'name', 'intervention_name', 'interventionName');
          return hasCode || hasName;
        });

        const filtered = inpatientOnly ? items.filter(isIPIntervention) : items;
        setInterventions(filtered);

        // Fetch utilization for each intervention (sequential to respect rate limits)
        const utilMap = new Map<string, ParsedUtilizationEntry[]>();
        for (const intervention of filtered) {
          if (cancelled) break;
          const iCode = getField(intervention as Record<string, unknown>, 'code', 'intervention_code', 'interventionCode');
          if (!iCode) continue;
          try {
            const utilResp = await shaApi.ilmUtilization({
              patient_id: crNumber,
              intervention_code: iCode,
              patient_pk: patientPk,
              sha_member_id: shaMemberId,
            });
            const entries = parseUtilization(utilResp);
            if (entries.length > 0) {
              utilMap.set(iCode, entries);
            }
          } catch {
            // Best effort — don't block on utilization errors
          }
        }
        if (!cancelled) setUtilizations(utilMap);
      })
      .catch(() => {
        if (!cancelled) setInterventions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [expanded, crNumber, code, patientPk, shaMemberId, inpatientOnly]);

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
          {loading ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading interventions & utilization...
            </div>
          ) : interventions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No inpatient interventions available.
            </p>
          ) : (
            <div className="space-y-1">
              {interventions.map((intervention, idx) => {
                const iCode = getField(intervention as Record<string, unknown>, 'code', 'intervention_code', 'interventionCode');
                const utilEntries = iCode ? utilizations.get(iCode) : undefined;
                return (
                  <InterventionCoverageRow
                    key={iCode || idx}
                    intervention={intervention}
                    utilization={utilEntries}
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
// Intervention Row with inline utilization
// ============================================================================

function InterventionCoverageRow({
  intervention,
  utilization,
}: {
  intervention: InterventionItem;
  utilization?: ParsedUtilizationEntry[];
}) {
  const item = intervention as Record<string, unknown>;
  const code = getField(item, 'code', 'intervention_code', 'interventionCode', 'benefitCode');
  const name = getField(
    item,
    'name',
    'intervention_name',
    'interventionName',
    'benefit_name',
    'benefitName',
    'description',
    'display_name',
  ) || code || 'Unknown';
  const tariff = (item.overallTariff ?? item.overall_tariff) as number | undefined;
  const needsPreauth = (item.needsPreauth ?? item.needs_preauth) as boolean | undefined;

  const hasUtil = utilization && utilization.length > 0;
  const util = hasUtil ? utilization[0] : null;

  return (
    <div className="rounded px-2 py-1.5 hover:bg-muted/20 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 font-medium">{name}</span>
        {code && (
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{code}</span>
        )}
        {needsPreauth && (
          <Badge variant="outline" size="sm" className="text-[10px] h-4 shrink-0 border-amber-400 text-amber-600 dark:text-amber-400">
            Preauth
          </Badge>
        )}
        {tariff != null && tariff > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
            KES {tariff.toLocaleString()}
          </span>
        )}
      </div>

      {/* Inline utilization */}
      {util && (
        <div className="ml-5 flex items-center gap-3 text-[10px] text-muted-foreground">
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
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function CoverageSkeleton({ compact, className }: { compact?: boolean; className?: string }) {
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

  if (compact) return <div className={className}>{content}</div>;
  return (
    <Card className={className}>
      <CardContent className="py-4">{content}</CardContent>
    </Card>
  );
}

export default SHACoveragePanel;
