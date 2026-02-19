/**
 * Clinic Enrolled Patients Page
 *
 * Displays patients enrolled in this clinic (for chronic care clinics like CCC, Diabetic, etc.)
 * or patients who have visited this clinic recently.
 *
 * Route: /clinics/[clinicId]/patients
 */
'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Search,
  Filter,
  Plus,
  Download,
  Calendar,
  Clock,
  AlertCircle,
  UserPlus,
  FileText,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useClinic,
  useClinicEnrollments,
  useOverdueEnrollments,
  useDefaulters,
} from '@/lib/hooks/use-clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import type { EnrollmentStatus, ClinicEnrollment } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

type StatusFilter = EnrollmentStatus | 'ALL';

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  INACTIVE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  TRANSFERRED_OUT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  LOST_TO_FOLLOW_UP: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  DECEASED: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  SUSPENDED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(nextAppointment: string | null | undefined): boolean {
  if (!nextAppointment) return false;
  return new Date(nextAppointment) < new Date();
}

export default function ClinicPatientsPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = Number(params.clinicId);
  const { refresh, isRefreshing } = usePageRefresh();

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch clinic data
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: enrollmentsData, isLoading: enrollmentsLoading, refetch: refetchEnrollments } = useClinicEnrollments({
    clinic: clinicId,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    search: searchQuery || undefined,
    page: currentPage,
  });
  const { data: overdueData } = useOverdueEnrollments();
  const { data: defaultersData } = useDefaulters();

  // Filter enrollments for this clinic
  const overduePatients = useMemo(() => {
    return (overdueData?.results ?? []).filter((e) => e.clinic === clinicId);
  }, [overdueData, clinicId]);

  const defaulters = useMemo(() => {
    return (defaultersData?.results ?? []).filter((e) => e.clinic === clinicId);
  }, [defaultersData, clinicId]);

  const enrollments = enrollmentsData?.results ?? [];
  const totalCount = enrollmentsData?.count ?? 0;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'ALL';

  if (clinicLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 sm:h-24" />
          ))}
        </div>
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12">
        <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
        <h3 className="text-base sm:text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild size="sm">
          <Link href="/clinics">Back to Clinics</Link>
        </Button>
      </div>
    );
  }

  // Check if this is a chronic care clinic (supports enrollments)
  const isChronicCareClinic = ['CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'ONCOLOGY', 'DIALYSIS'].includes(
    clinic.clinic_type
  );

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${clinic.name} - ${isChronicCareClinic ? 'Enrolled' : 'Patients'}`}
        helpContent={isChronicCareClinic
          ? 'Manage patient enrollments, track appointments, and identify defaulters for chronic care.'
          : 'View patients who have visited this clinic recently.'}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isChronicCareClinic && (
              <Button asChild size="sm">
                <Link href={`/clinics/enrollments/new?clinic=${clinicId}`}>
                  <UserPlus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Enroll</span>
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        }
      />

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Stats Cards */}
      {isChronicCareClinic && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Enrolled</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Overdue</CardTitle>
              <Clock className="h-4 w-4 text-orange-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-orange-600">{overduePatients.length}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Missed appt</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Defaulters</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-red-600">{defaulters.length}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">Lost</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-green-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-green-600">
                {enrollments.filter((e) => {
                  const nextAppt = e.next_appointment_date;
                  if (!nextAppt) return false;
                  const date = new Date(nextAppt);
                  const now = new Date();
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                }).length}
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">Due</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, MRN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2 sm:gap-4">
              {isChronicCareClinic && (
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <Filter className="h-4 w-4 mr-2 hidden sm:block" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                    <SelectItem value="LOST_TO_FOLLOW_UP">Lost</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="DECEASED">Deceased</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for chronic care clinics */}
      {isChronicCareClinic ? (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all" className="gap-1">
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All Patients</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {totalCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1">
              Overdue
              {overduePatients.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {overduePatients.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="defaulters" className="gap-1">
              <span className="sm:hidden">Lost</span>
              <span className="hidden sm:inline">Defaulters</span>
              {defaulters.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {defaulters.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <EnrollmentsTable
              enrollments={enrollments}
              isLoading={enrollmentsLoading}
              clinicId={clinicId}
            />
          </TabsContent>

          <TabsContent value="overdue">
            <EnrollmentsTable
              enrollments={overduePatients}
              isLoading={false}
              clinicId={clinicId}
              emptyMessage="No overdue patients"
              emptyDescription="All enrolled patients are up to date."
            />
          </TabsContent>

          <TabsContent value="defaulters">
            <EnrollmentsTable
              enrollments={defaulters}
              isLoading={false}
              clinicId={clinicId}
              emptyMessage="No defaulters"
              emptyDescription="No patients lost to follow-up."
            />
          </TabsContent>
        </Tabs>
      ) : (
        // For non-chronic care clinics, show a simpler view
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Recent Patients</CardTitle>
              <HelpPopover content={`Patients who have visited ${clinic.name} recently.`} />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <EnrollmentsTable
              enrollments={enrollments}
              isLoading={enrollmentsLoading}
              clinicId={clinicId}
              emptyMessage="No patients found"
              emptyDescription="No patient records found for this clinic."
            />
          </CardContent>
        </Card>
      )}
    </div>
    </PullToRefresh>
  );
}

// ============================================================================
// Enrollments Table Component
// ============================================================================

interface EnrollmentsTableProps {
  enrollments: ClinicEnrollment[];
  isLoading: boolean;
  clinicId: number;
  emptyMessage?: string;
  emptyDescription?: string;
}

function EnrollmentsTable({
  enrollments,
  isLoading,
  clinicId,
  emptyMessage = 'No patients found',
  emptyDescription = 'No patients match your search criteria.',
}: EnrollmentsTableProps) {
  const router = useRouter();

  return (
    <ResponsiveTable<ClinicEnrollment>
      data={enrollments}
      keyExtractor={(e) => e.id}
      isLoading={isLoading}
      emptyMessage={`${emptyMessage}. ${emptyDescription}`}
      onRowClick={(enrollment) => router.push(`/clinics/enrollments/${enrollment.id}`)}
      columns={[
        {
          key: 'patient',
          header: 'Patient',
          cell: (enrollment) => (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                <AvatarFallback className="text-xs">
                  {enrollment.patient_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium truncate">{enrollment.patient_name}</p>
                <p className="text-xs text-muted-foreground">{enrollment.patient_mrn}</p>
              </div>
            </div>
          ),
        },
        {
          key: 'enrollment_number',
          header: 'Enroll #',
          cell: (enrollment) => (
            <span className="font-mono text-xs">{enrollment.enrollment_number || '—'}</span>
          ),
          hideOnMobile: true,
        },
        {
          key: 'status',
          header: 'Status',
          cell: (enrollment) => (
            <Badge className={cn('font-normal shrink-0 w-fit text-xs', STATUS_COLORS[enrollment.status])}>
              {enrollment.status_display || enrollment.status}
            </Badge>
          ),
        },
        {
          key: 'enrollment_date',
          header: 'Enrolled',
          cell: (enrollment) => formatDate(enrollment.enrollment_date),
          hideOnMobile: true,
        },
        {
          key: 'last_visit_date',
          header: 'Last Visit',
          cell: (enrollment) => formatDate(enrollment.last_visit_date),
          hideOnMobile: true,
        },
        {
          key: 'next_appointment_date',
          header: 'Next Appt',
          cell: (enrollment) => (
            <div className="flex items-center gap-1">
              <span className={cn(
                'text-xs sm:text-sm',
                isOverdue(enrollment.next_appointment_date) && 'text-red-600 font-medium'
              )}>
                {formatDate(enrollment.next_appointment_date)}
              </span>
              {isOverdue(enrollment.next_appointment_date) && (
                <Badge variant="destructive" className="text-xs px-1">!</Badge>
              )}
            </div>
          ),
        },
        {
          key: 'visit_count',
          header: 'Visits',
          cell: (enrollment) => enrollment.visit_count ?? enrollment.total_visits ?? 0,
          className: 'text-right',
          hideOnMobile: true,
        },
        {
          key: 'actions',
          header: '',
          cell: (enrollment) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/patients/${enrollment.patient}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Patient
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/clinics/enrollments/${enrollment.id}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    View Enrollment
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/clinics/${clinicId}/queue?patient=${enrollment.patient}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Queue
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
          className: 'w-[50px]',
        },
      ]}
      mobileCard={(enrollment) => (
        <div className="rounded-lg border p-3 space-y-2 active:bg-muted/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {enrollment.patient_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{enrollment.patient_name}</p>
                <p className="text-xs text-muted-foreground">{enrollment.patient_mrn}</p>
              </div>
            </div>
            <Badge className={cn('font-normal shrink-0 text-xs', STATUS_COLORS[enrollment.status])}>
              {enrollment.status_display || enrollment.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Next:</span>
            <span className={cn(
              isOverdue(enrollment.next_appointment_date) && 'text-red-600 font-medium'
            )}>
              {formatDate(enrollment.next_appointment_date)}
              {isOverdue(enrollment.next_appointment_date) && ' (Overdue)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Visits: {enrollment.visit_count ?? enrollment.total_visits ?? 0}</span>
            <span>Enrolled: {formatDate(enrollment.enrollment_date)}</span>
          </div>
        </div>
      )}
    />
  );
}
