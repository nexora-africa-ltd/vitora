/**
 * Defaulters Page
 *
 * Displays patients who have been lost to follow-up.
 *
 * Route: /clinics/enrollments/defaulters
 */
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  UserX,
  Calendar,
  Phone,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
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
import { useDefaulters } from '@/lib/hooks/use-clinics';

export default function DefaultersPage() {
  const router = useRouter();
  const { data, isLoading, refetch } = useDefaulters();

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
            Defaulters
          </h1>
          <p className="text-muted-foreground">
            Patients who have been lost to follow-up and require outreach
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <UserX className="h-5 w-5" />
            {enrollments.length} Patients Lost to Follow-up
          </CardTitle>
          <CardDescription className="text-red-600 dark:text-red-400">
            These patients have been marked as lost to follow-up and may require
            community health worker outreach or tracing.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Defaulters List */}
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
                No defaulters!
              </h3>
              <p className="text-muted-foreground text-center">
                All enrolled patients are accounted for.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Enrollment Date</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Total Visits</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => (
                  <TableRow key={enrollment.id}>
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
                      {new Date(enrollment.enrollment_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {enrollment.last_visit_date
                        ? new Date(enrollment.last_visit_date).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>{enrollment.visit_count}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
