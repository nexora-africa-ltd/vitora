'use client';

import Link from 'next/link';
import { Building2, Construction, CreditCard, ShieldCheck, ExternalLink, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClaims } from '@/lib/hooks/use-sha';
import { ClaimStatusBadge } from '@/components/billing/sha/ClaimComponents';
import { formatCurrency } from '@/lib/utils/format';
import { format, parseISO } from 'date-fns';
import type { Claim } from '@/lib/types/sha';

function RecentSHAClaims() {
  const claimsQuery = useClaims({ page_size: 5, ordering: '-created_at' });

  const claims = claimsQuery.data?.results ?? [];

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Recent SHA Claims</p>
            <p className="text-sm text-muted-foreground">
              Read-only view powered by the existing claims endpoint.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/billing/sha-claims" className="inline-flex items-center gap-2">
              View all
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {claimsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading claims…
            </div>
          )}

          {claimsQuery.isError && (
            <div className="text-sm text-muted-foreground">
              Unable to load claims right now.
            </div>
          )}

          {!claimsQuery.isLoading && !claimsQuery.isError && claims.length === 0 && (
            <div className="text-sm text-muted-foreground">No claims found.</div>
          )}

          {!claimsQuery.isLoading && !claimsQuery.isError && claims.length > 0 && (
            <div className="divide-y rounded-md border">
              {claims.map((claim: Claim) => (
                <div
                  key={claim.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/billing/sha-claims/${claim.id}`}
                        className="font-medium hover:underline"
                      >
                        {claim.claim_number || `Claim #${claim.id}`}
                      </Link>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {claim.patient_name ? claim.patient_name : 'Patient'}
                      {claim.invoice_number ? ` • Invoice ${claim.invoice_number}` : ''}
                      {claim.created_at ? ` • ${format(parseISO(claim.created_at), 'dd MMM yyyy')}` : ''}
                    </p>
                  </div>
                  <div className="text-sm font-medium">
                    {formatCurrency(parseFloat(claim.total_amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function InsurancePage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Insurance"
        description="Manage insurance verification and coverage workflows"
      />

      <Tabs defaultValue="sha" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="sha">SHA</TabsTrigger>
          <TabsTrigger value="other">Other Insurances</TabsTrigger>
        </TabsList>

        <TabsContent value="sha" className="space-y-4">
          <Card className="border-dashed border-2 border-muted-foreground/25">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Construction className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Partial Implementation</h2>
              <p className="text-muted-foreground max-w-md">
                SHA claims workflows currently live under Finance → Billing. This Insurance
                screen will expand to include verification, coverage checks, and policy tracking.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <Button asChild variant="outline">
                  <Link href="/billing">Go to Billing</Link>
                </Button>
                <Button asChild>
                  <Link href="/billing/sha-claims">Go to SHA Claims</Link>
                </Button>
              </div>
              <Badge variant="secondary" className="mt-4">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Placeholder (SHA)
              </Badge>
            </CardContent>
          </Card>

          <RecentSHAClaims />
        </TabsContent>

        <TabsContent value="other" className="space-y-4">
          <Card className="border-dashed border-2 border-muted-foreground/25">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Construction className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground max-w-md">
                Private insurance support (providers, policies, pre-auth, claims, and reconciliation)
                will be implemented in a future phase.
              </p>
              <Badge variant="secondary" className="mt-4">
                <Building2 className="h-3 w-3 mr-1" />
                Placeholder (Other Insurances)
              </Badge>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Planned Scope</p>
                  <p className="text-sm text-muted-foreground">
                    Provider registry, member/policy details, coverage rules, pre-authorization, and claims tracking.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
