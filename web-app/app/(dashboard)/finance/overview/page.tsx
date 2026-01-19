'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Construction,
  CreditCard,
  Shield,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClaims } from '@/lib/hooks/use-sha';

export default function FinanceOverviewPage() {
  // Claims belong under Finance/Insurance (not Billing)
  const { data: claimsData, isLoading: claimsLoading } = useClaims({});

  const claims = claimsData?.results || [];
  const pendingClaims = claims.filter(c => c.status === 'draft' || c.status === 'pending').length;
  const submittedClaims = claims.filter(c => c.status === 'submitted').length;
  const approvedClaims = claims.filter(c => c.status === 'approved' || c.status === 'paid').length;
  const rejectedClaims = claims.filter(c => c.status === 'rejected').length;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Finance Overview"
        description="Transactions, insurance, and claims at a glance"
      />

      <Card variant="primary">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <p className="text-lg font-semibold">SHA Claims Overview</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transactions/sha-claims" className="gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Social Health Authority insurance claims status
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold">{claimsLoading ? '-' : pendingClaims}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <AlertCircle className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{claimsLoading ? '-' : submittedClaims}</p>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{claimsLoading ? '-' : approvedClaims}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{claimsLoading ? '-' : rejectedClaims}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button asChild variant="outline">
              <Link href="/insurance">Go to Insurance</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/transactions">Go to Transactions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card variant="dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Finance overview dashboards (receivables, collections, claims status, and payer mix)
            will be implemented incrementally.
          </p>
          <Badge variant="secondary" className="mt-4">
            <BarChart3 className="h-3 w-3 mr-1" />
            Placeholder (Overview)
          </Badge>
        </CardContent>
      </Card>

      <Card variant="muted">
        <CardContent className="py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Accounts KPIs</p>
                <p className="text-sm text-muted-foreground">
                  Invoices, receipts, outstanding balances, and collections.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Claims KPIs</p>
                <p className="text-sm text-muted-foreground">
                  SHA claim statuses, approvals, rejections, and turnaround time.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
