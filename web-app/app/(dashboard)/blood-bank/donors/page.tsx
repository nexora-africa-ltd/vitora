'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBloodDonors } from '@/lib/hooks/use-blood-bank';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { BloodDonorListItem } from '@/lib/types/blood-bank';

export default function BloodDonorsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [bloodGroupFilter, setBloodGroupFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useBloodDonors({
    search: debouncedSearch || undefined,
    blood_group: bloodGroupFilter || undefined,
    ordering: '-created_at',
  });

  const columns = [
    {
      key: 'donor_number',
      header: 'Donor #',
      sortable: true,
      cell: (item: BloodDonorListItem) => (
        <span className="font-mono text-sm">{item.donor_number}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortFn: (a: BloodDonorListItem, b: BloodDonorListItem) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
      cell: (item: BloodDonorListItem) => (
        <p className="font-medium">{item.first_name} {item.last_name}</p>
      ),
    },
    {
      key: 'blood_group',
      header: 'Blood Group',
      sortable: true,
      cell: (item: BloodDonorListItem) => (
        <Badge variant="outline" className="font-bold">{item.blood_group}</Badge>
      ),
    },
    {
      key: 'total_donations',
      header: 'Donations',
      sortable: true,
      sortType: 'number' as const,
      hideOnMobile: true,
      cell: (item: BloodDonorListItem) => item.total_donations,
    },
    {
      key: 'eligible_to_donate',
      header: 'Eligible',
      sortable: true,
      cell: (item: BloodDonorListItem) => (
        <Badge className={item.eligible_to_donate
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
        }>
          {item.eligible_to_donate ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      hideOnMobile: true,
      cell: (item: BloodDonorListItem) => (
        <Badge variant={item.is_active ? 'default' : 'secondary'}>
          {item.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Blood Donors"
          helpContent="Register and manage blood donors. Track eligibility based on donation intervals."
          actions={
            <Button onClick={() => router.push('/blood-bank/donors/new')}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Register Donor</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search donors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={bloodGroupFilter} onValueChange={setBloodGroupFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Blood Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Groups</SelectItem>
              <SelectItem value="A+">A+</SelectItem>
              <SelectItem value="A-">A-</SelectItem>
              <SelectItem value="B+">B+</SelectItem>
              <SelectItem value="B-">B-</SelectItem>
              <SelectItem value="AB+">AB+</SelectItem>
              <SelectItem value="AB-">AB-</SelectItem>
              <SelectItem value="O+">O+</SelectItem>
              <SelectItem value="O-">O-</SelectItem>
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
            onRowClick={(item) => router.push(`/blood-bank/donors/${item.id}`)}
            defaultSortColumn="donor_number"
            defaultSortDirection="desc"
            emptyMessage="No donors registered yet."
          />
        )}
      </div>
    </PullToRefresh>
  );
}
