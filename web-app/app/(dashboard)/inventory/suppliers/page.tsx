'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { inventoryApi } from '@/lib/api/inventory';
import type { Supplier, SupplierType } from '@/lib/types/inventory';

const supplierTypeLabels: Record<SupplierType, string> = {
  MANUFACTURER: 'Manufacturer',
  DISTRIBUTOR: 'Distributor',
  WHOLESALER: 'Wholesaler',
  GOVERNMENT: 'Government',
};

const supplierTypeColors: Record<SupplierType, string> = {
  MANUFACTURER: 'bg-blue-100 text-blue-700',
  DISTRIBUTOR: 'bg-purple-100 text-purple-700',
  WHOLESALER: 'bg-amber-100 text-amber-700',
  GOVERNMENT: 'bg-green-100 text-green-700',
};

export default function SuppliersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-suppliers', page, debouncedSearch, typeFilter, activeFilter],
    queryFn: () =>
      inventoryApi.listSuppliers({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        supplier_type: typeFilter !== 'all' ? (typeFilter as SupplierType) : undefined,
        is_active: activeFilter !== 'all' ? activeFilter === 'true' : undefined,
      }),
  });

  const suppliers = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Suppliers"
          helpContent="Manage vendor and supplier relationships. Suppliers are shared across all facilities in your organization."
          actions={
            <Button onClick={() => router.push('/inventory/suppliers/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Supplier
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{totalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold text-green-600">{suppliers.filter(s => s.is_active).length}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Inactive</p>
              <p className="text-xl font-bold text-slate-500">{suppliers.filter(s => !s.is_active).length}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Avg Rating</p>
              <p className="text-xl font-bold flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                {suppliers.length > 0 ? (suppliers.reduce((s, sup) => s + Number(sup.rating), 0) / suppliers.length).toFixed(1) : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:w-64"
          />
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(supplierTypeLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable<Supplier>
          data={suppliers}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No suppliers found."
          onRowClick={(s) => router.push(`/inventory/suppliers/${s.id}`)}
          defaultSortColumn="name"
          defaultSortDirection="asc"
          columns={[
            {
              key: 'code',
              header: 'Code',
              sortable: true,
              cell: (s) => <span className="font-mono text-sm">{s.code}</span>,
            },
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (s) => <span className="font-medium">{s.name}</span>,
            },
            {
              key: 'supplier_type',
              header: 'Type',
              sortable: true,
              cell: (s) => (
                <Badge className={`${supplierTypeColors[s.supplier_type]} shrink-0 w-fit`}>
                  {supplierTypeLabels[s.supplier_type]}
                </Badge>
              ),
            },
            {
              key: 'contact_person',
              header: 'Contact',
              hideOnMobile: true,
              cell: (s) => s.contact_person || '—',
            },
            {
              key: 'rating',
              header: 'Rating',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (s) => (
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  {Number(s.rating).toFixed(1)}
                </span>
              ),
            },
            {
              key: 'is_active',
              header: 'Status',
              sortable: true,
              cell: (s) => (
                <Badge className={`shrink-0 w-fit ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
          ]}
          mobileCard={(s) => (
            <div className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.code} · {supplierTypeLabels[s.supplier_type]}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-0.5 text-sm">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  {Number(s.rating).toFixed(1)}
                </span>
                <Badge className={`${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} shrink-0 w-fit`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {totalPages} ({totalCount} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
