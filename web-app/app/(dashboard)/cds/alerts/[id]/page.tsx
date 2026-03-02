'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldOff,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { cdsApi } from '@/lib/api/cds';
import { formatDateTime } from '@/lib/utils/format';
import { toast } from 'sonner';

const STATUS_BADGE_VARIANTS: Record<string, 'warning' | 'info' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  PENDING: 'warning',
  ACKNOWLEDGED: 'info',
  ACCEPTED: 'success',
  OVERRIDDEN: 'destructive',
  DISMISSED: 'secondary',
  AUTO_RESOLVED: 'outline',
};

const PRIORITY_BADGE_VARIANTS: Record<string, 'destructive' | 'warning' | 'info' | 'secondary' | 'outline'> = {
  CRITICAL: 'destructive',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'secondary',
  INFO: 'outline',
};

const CATEGORY_LABELS: Record<string, string> = {
  DRUG_ALLERGY: 'Drug-Allergy Interaction',
  DRUG_DRUG: 'Drug-Drug Interaction',
  CRITICAL_LAB: 'Critical Lab Value',
  VITAL_SIGN: 'Vital Sign Alert',
  GUIDELINE: 'Clinical Guideline',
  PREVENTIVE: 'Preventive Care',
  DOSAGE: 'Dosage Check',
};

export default function CDSAlertDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const alertId = Number(id);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const { data: alert, isLoading } = useQuery({
    queryKey: ['cds-alert', alertId],
    queryFn: () => cdsApi.getAlert(alertId),
    enabled: !isNaN(alertId),
  });

  const invalidateAlertQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['cds-alert', alertId] });
    queryClient.invalidateQueries({ queryKey: ['cds-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['cds-dashboard'] });
  };

  const acknowledgeMutation = useMutation({
    mutationFn: () => cdsApi.acknowledgeAlert(alertId),
    onSuccess: () => { invalidateAlertQueries(); toast.success('Alert acknowledged'); },
    onError: () => toast.error('Failed to acknowledge alert'),
  });

  const acceptMutation = useMutation({
    mutationFn: () => cdsApi.acceptAlert(alertId),
    onSuccess: () => { invalidateAlertQueries(); toast.success('Recommendation accepted'); },
    onError: () => toast.error('Failed to accept'),
  });

  const overrideMutation = useMutation({
    mutationFn: (reason: string) => cdsApi.overrideAlert(alertId, reason),
    onSuccess: () => {
      invalidateAlertQueries();
      setOverrideDialogOpen(false);
      setOverrideReason('');
      toast.success('Alert overridden');
    },
    onError: () => toast.error('Failed to override alert'),
  });

  const dismissMutation = useMutation({
    mutationFn: () => cdsApi.dismissAlert(alertId),
    onSuccess: () => { invalidateAlertQueries(); toast.success('Alert dismissed'); },
    onError: () => toast.error('Failed to dismiss'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="CDS Alert" />
        <Card className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </Card>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="space-y-4">
        <PageHeader title="CDS Alert" />
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Alert not found</p>
        </Card>
      </div>
    );
  }

  const isPending = alert.is_pending;
  const anyPending =
    acknowledgeMutation.isPending ||
    acceptMutation.isPending ||
    overrideMutation.isPending ||
    dismissMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Alert: ${alert.rule_code}`}
        helpContent="Review CDS alert details. Take action by acknowledging, accepting the recommendation, overriding with justification, or dismissing the alert."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {alert.patient_name}
            <span className="text-muted-foreground"> • {alert.patient_mrn}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {alert.rule_name} • {CATEGORY_LABELS[alert.category] ?? alert.category}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={PRIORITY_BADGE_VARIANTS[alert.priority] ?? 'secondary'}>
            {alert.is_critical && <AlertTriangle className="h-3 w-3 mr-1" />}
            {alert.priority}
          </Badge>
          <Badge variant={STATUS_BADGE_VARIANTS[alert.status] ?? 'secondary'}>
            {alert.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {/* Alert Message */}
      <Card className={`border-l-4 ${
        alert.is_critical ? 'border-l-destructive bg-destructive/5' :
        alert.priority === 'HIGH' ? 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20' :
        'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
      }`}>
        <CardContent className="pt-4">
          <p className="font-medium text-sm">{alert.message}</p>
          {alert.suggestion && (
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>Suggestion:</strong> {alert.suggestion}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons (when pending) */}
      {isPending && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => acknowledgeMutation.mutate()}
            disabled={anyPending}
          >
            <Eye className="h-4 w-4 mr-1" />
            Acknowledge
          </Button>
          <Button
            size="sm"
            onClick={() => acceptMutation.mutate()}
            disabled={anyPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Accept Recommendation
          </Button>
          <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={anyPending}>
                <ShieldOff className="h-4 w-4 mr-1" />
                Override
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Override Alert</DialogTitle>
                  <HelpPopover content="Provide a clinical justification for overriding this CDS alert. The reason is recorded in the audit trail. Minimum 10 characters." />
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Clinical Justification *</Label>
                  <Textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Explain clinical reason for overriding this alert (min 10 characters)..."
                    rows={4}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    disabled={overrideReason.length < 10 || overrideMutation.isPending}
                    onClick={() => overrideMutation.mutate(overrideReason)}
                  >
                    {overrideMutation.isPending ? 'Overriding...' : 'Confirm Override'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismissMutation.mutate()}
            disabled={anyPending}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Dismiss
          </Button>
        </div>
      )}

      {/* Override Reason (if overridden) */}
      {alert.status === 'OVERRIDDEN' && alert.override_reason && (
        <Card className="border-l-4 border-l-destructive">
          <CardHeader><CardTitle className="text-base">Override Reason</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{alert.override_reason}</p>
            {alert.resolved_by_name && (
              <p className="text-xs text-muted-foreground mt-2">
                Overridden by {alert.resolved_by_name}
                {alert.resolved_at && <> on {formatDateTime(alert.resolved_at)}</>}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Details */}
      {alert.details && Object.keys(alert.details).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Evaluation Details</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(alert.details, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Evidence Level</div>
          <div className="text-sm font-medium">Level {alert.evidence_level}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Action Type</div>
          <div className="text-sm font-medium">{alert.action_type}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Created</div>
          <div className="text-sm font-medium">{formatDateTime(alert.created_at)}</div>
          {alert.age_hours != null && (
            <div className="text-xs text-muted-foreground">{alert.age_hours.toFixed(1)} hours ago</div>
          )}
        </Card>
        {alert.resolved_at && (
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Resolved</div>
            <div className="text-sm font-medium">{formatDateTime(alert.resolved_at)}</div>
            {alert.resolved_by_name && (
              <div className="text-xs text-muted-foreground">by {alert.resolved_by_name}</div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
