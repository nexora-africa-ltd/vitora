/**
 * Roles List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Lists all roles with permissions, type badges, and staff counts.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Shield, Users, Settings, Search, KeyRound, BadgeCheck } from 'lucide-react';
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
import { useRoles } from '@/lib/hooks/use-rbac';
import type { Role, RoleCategory } from '@/lib/types/rbac';

const ROLE_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'CLINICAL', label: 'Clinical Staff' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'TECHNICAL', label: 'Technical Staff' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'COMMUNITY', label: 'Community Health' },
];

function getCategoryBadgeVariant(category: string) {
  switch (category) {
    case 'CLINICAL':
      return 'default';
    case 'TECHNICAL':
      return 'secondary';
    case 'ADMINISTRATIVE':
      return 'outline';
    case 'MANAGEMENT':
      return 'default';
    case 'COMMUNITY':
      return 'secondary';
    default:
      return 'secondary';
  }
}

const PAGE_SIZE = 20;

export default function RolesListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleType, setRoleType] = useState('all');
  const [page, setPage] = useState(1);
  const { refresh, isRefreshing } = usePageRefresh();

  const { data, isLoading, error, refetch } = useRoles({
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    category: (roleType !== 'all' ? roleType : undefined) as RoleCategory | undefined,
  });

  const roles = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;
  const activeCount = roles.filter((role) => role.is_active).length;
  const licenseRequiredCount = roles.filter((role) => role.requires_license).length;
  const managementCount = roles.filter((role) => role.category === 'MANAGEMENT').length;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Roles"
          helpContent="Manage role definitions and permission bundles for clinical, administrative, and technical staff."
          actions={
            <Button asChild>
              <Link href="/admin/roles/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Role
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">Roles could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check the RBAC endpoint response and try again.
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
          title="Roles"
          helpContent="Manage role definitions and permission bundles for clinical, administrative, and technical staff."
          actions={
            <Button asChild>
              <Link href="/admin/roles/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Role
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Visible Roles"
            value={data?.count ?? 0}
            description="Current results after filters"
            icon={<Settings className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Active"
            value={activeCount}
            description="Assignable to staff profiles"
            icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="License Required"
            value={licenseRequiredCount}
            description="Needs active professional registration"
            icon={<KeyRound className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Management"
            value={managementCount}
            description="Leadership and escalation roles"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search roles"
                  autoComplete="off"
                  className="pl-9"
                  name="role-search"
                  placeholder="Search by role name or code…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={roleType} onValueChange={(v) => { setRoleType(v); setPage(1); }}>
                <SelectTrigger aria-label="Filter by role category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
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
              <Shield className="h-5 w-5" />
              Role Directory
              <Badge variant="secondary" className="ml-1">
                {data?.count ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={roles}
                emptyMessage="No roles match the current filters."
                keyExtractor={(role) => role.id}
                onRowClick={(role) => router.push(`/admin/roles/${role.id}`)}
                mobileCard={(role) => <RoleMobileCard role={role} />}
                columns={[
                  {
                    key: 'name',
                    header: 'Role',
                    sortable: true,
                    sortFn: (a, b) => a.name.localeCompare(b.name),
                    cell: (role) => (
                      <div className="min-w-0">
                        <p className="font-medium truncate">{role.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{role.code}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'category',
                    header: 'Category',
                    sortable: true,
                    cell: (role) => (
                      <Badge variant={getCategoryBadgeVariant(role.category)}>
                        {role.category_display || role.category}
                      </Badge>
                    ),
                  },
                  {
                    key: 'license',
                    header: 'License',
                    hideOnMobile: true,
                    sortable: true,
                    cell: (role) =>
                      role.requires_license ? role.license_body || 'Required' : 'Not required',
                  },
                  {
                    key: 'hierarchy',
                    header: 'Hierarchy',
                    hideOnMobile: true,
                    sortable: true,
                    sortType: 'number',
                    sortFn: (a, b) => a.hierarchy_level - b.hierarchy_level,
                    cell: (role) => <span className="text-muted-foreground">Level {role.hierarchy_level}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    cell: (role) => (
                      <Badge variant={role.is_active ? 'default' : 'secondary'}>
                        {role.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-[90px] text-right',
                    cell: (role) => (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/roles/${role.id}`}>Open</Link>
                      </Button>
                    ),
                  },
                ]}
              />
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function RoleMobileCard({ role }: { role: Role }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium truncate">{role.name}</p>
          <p className="font-mono text-sm text-muted-foreground truncate">{role.code}</p>
        </div>
        <Badge variant={role.is_active ? 'default' : 'secondary'}>
          {role.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={getCategoryBadgeVariant(role.category)}>
          {role.category_display || role.category}
        </Badge>
        {role.requires_license ? <Badge variant="outline">{role.license_body || 'License required'}</Badge> : null}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Hierarchy level {role.hierarchy_level}</p>
    </Card>
  );
}
