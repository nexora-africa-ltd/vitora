'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { StoreLocation, StoreLocationType } from '@/lib/types/inventory';

const locationTypeLabels: Record<StoreLocationType, string> = {
  MAIN_STORE: 'Main Store',
  SATELLITE_PHARMACY: 'Satellite Pharmacy',
  WARD_STORE: 'Ward Store',
  THEATRE_STORE: 'Theatre Store',
  LAB_STORE: 'Lab Store',
};

const locationTypeColors: Record<StoreLocationType, string> = {
  MAIN_STORE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  SATELLITE_PHARMACY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  WARD_STORE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  THEATRE_STORE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  LAB_STORE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

export default function StoreLocationsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [locationType, setLocationType] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-store-locations', page, debouncedSearch, locationType, activeFilter],
    queryFn: () =>
      inventoryApi.listStoreLocations({
        page,
        page_size: 20,
        search: debouncedSearch || undefined,
        location_type: locationType !== 'all' ? (locationType as StoreLocationType) : undefined,
        is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
      }),
  });

  const locations = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const activeCount = locations.filter((l) => l.is_active).length;
  const inactiveCount = locations.filter((l) => !l.is_active).length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Store Locations"
          helpContent="Manage storage locations for inventory — main stores, satellite pharmacies, ward stores, theatre stores, and lab stores."
          actions={
            <Button onClick={() => router.push('/inventory/store-locations/new')}>
              <Warehouse className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Locations', value: totalCount },
            { label: 'Active', value: activeCount },
            { label: 'Inactive', value: inactiveCount },
          ].map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search locations..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="sm:w-56"
          />
          <Select
            value={locationType}
            onValueChange={(v) => {
              setLocationType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(locationTypeLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeFilter}
            onValueChange={(v) => {
              setActiveFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveTable<StoreLocation>
            data={locations}
            keyExtractor={(loc) => loc.id}
            onRowClick={(loc) => router.push(`/inventory/store-locations/${loc.id}`)}
            defaultSortColumn="name"
            defaultSortDirection="asc"
            columns={[
              {
                key: 'code',
                header: 'Code',
                sortable: true,
                cell: (loc) => <span className="font-medium">{loc.code}</span>,
              },
              {
                key: 'name',
                header: 'Name',
                sortable: true,
                cell: (loc) => loc.name,
              },
              {
                key: 'location_type',
                header: 'Type',
                sortable: true,
                cell: (loc) => (
                  <Badge variant="outline" className={locationTypeColors[loc.location_type]}>
                    {locationTypeLabels[loc.location_type]}
                  </Badge>
                ),
              },
              {
                key: 'managed_by_name',
                header: 'Manager',
                sortable: true,
                hideOnMobile: true,
                cell: (loc) => loc.managed_by_name || '—',
              },
              {
                key: 'is_active',
                header: 'Status',
                sortable: true,
                sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
                cell: (loc) => (
                  <Badge variant={loc.is_active ? 'default' : 'secondary'}>
                    {loc.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
            ]}
            mobileCard={(loc) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{loc.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{loc.code}</p>
                  {loc.managed_by_name && (
                    <p className="text-xs text-muted-foreground">Manager: {loc.managed_by_name}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={locationTypeColors[loc.location_type]}>
                    {locationTypeLabels[loc.location_type]}
                  </Badge>
                  <Badge variant={loc.is_active ? 'default' : 'secondary'} className="w-fit">
                    {loc.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} locations)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
