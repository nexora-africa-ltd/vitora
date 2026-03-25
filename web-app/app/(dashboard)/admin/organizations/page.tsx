/**
 * Organizations List Page
 * Multitenancy Phase 4: Organization management (superuser only)
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Users, Search, MapPin } from 'lucide-react';
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
import { organizationsApi } from '@/lib/api/organizations';
import type { OrganizationListItem, SubscriptionTier } from '@/lib/types/organization';

const tierColors: Record<SubscriptionTier, string> = {
  free: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  basic: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  professional: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

export default function OrganizationsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['organizations', search],
    queryFn: () => organizationsApi.list(search ? { search } : undefined),
  });

  const organizations = data?.results ?? [];
  const totalOrgs = data?.count ?? 0;
  const activeOrgs = organizations.filter((o) => o.is_active).length;
  const totalFacilities = organizations.reduce((sum, o) => sum + o.facility_count, 0);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Organizations"
          helpContent="Manage healthcare organizations and their facility branches. Each organization groups multiple facilities under a single entity."
          actions={
            <Button asChild size="sm">
              <Link href="/admin/organizations/new">
                <Plus className="h-4 w-4 mr-1" />
                New Organization
              </Link>
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AdminStatCard
            title="Organizations"
            value={isLoading ? '...' : totalOrgs}
            icon={<Building2 className="h-4 w-4" />}
          />
          <AdminStatCard
            title="Active"
            value={isLoading ? '...' : activeOrgs}
            icon={<Building2 className="h-4 w-4" />}
          />
          <AdminStatCard
            title="Total Facilities"
            value={isLoading ? '...' : totalFacilities}
            icon={<MapPin className="h-4 w-4" />}
          />
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search organizations..."
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
            data={organizations}
            keyExtractor={(org) => org.id}
            onRowClick={(org) => router.push(`/admin/organizations/${org.id}`)}
            columns={[
              {
                key: 'name',
                header: 'Organization',
                sortable: true,
                cell: (org) => (
                  <div>
                    <p className="font-medium">{org.name}</p>
                    {org.county_name && (
                      <p className="text-xs text-muted-foreground">{org.county_name}</p>
                    )}
                  </div>
                ),
              },
              {
                key: 'subscription_tier',
                header: 'Tier',
                sortable: true,
                cell: (org) => (
                  <Badge className={tierColors[org.subscription_tier]}>
                    {org.subscription_tier}
                  </Badge>
                ),
              },
              {
                key: 'facility_count',
                header: 'Facilities',
                sortable: true,
                sortType: 'number',
                cell: (org) => (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {org.facility_count}
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'staff_count',
                header: 'Staff',
                sortable: true,
                sortType: 'number',
                cell: (org) => (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {org.staff_count}
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'is_active',
                header: 'Status',
                sortable: true,
                cell: (org) => (
                  <Badge variant={org.is_active ? 'default' : 'secondary'}>
                    {org.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
            ]}
            mobileCard={(org: OrganizationListItem) => (
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {org.facility_count} facilities · {org.staff_count} staff
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={tierColors[org.subscription_tier]}>
                    {org.subscription_tier}
                  </Badge>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
