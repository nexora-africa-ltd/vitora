/**
 * SHA Claim Detail Page
 *
 * Refactored to a tabbed workspace with a sticky summary bar, a single
 * next-step banner, and conditionally-rendered workflow panels. See
 * `useClaimNextStep` + `ClaimSummaryBar` + the three tab components.
 */
'use client';

import React, { useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Copy, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { getApiErrorMessage } from '@/lib/api/client';
import { shaApi } from '@/lib/api/sha';

import { useClaim, useResubmitClaim } from '@/lib/hooks/use-sha';
import { useClaimFlow } from '@/lib/hooks/use-claim-flow';
import { useClaimNextStep } from '@/lib/hooks/use-claim-next-step';
import { useToast } from '@/lib/hooks/use-toast';

import { ClaimSummaryBar } from '@/components/billing/sha/ClaimSummaryBar';
import { ClaimNextStepBanner } from '@/components/billing/sha/ClaimNextStepBanner';
import { ClaimOverviewTab } from '@/components/billing/sha/ClaimOverviewTab';
import { ClaimWorkflowTab } from '@/components/billing/sha/ClaimWorkflowTab';
import { ClaimAdjudicationTab } from '@/components/billing/sha/ClaimAdjudicationTab';
import { InterventionsList } from '@/components/billing/sha/InterventionsList';
import {
  claimStatusNeedsAdjudicationAttention,
  getEffectiveClaimStatus,
} from '@/lib/sha/payer-preview';

type TabId = 'overview' | 'workflow' | 'interventions' | 'adjudication';

interface ClaimInterventionRow {
  id: number;
  intervention_code: string;
  intervention_name: string;
  benefit_code: string;
  status: 'active' | 'retired';
  preview_missing_streak?: number;
  last_seen_in_preview_at?: string | null;
  auto_retired_by_omission?: boolean;
  required_document_types: string[];
  dha_intervention_id?: string;
  tariff_amount?: string | null;
  payment_mechanism?: string;
  access_point?: 'IP' | 'OP' | 'BOTH' | string;
  needs_preauth?: boolean;
  fund?: string;
  intervention_fund?: string;
  supported_scheme?: string;
  schemes?: string[];
  is_per_diem?: boolean;
  preauth_exists?: boolean;
  preauth_status?: string;
  preauth_approved?: boolean;
  level2_tariff?: string | null;
  level3_tariff?: string | null;
  level4_tariff?: string | null;
  level5_tariff?: string | null;
  level6_tariff?: string | null;
}

function toInterventionStatus(value: unknown): 'active' | 'retired' {
  let normalized = '';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    normalized = String(
      row.workflow_state
      || row.workflowState
      || row.status
      || row.intervention_status
      || '',
    )
      .trim()
      .toLowerCase();
  } else {
    normalized = String(value || '').trim().toLowerCase();
  }
  if (!normalized) return 'active';
  if (normalized === 'active') return 'active';
  if (
    normalized.includes('retir')
    || normalized.includes('inactiv')
    || normalized.includes('cancel')
    || normalized.includes('delet')
    || normalized.includes('void')
    || normalized.includes('remov')
    || normalized.includes('close')
    || normalized.includes('suspend')
    || normalized.includes('terminate')
  ) {
    return 'retired';
  }
  return 'active';
}

