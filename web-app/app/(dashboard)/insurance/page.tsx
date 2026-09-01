'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileText, ShieldCheck, ArrowRight, TrendingUp, Wallet } from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SHAVerificationModal } from '@/components/billing/sha';
import { SHAClaimsPanel } from '@/components/insurance/SHAClaimsPanel';
import { useFacility } from '@/lib/context/facility-context';
import {
  useInsuranceProviders,
  useInsuranceClaims,
  useInsurancePreauths,
  useHealthcloudSyncStatus,
  useVisitAuthorizations,
} from '@/lib/hooks/use-insurance';

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  isLoading?: boolean;
  href?: string;
}) {
  const router = useRouter();
  return (
    <Card
      className={`relative overflow-hidden ${href ? 'cursor-pointer transition-colors hover:bg-accent/50' : ''}`}
      onClick={href ? () => router.push(href) : undefined}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-7 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-bold">{value}</p>
            )}
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

type SyncDrilldownTarget = {
  kind: 'sync' | 'remittance';
  filter: string;
  title: string;
};

export default function InsurancePage() {
  const router = useRouter();
  const { facility } = useFacility();
  const [drilldownTarget, setDrilldownTarget] = React.useState<SyncDrilldownTarget | null>(null);

  const { data: providersData, isLoading: providersLoading } = useInsuranceProviders({ page: 1 });
  const { data: claimsData, isLoading: claimsLoading } = useInsuranceClaims({ page: 1 });
  const { data: preauthsData, isLoading: preauthsLoading } = useInsurancePreauths({ page: 1 });
  const { data: authorizationsData, isLoading: authorizationsLoading } = useVisitAuthorizations({
    page: 1,
    page_size: 200,
  });
  const { data: syncStatus, isLoading: syncLoading } = useHealthcloudSyncStatus({
    enabled: !!facility?.id,
    includeFailures: true,
    includeSyncItems: true,
    includeRemittanceItems: true,
    limit: 30,
  });

  const syncItems = React.useMemo(() => syncStatus?.sync_items || [], [syncStatus?.sync_items]);
  const remittanceItems = React.useMemo(
    () => syncStatus?.remittance_items || [],
    [syncStatus?.remittance_items]
  );
  const failureBuckets = syncStatus?.failure_buckets || [];

  const filteredSyncItems = React.useMemo(() => {
    if (!drilldownTarget || drilldownTarget.kind !== 'sync') return [];
    if (drilldownTarget.filter === 'all') return syncItems;
    return syncItems.filter((item) => item.status === drilldownTarget.filter);
  }, [drilldownTarget, syncItems]);

  const filteredRemittanceItems = React.useMemo(() => {
    if (!drilldownTarget || drilldownTarget.kind !== 'remittance') return [];
    if (drilldownTarget.filter === 'all') return remittanceItems;
    return remittanceItems.filter((item) => item.status === drilldownTarget.filter);
  }, [drilldownTarget, remittanceItems]);

  const openSyncDrilldown = (filter: string, title: string) => {
    setDrilldownTarget({ kind: 'sync', filter, title });
  };

  const openRemittanceDrilldown = (filter: string, title: string) => {
    setDrilldownTarget({ kind: 'remittance', filter, title });
  };

  const totalProviders = providersData?.count ?? 0;
  const totalClaims = claimsData?.count ?? 0;
  const totalPreauths = preauthsData?.count ?? 0;

  const pendingClaims =
    claimsData?.results?.filter((c) =>
      ['submitted', 'acknowledged', 'under_review', 'query'].includes(c.status)
    ).length ?? 0;

  const sessions = authorizationsData?.results ?? [];
  const sessionSteps = {
    started: sessions.filter((session) => session.workflow_step === 'eligibility_verified').length,
    otpRequested: sessions.filter((session) => session.workflow_step === 'otp_requested').length,
    visitAuthorized: sessions.filter((session) => session.workflow_step === 'visit_authorized')
      .length,
    tokenValidated: sessions.filter(
      (session) => session.workflow_step === 'authorization_validated'
    ).length,
  };
  const sessionConversion =
    sessionSteps.started > 0
      ? Math.round((sessionSteps.tokenValidated / sessionSteps.started) * 100)
      : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Insurance"
        helpContent="Manage insurance providers, claims, pre-authorizations, and SHA verification workflows."
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Providers"
          value={totalProviders}
          isLoading={providersLoading}
          href="/insurance/providers"
        />
        <StatCard
          icon={FileText}
          label="Total Claims"
          value={totalClaims}
          isLoading={claimsLoading}
          href="/insurance/claims"
        />
        <StatCard
          icon={TrendingUp}
          label="Pending"
          value={pendingClaims}
          isLoading={claimsLoading}
          href="/insurance/claims"
        />
        <StatCard
          icon={ShieldCheck}
          label="Pre-auths"
          value={totalPreauths}
          isLoading={preauthsLoading}
          href="/insurance/preauths"
        />
      </div>

      {/* Tabs: Private / SHA */}
      <Tabs defaultValue="private" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="private" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="sm:hidden">Private</span>
            <span className="hidden sm:inline">Private Insurance</span>
          </TabsTrigger>
          <TabsTrigger value="sha" className="gap-2">
            <SHALogo size="xs" />
            SHA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="private" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">HealthCloud Sync Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {syncLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : syncStatus ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openSyncDrilldown('all', 'Sync Total')}
                    >
                      <Badge variant="secondary" className="hover:bg-secondary/80">
                        Sync Total: {syncStatus.sync.total}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openSyncDrilldown('success', 'Sync Success')}
                    >
                      <Badge variant="outline" className="hover:bg-accent">
                        Success: {syncStatus.sync.success}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openSyncDrilldown('pending', 'Sync Pending')}
                    >
                      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                        Pending: {syncStatus.sync.pending}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openSyncDrilldown('failed', 'Sync Failed')}
                    >
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-200">
                        Failed: {syncStatus.sync.failed}
                      </Badge>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click any pill to drill into records behind the metric.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openRemittanceDrilldown('all', 'Remittances Total')}
                    >
                      <Badge variant="secondary" className="hover:bg-secondary/80">
                        Remittances: {syncStatus.remittances.total}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openRemittanceDrilldown('received', 'Remittances Received')}
                    >
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                        Received: {syncStatus.remittances.received}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openRemittanceDrilldown('partial', 'Remittances Partial')}
                    >
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                        Partial: {syncStatus.remittances.partial}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        openRemittanceDrilldown('reconciled', 'Remittances Reconciled')
                      }
                    >
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                        Reconciled: {syncStatus.remittances.reconciled}
                      </Badge>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => openRemittanceDrilldown('disputed', 'Remittances Disputed')}
                    >
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-200">
                        Disputed: {syncStatus.remittances.disputed}
                      </Badge>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No sync metrics available yet.</p>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={!!drilldownTarget}
            onOpenChange={(open) => !open && setDrilldownTarget(null)}
          >
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{drilldownTarget?.title || 'HealthCloud Drilldown'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {drilldownTarget?.kind === 'sync' && failureBuckets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {failureBuckets.map((bucket) => (
                      <Badge key={bucket.code} variant="outline">
                        {bucket.label}: {bucket.count}
                      </Badge>
                    ))}
                  </div>
                )}

                {drilldownTarget?.kind === 'sync' &&
                  (filteredSyncItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No sync records found for this pill.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {filteredSyncItems.map((item) => (
                        <div key={item.id} className="space-y-2 rounded-lg border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-slate-100 text-slate-800">{item.operation}</Badge>
                            <Badge variant="outline">Status: {item.status}</Badge>
                            <Badge variant="secondary">Attempts: {item.attempt_count}</Badge>
                            {item.status === 'failed' && (
                              <Badge className="bg-red-100 text-red-800">{item.bucket.label}</Badge>
                            )}
                          </div>
                          {item.status === 'failed' && (
                            <p className="text-sm text-muted-foreground">{item.error}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Claim: {item.claim_number || item.claim_id || 'N/A'}</span>
                            <span>Sync ID: {item.id}</span>
                            <span>Updated: {formatDateTime(item.updated_at)}</span>
                            {item.correlation_id && <span>Correlation: {item.correlation_id}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                {drilldownTarget?.kind === 'remittance' &&
                  (filteredRemittanceItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No remittance records found for this pill.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {filteredRemittanceItems.map((item) => (
                        <div key={item.id} className="space-y-2 rounded-lg border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800">
                              {item.remittance_number}
                            </Badge>
                            <Badge variant="outline">{item.provider_name}</Badge>
                            <Badge variant="secondary">Status: {item.status}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Total: KES {Number(item.total_amount).toLocaleString()}</span>
                            <span>
                              Reconciled: KES {Number(item.reconciled_amount).toLocaleString()}
                            </span>
                            <span>Date: {item.remittance_date}</span>
                            <span>Updated: {formatDateTime(item.updated_at)}</span>
                            {item.payment_reference && (
                              <span>Payment Ref: {item.payment_reference}</span>
                            )}
                            {item.bank_reference && <span>Bank Ref: {item.bank_reference}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                {drilldownTarget?.kind !== 'sync' && drilldownTarget?.kind !== 'remittance' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select a drilldown pill to view details.
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">HealthCloud Session Funnel</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/insurance/authorizations')}
              >
                Open Queue
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {authorizationsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <div className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">1. Eligibility</p>
                      <p className="font-semibold">{sessionSteps.started}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">2. OTP</p>
                      <p className="font-semibold">{sessionSteps.otpRequested}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">3. Visit</p>
                      <p className="font-semibold">{sessionSteps.visitAuthorized}</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">4. Validated</p>
                      <p className="font-semibold">{sessionSteps.tokenValidated}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Conversion: {sessionConversion}%</Badge>
                    <Badge variant="outline">Total Sessions: {sessions.length}</Badge>
                    <Badge className="bg-yellow-100 text-yellow-800">
                      Needs Action:{' '}
                      {Math.max(
                        sessionSteps.started +
                          sessionSteps.otpRequested -
                          sessionSteps.tokenValidated,
                        0
                      )}
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/providers')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Providers</p>
                    <p className="text-xs text-muted-foreground">Manage providers & plans</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/claims')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Claims</p>
                    <p className="text-xs text-muted-foreground">Submit & track claims</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/preauths')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Pre-authorizations</p>
                      <TooltipProvider delayDuration={250}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700"
                            >
                              HealthCloud pending
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            Not available for HealthCloud yet.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-xs text-muted-foreground">Request & approve</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/enrollments')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Enrollments</p>
                    <p className="text-xs text-muted-foreground">Create & verify membership</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/provider-configs')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Provider Configs</p>
                    <p className="text-xs text-muted-foreground">Facility API setup</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/authorizations')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Authorizations</p>
                    <p className="text-xs text-muted-foreground">Validate visit tokens</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/remittances')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Remittances</p>
                    <p className="text-xs text-muted-foreground">Create & reconcile batches</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/reservations')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Reservations</p>
                    <p className="text-xs text-muted-foreground">Reserve balances for claims</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => router.push('/insurance/tariffs')}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Tariffs</p>
                    <p className="text-xs text-muted-foreground">Payer code mapping</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Recent Claims */}
          {claimsData?.results && claimsData.results.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent Claims</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/insurance/claims')}
                  className="gap-1"
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {claimsData.results.slice(0, 5).map((claim) => (
                    <div
                      key={claim.id}
                      className="flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-accent/50"
                      onClick={() => router.push(`/insurance/claims/${claim.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{claim.claim_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {claim.patient_name} • {claim.provider_name}
                        </p>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium">
                          KES {Number(claim.total_amount).toLocaleString()}
                        </span>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {claim.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sha" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SHA Verification</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Verify SHA eligibility and coverage before billing.
              </p>
              <SHAVerificationModal
                trigger={
                  <Button>
                    <SHALogo size="sm" className="mr-2" />
                    Verify Member
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <SHAClaimsPanel basePath="/transactions/sha-claims" showHeader={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
