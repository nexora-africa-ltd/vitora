'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { surveillanceApi } from '@/lib/api/surveillance';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { toast } from '@/lib/hooks/use-toast';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  Clock,
  FlaskConical,
  MapPin,
  User,
  FileText,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';

const STATUS_BADGE_VARIANTS: Record<
  string,
  'secondary' | 'warning' | 'info' | 'success' | 'destructive'
> = {
  PENDING: 'warning',
  NOTIFIED: 'info',
  ACKNOWLEDGED: 'info',
  INVESTIGATED: 'info',
  CLOSED: 'success',
};

const SEVERITY_COLORS: Record<string, string> = {
  MILD: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  SEVERE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const OUTCOME_COLORS: Record<string, string> = {
  RECOVERING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  RECOVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  HOSPITALIZED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  DIED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function NotifiableCaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = Number(params?.id);
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selectedSeverity, setSelectedSeverity] = useState<
    'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL'
  >('MODERATE');
  const [selectedOnsetDate, setSelectedOnsetDate] = useState('');
  const [selectedLabConfirmed, setSelectedLabConfirmed] = useState<'true' | 'false'>('false');

  const {
    data: caseData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['notifiable-case', caseId],
    queryFn: () => surveillanceApi.getNotifiableCase(caseId),
    enabled: Number.isFinite(caseId),
  });

  const { data: deliveryStatus = [] } = useQuery({
    queryKey: ['notifiable-case-deliveries', caseId],
    queryFn: () => surveillanceApi.listCaseNotificationDeliveries(caseId),
    enabled: Number.isFinite(caseId),
  });

  const { mutateAsync: notifyCounty, isPending: notifying } = useMutation({
    mutationFn: () => surveillanceApi.notifyCounty(caseId),
    onSuccess: (data) => {
      const isPendingConfirmation = data.notification_status === 'PENDING';
      toast({
        title: isPendingConfirmation ? 'Notification accepted' : 'County notified',
        description: isPendingConfirmation
          ? 'Email accepted and waiting for delivery confirmation from provider.'
          : 'The case has been reported to the county health office.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case-deliveries', caseId] });
    },
    onError: (error: unknown) => {
      const msg =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Unable to notify the county.';
      toast({
        title: 'Notification failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: retryDeliveries, isPending: retryingDeliveries } = useMutation({
    mutationFn: () => surveillanceApi.retryCaseNotificationDeliveries(caseId),
    onSuccess: () => {
      toast({
        title: 'Retry triggered',
        description: 'County notification retries have been processed.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case-deliveries', caseId] });
    },
    onError: () => {
      toast({
        title: 'Retry failed',
        description: 'Unable to retry county notifications.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: markInvestigated, isPending: markingInvestigated } = useMutation({
    mutationFn: () => surveillanceApi.markCaseInvestigated(caseId),
    onSuccess: () => {
      toast({
        title: 'Case updated',
        description: 'Case moved to under investigation.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: (error: unknown) => {
      const msg =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Unable to mark case as investigated.';
      toast({
        title: 'Update failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: closeCase, isPending: closingCase } = useMutation({
    mutationFn: () => surveillanceApi.closeCase(caseId),
    onSuccess: () => {
      toast({
        title: 'Case closed',
        description: 'Case status moved to closed.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: (error: unknown) => {
      const msg =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Unable to close case.';
      toast({
        title: 'Close failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: updateSeverity, isPending: updatingSeverity } = useMutation({
    mutationFn: (severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL') =>
      surveillanceApi.updateCaseSeverity(caseId, severity),
    onSuccess: () => {
      toast({
        title: 'Severity updated',
        description: 'Case severity has been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: () => {
      toast({
        title: 'Update failed',
        description: 'Unable to update case severity.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: updateOnsetDate, isPending: updatingOnsetDate } = useMutation({
    mutationFn: (onsetDate: string) => surveillanceApi.updateCaseOnsetDate(caseId, onsetDate),
    onSuccess: () => {
      toast({
        title: 'Onset date updated',
        description: 'Case onset date has been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: () => {
      toast({
        title: 'Update failed',
        description: 'Unable to update onset date.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: updateLabConfirmed, isPending: updatingLabConfirmed } = useMutation({
    mutationFn: (laboratoryConfirmed: boolean) =>
      surveillanceApi.updateCaseLaboratoryConfirmed(caseId, laboratoryConfirmed),
    onSuccess: () => {
      toast({
        title: 'Lab status updated',
        description: 'Laboratory confirmation has been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: () => {
      toast({
        title: 'Update failed',
        description: 'Unable to update laboratory confirmation.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (caseData?.severity) {
      setSelectedSeverity(caseData.severity);
    }
  }, [caseData?.severity]);

  useEffect(() => {
    if (caseData) {
      setSelectedOnsetDate(caseData.onset_date ?? '');
      setSelectedLabConfirmed(caseData.laboratory_confirmed ? 'true' : 'false');
    }
  }, [caseData]);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <Card className="p-6 text-center text-destructive">
        <p>Failed to load case details</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/surveillance/cases')}
        >
          Back to Cases
        </Button>
      </Card>
    );
  }

  const canNotify = caseData.notification_status === 'PENDING';
  const canManageCaseStatus = hasPermission('surveillance.change_notifiablecase');
  const canEditSeverity = hasPermission('surveillance.change_notifiablecase');
  const canEditOnsetDate = hasPermission('surveillance.change_notifiablecase');
  const canOverrideLabConfirmed = hasPermission('surveillance.change_notifiablecase');
  const canMarkInvestigated =
    canManageCaseStatus && ['NOTIFIED', 'ACKNOWLEDGED'].includes(caseData.notification_status);
  const canCloseCase =
    canManageCaseStatus &&
    ['NOTIFIED', 'ACKNOWLEDGED', 'INVESTIGATED'].includes(caseData.notification_status);
  const hasRetryableDeliveries = deliveryStatus.some((item) =>
    ['FAILED', 'RETRY_SCHEDULED'].includes(item.status)
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${caseData.disease_name} Case`}
        helpContent="View details of a notifiable disease case including patient information, notification status, and investigation details."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canNotify && (
              <Button onClick={() => notifyCounty()} disabled={notifying}>
                {notifying ? 'Notifying...' : 'Notify County'}
              </Button>
            )}
            {canMarkInvestigated && (
              <Button
                variant="outline"
                onClick={() => markInvestigated()}
                disabled={markingInvestigated}
              >
                {markingInvestigated ? 'Updating...' : 'Investigate'}
              </Button>
            )}
            {canCloseCase && (
              <Button variant="outline" onClick={() => closeCase()} disabled={closingCase}>
                {closingCase ? 'Closing...' : 'Close'}
              </Button>
            )}
            {hasRetryableDeliveries && (
              <Button
                variant="outline"
                onClick={() => retryDeliveries()}
                disabled={retryingDeliveries}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {retryingDeliveries ? 'Retrying...' : 'Retry Delivery'}
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/patients/${caseData.patient}`}
                className="font-medium text-primary hover:underline"
              >
                {caseData.patient_name}
              </Link>
              <span className="text-sm text-muted-foreground">• {caseData.patient_mrn}</span>
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Detected {formatDateTime(caseData.detected_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${SEVERITY_COLORS[caseData.severity]} shrink-0`}>
              {caseData.severity}
            </Badge>
            <Badge variant={STATUS_BADGE_VARIANTS[caseData.notification_status] || 'secondary'}>
              {caseData.notification_status.replace('_', ' ')}
            </Badge>
            {caseData.is_overdue && (
              <Badge variant="destructive" className="shrink-0">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Overdue
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Case Information */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Case Information</CardTitle>
              <HelpPopover content="Details about the disease case and its classification." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Disease"
              value={caseData.disease_name}
            />
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Category"
              value={
                <Badge variant={caseData.is_immediate ? 'destructive' : 'secondary'}>
                  {caseData.disease_category}
                </Badge>
              }
            />
            <InfoRow
              icon={<Clock className="h-4 w-4" />}
              label="Onset Date"
              value={caseData.onset_date ? formatDate(caseData.onset_date) : 'Unknown'}
            />
            {canEditOnsetDate && (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium">Update Onset Date</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="date"
                    value={selectedOnsetDate}
                    onChange={(event) => setSelectedOnsetDate(event.target.value)}
                    className="sm:w-56"
                  />
                  <Button
                    variant="outline"
                    disabled={
                      updatingOnsetDate ||
                      !selectedOnsetDate ||
                      selectedOnsetDate === (caseData.onset_date ?? '')
                    }
                    onClick={() => updateOnsetDate(selectedOnsetDate)}
                  >
                    {updatingOnsetDate ? 'Saving...' : 'Save Onset Date'}
                  </Button>
                </div>
              </div>
            )}
            <InfoRow
              icon={<FlaskConical className="h-4 w-4" />}
              label="Lab Confirmed"
              value={
                caseData.laboratory_confirmed ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" /> No
                  </span>
                )
              }
            />
            {canOverrideLabConfirmed && (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium">Override Lab Confirmation</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={selectedLabConfirmed}
                    onValueChange={(value) => setSelectedLabConfirmed(value as 'true' | 'false')}
                  >
                    <SelectTrigger className="sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Confirmed</SelectItem>
                      <SelectItem value="false">Not Confirmed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={
                      updatingLabConfirmed ||
                      (selectedLabConfirmed === 'true') === caseData.laboratory_confirmed
                    }
                    onClick={() => updateLabConfirmed(selectedLabConfirmed === 'true')}
                  >
                    {updatingLabConfirmed ? 'Saving...' : 'Save Lab Status'}
                  </Button>
                </div>
              </div>
            )}
            {caseData.lab_result_date && (
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Lab Result Date"
                value={formatDate(caseData.lab_result_date)}
              />
            )}
            <InfoRow
              icon={<User className="h-4 w-4" />}
              label="Outcome"
              value={
                <Badge className={OUTCOME_COLORS[caseData.outcome] || OUTCOME_COLORS.UNKNOWN}>
                  {caseData.outcome}
                </Badge>
              }
            />
            {canEditSeverity && (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium">Update Severity</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={selectedSeverity}
                    onValueChange={(value) =>
                      setSelectedSeverity(value as 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL')
                    }
                  >
                    <SelectTrigger className="sm:w-56">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MILD">Mild</SelectItem>
                      <SelectItem value="MODERATE">Moderate</SelectItem>
                      <SelectItem value="SEVERE">Severe</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={updatingSeverity || selectedSeverity === caseData.severity}
                    onClick={() => updateSeverity(selectedSeverity)}
                  >
                    {updatingSeverity ? 'Saving...' : 'Save Severity'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Notification Status</CardTitle>
              <HelpPopover content="Status of reporting this case to county/national health authorities." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              icon={<Clock className="h-4 w-4" />}
              label="Status"
              value={
                <Badge variant={STATUS_BADGE_VARIANTS[caseData.notification_status] || 'secondary'}>
                  {caseData.notification_status}
                </Badge>
              }
            />
            {caseData.notification_deadline && (
              <InfoRow
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Deadline"
                value={
                  <span className={caseData.is_overdue ? 'font-medium text-destructive' : ''}>
                    {formatDateTime(caseData.notification_deadline)}
                    {caseData.hours_until_deadline > 0 &&
                      ` (${caseData.hours_until_deadline}h remaining)`}
                  </span>
                }
              />
            )}
            {caseData.notified_at && (
              <InfoRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Notified At"
                value={formatDateTime(caseData.notified_at)}
              />
            )}
            {caseData.notified_by_name && (
              <InfoRow
                icon={<User className="h-4 w-4" />}
                label="Notified By"
                value={caseData.notified_by_name}
              />
            )}
            {caseData.reported_by_name && (
              <InfoRow
                icon={<User className="h-4 w-4" />}
                label="Reported By"
                value={caseData.reported_by_name}
              />
            )}
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Location</CardTitle>
              <HelpPopover content="Geographic location information for epidemiological tracking." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              label="County"
              value={caseData.county_name || 'Not specified'}
            />
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              label="Sub-County"
              value={caseData.sub_county_name || 'Not specified'}
            />
          </CardContent>
        </Card>

        {/* Contact Tracing */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Contact Tracing</CardTitle>
              <HelpPopover content="Status of contact tracing investigation for this case." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              icon={<Users className="h-4 w-4" />}
              label="Initiated"
              value={
                caseData.contact_tracing_initiated ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" /> No
                  </span>
                )
              }
            />
            <InfoRow
              icon={<Users className="h-4 w-4" />}
              label="Contacts Identified"
              value={caseData.contacts_identified}
            />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/surveillance/cases/${caseId}/contacts`}>Manage Contacts</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Delivery Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">County Delivery Status</CardTitle>
              <HelpPopover content="Outbound county notification attempts by channel with retry state." />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveryStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No delivery attempts yet.</p>
            ) : (
              deliveryStatus.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-md border border-border/60 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{delivery.channel}</span>
                    <Badge
                      variant={
                        delivery.status === 'DELIVERED' ||
                        (delivery.channel === 'SMS' && delivery.status === 'SENT')
                          ? 'success'
                          : delivery.status === 'FAILED' || delivery.status === 'BOUNCED'
                            ? 'destructive'
                            : delivery.status === 'SENT'
                              ? 'info'
                              : 'warning'
                      }
                    >
                      {delivery.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">Recipient: {delivery.recipient_masked}</p>
                  <p className="text-muted-foreground">
                    Attempts: {delivery.attempt_count} / {delivery.max_retry_attempts}
                  </p>
                  {delivery.last_error ? (
                    <p className="mt-1 text-destructive">Last error: {delivery.last_error}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Investigation Notes */}
      {caseData.investigation_notes && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Investigation Notes</CardTitle>
              <HelpPopover content="Additional notes from the case investigation." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="whitespace-pre-wrap text-sm">{caseData.investigation_notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
            <span>Created: {formatDateTime(caseData.created_at)}</span>
            <span>Last Updated: {formatDateTime(caseData.updated_at)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{label}:</span>
        <span className="break-words text-sm">{value}</span>
      </div>
    </div>
  );
}
