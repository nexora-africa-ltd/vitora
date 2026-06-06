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
import { Loader2, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

import { useClaim, useSubmitClaim, useResubmitClaim } from '@/lib/hooks/use-sha';
import { useClaimFlow } from '@/lib/hooks/use-claim-flow';
import { useClaimNextStep, type ClaimNextStep } from '@/lib/hooks/use-claim-next-step';
import { useToast } from '@/lib/hooks/use-toast';

import { ClaimSummaryBar } from '@/components/billing/sha/ClaimSummaryBar';
import { ClaimNextStepBanner } from '@/components/billing/sha/ClaimNextStepBanner';
import { ClaimOverviewTab } from '@/components/billing/sha/ClaimOverviewTab';
import { ClaimWorkflowTab } from '@/components/billing/sha/ClaimWorkflowTab';
import { ClaimAdjudicationTab } from '@/components/billing/sha/ClaimAdjudicationTab';
import { InterventionsList } from '@/components/billing/sha/InterventionsList';

type TabId = 'overview' | 'workflow' | 'interventions' | 'adjudication';

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
  const submitMutation = useSubmitClaim();
  const resubmitMutation = useResubmitClaim();

  const flow = useClaimFlow(claim);
  const nextStep = useClaimNextStep(claim ?? null, flow ?? null);

  const [activeTab, setActiveTab] = React.useState<TabId>('overview');

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

  const handleSubmit = useCallback(async () => {
    try {
      await submitMutation.mutateAsync(claimId);
      toast({ title: 'Claim submitted', description: 'Sent to SHA for processing.' });
      refetch();
    } catch (e) {
      toast({
        title: 'Submission failed',
        description: e instanceof Error ? e.message : 'Could not submit claim.',
        variant: 'destructive',
      });
    }
  }, [claimId, submitMutation, refetch, toast]);

  const handleResubmit = useCallback(async () => {
    try {
      await resubmitMutation.mutateAsync(claimId);
      toast({ title: 'Resubmitted', description: 'Claim resubmitted to SHA.' });
      refetch();
    } catch (e) {
      toast({
        title: 'Resubmit failed',
        description: e instanceof Error ? e.message : 'Could not resubmit claim.',
        variant: 'destructive',
      });
    }
  }, [claimId, resubmitMutation, refetch, toast]);

  const handleNextStepCta = useCallback(
    (step: ClaimNextStep) => {
      if (step.action === 'submit') {
        handleSubmit();
        return;
      }
      if (step.action === 'resubmit') {
        handleResubmit();
        return;
      }
      if (step.targetTab) {
        handleTabChange(step.targetTab);
      }
    },
    [handleSubmit, handleResubmit, handleTabChange],
  );

  const isMutating = submitMutation.isPending || resubmitMutation.isPending;

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

  const canSubmit = claim.status === 'draft' && nextStep.action === 'submit';
  const canResubmit = claim.status === 'rejected';

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
              {canSubmit && (
                <Button size="sm" onClick={handleSubmit} disabled={isMutating}>
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit to SHA
                </Button>
              )}
              {canResubmit && (
                <Button size="sm" onClick={handleResubmit} disabled={isMutating}>
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Resubmit
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
          onCtaClick={handleNextStepCta}
          isBusy={isMutating}
        />

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
            <TabsTrigger value="adjudication">Adjudication</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 sm:mt-6">
            <ClaimOverviewTab claim={claim} />
          </TabsContent>

          <TabsContent value="workflow" className="mt-4 sm:mt-6">
            <ClaimWorkflowTab claim={claim} flow={flow} onChange={refetch} />
          </TabsContent>

          <TabsContent value="interventions" className="mt-4 sm:mt-6">
            <div className="space-y-4">
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
            <ClaimAdjudicationTab claim={claim} />
          </TabsContent>
        </Tabs>

        {/* Mobile sticky action bar — only when there's an actionable next step */}
        {nextStep.ctaLabel && !nextStep.blocked && (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur p-3 lg:hidden">
            <Button
              className="w-full"
              size="lg"
              variant={nextStep.severity === 'destructive' ? 'destructive' : 'default'}
              onClick={() => handleNextStepCta(nextStep)}
              disabled={isMutating}
            >
              {isMutating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {nextStep.ctaLabel}
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
