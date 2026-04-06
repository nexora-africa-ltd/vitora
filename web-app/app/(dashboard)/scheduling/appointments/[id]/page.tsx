'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  UserCheck,
  Play,
  AlertTriangle,
  Clock,
  CalendarDays,
  User,
  Stethoscope,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { appointmentsApi } from '@/lib/api/scheduling';
import { formatDate } from '@/lib/utils/format';
import type { AppointmentStatus, AppointmentPriority } from '@/lib/types/scheduling';

const statusColors: Record<AppointmentStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CHECKED_IN: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  NO_SHOW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const priorityColors: Record<AppointmentPriority, string> = {
  ROUTINE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  URGENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusLabels: Record<AppointmentStatus, string> = {
  CREATED: 'Created',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

// Valid status transitions (mirroring backend)
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  CREATED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export default function AppointmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const id = Number(params.id);

  const [cancelReason, setCancelReason] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const { data: appointment, isLoading } = useQuery({
    queryKey: ['scheduling-appointment', id],
    queryFn: () => appointmentsApi.get(id),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduling-appointment', id] });
    queryClient.invalidateQueries({ queryKey: ['scheduling-appointments'] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => appointmentsApi.confirm(id),
    onSuccess: () => { invalidate(); toast({ title: 'Appointment Confirmed' }); },
    onError: () => toast({ title: 'Error', description: 'Failed to confirm.', variant: 'destructive' }),
  });

  const checkInMutation = useMutation({
    mutationFn: () => appointmentsApi.checkIn(id),
    onSuccess: () => { invalidate(); toast({ title: 'Patient Checked In' }); },
    onError: () => toast({ title: 'Error', description: 'Failed to check in.', variant: 'destructive' }),
  });

  const startMutation = useMutation({
    mutationFn: () => appointmentsApi.start(id),
    onSuccess: () => { invalidate(); toast({ title: 'Appointment Started' }); },
    onError: () => toast({ title: 'Error', description: 'Failed to start.', variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: () => appointmentsApi.complete(id, completeNotes),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Appointment Completed' });
      setShowCompleteDialog(false);
      setCompleteNotes('');
    },
    onError: () => toast({ title: 'Error', description: 'Failed to complete.', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => appointmentsApi.cancel(id, cancelReason),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Appointment Cancelled' });
      setShowCancelDialog(false);
      setCancelReason('');
    },
    onError: () => toast({ title: 'Error', description: 'Failed to cancel.', variant: 'destructive' }),
  });

  const noShowMutation = useMutation({
    mutationFn: () => appointmentsApi.noShow(id),
    onSuccess: () => { invalidate(); toast({ title: 'Marked as No-Show' }); },
    onError: () => toast({ title: 'Error', description: 'Failed to mark no-show.', variant: 'destructive' }),
  });

  if (isLoading || !appointment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Appointment" />
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const canTransitionTo = VALID_TRANSITIONS[appointment.status] || [];
  const anyPending =
    confirmMutation.isPending ||
    checkInMutation.isPending ||
    startMutation.isPending ||
    completeMutation.isPending ||
    cancelMutation.isPending ||
    noShowMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Appointment ${appointment.appointment_number}`}
        helpContent="View appointment details and manage its lifecycle. Actions available depend on the current status."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {appointment.patient_name}
            <span className="text-muted-foreground"> &bull; {appointment.patient_mrn}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {appointment.resource_name} ({appointment.resource_code}) &bull;{' '}
            {appointment.appointment_type_display}
          </p>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          <Badge className={`${priorityColors[appointment.priority]} w-fit`}>
            {appointment.priority}
          </Badge>
          <Badge className={`${statusColors[appointment.status]} w-fit`}>
            {statusLabels[appointment.status]}
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      {canTransitionTo.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canTransitionTo.includes('CONFIRMED') && (
            <Button
              size="sm"
              onClick={() => confirmMutation.mutate()}
              disabled={anyPending}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> Confirm
            </Button>
          )}
          {canTransitionTo.includes('CHECKED_IN') && (
            <Button
              size="sm"
              onClick={() => checkInMutation.mutate()}
              disabled={anyPending}
            >
              <UserCheck className="h-4 w-4 mr-1" /> Check In
            </Button>
          )}
          {canTransitionTo.includes('IN_PROGRESS') && (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={anyPending}
            >
              <Play className="h-4 w-4 mr-1" /> Start
            </Button>
          )}
          {canTransitionTo.includes('COMPLETED') && (
            <Button
              size="sm"
              onClick={() => setShowCompleteDialog(true)}
              disabled={anyPending}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> Complete
            </Button>
          )}
          {canTransitionTo.includes('NO_SHOW') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => noShowMutation.mutate()}
              disabled={anyPending}
            >
              <AlertTriangle className="h-4 w-4 mr-1" /> No-Show
            </Button>
          )}
          {canTransitionTo.includes('CANCELLED') && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowCancelDialog(true)}
              disabled={anyPending}
            >
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      )}

      {/* Details Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Scheduling Details */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Schedule</CardTitle>
              <HelpPopover content="Scheduled and actual appointment times." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Detail icon={CalendarDays} label="Scheduled Start" value={formatDate(appointment.scheduled_start, 'MMM d, yyyy h:mm a')} />
            <Detail icon={CalendarDays} label="Scheduled End" value={formatDate(appointment.scheduled_end, 'MMM d, yyyy h:mm a')} />
            <Detail icon={Clock} label="Duration" value={`${appointment.duration_minutes} min`} />
            {appointment.actual_start && (
              <Detail icon={Play} label="Actual Start" value={formatDate(appointment.actual_start, 'MMM d, yyyy h:mm a')} />
            )}
            {appointment.actual_end && (
              <Detail icon={CheckCircle} label="Actual End" value={formatDate(appointment.actual_end, 'MMM d, yyyy h:mm a')} />
            )}
          </CardContent>
        </Card>

        {/* Clinical Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Details</CardTitle>
              <HelpPopover content="Appointment reason, notes, and tracking information." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Detail icon={Stethoscope} label="Reason" value={appointment.reason} />
            {appointment.notes && (
              <Detail icon={Stethoscope} label="Notes" value={appointment.notes} />
            )}
            {appointment.completion_notes && (
              <Detail icon={CheckCircle} label="Completion Notes" value={appointment.completion_notes} />
            )}
            {appointment.cancellation_reason && (
              <Detail icon={XCircle} label="Cancel Reason" value={appointment.cancellation_reason} />
            )}
          </CardContent>
        </Card>

        {/* Audit Trail */}
        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Timeline</CardTitle>
              <HelpPopover content="Appointment lifecycle tracking: who did what and when." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {appointment.created_by_name && (
                <TimelineEntry
                  label="Created"
                  by={appointment.created_by_name}
                  at={appointment.created_at}
                />
              )}
              {appointment.confirmed_at && (
                <TimelineEntry
                  label="Confirmed"
                  by={appointment.confirmed_by_name}
                  at={appointment.confirmed_at}
                />
              )}
              {appointment.checked_in_at && (
                <TimelineEntry
                  label="Checked In"
                  at={appointment.checked_in_at}
                />
              )}
              {appointment.actual_start && (
                <TimelineEntry
                  label="Started"
                  at={appointment.actual_start}
                />
              )}
              {appointment.actual_end && (
                <TimelineEntry
                  label="Completed"
                  at={appointment.actual_end}
                />
              )}
              {appointment.cancelled_at && (
                <TimelineEntry
                  label="Cancelled"
                  by={appointment.cancelled_by_name}
                  at={appointment.cancelled_at}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancellation reason..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancel Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Completion Notes (optional)</Label>
            <Textarea
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              placeholder="Enter completion notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              Back
            </Button>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function TimelineEntry({
  label,
  by,
  at,
}: {
  label: string;
  by?: string | null;
  at: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{label}</span>
        {by && <span className="text-muted-foreground"> by {by}</span>}
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatDate(at, 'MMM d, h:mm a')}
      </span>
    </div>
  );
}
