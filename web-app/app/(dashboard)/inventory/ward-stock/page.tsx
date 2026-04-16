'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { WardStock } from '@/lib/types/inventory';

export default function WardStockPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [storeFilter, setStoreFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-ward-stock', page, storeFilter],
    queryFn: () =>
      inventoryApi.listWardStock({
        page,
        page_size: 20,
        store_location: storeFilter !== 'all' ? Number(storeFilter) : undefined,
      }),
  });

  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });

  const items = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const belowParCount = items.filter((i) => i.is_below_par).length;
  const aboveMaxCount = items.filter((i) => i.is_above_max).length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Ward Stock"
          helpContent="Monitor stock levels at ward stores. Items below par level need replenishment. Use consume, replenish, and return actions from the detail page."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Items', value: totalCount },
            {
              label: 'Below Par Level',
              value: belowParCount,
              alert: belowParCount > 0,
            },
            {
              label: 'Above Max Level',
              value: aboveMaxCount,
              alert: aboveMaxCount > 0,
            },
          ].map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p
                  className={`text-lg sm:text-2xl font-bold ${
                    stat.alert ? 'text-destructive' : ''
                  }`}
                >
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={storeFilter}
            onValueChange={(v) => {
              setStoreFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="All Store Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Store Locations</SelectItem>
              {(storesData?.results || []).map((store) => (
                <SelectItem key={store.id} value={String(store.id)}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveTable<WardStock>
            data={items}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/inventory/ward-stock/${item.id}`)}
            defaultSortColumn="drug_name"
            defaultSortDirection="asc"
            columns={[
              {
                key: 'drug_name',
                header: 'Drug',
                sortable: true,
                cell: (item) => <span className="font-medium">{item.drug_name}</span>,
              },
              {
                key: 'store_location_name',
                header: 'Store',
                sortable: true,
                cell: (item) => item.store_location_name,
              },
              {
                key: 'quantity_available',
                header: 'Qty Available',
                sortable: true,
                sortType: 'number',
                cell: (item) => (
                  <span
                    className={
                      item.is_below_par
                        ? 'text-destructive font-semibold'
                        : item.is_above_max
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : ''
                    }
                  >
                    {item.quantity_available}
                  </span>
                ),
              },
              {
                key: 'par_level',
                header: 'Par Level',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (item) => item.par_level,
              },
              {
                key: 'max_level',
                header: 'Max Level',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (item) => item.max_level,
              },
              {
                key: 'status',
                header: 'Status',
                sortFn: (a, b) => Number(a.is_below_par) - Number(b.is_below_par),
                sortable: true,
                cell: (item) =>
                  item.is_below_par ? (
                    <Badge
                      variant="outline"
                      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Below Par
                    </Badge>
                  ) : item.is_above_max ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    >
                      Above Max
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    >
                      OK
                    </Badge>
                  ),
              },
            ]}
            mobileCard={(item) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{item.drug_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.store_location_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Qty: {item.quantity_available} · Par: {item.par_level} · Max: {item.max_level}
                  </p>
                </div>
                <div className="shrink-0">
                  {item.is_below_par ? (
                    <Badge
                      variant="outline"
                      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 w-fit"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Below Par
                    </Badge>
                  ) : item.is_above_max ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-fit"
                    >
                      Above Max
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 w-fit"
                    >
                      OK
                    </Badge>
                  )}
                </div>
              </div>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} items)
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
