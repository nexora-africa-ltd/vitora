/**
 * Clinic Enrollments Page
 *
 * Displays all chronic care program enrollments with filtering.
 *
 * Route: /clinics/enrollments
 */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Filter,
  Users,
  AlertTriangle,
  Calendar,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useClinics, useClinicEnrollments } from '@/lib/hooks/use-clinics';
import type { ClinicEnrollmentListParams, EnrollmentStatus } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const STATUS_OPTIONS: { value: EnrollmentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'LOST_TO_FOLLOW_UP', label: 'Lost to Follow-up' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'COMPLETED', label: 'Completed' },
];

const statusColors: Record<EnrollmentStatus, string> = {
  ACTIVE: 'bg-green-500',
  INACTIVE: 'bg-gray-500',
  TRANSFERRED: 'bg-blue-500',
  LOST_TO_FOLLOW_UP: 'bg-orange-500',
  DECEASED: 'bg-red-500',
  COMPLETED: 'bg-purple-500',
};

export default function EnrollmentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus | 'ALL'>('ACTIVE');
  const [selectedClinic, setSelectedClinic] = useState<string>('ALL');

  // Fetch clinics for filter
  const { data: clinicsData } = useClinics({ status: 'ACTIVE' });
  const clinics = clinicsData?.results ?? [];

  const params = useMemo<ClinicEnrollmentListParams>(() => {
    const p: ClinicEnrollmentListParams = {};
    if (search) p.search = search;
    if (status !== 'ALL') p.status = status;
    if (selectedClinic !== 'ALL') p.clinic = Number(selectedClinic);
    return p;
  }, [search, status, selectedClinic]);

  const { data, isLoading, refetch } = useClinicEnrollments(params);

  const enrollments = data?.results ?? [];
  const totalCount = data?.count ?? 0;

  // Calculate stats
  const activeCount = enrollments.filter((e) => e.status === 'ACTIVE').length;
  const overdueCount = enrollments.filter(
    (e) =>
      e.next_appointment_date &&
      new Date(e.next_appointment_date) < new Date() &&
      e.status === 'ACTIVE'
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic Enrollments"
        description="Manage chronic care program enrollments"
        actions={
          <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" asChild>
              <Link href="/clinics/enrollments/overdue">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Overdue
              </Link>
            </Button>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{overdueCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <Link href="/clinics/enrollments/defaulters">View Defaulters</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter Enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by patient name or MRN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedClinic} onValueChange={setSelectedClinic}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Select Clinic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Clinics</SelectItem>
                {clinics.map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id.toString()}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as EnrollmentStatus | 'ALL')}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Enrollments Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-48" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No enrollments found</h3>
              <p className="text-muted-foreground text-center">
                {search || status !== 'ALL' || selectedClinic !== 'ALL'
                  ? 'Try adjusting your filters'
                  : 'No chronic care enrollments yet'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enrollment #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Enrollment Date</TableHead>
                  <TableHead>Next Appointment</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const isOverdue =
                    enrollment.next_appointment_date &&
                    new Date(enrollment.next_appointment_date) < new Date() &&
                    enrollment.status === 'ACTIVE';

                  return (
                    <TableRow
                      key={enrollment.id}
                      className={cn(isOverdue && 'bg-orange-50 dark:bg-orange-950/20')}
                    >
                      <TableCell className="font-mono text-sm">
                        {enrollment.enrollment_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{enrollment.patient_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {enrollment.patient_mrn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{enrollment.clinic_name}</TableCell>
                      <TableCell>
                        {new Date(enrollment.enrollment_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {enrollment.next_appointment_date ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span
                              className={cn(
                                isOverdue && 'text-orange-600 font-medium'
                              )}
                            >
                              {new Date(enrollment.next_appointment_date).toLocaleDateString()}
                            </span>
                            {isOverdue && (
                              <Badge variant="outline" className="border-orange-500 text-orange-600">
                                Overdue
                              </Badge>
                            )}
                          </div>
                        ) : (
                          '--'
                        )}
                      </TableCell>
                      <TableCell>{enrollment.visit_count}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[enrollment.status]}>
                          {enrollment.status_display}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/patients/${enrollment.patient}`)
                          }
                        >
                          View
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