function mapPreviewInterventions(
  payload: unknown,
  fallbackRows: ClaimInterventionRow[],
): ClaimInterventionRow[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const interventions = (payload as { interventions?: unknown }).interventions;
  if (!Array.isArray(interventions)) return null;

  const byCode = new Map(
    fallbackRows.map((row) => [String(row.intervention_code || '').trim().toUpperCase(), row]),
  );

  const mapped = interventions
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const interventionCode = String(row.intervention_code || '').trim();
      if (!interventionCode) return null;
      const key = interventionCode.toUpperCase();
      const existing = byCode.get(key);
      const status = toInterventionStatus(row);
      const rawAccessPoint = String(row.access_point || row.intervention_access_point || '')
        .trim()
        .toUpperCase();
      const accessPoint =
        rawAccessPoint === 'IP' || rawAccessPoint === 'OP' || rawAccessPoint === 'BOTH'
          ? rawAccessPoint
          : existing?.access_point;

      return {
        ...(existing || {
          id: -(index + 1),
          intervention_code: interventionCode,
          intervention_name: interventionCode,
          benefit_code: interventionCode.split('-').slice(0, 2).join('-') || 'UNKNOWN',
          required_document_types: [],
        }),
        intervention_code: interventionCode,
        intervention_name: String(
          row.intervention_name || row.name || row.intervention_description || existing?.intervention_name || interventionCode,
        ).trim(),
        status,
        dha_intervention_id: String(row.intervention_id || row.dha_intervention_id || existing?.dha_intervention_id || '').trim() || undefined,
        payment_mechanism: String(
          row.intervention_payment_mechanism || row.payment_mechanism || existing?.payment_mechanism || '',
        ).trim() || undefined,
        access_point: accessPoint,
        is_per_diem:
          row.is_per_diem === true
          || row.is_per_diem === 'true'
          || String(row.intervention_payment_mechanism || row.payment_mechanism || '').toUpperCase().includes('PER DIEM')
          || existing?.is_per_diem,
      };
    })
    .filter((row): row is ClaimInterventionRow => !!row);

  const mappedCodes = new Set(mapped.map((row) => row.intervention_code.toUpperCase()));
  const omittedLocalRows = fallbackRows.filter(
    (row) => !mappedCodes.has(String(row.intervention_code || '').trim().toUpperCase()),
  );

  return [...mapped, ...omittedLocalRows];
}

function extractShaInlineError(error: unknown): string {
  const baseMessage = getApiErrorMessage(error);
  const start = baseMessage.indexOf('{');
  if (start >= 0) {
    try {
      const parsed = JSON.parse(baseMessage.slice(start)) as Record<string, unknown>;
      const ediError = parsed['EDI ERROR'] as Record<string, unknown> | undefined;
      const combo = ediError?.['Intervention Combination'];
      if (typeof combo === 'string' && combo.trim()) {
        return combo;
      }
    } catch {
      // no-op; fall back to base message
    }
  }
  return baseMessage;
}

function ClaimDetailSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ClaimDetailPage() {
  const router = useRouter();
  const params = useParams();
  const claimId = Number(params.id);
  const { toast } = useToast();
  const { refresh: pageRefresh, isRefreshing } = usePageRefresh();

  const { data: claim, isLoading, refetch, isRefetching } = useClaim(claimId);
  const resubmitMutation = useResubmitClaim();

  const flow = useClaimFlow(claim);
  const nextStep = useClaimNextStep(claim ?? null, flow ?? null);

  const [activeTab, setActiveTab] = React.useState<TabId>('overview');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [payerNeedsAttention, setPayerNeedsAttention] = React.useState(false);
  const [syncingFromDha, setSyncingFromDha] = React.useState(false);
  const [interventionSyncSummary, setInterventionSyncSummary] = React.useState<string>('');
  const [previewInterventions, setPreviewInterventions] = React.useState<ClaimInterventionRow[] | null>(null);
  const [previewInterventionsSyncedAt, setPreviewInterventionsSyncedAt] = React.useState<Date | null>(null);

  const effectiveStatus = claim ? getEffectiveClaimStatus(claim) : null;
  const adjudicationNeedsAttention =
    (effectiveStatus ? claimStatusNeedsAdjudicationAttention(effectiveStatus) : false)
    || payerNeedsAttention;

  useEffect(() => {
    setPayerNeedsAttention(false);
  }, [claim?.id]);

  useEffect(() => {
    setPreviewInterventions(null);
    setPreviewInterventionsSyncedAt(null);
  }, [claim?.id]);

  const handleCopyActionError = useCallback(async () => {
    if (!actionError) return;
    try {
      await navigator.clipboard.writeText(actionError);
      toast({ title: 'Copied', description: 'Error details copied to clipboard.' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy error details. Please copy manually.',
        variant: 'destructive',
      });
    }
  }, [actionError, toast]);

  // Sync URL hash with active tab so direct links (and the next-step CTA) work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'workflow', 'interventions', 'adjudication'].includes(hash)) {
      setActiveTab(hash as TabId);
    }
  }, []);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabId);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${value}`);
    }
  }, []);

  const handleResubmit = useCallback(async () => {
    setActionError(null);
    try {
      const isQueuedRetry = claim?.status === 'pending_submission';
      const result = await resubmitMutation.mutateAsync(claimId);
      const statusValue = String(result?.status || '').toLowerCase();
      if (statusValue === 'draft' || statusValue === 'validated' || statusValue === 'failed') {
        throw new Error(result?.message || 'Claim retry failed.');
      }
      toast({
        title:
          result?.status === 'queued'
            ? isQueuedRetry
              ? 'Retry queued'
              : 'Resubmission queued'
            : isQueuedRetry
              ? 'Retry submitted'
              : 'Resubmitted',
        description:
          result?.status === 'queued'
            ? result?.message || 'Queued for submission when online.'
            : isQueuedRetry
              ? 'Queued claim submitted to SHA.'
              : 'Claim resubmitted to SHA.',
      });
      refetch();
    } catch (e) {
      const errorMessage = extractShaInlineError(e);
      setActionError(errorMessage);
      toast({
        title: claim?.status === 'pending_submission' ? 'Retry failed' : 'Resubmit failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [claim?.status, claimId, resubmitMutation, refetch, toast]);

  const handleFetchInterventionsFromDha = useCallback(async () => {
    setSyncingFromDha(true);
    try {
      const result = await shaApi.ilmPreview(claimId);
      const mapped = mapPreviewInterventions(result.payload, (claim?.claim_interventions ?? []) as ClaimInterventionRow[]);
      if (mapped) {
        setPreviewInterventions(mapped);
        setPreviewInterventionsSyncedAt(new Date());
      }
      const summary = result.reconciliation_summary;
      if (summary?.reconciled) {
        const created = summary.created ?? 0;
        const updated = summary.updated ?? 0;
        const restored = summary.restored ?? 0;
        const retired = summary.retired ?? 0;
        setInterventionSyncSummary(
          `DHA sync complete: +${created} created, ${updated} updated, ${restored} restored, ${retired} retired.`,
        );
      } else {
        setInterventionSyncSummary('DHA preview succeeded, but intervention reconciliation was skipped.');
      }
      await refetch();
      toast({
        title: 'Fetched from DHA',
        description: 'Interventions refreshed from latest DHA preview.',
      });
    } catch (e) {
      const message = extractShaInlineError(e);
      setInterventionSyncSummary('');
      toast({
        title: 'Fetch from DHA failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSyncingFromDha(false);
    }
  }, [claim?.claim_interventions, claimId, refetch, toast]);

  const isMutating = resubmitMutation.isPending;

  // ---- Loading / not-found states ----
  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Loading claim..." />
        <ClaimDetailSkeleton />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Claim not found"
          actions={
            <Button variant="outline" onClick={() => router.push('/transactions/sha-claims')}>
              All claims
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertTitle>Not found</AlertTitle>
          <AlertDescription>
            The requested claim could not be found, or you don&apos;t have permission to view it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const canResubmit = claim.status === 'rejected' || claim.status === 'pending_submission';
  const interventionsForTab = (previewInterventions ?? claim.claim_interventions ?? []) as ClaimInterventionRow[];
  const activeInterventionCount = interventionsForTab.filter((i) => i.status === 'active').length;

  // ---- Render ----
  return (
    <PullToRefresh onRefresh={pageRefresh} isRefreshing={isRefreshing || isRefetching}>
      <div className="space-y-4 sm:space-y-6 pb-20 lg:pb-0">
        <PageHeader
          title={`Claim ${claim.claim_number || `#${claim.id}`}`}
          helpContent="Review and manage this SHA claim. Use the tabs to switch between overview, DHA workflow steps, interventions, and adjudication."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                {isRefetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              {canResubmit && (
                <Button size="sm" onClick={handleResubmit} disabled={isMutating}>
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  {claim.status === 'pending_submission' ? 'Retry now' : 'Resubmit'}
                </Button>
              )}
            </>
          }
        />

        {/* Sticky summary bar — always visible while scrolling */}
        <ClaimSummaryBar claim={claim} />

        {/* Single next-step banner replaces the rejection / missing-docs / consent alerts */}
        <ClaimNextStepBanner
          step={nextStep}
          showCta={false}
          isBusy={isMutating}
        />

        {actionError && (
          <Alert variant="destructive">
            <AlertTitle>SHA action failed</AlertTitle>
            <AlertDescription className="flex items-start justify-between gap-3">
              <span className="flex-1">{actionError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyActionError}
                className="h-6 px-2 text-[11px]"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Tabbed workspace */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-4">
            <TabsTrigger value="overview" className="w-full">Overview</TabsTrigger>
            <TabsTrigger value="workflow" className="w-full">Workflow</TabsTrigger>
            <TabsTrigger value="interventions" className="w-full">
              Interventions
              {interventionsForTab.length ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({activeInterventionCount})
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="adjudication" className="w-full">
              Adjudication
              {adjudicationNeedsAttention ? (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-amber-500" aria-label="Adjudication needs attention" />
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 sm:mt-6">
            <ClaimOverviewTab claim={claim} />
          </TabsContent>

          <TabsContent value="workflow" className="mt-4 sm:mt-6">
            <ClaimWorkflowTab
              claim={claim}
              flow={flow}
              isActive={activeTab === 'workflow'}
              onChange={refetch}
            />
          </TabsContent>

          <TabsContent value="interventions" className="mt-4 sm:mt-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Refresh this tab from DHA preview to reconcile local intervention rows with ILM source-of-truth.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFetchInterventionsFromDha}
                  disabled={syncingFromDha || isRefetching}
                >
                  {syncingFromDha ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Fetch from DHA
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Source: {previewInterventions ? 'DHA preview' : 'local fallback'} • Last synced from DHA:{' '}
                {previewInterventionsSyncedAt ? previewInterventionsSyncedAt.toLocaleTimeString() : 'Not yet synced'}
              </p>
              {interventionSyncSummary ? (
                <Alert>
                  <AlertTitle>Intervention reconciliation</AlertTitle>
                  <AlertDescription>{interventionSyncSummary}</AlertDescription>
                </Alert>
              ) : null}
              {interventionsForTab.length > 0 ? (
                <InterventionsList
                  claimId={claim.id}
                  interventions={interventionsForTab}
                  facilityLevel={
                    claim.facility_level
                      ? parseInt(claim.facility_level.replace('L', ''), 10)
                      : undefined
                  }
                  onChange={() => {
                    void handleFetchInterventionsFromDha();
                  }}
                />
              ) : (
                <Alert>
                  <AlertTitle>No interventions yet</AlertTitle>
                  <AlertDescription>
                    Add the first intervention from the{' '}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => handleTabChange('workflow')}
                    >
                      Workflow tab
                    </button>
                    .
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          <TabsContent value="adjudication" className="mt-4 sm:mt-6">
            <ClaimAdjudicationTab
              claim={claim}
              isActive={activeTab === 'adjudication'}
              onNavigateToTab={handleTabChange}
              onAttentionChange={setPayerNeedsAttention}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
