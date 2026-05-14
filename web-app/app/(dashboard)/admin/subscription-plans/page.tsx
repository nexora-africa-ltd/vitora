/**
 * Subscription Plans List Page
 * Admin management of subscription tiers and their limits.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, CreditCard, Building2, Users, Check, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import { Card, CardContent } from '@/components/ui/card';
import type { SubscriptionPlanListItem, TierCode } from '@/lib/types/subscription';

const tierColors: Record<TierCode, string> = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  BASIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  PROFESSIONAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  ENTERPRISE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (num === 0) return 'Free';
  return `KES ${num.toLocaleString()}`;
}

function formatLimit(value: number | null): string {
  return value === null ? 'Unlimited' : value.toLocaleString();
}

export default function SubscriptionPlansPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { isSuperuser } = usePermissions();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['subscription-plans', search],
    queryFn: () => subscriptionPlansApi.list(search ? { search } : undefined),
  });

  const plans = data?.results ?? [];
  const totalPlans = data?.count ?? 0;
  const activePlans = plans.filter((p) => p.is_active).length;

  if (!isSuperuser) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">Only Nexora superusers can manage subscription plans.</CardContent></Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Subscription Plans"
          helpContent="Manage subscription tiers with pricing, facility/user/patient limits, and feature flags. Plans are linked to organizations to enforce limits."
          actions={
            <Button asChild size="sm">
              <Link href="/admin/subscription-plans/new">
                <Plus className="h-4 w-4 mr-1" />
                New Plan
              </Link>
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AdminStatCard
            title="Total Plans"
            value={isLoading ? '...' : totalPlans}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <AdminStatCard
            title="Active"
            value={isLoading ? '...' : activePlans}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <AdminStatCard
            title="Inactive"
            value={isLoading ? '...' : totalPlans - activePlans}
            icon={<CreditCard className="h-4 w-4" />}
          />
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search plans..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <ResponsiveTable
            data={plans}
            keyExtractor={(plan) => plan.id}
            onRowClick={(plan) => router.push(`/admin/subscription-plans/${plan.id}`)}
            defaultSortColumn="sort_order"
            defaultSortDirection="asc"
            columns={[
              {
                key: 'name',
                header: 'Plan',
                sortable: true,
                cell: (plan) => (
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <Badge className={`${tierColors[plan.code]} mt-0.5`}>
                      {plan.code}
                    </Badge>
                  </div>
                ),
              },
              {
                key: 'monthly_price',
                header: 'Monthly',
                sortable: true,
                sortType: 'number',
                cell: (plan) => (
                  <span className="text-sm">{formatPrice(plan.monthly_price)}</span>
                ),
              },
              {
                key: 'annual_price',
                header: 'Annual',
                sortable: true,
                sortType: 'number',
                cell: (plan) => (
                  <span className="text-sm">{formatPrice(plan.annual_price)}</span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'max_facilities',
                header: 'Facilities',
                sortable: true,
                sortType: 'number',
                cell: (plan) => (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatLimit(plan.max_facilities)}
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'max_users',
                header: 'Users',
                sortable: true,
                sortType: 'number',
                cell: (plan) => (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatLimit(plan.max_users)}
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'is_active',
                header: 'Status',
                sortable: true,
                cell: (plan) => (
                  <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
              {
                key: 'has_trial',
                header: 'Trial',
                cell: (plan) =>
                  plan.has_trial ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  ),
                hideOnMobile: true,
              },
            ]}
            mobileCard={(plan: SubscriptionPlanListItem) => (
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(plan.monthly_price)}/mo · {formatLimit(plan.max_facilities)} facilities
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={tierColors[plan.code]}>{plan.code}</Badge>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
