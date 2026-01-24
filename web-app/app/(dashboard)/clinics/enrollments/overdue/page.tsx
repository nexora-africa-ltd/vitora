/**
 * Overdue Enrollments Page
 *
 * Displays patients who have missed their scheduled appointments.
 *
 * Route: /clinics/enrollments/overdue
 */
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Phone,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
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
import { useOverdueEnrollments } from '@/lib/hooks/use-clinics';
import { cn } from '@/lib/utils/cn';

function getDaysOverdue(dateString: string): number {
  const appointmentDate = new Date(dateString);
  const today = new Date();
  const diffTime = today.getTime() - appointmentDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export default function OverdueEnrollmentsPage() {
  const router = useRouter();
  const { data, isLoading, refetch } = useOverdueEnrollments();

  const enrollments = data?.results ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clinics/enrollments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Overdue Appointments
          </h1>
          <p className="text-muted-foreground">
            Patients who have missed their scheduled appointments
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <Card className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
            <AlertTriangle className="h-5 w-5" />
            {enrollments.length} Patients Overdue
          </CardTitle>
          <CardDescription className="text-orange-600 dark:text-orange-400">
            These patients have missed their scheduled follow-up appointments and may need
            outreach or rescheduling.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Overdue List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-48" />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-green-600">
                No overdue patients!
              </h3>
              <p className="text-muted-foreground text-center">
                All enrolled patients are up to date with their appointments.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const daysOverdue = enrollment.next_appointment_date
                    ? getDaysOverdue(enrollment.next_appointment_date)
                    : 0;
                  const isUrgent = daysOverdue > 30;

                  return (
                    <TableRow
                      key={enrollment.id}
                      className={cn(isUrgent && 'bg-red-50 dark:bg-red-950/20')}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{enrollment.patient_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {enrollment.patient_mrn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{enrollment.clinic_name}</Badge>
                      </TableCell>
                      <TableCell>
                        {enrollment.next_appointment_date
                          ? new Date(enrollment.next_appointment_date).toLocaleDateString()
                          : '--'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isUrgent ? 'destructive' : 'outline'}
                          className={cn(
                            !isUrgent && 'border-orange-500 text-orange-600'
                          )}
                        >
                          {daysOverdue} days
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {enrollment.last_visit_date
                          ? new Date(enrollment.last_visit_date).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm">
                            <Phone className="h-3 w-3 mr-1" />
                            Contact
                          </Button>
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
                        </div>
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
