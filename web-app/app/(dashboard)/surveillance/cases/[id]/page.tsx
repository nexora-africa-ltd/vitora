'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { surveillanceApi } from '@/lib/api/surveillance';
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

  const {
    data: caseData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['notifiable-case', caseId],
    queryFn: () => surveillanceApi.getNotifiableCase(caseId),
    enabled: Number.isFinite(caseId),
  });

  const { mutateAsync: notifyCounty, isPending: notifying } = useMutation({
    mutationFn: () => surveillanceApi.notifyCounty(caseId),
    onSuccess: () => {
      toast({
        title: 'County notified',
        description: 'The case has been reported to the county health office.',
      });
      queryClient.invalidateQueries({ queryKey: ['notifiable-case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['notifiable-cases'] });
    },
    onError: () => {
      toast({
        title: 'Notification failed',
        description: 'Unable to notify the county.',
        variant: 'destructive',
      });
    },
  });

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
        <Button variant="outline" className="mt-4" onClick={() => router.push('/surveillance/cases')}>
          Back to Cases
        </Button>
      </Card>
    );
  }

  const canNotify = caseData.notification_status === 'PENDING';

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
          </div>
        }
      />

      {/* Summary Bar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/patients/${caseData.patient}`}
                className="font-medium hover:underline text-primary"
              >
                {caseData.patient_name}
              </Link>
              <span className="text-muted-foreground text-sm">• {caseData.patient_mrn}</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Detected {formatDateTime(caseData.detected_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${SEVERITY_COLORS[caseData.severity]} shrink-0`}>
              {caseData.severity}
            </Badge>
            <Badge variant={STATUS_BADGE_VARIANTS[caseData.notification_status] || 'secondary'}>
              {caseData.notification_status.replace('_', ' ')}
            </Badge>
            {caseData.is_overdue && (
              <Badge variant="destructive" className="shrink-0">
                <AlertTriangle className="h-3 w-3 mr-1" />
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
                  <span className={caseData.is_overdue ? 'text-destructive font-medium' : ''}>
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
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm whitespace-pre-wrap">{caseData.investigation_notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between text-xs text-muted-foreground">
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
      <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
        <span className="text-sm font-medium text-muted-foreground shrink-0">{label}:</span>
        <span className="text-sm break-words">{value}</span>
      </div>
    </div>
  );
}
