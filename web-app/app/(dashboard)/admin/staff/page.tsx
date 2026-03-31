/**
 * Staff Profiles List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Lists all staff profiles with roles, departments, and status.
 * Supports list and grid view modes.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Users,
  Search,
  Building2,
  Shield,
  Mail,
  Phone,
  IdCard,
  UserCheck,
  UserMinus,
  UserCog,
} from 'lucide-react';
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
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useStaffList, useDepartments, useRoles } from '@/lib/hooks/use-rbac';
import type { StaffProfile, EmploymentStatus } from '@/lib/types/rbac';

const PAGE_SIZE = 20;

export default function StaffListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const { refresh, isRefreshing } = usePageRefresh();

  const {
    data: departments,
    refetch: refetchDepartments,
  } = useDepartments({ is_active: true, page_size: 100 });
  const {
    data: roles,
    refetch: refetchRoles,
  } = useRoles({ page_size: 100 });

  const {
    data,
    isLoading,
    error,
    refetch: refetchStaff,
  } = useStaffList({
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    primary_department: departmentFilter !== 'all' ? parseInt(departmentFilter, 10) : undefined,
    primary_role: roleFilter !== 'all' ? parseInt(roleFilter, 10) : undefined,
    employment_status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const staff = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;
  const activeCount = staff.filter((member) => member.employment_status === 'ACTIVE').length;
  const onLeaveCount = staff.filter((member) => member.employment_status === 'ON_LEAVE').length;
  const unassignedCount = staff.filter(
    (member) => !member.primary_department_name || !member.primary_role_name
  ).length;

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([refetchStaff(), refetchDepartments(), refetchRoles()]);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Staff Profiles"
          helpContent="Manage staff accounts, role assignments, and department placement for administrative oversight."
          actions={
            <Button asChild>
              <Link href="/admin/staff/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Staff
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">Staff profiles could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Refresh the page or check the RBAC service response, then try again.
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
          title="Staff Profiles"
          helpContent="Manage staff accounts, role assignments, and department placement for administrative oversight. Pull down to refresh on mobile when new records are added from another workstation."
          actions={
            <Button asChild>
              <Link href="/admin/staff/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Staff
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Visible Profiles"
            value={data?.count ?? 0}
            description="Current results after filters"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Active"
            value={activeCount}
            description="Able to access the system"
            icon={<UserCheck className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="On Leave"
            value={onLeaveCount}
            description="Temporarily unavailable"
            icon={<UserMinus className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Needs Assignment"
            value={unassignedCount}
            description="Missing a role or department"
            icon={<UserCog className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_160px_auto] lg:items-center">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search staff"
                  autoComplete="off"
                  className="pl-9"
                  name="staff-search"
                  placeholder="Search by name, username, or employee ID…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}>
                <SelectTrigger aria-label="Filter by department">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.results?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger aria-label="Filter by role">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles?.results?.map((role) => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => { setStatusFilter(value as EmploymentStatus | 'all'); setPage(1); }}
              >
                <SelectTrigger aria-label="Filter by employment status">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex justify-start lg:justify-end">
                <ViewToggle value={viewMode} onChange={setViewMode} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staff Directory
              <Badge variant="secondary" className="ml-1">
                {data?.count ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              viewMode === 'list' ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <EntityGrid>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-44 w-full rounded-lg" />
                  ))}
                </EntityGrid>
              )
            ) : viewMode === 'list' ? (
              <StaffTableView
                staff={staff}
                onOpen={(member) => router.push(`/admin/staff/${member.id}`)}
              />
            ) : (
              <StaffGridView staff={staff} />
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

function StaffTableView({
  staff,
  onOpen,
}: {
  staff: StaffProfile[];
  onOpen: (member: StaffProfile) => void;
}) {
  return (
    <ResponsiveTable
      data={staff}
      emptyMessage="No staff profiles match the current filters."
      keyExtractor={(member) => member.id}
      onRowClick={onOpen}
      mobileCard={(member) => (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium truncate">{member.full_name}</p>
              <p className="text-sm text-muted-foreground truncate">@{member.user_username}</p>
            </div>
            <Badge variant={member.employment_status === 'ACTIVE' ? 'default' : 'secondary'}>
              {formatEmploymentStatus(member.employment_status)}
            </Badge>
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <IdCard className="h-3.5 w-3.5" />
              <span className="font-mono">{member.employee_id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" />
              <span>{member.primary_department_name || 'Department not assigned'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" />
              <span>{member.primary_role_name || 'Role not assigned'}</span>
            </div>
            {member.user_email ? (
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{member.user_email}</span>
              </div>
            ) : null}
          </div>
        </Card>
      )}
      columns={[
        {
          key: 'employee',
          header: 'Employee',
          sortable: true,
          sortFn: (a, b) => a.full_name.localeCompare(b.full_name),
          cell: (member) => (
            <div className="min-w-0">
              <p className="font-medium truncate">{member.full_name}</p>
              <p className="text-sm text-muted-foreground truncate">@{member.user_username}</p>
            </div>
          ),
        },
        {
          key: 'employee_id',
          header: 'Employee ID',
          sortable: true,
          cell: (member) => <span className="font-mono text-sm">{member.employee_id}</span>,
        },
        {
          key: 'department',
          header: 'Department',
          hideOnMobile: true,
          sortable: true,
          sortFn: (a, b) => (a.primary_department_name || '').localeCompare(b.primary_department_name || ''),
          cell: (member) => member.primary_department_name || 'Unassigned',
        },
        {
          key: 'role',
          header: 'Role',
          hideOnMobile: true,
          sortable: true,
          sortFn: (a, b) => (a.primary_role_name || '').localeCompare(b.primary_role_name || ''),
          cell: (member) => member.primary_role_name || 'Unassigned',
        },
        {
          key: 'contact',
          header: 'Contact',
          hideOnMobile: true,
          cell: (member) => (
            <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
              {member.user_email ? <p className="truncate">{member.user_email}</p> : null}
              {member.phone_number ? <p>{member.phone_number}</p> : <p>—</p>}
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          sortable: true,
          sortFn: (a, b) => (a.employment_status || '').localeCompare(b.employment_status || ''),
          cell: (member) => (
            <Badge variant={member.employment_status === 'ACTIVE' ? 'default' : 'secondary'}>
              {formatEmploymentStatus(member.employment_status)}
            </Badge>
          ),
        },
        {
          key: 'actions',
          header: '',
          className: 'w-[90px] text-right',
          cell: (member) => (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/admin/staff/${member.id}`}>Open</Link>
            </Button>
          ),
        },
      ]}
    />
  );
}

/**
 * Staff Grid View Component
 */
