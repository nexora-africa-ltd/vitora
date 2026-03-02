'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  Globe,
  MapPin,
  Shield,
  User,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDateTime, formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import type { IHRNotificationStatus } from '@/lib/types/surveillance';

const STATUS_BADGE_VARIANTS: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  SUBMITTED_COUNTY: 'info',
  ESCALATED_NATIONAL: 'info',
  NOTIFIED_WHO: 'success',
  ACKNOWLEDGED: 'success',
  CLOSED: 'outline',
  REJECTED: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  SUBMITTED_COUNTY: 'Submitted to County',
  ESCALATED_NATIONAL: 'Escalated to MOH',
  NOTIFIED_WHO: 'WHO Notified',
  ACKNOWLEDGED: 'WHO Acknowledged',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

const URGENCY_BADGE_VARIANTS: Record<string, 'destructive' | 'warning' | 'info'> = {
  EMERGENCY: 'destructive',
  URGENT: 'warning',
  ROUTINE: 'info',
};

const ESCALATION_STEPS: Array<{
  status: IHRNotificationStatus;
  label: string;
  shortLabel: string;
}> = [
  { status: 'DRAFT', label: 'Draft', shortLabel: 'Draft' },
  { status: 'SUBMITTED_COUNTY', label: 'County', shortLabel: 'County' },
  { status: 'ESCALATED_NATIONAL', label: 'MOH National', shortLabel: 'MOH' },
  { status: 'NOTIFIED_WHO', label: 'WHO Notified', shortLabel: 'WHO' },
  { status: 'ACKNOWLEDGED', label: 'Acknowledged', shortLabel: 'Ack' },
  { status: 'CLOSED', label: 'Closed', shortLabel: 'Closed' },
];

