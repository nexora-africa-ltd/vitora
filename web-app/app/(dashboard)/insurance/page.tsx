'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  FileText,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SHAVerificationModal } from '@/components/billing/sha';
import { SHAClaimsPanel } from '@/components/insurance/SHAClaimsPanel';
import {
  useInsuranceProviders,
  useInsuranceClaims,
  useInsurancePreauths,
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
      className={`relative overflow-hidden ${href ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}
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
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
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

export default function InsurancePage() {
  const router = useRouter();

  const { data: providersData, isLoading: providersLoading } = useInsuranceProviders({ page: 1 });
  const { data: claimsData, isLoading: claimsLoading } = useInsuranceClaims({ page: 1 });
  const { data: preauthsData, isLoading: preauthsLoading } = useInsurancePreauths({ page: 1 });

  const totalProviders = providersData?.count ?? 0;
  const totalClaims = claimsData?.count ?? 0;
  const totalPreauths = preauthsData?.count ?? 0;

  const pendingClaims = claimsData?.results?.filter(
    (c) => ['submitted', 'acknowledged', 'under_review', 'query'].includes(c.status)
  ).length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Insurance"
        helpContent="Manage insurance providers, claims, pre-authorizations, and SHA verification workflows."
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

        <TabsContent value="private" className="space-y-4 mt-4">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => router.push('/insurance/providers')}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Providers</p>
                    <p className="text-xs text-muted-foreground">Manage providers & plans</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => router.push('/insurance/claims')}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Claims</p>
                    <p className="text-xs text-muted-foreground">Submit & track claims</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => router.push('/insurance/preauths')}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Pre-authorizations</p>
                    <p className="text-xs text-muted-foreground">Request & approve</p>
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
                <Button variant="ghost" size="sm" onClick={() => router.push('/insurance/claims')} className="gap-1">
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {claimsData.results.slice(0, 5).map((claim) => (
                    <div
                      key={claim.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/insurance/claims/${claim.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{claim.claim_number}</p>
                        <p className="text-xs text-muted-foreground truncate">{claim.patient_name} • {claim.provider_name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-sm font-medium">KES {Number(claim.total_amount).toLocaleString()}</span>
                        <Badge variant="secondary" className="text-xs capitalize">{claim.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sha" className="space-y-4 mt-4">
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