function StaffGridView({ staff }: { staff: StaffProfile[] }) {
  if (staff.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No staff profiles match the current filters.
      </div>
    );
  }

  return (
    <EntityGrid>
      {staff.map((member) => (
        <EntityCard
          key={member.id}
          title={member.full_name}
          subtitle={`@${member.user_username}`}
          initials={getInitials(member.user_first_name, member.user_last_name)}
          href={`/admin/staff/${member.id}`}
          status={{
            label: member.employment_status === 'ACTIVE' ? 'Active' : member.employment_status?.toLowerCase() || 'Unknown',
            variant: member.employment_status === 'ACTIVE' ? 'default' : 'secondary',
          }}
          badges={member.primary_role_name ? [{ label: member.primary_role_name }] : []}
          metadata={[
            {
              icon: <IdCard className="h-3 w-3" />,
              label: 'ID',
              value: member.employee_id,
            },
            {
              icon: <Building2 className="h-3 w-3" />,
              label: 'Dept',
              value: member.primary_department_name || 'Unassigned',
            },
            ...(member.user_email
              ? [{
                  icon: <Mail className="h-3 w-3" />,
                  label: 'Email',
                  value: member.user_email,
                }]
              : []),
          ]}
          actions={[
            { label: 'Edit Profile', href: `/admin/staff/${member.id}` },
            { label: 'View Activity', href: `/admin/audit-logs?user=${member.user}` },
          ]}
        />
      ))}
    </EntityGrid>
  );
}

function formatEmploymentStatus(status?: EmploymentStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'ON_LEAVE':
      return 'On Leave';
    case 'SUSPENDED':
      return 'Suspended';
    case 'TERMINATED':
      return 'Terminated';
    default:
      return 'Unknown';
  }
}

/**
 * Get initials from first and last name
 */
function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0) || '';
  const last = lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || '??';
}
