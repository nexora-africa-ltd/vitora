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
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
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
  Phone,
  Mail,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  LOST_TO_FOLLOW_UP: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  DECEASED: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(nextAppointment: string | null): boolean {
  if (!nextAppointment) return false;
  return new Date(nextAppointment) < new Date();
}

export default function ClinicPatientsPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);

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
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Clinic not found</h3>
        <Button asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clinics
          </Link>
        </Button>
      </div>
    );
  }

  // Check if this is a chronic care clinic (supports enrollments)
  const isChronicCareClinic = ['CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'ONCOLOGY', 'DIALYSIS'].includes(
    clinic.clinic_type
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/clinics/${clinicId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {clinic.name} - {isChronicCareClinic ? 'Enrolled Patients' : 'Patients'}
            </h1>
            <p className="text-muted-foreground">
              {isChronicCareClinic
                ? 'Manage patient enrollments, track appointments, and identify defaulters'
                : 'View patients who have visited this clinic'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" onClick={() => refetchEnrollments()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {isChronicCareClinic && (
            <Button asChild>
              <Link href={`/clinics/enrollments/new?clinic=${clinicId}`}>
                <UserPlus className="h-4 w-4 mr-2" />
                Enroll Patient
              </Link>
            </Button>
          )}
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <ClinicNavigation clinicId={clinicId} />

      {/* Stats Cards */}
      {isChronicCareClinic && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Enrolled</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">Active enrollments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{overduePatients.length}</div>
              <p className="text-xs text-muted-foreground">Missed appointment date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Defaulters</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{defaulters.length}</div>
              <p className="text-xs text-muted-foreground">Lost to follow-up</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {enrollments.filter((e) => {
                  const nextAppt = e.next_appointment_date;
                  if (!nextAppt) return false;
                  const date = new Date(nextAppt);
                  const now = new Date();
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                }).length}
              </div>
              <p className="text-xs text-muted-foreground">Appointments due</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, MRN, or enrollment number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {isChronicCareClinic && (
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="TRANSFERRED">Transferred</SelectItem>
                  <SelectItem value="LOST_TO_FOLLOW_UP">Lost to Follow-up</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="DECEASED">Deceased</SelectItem>
                </SelectContent>
              </Select>
            )}

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for chronic care clinics */}
      {isChronicCareClinic ? (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">
              All Patients
              <Badge variant="secondary" className="ml-2">
                {totalCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="overdue">
              Overdue
              {overduePatients.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {overduePatients.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="defaulters">
              Defaulters
              {defaulters.length > 0 && (
                <Badge variant="destructive" className="ml-2">
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
              emptyDescription="All enrolled patients are up to date with their appointments."
            />
          </TabsContent>

          <TabsContent value="defaulters">
            <EnrollmentsTable
              enrollments={defaulters}
              isLoading={false}
              clinicId={clinicId}
              emptyMessage="No defaulters"
              emptyDescription="No patients have been lost to follow-up."
            />
          </TabsContent>
        </Tabs>
      ) : (
        // For non-chronic care clinics, show a simpler view
        <Card>
          <CardHeader>
            <CardTitle>Recent Patients</CardTitle>
            <CardDescription>
              Patients who have visited {clinic.name} recently
            </CardDescription>
          </CardHeader>
          <CardContent>
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
  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{emptyMessage}</h3>
        <p className="text-muted-foreground text-center">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Enrollment #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Enrolled Date</TableHead>
            <TableHead>Last Visit</TableHead>
            <TableHead>Next Appointment</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map((enrollment) => (
            <TableRow key={enrollment.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {enrollment.patient_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Link
                      href={`/patients/${enrollment.patient}`}
                      className="font-medium hover:underline"
                    >
                      {enrollment.patient_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">{enrollment.patient_mrn}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">{enrollment.enrollment_number}</span>
              </TableCell>
              <TableCell>
                <Badge className={cn('font-normal', STATUS_COLORS[enrollment.status])}>
                  {enrollment.status_display}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(enrollment.enrollment_date)}</TableCell>
              <TableCell>{formatDate(enrollment.last_visit_date)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      isOverdue(enrollment.next_appointment_date) && 'text-red-600 font-medium'
                    )}
                  >
                    {formatDate(enrollment.next_appointment_date)}
                  </span>
                  {isOverdue(enrollment.next_appointment_date) && (
                    <Badge variant="destructive" className="text-xs">
                      Overdue
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{enrollment.visit_count}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
