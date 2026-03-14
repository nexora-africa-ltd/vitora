/**
 * Departments List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Users, Search, Filter, Network, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useDepartments } from '@/lib/hooks/use-rbac';
import type { Department, DepartmentType } from '@/lib/types/rbac';

const DEPARTMENT_TYPES: { value: DepartmentType; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'LABORATORY', label: 'Laboratory' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'RECORDS', label: 'Medical Records' },
];

function getDepartmentTypeBadgeVariant(type: DepartmentType) {
  switch (type) {
    case 'CLINICAL':
      return 'default';
    case 'ADMINISTRATIVE':
      return 'default';
    case 'SUPPORT':
      return 'destructive';
    case 'LABORATORY':
    case 'PHARMACY':
    case 'RADIOLOGY':
    case 'RECORDS':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function DepartmentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DepartmentType | 'all'>('all');
  const { refresh, isRefreshing } = usePageRefresh();

  const { data, isLoading, error, refetch } = useDepartments({
    search: search || undefined,
    department_type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  const departments = data?.results ?? [];
  const activeCount = departments.filter((dept) => dept.is_active).length;
  const topLevelCount = departments.filter((dept) => !dept.parent).length;
  const totalStaff = departments.reduce((sum, dept) => sum + dept.staff_count, 0);

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Departments"
          helpContent="Manage organizational departments, reporting structure, and leadership assignments."
          actions={
            <Button asChild>
              <Link href="/admin/departments/new">
                <Plus className="mr-2 h-4 w-4" />
                New Department
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">Departments could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Refresh the page or inspect the backend response, then try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Departments"
          helpContent="Manage organizational departments, reporting structure, and leadership assignments."
          actions={
            <Button asChild>
              <Link href="/admin/departments/new">
                <Plus className="mr-2 h-4 w-4" />
                New Department
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Visible Departments"
            value={data?.count ?? 0}
            description="Current results after filters"
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Active"
            value={activeCount}
            description="Open for assignment"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Top-Level"
            value={topLevelCount}
            description="No parent department"
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Staff Assigned"
            value={totalStaff}
            description="Across visible departments"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoComplete="off"
                  className="pl-9"
                  name="department-search"
                  placeholder="Search by department name or code…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as DepartmentType | 'all')}
              >
                <SelectTrigger aria-label="Filter departments by type">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {DEPARTMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Department Directory
              <Badge variant="secondary" className="ml-1">
                {data?.count ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={departments}
                emptyMessage="No departments match the current filters."
                keyExtractor={(dept) => dept.id}
                onRowClick={(dept) => router.push(`/admin/departments/${dept.id}`)}
                mobileCard={(dept) => <DepartmentMobileCard dept={dept} />}
                columns={[
                  {
                    key: 'name',
                    header: 'Department',
                    sortable: true,
                    sortFn: (a, b) => a.name.localeCompare(b.name),
                    cell: (dept) => (
                      <div className="min-w-0">
                        <p className="font-medium truncate">{dept.name}</p>
                        <p className="font-mono text-sm text-muted-foreground truncate">{dept.code}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    sortable: true,
                    sortFn: (a, b) => (a.department_type_display || '').localeCompare(b.department_type_display || ''),
                    cell: (dept) => (
                      <Badge variant={getDepartmentTypeBadgeVariant(dept.department_type)}>
                        {dept.department_type_display}
                      </Badge>
                    ),
                  },
                  {
                    key: 'head',
                    header: 'Head',
                    hideOnMobile: true,
                    sortable: true,
                    sortFn: (a, b) => (a.head_name || '').localeCompare(b.head_name || ''),
                    cell: (dept) => dept.head_name || 'Not assigned',
                  },
                  {
                    key: 'staff',
                    header: 'Staff',
                    hideOnMobile: true,
                    sortable: true,
                    sortType: 'number',
                    sortFn: (a, b) => (a.staff_count ?? 0) - (b.staff_count ?? 0),
                    cell: (dept) => `${dept.staff_count} assigned`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    cell: (dept) => (
                      <Badge variant={dept.is_active ? 'default' : 'secondary'}>
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-[90px] text-right',
                    cell: (dept) => (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/departments/${dept.id}`}>Open</Link>
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function DepartmentMobileCard({ dept }: { dept: Department }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium truncate">{dept.name}</p>
          <p className="font-mono text-sm text-muted-foreground truncate">{dept.code}</p>
        </div>
        <Badge variant={dept.is_active ? 'default' : 'secondary'}>
          {dept.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={getDepartmentTypeBadgeVariant(dept.department_type)}>
          {dept.department_type_display}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>Head: {dept.head_name || 'Not assigned'}</p>
        <p>{dept.staff_count} staff assigned</p>
      </div>
    </Card>
  );
}
