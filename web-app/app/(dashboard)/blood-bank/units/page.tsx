'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBloodUnits } from '@/lib/hooks/use-blood-bank';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { BloodUnitListItem } from '@/lib/types/blood-bank';
import { UNIT_STATUS_COLORS, COMPONENT_LABELS } from '@/lib/types/blood-bank';

export default function BloodUnitsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [componentFilter, setComponentFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useBloodUnits({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    component: componentFilter || undefined,
    ordering: '-collection_date',
  });

  const columns = [
    {
      key: 'unit_number',
      header: 'Unit #',
      sortable: true,
      cell: (item: BloodUnitListItem) => (
        <span className="font-mono text-sm">{item.unit_number}</span>
      ),
    },
    {
      key: 'blood_group',
      header: 'Group',
      sortable: true,
      cell: (item: BloodUnitListItem) => (
        <Badge variant="outline" className="font-bold">{item.blood_group}</Badge>
      ),
    },
    {
      key: 'component',
      header: 'Component',
      sortable: true,
      hideOnMobile: true,
      cell: (item: BloodUnitListItem) => COMPONENT_LABELS[item.component] || item.component,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: BloodUnitListItem) => (
        <Badge className={`${UNIT_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'expiry_date',
      header: 'Expires',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: BloodUnitListItem) => (
        <span className={item.is_expired ? 'text-destructive font-medium' : ''}>
          {formatDate(item.expiry_date)}
        </span>
      ),
    },
    {
      key: 'donor_name',
      header: 'Donor',
      hideOnMobile: true,
      cell: (item: BloodUnitListItem) => item.donor_name,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Blood Units"
          helpContent="Track blood unit inventory, screening status, and expiry. Units move through: Collected → Testing → Available → Issued."
          actions={
            <PermissionGate action="blood_bank.manage">
              <Button onClick={() => router.push('/blood-bank/units/new')}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Add Unit</span>
                <span className="sm:hidden">New</span>
              </Button>
            </PermissionGate>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search units..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="COLLECTED">Collected</SelectItem>
              <SelectItem value="TESTING">Testing</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="RESERVED">Reserved</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="QUARANTINED">Quarantined</SelectItem>
            </SelectContent>
          </Select>
          <Select value={componentFilter} onValueChange={setComponentFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Components" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Components</SelectItem>
              <SelectItem value="WHOLE_BLOOD">Whole Blood</SelectItem>
              <SelectItem value="PACKED_RBC">Packed RBC</SelectItem>
              <SelectItem value="PLATELETS">Platelets</SelectItem>
              <SelectItem value="FFP">FFP</SelectItem>
              <SelectItem value="CRYOPRECIPITATE">Cryoprecipitate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ResponsiveTable
            data={data?.results || []}
            columns={columns}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/blood-bank/units/${item.id}`)}
            defaultSortColumn="collection_date"
            defaultSortDirection="desc"
            emptyMessage="No blood units in inventory."
          />
        )}
      </div>
    </PullToRefresh>
  );
}
