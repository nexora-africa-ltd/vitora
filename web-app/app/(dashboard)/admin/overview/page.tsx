'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Network,
  ScrollText,
  ShieldUser,
  UserCog,
  Users,
  UserRoundCheck,
} from 'lucide-react';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDepartmentOrgChart, useRoles } from '@/lib/hooks/use-rbac';

const AdminOrgChart = dynamic(
  () => import('@/components/admin/admin-org-chart').then((mod) => mod.AdminOrgChart),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-[560px] w-full rounded-xl" />
      </div>
    ),
  }
);

const QUICK_LINKS = [
  {
    title: 'Departments',
    description: 'Maintain the formal structure, parent-child hierarchy, and department leadership.',
    href: '/admin/departments',
    icon: Building2,
  },
  {
    title: 'Roles',
    description: 'Review role definitions, privilege boundaries, and license-restricted assignments.',
    href: '/admin/roles',
    icon: ShieldUser,
  },
  {
    title: 'Staff',
    description: 'Manage staff profiles, placement, and direct reporting relationships.',
    href: '/admin/staff',
    icon: UserCog,
  },
  {
    title: 'Audit Logs',
    description: 'Inspect privileged changes across departments, roles, and staff assignments.',
    href: '/admin/audit-logs',
    icon: ScrollText,
  },
];

export default function AdminOverviewPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const {
    data: rolesData,
    isLoading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useRoles({ page_size: 200 });
  const {
    data: orgChartData,
    isLoading: orgChartLoading,
    error: orgChartError,
    refetch: refetchOrgChart,
  } = useDepartmentOrgChart({ include_inactive: true });

  const departments = orgChartData?.departments ?? [];
  const roles = rolesData?.results ?? [];
  const staff = orgChartData?.staff ?? [];

  const activeDepartments = departments.filter((department) => department.is_active).length;
  const assignedHeads = departments.filter((department) => department.head !== null).length;
  const activeStaff = staff.filter((member) => member.employment_status === 'ACTIVE').length;
  const supervisorCoverage = staff.length > 0
    ? Math.round((staff.filter((member) => member.supervisor).length / staff.length) * 100)
    : 0;
  const activeRoles = roles.filter((role) => role.is_active).length;
  const licensedRoles = roles.filter((role) => role.requires_license).length;
  const topLevelDepartments = departments.filter((department) => department.parent === null).length;

  const isLoading = orgChartLoading || rolesLoading;
  const hasError = orgChartError || rolesError;

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([refetchOrgChart(), refetchRoles()]);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Admin Overview"
          helpContent="Review administrative structure, staffing coverage, and role inventory from one place before drilling into departments, roles, or staff records."
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/admin/staff/new">Add Staff</Link>
              </Button>
              <Button asChild>
                <Link href="/admin/departments/new">New Department</Link>
              </Button>
            </>
          }
        />

        {hasError ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-medium text-destructive">The admin overview could not be loaded.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Refresh the page or verify the RBAC endpoints, then try again.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Departments"
            value={isLoading ? '...' : orgChartData?.summary.department_count ?? 0}
            description={`${activeDepartments} active, ${topLevelDepartments} top-level`}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Department Heads"
            value={isLoading ? '...' : assignedHeads}
            description="Departments with a named lead"
            icon={<UserRoundCheck className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Staff Profiles"
            value={isLoading ? '...' : orgChartData?.summary.staff_count ?? 0}
            description={`${activeStaff} active staff in loaded results`}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Supervisor Coverage"
            value={isLoading ? '...' : `${supervisorCoverage}%`}
            description="Loaded staff with a direct supervisor assigned"
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Roles"
            value={isLoading ? '...' : rolesData?.count ?? 0}
            description={`${activeRoles} active role definitions`}
            icon={<ShieldUser className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Licensed Roles"
            value={isLoading ? '...' : licensedRoles}
            description="Roles marked as license-required"
            icon={<ShieldUser className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Org Roots"
            value={isLoading ? '...' : topLevelDepartments}
            description="Departments with no parent"
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Head Assignment Rate"
            value={isLoading ? '...' : `${departments.length > 0 ? Math.round((assignedHeads / departments.length) * 100) : 0}%`}
            description="Loaded departments with a head assigned"
            icon={<UserRoundCheck className="h-4 w-4 text-cyan-600" />}
            valueClassName="text-2xl font-semibold text-cyan-600"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Organization Chart</CardTitle>
                  <CardDescription>
                    Interactive React Flow view of department hierarchy with leadership context and reporting coverage.
                  </CardDescription>
                </div>
                <Badge variant="outline">React Flow</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <AdminOrgChart departments={departments} staff={staff} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Admin Shortcuts</CardTitle>
                <CardDescription>
                  Jump directly into the operational areas that feed this overview.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {QUICK_LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <Card variant="muted" className="border-border/60">
                        <CardContent className="flex items-start justify-between gap-3 p-4">
                          <div className="flex min-w-0 gap-3">
                            <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-700 dark:text-cyan-300">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{item.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                            </div>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coverage Notes</CardTitle>
                <CardDescription>
                  Structural signals worth reviewing while you fill out the organization map.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {assignedHeads} of {departments.length || 0} loaded departments currently have a department head.
                </p>
                <p>
                  {staff.filter((member) => member.primary_department).length} loaded staff profiles are assigned to a primary department.
                </p>
                <p>
                  {staff.filter((member) => member.supervisor).length} loaded staff profiles have a direct supervisor set.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/staff">
                    Review staff assignments
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}