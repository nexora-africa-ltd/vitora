/**
 * SHA Benefits & Interventions Panel
 *
 * Displays a patient's SHA benefit packages and covered interventions
 * fetched from the DHA ILM API. Shows structured data in collapsible
 * sections instead of raw JSON.
 *
 * Used on: Patient detail page (below EligibilityBanner), Lookup page
 */
'use client';

import React, { useState, useCallback } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useQuery } from '@tanstack/react-query';

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

interface BenefitItem {
  benefitCode?: string;
  benefitName?: string;
  benefit_code?: string;
  benefit_name?: string;
  status?: string;
  [key: string]: unknown;
}

interface SubBenefitItem {
  subBenefitCode?: string;
  subBenefitName?: string;
  sub_benefit_code?: string;
  sub_benefit_name?: string;
  [key: string]: unknown;
}

interface InterventionItem {
  interventionCode?: string;
  interventionName?: string;
  intervention_code?: string;
  intervention_name?: string;
  packageName?: string;
  package_name?: string;
  paymentMechanism?: string;
  payment_mechanism?: string;
  price?: number;
  [key: string]: unknown;
}

// ============================================================================
// Helper: Extract items from DHA response (can be nested in different ways)
// ============================================================================

function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // DHA responses sometimes wrap in { data: [...] } or { results: [...] }
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.benefits)) return obj.benefits as T[];
    if (Array.isArray(obj.subBenefits)) return obj.subBenefits as T[];
    if (Array.isArray(obj.interventions)) return obj.interventions as T[];
    // If it's a single object, wrap in array
    if (Object.keys(obj).length > 0 && !obj.error) return [obj as T];
  }
  return [];
}

function getBenefitCode(item: BenefitItem): string {
  return item.benefitCode || item.benefit_code || 'Unknown';
}

function getBenefitName(item: BenefitItem): string {
  return item.benefitName || item.benefit_name || getBenefitCode(item);
}

function getSubBenefitCode(item: SubBenefitItem): string {
  return item.subBenefitCode || item.sub_benefit_code || 'Unknown';
}

function getSubBenefitName(item: SubBenefitItem): string {
  return item.subBenefitName || item.sub_benefit_name || getSubBenefitCode(item);
}

function getInterventionCode(item: InterventionItem): string {
  return item.interventionCode || item.intervention_code || '';
}

function getInterventionName(item: InterventionItem): string {
  return item.interventionName || item.intervention_name || getInterventionCode(item) || 'Unknown Intervention';
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
  const {
    data: benefitsResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sha-benefits', crNumber, patientPk],
    queryFn: () =>
      shaApi.ilmBenefits({
        patient_id: crNumber,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: !!crNumber,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });

  const benefits = extractItems<BenefitItem>(benefitsResponse?.data);

  if (isLoading) {
    return <BenefitsSkeleton compact={compact} className={className} />;
  }

  if (isError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load benefits: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (benefits.length === 0) {
    return null; // Don't show empty panel
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
            crNumber={crNumber}
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
// Benefit Accordion (expandable to show interventions)
// ============================================================================

function BenefitAccordion({
  benefit,
  crNumber,
  patientPk,
  shaMemberId,
}: {
  benefit: BenefitItem;
  crNumber: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const code = getBenefitCode(benefit);
  const name = getBenefitName(benefit);
  const status = benefit.status;

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
        {code && code !== name && (
          <Badge variant="outline" size="sm" className="font-mono shrink-0">
            {code}
          </Badge>
        )}
        {status && (
          <Badge
            variant={status === 'ACTIVE' ? 'default' : 'secondary'}
            size="sm"
            className={cn(
              'shrink-0',
              status === 'ACTIVE' && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {status}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/50">
          <InterventionsList
            crNumber={crNumber}
            benefitCode={code}
            patientPk={patientPk}
            shaMemberId={shaMemberId}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Interventions List (fetched on expand)
// ============================================================================

function InterventionsList({
  crNumber,
  benefitCode,
  patientPk,
  shaMemberId,
}: {
  crNumber: string;
  benefitCode: string;
  patientPk?: number;
  shaMemberId?: number;
}) {
  // First fetch sub-benefits for this benefit code
  const {
    data: subBenefitsResponse,
    isLoading: subBenefitsLoading,
  } = useQuery({
    queryKey: ['sha-sub-benefits', crNumber, benefitCode, patientPk],
    queryFn: () =>
      shaApi.ilmSubBenefits({
        patient_id: crNumber,
        patient_pk: patientPk,
        sha_member_id: shaMemberId,
      }),
    enabled: !!crNumber,
    staleTime: 5 * 60 * 1000,
  });

  const subBenefits = extractItems<SubBenefitItem>(subBenefitsResponse?.data);

  if (subBenefitsLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading interventions...
      </div>
    );
  }

  if (subBenefits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        No sub-benefits found for this package.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {subBenefits.map((sub, idx) => (
        <SubBenefitSection
          key={getSubBenefitCode(sub) || idx}
          subBenefit={sub}
          crNumber={crNumber}
          patientPk={patientPk}
          shaMemberId={shaMemberId}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Sub-benefit Section (expandable to show specific interventions)
// ============================================================================

function SubBenefitSection({
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
  const code = getSubBenefitCode(subBenefit);
  const name = getSubBenefitName(subBenefit);

  const {
    data: interventionsResponse,
    isLoading,
  } = useQuery({
    queryKey: ['sha-interventions', crNumber, code, patientPk],
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

  const interventions = expanded ? extractItems<InterventionItem>(interventionsResponse?.data) : [];

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
              Loading...
            </div>
          ) : interventions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No interventions available.
            </p>
          ) : (
            <div className="space-y-1">
              {interventions.map((intervention, idx) => (
                <InterventionRow
                  key={getInterventionCode(intervention) || idx}
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
// Individual Intervention Row
// ============================================================================

function InterventionRow({ intervention }: { intervention: InterventionItem }) {
  const code = getInterventionCode(intervention);
  const name = getInterventionName(intervention);
  const packageName = intervention.packageName || intervention.package_name;
  const paymentMech = intervention.paymentMechanism || intervention.payment_mechanism;
  const price = intervention.price;

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/20 text-xs">
      <Activity className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="truncate flex-1">{name}</span>
      {code && (
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{code}</span>
      )}
      {paymentMech && (
        <Badge variant="outline" size="sm" className="text-[10px] h-4 shrink-0">
          {paymentMech}
        </Badge>
      )}
      {price != null && price > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
          KES {price.toLocaleString()}
        </span>
      )}
      {packageName && !name.includes(packageName) && (
        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
          ({packageName})
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
