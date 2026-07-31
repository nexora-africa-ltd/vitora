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

  const effectiveStatus = claim ? getEffectiveClaimStatus(claim) : null;
  const adjudicationNeedsAttention =
    (effectiveStatus ? claimStatusNeedsAdjudicationAttention(effectiveStatus) : false)
    || payerNeedsAttention;

  useEffect(() => {
    setPayerNeedsAttention(false);
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
  }, [claimId, refetch, toast]);

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
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="interventions">
              Interventions
              {claim.claim_interventions?.length ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({claim.claim_interventions.filter((i) => i.status === 'active').length})
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="adjudication">
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
              {interventionSyncSummary ? (
                <Alert>
                  <AlertTitle>Intervention reconciliation</AlertTitle>
                  <AlertDescription>{interventionSyncSummary}</AlertDescription>
                </Alert>
              ) : null}
              {claim.claim_interventions && claim.claim_interventions.length > 0 ? (
                <InterventionsList
                  claimId={claim.id}
                  interventions={claim.claim_interventions}
                  facilityLevel={
                    claim.facility_level
                      ? parseInt(claim.facility_level.replace('L', ''), 10)
                      : undefined
                  }
                  onChange={() => refetch()}
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
