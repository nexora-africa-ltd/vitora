/**
 * Clinic Visit Detail Page
 *
 * Displays details of a single clinic visit with actions to manage the visit.
 * Route: /clinics/visits/[visitId]
 */
'use client';

import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Phone,
  Calendar,
  Clock,
  Stethoscope,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  FileText,
  ArrowRight,
} from 'lucide-react';
import {
  useClinicVisit,
  useCallPatient,
  useStartConsultation,
  useCompleteVisit,
} from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisitStatus, ClinicVisitPriority } from '@/lib/types/clinic';
import { cn } from '@/lib/utils/cn';

const statusConfig: Record<ClinicVisitStatus, { label: string; className: string; icon: typeof Clock }> = {
  REGISTERED: { label: 'Registered', className: 'bg-blue-100 text-blue-800', icon: Clock },
  WAITING: { label: 'Waiting', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  CALLED: { label: 'Called', className: 'bg-orange-100 text-orange-800', icon: Phone },
  IN_CONSULTATION: { label: 'In Consultation', className: 'bg-purple-100 text-purple-800', icon: Stethoscope },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  REFERRED: { label: 'Referred', className: 'bg-indigo-100 text-indigo-800', icon: ArrowRight },
  NO_SHOW: { label: 'No Show', className: 'bg-gray-100 text-gray-800', icon: XCircle },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-800', icon: XCircle },
};

const priorityConfig: Record<ClinicVisitPriority, { label: string; className: string }> = {
  EMERGENCY: { label: 'Emergency', className: 'bg-red-600 text-white' },
  URGENT: { label: 'Urgent', className: 'bg-orange-500 text-white' },
  PRIORITY: { label: 'Priority', className: 'bg-yellow-500 text-white' },
  STANDARD: { label: 'Standard', className: 'bg-green-500 text-white' },
  NON_URGENT: { label: 'Non-Urgent', className: 'bg-blue-500 text-white' },
  RED: { label: 'Red', className: 'bg-red-600 text-white' },
  ORANGE: { label: 'Orange', className: 'bg-orange-500 text-white' },
  YELLOW: { label: 'Yellow', className: 'bg-yellow-500 text-white' },
  GREEN: { label: 'Green', className: 'bg-green-500 text-white' },
  BLUE: { label: 'Blue', className: 'bg-blue-500 text-white' },
};

export default function ClinicVisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = Number(params.visitId);

  const { data: visit, isLoading, error } = useClinicVisit(visitId);
  const callPatientMutation = useCallPatient();
  const startConsultationMutation = useStartConsultation();
  const completeVisitMutation = useCompleteVisit();

  const handleCallPatient = async () => {
    try {
      await callPatientMutation.mutateAsync(visitId);
      toast({ title: 'Patient called', description: 'Patient has been summoned for consultation.' });
    } catch (err) {
      toast({
        title: 'Failed to call patient',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleStartConsultation = async () => {
    try {
      await startConsultationMutation.mutateAsync(visitId);
      toast({ title: 'Consultation started' });
      // Navigate to encounter if created
      if (visit?.patient?.id) {
        router.push(`/encounters/new?patient_id=${visit.patient.id}`);
      }
    } catch (err) {
      toast({
        title: 'Failed to start consultation',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCompleteVisit = async () => {
    try {
      await completeVisitMutation.mutateAsync(visitId);
      toast({ title: 'Visit completed' });
    } catch (err) {
      toast({
        title: 'Failed to complete visit',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="p-4 text-center text-destructive">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>Failed to load visit details</p>
        <p className="text-sm text-muted-foreground">{error?.message || 'Visit not found'}</p>
      </div>
    );
  }

  const canCall = visit.status === 'REGISTERED' || visit.status === 'WAITING';
  const canStart = visit.status === 'CALLED' || visit.status === 'WAITING' || visit.status === 'REGISTERED';
  const canComplete = visit.status === 'IN_CONSULTATION' || visit.status === 'CALLED';
  const statusInfo = statusConfig[visit.status] || statusConfig.REGISTERED;
  const priorityInfo = priorityConfig[visit.priority] || priorityConfig.STANDARD;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Visit #${visit.queue_number}`}
        helpContent="View and manage clinic visit details. Call the patient, start consultation, or complete the visit."
      />

      {/* Patient Info & Status */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Patient Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-lg">{visit.patient.full_name}</p>
                <p className="text-sm text-muted-foreground">{visit.patient.mrn}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/patients/${visit.patient.id}`)}
              >
                View Profile
              </Button>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Gender</p>
                <p className="font-medium">{visit.patient.gender}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Age</p>
                <p className="font-medium">{visit.patient.age || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Date of Birth</p>
                <p className="font-medium">
                  {format(new Date(visit.patient.date_of_birth), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{visit.patient.phone_number || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visit Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Visit Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className={cn('text-sm px-3 py-1', statusInfo.className)}>
                <StatusIcon className="h-4 w-4 mr-1" />
                {statusInfo.label}
              </Badge>
              <Badge className={cn('text-sm px-3 py-1', priorityInfo.className)}>
                {priorityInfo.label}
              </Badge>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Visit Type</p>
                <p className="font-medium">{visit.visit_type_display || visit.visit_type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium">{visit.source_display || visit.source}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Registered At</p>
                <p className="font-medium">
                  {format(new Date(visit.registered_at), 'HH:mm, MMM d')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Wait Time</p>
                <p className="font-medium">
                  {visit.wait_time_minutes ? `${visit.wait_time_minutes} min` : '-'}
                </p>
              </div>
              {visit.called_at && (
                <div>
                  <p className="text-muted-foreground">Called At</p>
                  <p className="font-medium">
                    {format(new Date(visit.called_at), 'HH:mm, MMM d')}
                  </p>
                </div>
              )}
              {visit.consultation_started_at && (
                <div>
                  <p className="text-muted-foreground">Consultation Started</p>
                  <p className="font-medium">
                    {format(new Date(visit.consultation_started_at), 'HH:mm, MMM d')}
                  </p>
                </div>
              )}
              {visit.completed_at && (
                <div>
                  <p className="text-muted-foreground">Completed At</p>
                  <p className="font-medium">
                    {format(new Date(visit.completed_at), 'HH:mm, MMM d')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chief Complaint & Notes */}
      {(visit.chief_complaint || visit.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Visit Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {visit.chief_complaint && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Chief Complaint</p>
                <p className="text-base">{visit.chief_complaint}</p>
              </div>
            )}
            {visit.notes && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-base">{visit.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {canCall && (
              <Button
                onClick={handleCallPatient}
                disabled={callPatientMutation.isPending}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call Patient
              </Button>
            )}
            {canStart && (
              <Button
                onClick={handleStartConsultation}
                disabled={startConsultationMutation.isPending}
                variant="default"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Consultation
              </Button>
            )}
            {canComplete && (
              <Button
                onClick={handleCompleteVisit}
                disabled={completeVisitMutation.isPending}
                variant="outline"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Visit
              </Button>
            )}
            {visit.encounter && (
              <Button
                variant="outline"
                onClick={() => router.push(`/encounters/${visit.encounter}`)}
              >
                <Stethoscope className="h-4 w-4 mr-2" />
                View Encounter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
