'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Check, Clock, User, MapPin, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { inpatientApi } from '@/lib/api/inpatient';
import type { SupervisorAlert } from '@/lib/types/inpatient';
import { toast } from 'sonner';
import { HelpPopover } from '@/components/shared/help-popover';

interface SupervisorAlertsPanelProps {
  className?: string;
}

export function SupervisorAlertsPanel({ className }: SupervisorAlertsPanelProps) {
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<SupervisorAlert | null>(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState('');
  const [isAcknowledgeDialogOpen, setIsAcknowledgeDialogOpen] = useState(false);

  // Fetch alerts
  const { data: alertsResponse, isLoading, error } = useQuery({
    queryKey: ['supervisor-alerts'],
    queryFn: () => inpatientApi.getSupervisorAlerts(undefined, 50),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: (data: { admissionId: number; notes: string }) =>
      inpatientApi.acknowledgeAlert({
        admission_id: data.admissionId,
        notes: data.notes,
      }),
    onSuccess: () => {
      toast.success('Alert acknowledged successfully');
      queryClient.invalidateQueries({ queryKey: ['supervisor-alerts'] });
      setIsAcknowledgeDialogOpen(false);
      setSelectedAlert(null);
      setAcknowledgeNotes('');
    },
    onError: (err: Error) => {
      toast.error(`Failed to acknowledge alert: ${err.message}`);
    },
  });

  const handleAcknowledge = (alert: SupervisorAlert) => {
    setSelectedAlert(alert);
    setAcknowledgeNotes('');
    setIsAcknowledgeDialogOpen(true);
  };

  const handleConfirmAcknowledge = () => {
    if (!selectedAlert) return;
    acknowledgeMutation.mutate({
      admissionId: selectedAlert.admission_id,
      notes: acknowledgeNotes,
    });
  };

  const pendingAlerts = alertsResponse?.alerts.filter((a) => !a.is_acknowledged) ?? [];
  const acknowledgedAlerts = alertsResponse?.alerts.filter((a) => a.is_acknowledged) ?? [];

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Critical Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error loading alerts</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load alerts'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Critical Constraint Alerts
              {pendingAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingAlerts.length} pending
                </Badge>
              )}
            </CardTitle>
            <HelpPopover content="Critical constraint violations that were overridden during admission. Supervisors should acknowledge and review these alerts. Admission constraint violations requiring supervisor review." />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Pending</span> ({pendingAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="acknowledged" className="gap-2">
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">Acknowledged</span> ({acknowledgedAlerts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4 space-y-3">
              {pendingAlerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Check className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>No pending alerts</p>
                  <p className="text-sm">All critical violations have been acknowledged</p>
                </div>
              ) : (
                pendingAlerts.map((alert) => (
                  <AlertCard
                    key={alert.admission_id}
                    alert={alert}
                    onAcknowledge={() => handleAcknowledge(alert)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="acknowledged" className="mt-4 space-y-3">
              {acknowledgedAlerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No acknowledged alerts</p>
                </div>
              ) : (
                acknowledgedAlerts.map((alert) => (
                  <AlertCard key={alert.admission_id} alert={alert} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Acknowledge Dialog */}
      <Dialog open={isAcknowledgeDialogOpen} onOpenChange={setIsAcknowledgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Acknowledge Alert</DialogTitle>
              <HelpPopover content="Acknowledging this alert indicates you have reviewed the constraint violation and approve the override decision." />
            </div>
            <DialogDescription>
              Confirm you have reviewed the critical constraint violation for admission{' '}
              <strong>{selectedAlert?.admission_number}</strong>.
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="font-medium text-destructive mb-2">Critical Violations:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {selectedAlert.critical_violations.map((v, i) => (
                    <li key={i}>{typeof v === 'string' ? v : (v as { message?: string }).message ?? 'Unknown violation'}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes about your review..."
                  value={acknowledgeNotes}
                  onChange={(e) => setAcknowledgeNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsAcknowledgeDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAcknowledge}
              disabled={acknowledgeMutation.isPending}
              className="w-full sm:w-auto"
            >
              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AlertCardProps {
  alert: SupervisorAlert;
  onAcknowledge?: () => void;
}

function AlertCard({ alert, onAcknowledge }: AlertCardProps) {
  const timeAgo = formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true });

  return (
    <div
      className={`p-4 rounded-lg border ${
        alert.is_acknowledged
          ? 'bg-muted/50 border-muted'
          : 'bg-destructive/5 border-destructive/30'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{alert.patient_name}</span>
            <Badge variant="outline" className="text-xs">
              {alert.patient_mrn}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Admission: {alert.admission_number}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {alert.ward_name} - Bed {alert.bed_number}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Admitted by: {alert.admitted_by}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          </div>

          {/* Violations */}
          <div className="mt-3">
            <p className="text-sm font-medium text-destructive mb-1">Violations:</p>
            <div className="flex flex-wrap gap-1">
              {alert.critical_violations.map((v, i) => (
                <Badge key={i} variant="destructive" className="text-xs">
                  {typeof v === 'string' ? v : (v as { code?: string; message?: string }).code ?? 'UNKNOWN'}
                </Badge>
              ))}
            </div>
          </div>

          {/* Override reason */}
          {alert.override_reason && (
            <div className="mt-2">
              <p className="text-sm">
                <span className="font-medium">Override reason:</span>{' '}
                <span className="text-muted-foreground">{alert.override_reason}</span>
              </p>
            </div>
          )}

          {/* Acknowledgment info */}
          {alert.is_acknowledged && alert.acknowledged_by && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              <span>
                Acknowledged by {alert.acknowledged_by}
                {alert.acknowledged_at && (
                  <> on {format(new Date(alert.acknowledged_at), 'MMM d, yyyy h:mm a')}</>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Action button */}
        {!alert.is_acknowledged && onAcknowledge && (
          <Button
            size="sm"
            onClick={onAcknowledge}
            className="shrink-0 w-full sm:w-auto"
          >
            <Check className="h-4 w-4 mr-1" />
            Acknowledge
          </Button>
        )}
      </div>
    </div>
  );
}
