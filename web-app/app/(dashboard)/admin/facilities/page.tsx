'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Hospital, Search, MapPin, ShieldCheck, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { facilitiesApi } from '@/lib/api/facilities';
import type { FacilityListItem } from '@/lib/types/facility';

const levelLabels: Record<string, string> = {
  '1': 'Level 1',
  '2': 'Level 2',
  '3': 'Level 3',
  '4': 'Level 4',
  '5': 'Level 5',
  '6': 'Level 6',
};

export default function FacilitiesPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { isSuperuser } = usePermissions();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['facilities', search],
    queryFn: () => facilitiesApi.list(search ? { search } : undefined),
  });

  const facilities = data?.results ?? [];
  const totalFacilities = data?.count ?? 0;
  const activeFacilities = facilities.filter((f) => f.is_active).length;
  const shaContracted = facilities.filter((f) => f.sha_contracted).length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Facilities"
          helpContent="Manage healthcare facilities. Each facility has an MFL code, level, and can be linked to an organization."
          actions={
            isSuperuser ? (
              <Button asChild size="sm">
                <Link href="/admin/facilities/new">
                  <Plus className="h-4 w-4 mr-1" />
                  New Facility
                </Link>
              </Button>
            ) : undefined
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <AdminStatCard
            title="Total Facilities"
            value={isLoading ? '...' : totalFacilities}
            icon={<Hospital className="h-4 w-4" />}
          />
          <AdminStatCard
            title="Active"
            value={isLoading ? '...' : activeFacilities}
            icon={<Hospital className="h-4 w-4" />}
          />
          <AdminStatCard
            title="SHA Contracted"
            value={isLoading ? '...' : shaContracted}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name or MFL code..."
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
            data={facilities}
            keyExtractor={(f) => f.id}
            onRowClick={(f) => router.push(`/admin/facilities/${f.id}`)}
            columns={[
              {
                key: 'name',
                header: 'Facility',
                sortable: true,
                cell: (f) => (
                  <p className="font-medium">{f.name}</p>
                ),
              },
              {
                key: 'mfl_code',
                header: 'MFL Code',
                sortable: true,
                cell: (f) => (
                  <span className="font-mono text-xs">{f.mfl_code}</span>
                ),
              },
              {
                key: 'level',
                header: 'Level',
                sortable: true,
                cell: (f) => (
                  <Badge variant="outline">
                    {levelLabels[f.level] ?? f.level}
                  </Badge>
                ),
              },
              {
                key: 'organization_name',
                header: 'Organization',
                sortable: true,
                cell: (f) => (
                  <span className="text-sm">
                    {f.organization_name ?? <span className="text-muted-foreground">—</span>}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'county_name',
                header: 'Location',
                sortable: true,
                cell: (f) => (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{f.county_name}</span>
                  </div>
                ),
                hideOnMobile: true,
              },
              {
                key: 'sha_contracted',
                header: 'SHA',
                sortable: true,
                cell: (f) =>
                  f.sha_contracted ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      Contracted
                    </Badge>
                  ) : (
                    <Badge variant="secondary">No</Badge>
                  ),
                hideOnMobile: true,
              },
              {
                key: 'is_active',
                header: 'Status',
                sortable: true,
                cell: (f) => (
                  <Badge variant={f.is_active ? 'default' : 'secondary'}>
                    {f.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
            ]}
            mobileCard={(f: FacilityListItem) => (
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.mfl_code} · {levelLabels[f.level] ?? f.level} · {f.county_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={f.is_active ? 'default' : 'secondary'}>
                    {f.is_active ? 'Active' : 'Inactive'}
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
