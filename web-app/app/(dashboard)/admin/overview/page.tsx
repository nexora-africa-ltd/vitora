'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building,
  Building2,
  FolderTree,
  Hospital,
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
import { organizationsApi } from '@/lib/api/organizations';
import { facilitiesApi } from '@/lib/api/facilities';
import { useQuery } from '@tanstack/react-query';
import type { OrganizationListItem } from '@/lib/types/organization';
import type { FacilityListItem } from '@/lib/types/facility';

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
    title: 'Organizations',
    description: 'Manage healthcare organizations, subscription tiers, and facility assignments.',
    href: '/admin/organizations',
    icon: Building,
  },
  {
    title: 'Departments',
    description: 'Shape reporting lines, parent-child structure, and departmental ownership.',
    href: '/admin/departments',
    icon: Building2,
  },
  {
    title: 'Roles',
    description: 'Tighten privilege boundaries, role definitions, and license-gated access.',
    href: '/admin/roles',
    icon: ShieldUser,
  },
  {
    title: 'Staff',
    description: 'Resolve placement gaps, supervisor links, and staffing records.',
    href: '/admin/staff',
    icon: UserCog,
  },
  {
    title: 'Audit Logs',
    description: 'Trace privileged changes across structure, roles, and assignments.',
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

  const {
    data: orgsData,
    isLoading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useQuery({
    queryKey: ['organizations', { page_size: 200 }],
    queryFn: () => organizationsApi.list({ page_size: 200 }),
  });

  const {
    data: facilitiesData,
    isLoading: facilitiesLoading,
    error: facilitiesError,
    refetch: refetchFacilities,
  } = useQuery({
    queryKey: ['facilities', { page_size: 200 }],
    queryFn: () => facilitiesApi.list({ page_size: 200 }),
  });

  const departments = orgChartData?.departments ?? [];
  const roles = rolesData?.results ?? [];
  const staff = orgChartData?.staff ?? [];
  const organizations = (orgsData?.results ?? []) as OrganizationListItem[];
  const allFacilities = (facilitiesData?.results ?? []) as FacilityListItem[];

  const totalOrgs = organizations.length;
  const activeOrgs = organizations.filter((o: OrganizationListItem) => o.is_active).length;
  const totalFacilities = organizations.reduce((sum: number, o: OrganizationListItem) => sum + o.facility_count, 0);
  const totalOrgStaff = organizations.reduce((sum: number, o: OrganizationListItem) => sum + o.staff_count, 0);

  const activeDepartments = departments.filter((department) => department.is_active).length;
  const assignedHeads = departments.filter((department) => department.head !== null).length;
  const activeStaff = staff.filter((member) => member.employment_status === 'ACTIVE').length;
  const supervisorCoverage = staff.length > 0
    ? Math.round((staff.filter((member) => member.supervisor).length / staff.length) * 100)
    : 0;
  const activeRoles = roles.filter((role) => role.is_active).length;
  const licensedRoles = roles.filter((role) => role.requires_license).length;
  const topLevelDepartments = departments.filter((department) => department.parent === null).length;
  const departmentsWithoutHeads = departments.filter((department) => department.head === null).length;
  const inactiveDepartments = departments.length - activeDepartments;
  const staffWithoutSupervisor = staff.filter(
    (member) => member.primary_department && !member.supervisor && member.employment_status === 'ACTIVE'
  ).length;
  const staffWithoutDepartment = staff.filter(
    (member) => !member.primary_department && member.employment_status === 'ACTIVE'
  ).length;
  const staffWithoutRole = staff.filter(
    (member) => !member.primary_role && member.employment_status === 'ACTIVE'
  ).length;
  const licensedRoleShare = roles.length > 0 ? Math.round((licensedRoles / roles.length) * 100) : 0;
  const headAssignmentRate = departments.length > 0 ? Math.round((assignedHeads / departments.length) * 100) : 0;

  const isLoading = orgChartLoading || rolesLoading || orgsLoading || facilitiesLoading;
  const hasError = orgChartError || rolesError || orgsError || facilitiesError;

  const attentionItems = [
    {
      title: 'Departments Missing Heads',
      count: departmentsWithoutHeads,
      description: 'Leadership gaps slow approvals and escalation routing.',
      href: '/admin/departments',
      tone: departmentsWithoutHeads > 0 ? 'critical' : 'default',
    },
    {
      title: 'Staff Missing Supervisors',
      count: staffWithoutSupervisor,
      description: 'Direct reporting lines are incomplete in active profiles.',
      href: '/admin/staff',
      tone: staffWithoutSupervisor > 0 ? 'warning' : 'default',
    },
    {
      title: 'Unplaced Staff',
      count: staffWithoutDepartment,
      description: 'Active staff should sit in a primary department.',
      href: '/admin/staff',
      tone: staffWithoutDepartment > 0 ? 'warning' : 'default',
    },
    {
      title: 'Roles Requiring License',
      count: licensedRoles,
      description: 'Track role definitions with credential dependencies.',
      href: '/admin/roles',
      tone: licensedRoles > 0 ? 'primary' : 'default',
    },
  ] as const;

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([refetchOrgChart(), refetchRoles(), refetchOrgs(), refetchFacilities()]);
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

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <Card variant="primary" className="overflow-hidden border-primary/20">
            <CardContent className="relative p-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]" />
              <div className="relative space-y-6 p-6 sm:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl space-y-3">
                    <Badge variant="outline" className="border-primary/30 bg-background/70 text-primary">
                      Administrative Health
                    </Badge>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                        Structure, access, and staffing from one control surface.
                      </h2>
                      <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                        Use this page to spot missing leadership, repair reporting lines, and move directly into department, role, and staff maintenance.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[250px]">
                    <Button asChild className="w-full">
                      <Link href="/admin/departments/new">New Department</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/admin/staff/new">Add Staff</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full sm:col-span-2">
                      <Link href="/admin/roles">
                        Review Roles
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4 backdrop-blur">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Department Network
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {isLoading ? '...' : orgChartData?.summary.department_count ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {activeDepartments} active and {inactiveDepartments} inactive departments in the loaded structure.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4 backdrop-blur">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Leadership Coverage
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {isLoading ? '...' : `${headAssignmentRate}%`}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {assignedHeads} departments currently have a named lead.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4 backdrop-blur">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Reporting Coverage
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {isLoading ? '...' : `${supervisorCoverage}%`}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {staff.filter((member) => member.supervisor).length} active reporting links captured in loaded staff.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4 backdrop-blur">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Role Posture
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {isLoading ? '...' : rolesData?.count ?? 0}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {licensedRoleShare}% of loaded roles require license-backed assignments.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="warning" className="border-amber-500/30">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Priority Queue</CardTitle>
                  <CardDescription>
                    Fix the gaps that most affect leadership visibility and access governance.
                  </CardDescription>
                </div>
                <div className="rounded-2xl bg-amber-500/10 p-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {attentionItems.map((item) => (
                <Link key={item.title} href={item.href} className="block">
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:border-primary/30 hover:bg-background">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={item.count > 0 ? 'default' : 'secondary'}
                          className={item.tone === 'critical' ? 'bg-destructive text-destructive-foreground' : ''}
                        >
                          {isLoading ? '...' : item.count}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <AdminStatCard
            eyebrow="Structure"
            title="Top-Level Departments"
            value={isLoading ? '...' : topLevelDepartments}
            description="Departments operating without a parent node in the formal structure."
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
            tone="primary"
            meta="Hierarchy"
          />
          <AdminStatCard
            eyebrow="Leadership"
            title="Department Heads"
            value={isLoading ? '...' : assignedHeads}
            description="Loaded departments with a named lead assigned."
            icon={<UserRoundCheck className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
            tone="success"
            meta={`${headAssignmentRate}%`}
          />
          <AdminStatCard
            eyebrow="Staffing"
            title="Staff Profiles"
            value={isLoading ? '...' : orgChartData?.summary.staff_count ?? 0}
            description={`${activeStaff} active staff profiles loaded in the current dataset.`}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            tone="default"
            meta="Loaded"
          />
          <AdminStatCard
            eyebrow="Governance"
            title="Supervisor Coverage"
            value={isLoading ? '...' : `${supervisorCoverage}%`}
            description="Active staff with a direct supervisor recorded in the org model."
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
            tone={staffWithoutSupervisor > 0 ? 'warning' : 'success'}
            meta={`${staffWithoutSupervisor} gaps`}
          />
        </div>

        {/* Organization & Facility Stats */}
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <AdminStatCard
            eyebrow="Multitenancy"
            title="Organizations"
            value={isLoading ? '...' : totalOrgs}
            description={`${activeOrgs} active organizations registered in the platform.`}
            icon={<Building className="h-4 w-4 text-muted-foreground" />}
            tone="primary"
            meta={`${activeOrgs} active`}
          />
          <AdminStatCard
            eyebrow="Infrastructure"
            title="Facilities"
            value={isLoading ? '...' : totalFacilities}
            description="Healthcare facilities across all registered organizations."
            icon={<Hospital className="h-4 w-4 text-muted-foreground" />}
            tone="default"
            meta="All orgs"
          />
          <AdminStatCard
            eyebrow="Capacity"
            title="Org Staff"
            value={isLoading ? '...' : totalOrgStaff}
            description="Staff members assigned across all organizations."
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            tone="default"
            meta="All orgs"
          />
          <AdminStatCard
            eyebrow="Coverage"
            title="Avg Facilities/Org"
            value={isLoading ? '...' : activeOrgs > 0 ? Math.round(totalFacilities / activeOrgs) : 0}
            description="Average number of facilities per active organization."
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
            tone="default"
            meta="Mean"
          />
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <Card variant="accent" className="overflow-hidden border-border/70">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Organization Explorer</CardTitle>
                  <CardDescription>
                    Inspect the formal structure, then drill into staff reporting lines and department ownership without leaving the page.
                  </CardDescription>
                </div>
                <Badge variant="outline">Live Structure</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <AdminOrgChart departments={departments} staff={staff} organizations={organizations} facilities={allFacilities} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card variant="secondary">
              <CardHeader>
                <CardTitle>Action Paths</CardTitle>
                <CardDescription>
                  Move straight into the administrative workflows that shape this page.
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

            <Card variant="primary">
              <CardHeader>
                <CardTitle>Governance Snapshot</CardTitle>
                <CardDescription>
                  A compact readout of the areas most likely to need admin intervention.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Role Inventory</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {activeRoles} active roles and {licensedRoles} license-linked roles.
                        </p>
                      </div>
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <ShieldUser className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Structure Depth</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {topLevelDepartments} root departments feed the current hierarchy map.
                        </p>
                      </div>
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <FolderTree className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Assignment Completeness</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {staffWithoutRole} active staff profiles still need a primary role.
                        </p>
                      </div>
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <Users className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
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
