/**
 * Enrollment Detail Page
 *
 * Shows a single enrollment and allows recording a visit by adding
 * the patient to the clinic queue.
 * Route: /clinics/enrollments/[enrollmentId]
 */
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { useClinic, useClinicEnrollment, useAddToQueue } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';

export default function EnrollmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const enrollmentId = Number(params.enrollmentId);

  const { data: enrollment, isLoading: enrollmentLoading, refetch: refetchEnrollment } = useClinicEnrollment(enrollmentId);
  const { data: clinic, isLoading: clinicLoading } = useClinic(enrollment?.clinic);
  const { mutateAsync: addToQueue, isPending: recording } = useAddToQueue();

  const handleRecordVisit = async () => {
    if (!enrollment) return;

    try {
      await addToQueue({
        clinicId: enrollment.clinic,
        data: {
          patient_id: enrollment.patient,
          source: 'APPOINTMENT',
          visit_type: 'FOLLOW_UP',
          priority: 'STANDARD',
          chief_complaint: 'Follow-up visit',
          notes: 'Recorded from enrollment',
        },
      });

      toast({
        title: 'Visit Recorded',
        description: 'Patient has been added to the clinic queue.',
      });

      router.push(`/clinics/${enrollment.clinic}/queue`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.detail || 'Failed to record visit. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (enrollmentLoading || clinicLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Enrollment not found</h1>
        <Button asChild variant="outline">
          <Link href="/clinics/enrollments">Back to Enrollments</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clinics/enrollments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Enrollment Detail</h1>
          <p className="text-muted-foreground">{enrollment.patient_name} • {enrollment.patient_mrn}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchEnrollment()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Enrollment #{enrollment.enrollment_number}</CardTitle>
          <Badge variant="outline">{clinic?.name ?? enrollment.clinic_name}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Status: </span>
            <span>{enrollment.status_display}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Enrollment date: </span>
            <span>{new Date(enrollment.enrollment_date).toLocaleDateString()}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Next appointment: </span>
            <span>{enrollment.next_appointment_date ? new Date(enrollment.next_appointment_date).toLocaleDateString() : '--'}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Visit count: </span>
            <span>{enrollment.visit_count}</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button asChild variant="outline">
              <Link href={`/patients/${enrollment.patient}`}>View Patient</Link>
            </Button>
            <Button onClick={handleRecordVisit} disabled={recording}>
              <ClipboardList className="h-4 w-4 mr-2" />
              {recording ? 'Recording...' : 'Record Visit'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