function getStepIndex(status: IHRNotificationStatus): number {
  if (status === 'REJECTED') return -1;
  if (status === 'PENDING_REVIEW') return 0;
  const idx = ESCALATION_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

export default function IHRNotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [whoReference, setWhoReference] = useState('');

  const { data: notification, isLoading, error } = useQuery({
    queryKey: ['ihr-notification', id],
    queryFn: () => surveillanceApi.getIHRNotification(Number(id)),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ihr-notification', id] });
    queryClient.invalidateQueries({ queryKey: ['ihr-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['ihr-dashboard'] });
  };

  const submitToCounty = useMutation({
    mutationFn: () => surveillanceApi.submitIHRToCounty(Number(id), actionNotes),
    onSuccess: () => {
      toast.success('Submitted to County Disease Surveillance Coordinator');
      invalidate();
      closeDialog();
    },
    onError: () => toast.error('Failed to submit to county'),
  });

  const escalateToNational = useMutation({
    mutationFn: () => surveillanceApi.escalateIHRToNational(Number(id), actionNotes),
    onSuccess: () => {
      toast.success('Escalated to MOH National IHR Focal Point');
      invalidate();
      closeDialog();
    },
    onError: () => toast.error('Failed to escalate to MOH'),
  });

  const notifyWHO = useMutation({
    mutationFn: () => surveillanceApi.notifyIHRToWHO(Number(id), whoReference),
    onSuccess: () => {
      toast.success('WHO IHR Contact Point notified');
      invalidate();
      closeDialog();
    },
    onError: () => toast.error('Failed to notify WHO'),
  });

  const acknowledgeWHO = useMutation({
    mutationFn: () => surveillanceApi.acknowledgeIHRWHO(Number(id)),
    onSuccess: () => {
      toast.success('WHO acknowledgement recorded');
      invalidate();
    },
    onError: () => toast.error('Failed to record acknowledgement'),
  });

  const closeNotification = useMutation({
    mutationFn: () => surveillanceApi.closeIHRNotification(Number(id), actionNotes),
    onSuccess: () => {
      toast.success('IHR notification closed');
      invalidate();
      closeDialog();
    },
    onError: () => toast.error('Failed to close notification'),
  });

  const rejectNotification = useMutation({
    mutationFn: () => surveillanceApi.rejectIHRNotification(Number(id), actionNotes),
    onSuccess: () => {
      toast.success('IHR notification rejected');
      invalidate();
      closeDialog();
    },
    onError: () => toast.error('Failed to reject notification'),
  });

  const closeDialog = () => {
    setActionDialog(null);
    setActionNotes('');
    setWhoReference('');
  };

  const handleAction = () => {
    switch (actionDialog) {
      case 'submit_county':
        submitToCounty.mutate();
        break;
      case 'escalate_national':
        escalateToNational.mutate();
        break;
      case 'notify_who':
        notifyWHO.mutate();
        break;
      case 'close':
        closeNotification.mutate();
        break;
      case 'reject':
        rejectNotification.mutate();
        break;
    }
  };

  const isPending =
    submitToCounty.isPending ||
    escalateToNational.isPending ||
    notifyWHO.isPending ||
    closeNotification.isPending ||
    rejectNotification.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">IHR notification not found.</p>
      </div>
    );
  }

  const currentStep = getStepIndex(notification.status);
  const isTerminal = ['CLOSED', 'REJECTED'].includes(notification.status);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`IHR ${notification.notification_reference}`}
        helpContent="IHR notification detail. Use the escalation actions to move through the notification pipeline: Facility → County → MOH → WHO."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {notification.disease_name}
            {notification.patient_name && (
              <span className="text-muted-foreground"> • {notification.patient_name}</span>
            )}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Event {formatDate(notification.event_date)} • Reported{' '}
            {formatDateTime(notification.report_date)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={URGENCY_BADGE_VARIANTS[notification.urgency] ?? 'secondary'}>
            {notification.urgency}
          </Badge>
          <Badge variant={STATUS_BADGE_VARIANTS[notification.status] ?? 'secondary'}>
            {STATUS_LABELS[notification.status] ?? notification.status}
          </Badge>
          {notification.is_overdue && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </Badge>
          )}
        </div>
      </div>

      {/* Escalation Pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Escalation Pipeline</CardTitle>
            <HelpPopover content="IHR notifications follow the escalation path: Facility → County DSC → MOH National IHR Focal Point → WHO IHR Contact Point. Per IHR Article 6, WHO must be notified within 24 hours." />
          </div>
        </CardHeader>
        <CardContent>
          {notification.status === 'REJECTED' ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Rejected — not IHR-reportable</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {ESCALATION_STEPS.map((step, idx) => {
                const isActive = idx === currentStep;
                const isComplete = idx < currentStep;
                return (
                  <div key={step.status} className="flex items-center">
                    {idx > 0 && (
                      <ArrowRight
                        className={`h-4 w-4 mx-1 shrink-0 ${
                          isComplete ? 'text-green-600' : 'text-muted-foreground/40'
                        }`}
                      />
                    )}
                    <div
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isComplete
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isComplete && <CheckCircle className="h-3 w-3" />}
                      <span className="sm:hidden">{step.shortLabel}</span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {notification.hours_since_detection != null && !isTerminal && (
            <p className={`text-xs mt-2 ${notification.is_overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              <Clock className="h-3 w-3 inline mr-1" />
              {notification.hours_since_detection}h since detection
              {notification.is_overdue && ' — exceeds 24h IHR deadline'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {!isTerminal && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {notification.status === 'DRAFT' && (
            <Button onClick={() => setActionDialog('submit_county')}>
              <ArrowRight className="h-4 w-4 mr-1" />
              Submit to County
            </Button>
          )}
          {notification.status === 'PENDING_REVIEW' && (
            <Button onClick={() => setActionDialog('submit_county')}>
              <ArrowRight className="h-4 w-4 mr-1" />
              Submit to County
            </Button>
          )}
          {notification.status === 'SUBMITTED_COUNTY' && (
            <Button onClick={() => setActionDialog('escalate_national')}>
              <ArrowRight className="h-4 w-4 mr-1" />
              Escalate to MOH
            </Button>
          )}
          {notification.status === 'ESCALATED_NATIONAL' && (
            <Button onClick={() => setActionDialog('notify_who')}>
              <Globe className="h-4 w-4 mr-1" />
              Notify WHO
            </Button>
          )}
          {notification.status === 'NOTIFIED_WHO' && (
            <Button onClick={() => acknowledgeWHO.mutate()}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Record WHO Acknowledgement
            </Button>
          )}

          <Button variant="outline" onClick={() => setActionDialog('close')}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Close
          </Button>

          {!notification.is_who_notified && (
            <Button variant="destructive" onClick={() => setActionDialog('reject')}>
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Event Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Description</span>
              <p className="mt-0.5">{notification.event_description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground">Cases</span>
                <p className="font-medium">{notification.cases_count}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Deaths</span>
                <p className="font-medium">{notification.deaths_count}</p>
              </div>
            </div>
            {notification.affected_area && (
              <div>
                <span className="text-muted-foreground">Affected Area</span>
                <p className="mt-0.5">{notification.affected_area}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Annex 2 Positive:</span>
              <Badge variant={notification.is_annex2_positive ? 'destructive' : 'secondary'}>
                {notification.is_annex2_positive ? 'Yes' : 'No'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Location & Patient */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Location & Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {notification.patient_name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  {notification.patient_name}
                  {notification.patient_mrn && (
                    <span className="text-muted-foreground"> ({notification.patient_mrn})</span>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {notification.county_name ?? 'No county'}
                {notification.sub_county_name && `, ${notification.sub_county_name}`}
              </span>
            </div>
            {notification.reported_by_name && (
              <div>
                <span className="text-muted-foreground">Reported by</span>
                <p className="mt-0.5">{notification.reported_by_name}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk Assessment */}
        {(notification.risk_assessment || notification.response_measures) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Risk & Response</CardTitle>
                <HelpPopover content="Public health risk assessment and response measures taken as part of IHR Article 6 obligations." />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {notification.risk_assessment && (
                <div>
                  <span className="text-muted-foreground">Risk Assessment</span>
                  <p className="mt-0.5">{notification.risk_assessment}</p>
                </div>
              )}
              {notification.response_measures && (
                <div>
                  <span className="text-muted-foreground">Response Measures</span>
                  <p className="mt-0.5">{notification.response_measures}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Escalation History */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Escalation History</CardTitle>
              <HelpPopover content="Timeline of the notification through the escalation pipeline." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {notification.county_notified_at && (
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 text-blue-500" />
                <div>
                  <p className="font-medium">County Notified</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.county_notified_at)}
                    {notification.county_reviewed_by_name &&
                      ` by ${notification.county_reviewed_by_name}`}
                  </p>
                  {notification.county_notes && (
                    <p className="text-xs mt-0.5">{notification.county_notes}</p>
                  )}
                </div>
              </div>
            )}
            {notification.national_notified_at && (
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 text-purple-500" />
                <div>
                  <p className="font-medium">MOH Notified</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.national_notified_at)}
                    {notification.national_reviewed_by_name &&
                      ` by ${notification.national_reviewed_by_name}`}
                  </p>
                  {notification.national_notes && (
                    <p className="text-xs mt-0.5">{notification.national_notes}</p>
                  )}
                </div>
              </div>
            )}
            {notification.who_notified_at && (
              <div className="flex items-start gap-2">
                <Globe className="h-4 w-4 mt-0.5 text-green-500" />
                <div>
                  <p className="font-medium">WHO Notified</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.who_notified_at)}
                    {notification.who_reference_number &&
                      ` — Ref: ${notification.who_reference_number}`}
                  </p>
                </div>
              </div>
            )}
            {notification.who_acknowledged_at && (
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-600" />
                <div>
                  <p className="font-medium">WHO Acknowledged</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.who_acknowledged_at)}
                  </p>
                </div>
              </div>
            )}
            {notification.resolved_at && (
              <div className="flex items-start gap-2">
                {notification.status === 'REJECTED' ? (
                  <XCircle className="h-4 w-4 mt-0.5 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">
                    {notification.status === 'REJECTED' ? 'Rejected' : 'Closed'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(notification.resolved_at)}
                  </p>
                  {notification.resolution_notes && (
                    <p className="text-xs mt-0.5">{notification.resolution_notes}</p>
                  )}
                </div>
              </div>
            )}
            {!notification.county_notified_at && !notification.resolved_at && (
              <p className="text-muted-foreground text-xs">No escalation actions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Dialogs */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>
                {actionDialog === 'submit_county' && 'Submit to County'}
                {actionDialog === 'escalate_national' && 'Escalate to MOH'}
                {actionDialog === 'notify_who' && 'Notify WHO'}
                {actionDialog === 'close' && 'Close Notification'}
                {actionDialog === 'reject' && 'Reject Notification'}
              </DialogTitle>
              <HelpPopover
                content={
                  actionDialog === 'submit_county'
                    ? 'Submit this IHR notification to the County Disease Surveillance Coordinator for review and escalation.'
                    : actionDialog === 'escalate_national'
                      ? 'Escalate to the MOH National IHR Focal Point for assessment and WHO notification.'
                      : actionDialog === 'notify_who'
                        ? 'Record that the WHO IHR Contact Point has been notified about this event per IHR Article 6.'
                        : actionDialog === 'close'
                          ? 'Close this notification. The event has been resolved or no longer requires monitoring.'
                          : 'Reject this notification. Upon review, the event does not meet IHR reporting criteria.'
                }
              />
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog === 'notify_who' && (
              <div>
                <Label>WHO Reference Number (optional)</Label>
                <Input
                  value={whoReference}
                  onChange={(e) => setWhoReference(e.target.value)}
                  placeholder="e.g. WHO-KE-2026-001"
                />
              </div>
            )}

            <div>
              <Label>Notes {actionDialog !== 'notify_who' ? '' : '(optional)'}</Label>
              <Textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={
                  actionDialog === 'reject'
                    ? 'Reason for rejection...'
                    : 'Additional notes...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={isPending}
              variant={actionDialog === 'reject' ? 'destructive' : 'default'}
            >
              {isPending ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
