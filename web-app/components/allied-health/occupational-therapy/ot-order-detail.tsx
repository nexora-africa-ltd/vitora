/**
 * Occupational Therapy Order Detail
 * Shows full order information with sessions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Calendar,
  User,
  Wrench,
  Target,
  CheckCircle,
  XCircle,
  Play,
  Edit,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { OrderStatusBadge, PriorityBadge, SessionProgress } from '@/components/allied-health';
import {
  useOTOrder,
  useOTOrderSessions,
  useApproveOTOrder,
  useRejectOTOrder,
  useStartOTOrder,
  useCompleteOTOrder,
  useCancelOTOrder,
} from '@/lib/hooks/use-occupational-therapy';
import { useToast } from '@/lib/hooks/use-toast';

interface OTOrderDetailProps {
  orderId: number;
}

export function OTOrderDetail({ orderId }: OTOrderDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const { data: order, isLoading, error } = useOTOrder(orderId);
  const { data: sessionsData, isLoading: sessionsLoading } = useOTOrderSessions(orderId);

  const approveMutation = useApproveOTOrder();
  const rejectMutation = useRejectOTOrder();
  const startMutation = useStartOTOrder();
  const completeMutation = useCompleteOTOrder();
  const cancelMutation = useCancelOTOrder();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load order details
      </div>
    );
  }

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'approve':
          await approveMutation.mutateAsync(orderId);
          toast({ title: 'Order approved' });
          break;
        case 'reject':
          await rejectMutation.mutateAsync({ id: orderId });
          toast({ title: 'Order rejected' });
          break;
        case 'start':
          await startMutation.mutateAsync(orderId);
          toast({ title: 'Treatment started' });
          break;
        case 'complete':
          await completeMutation.mutateAsync(orderId);
          toast({ title: 'Treatment completed' });
          break;
        case 'cancel':
          await cancelMutation.mutateAsync({ id: orderId });
          toast({ title: 'Order cancelled' });
          break;
      }
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
    setConfirmAction(null);
  };

  const canApprove = order.status === 'PENDING';
  const canStart = order.status === 'APPROVED';
  const canComplete = order.status === 'IN_PROGRESS' && order.sessions_completed >= order.total_sessions;
  const canCancel = ['PENDING', 'APPROVED', 'IN_PROGRESS'].includes(order.status);
  const canEdit = !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status);

  const sessions = sessionsData?.results || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.order_number || `#${orderId}`}`}
        helpContent="View occupational therapy order details, functional assessments, and session history."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} showIcon />
          </div>
          <p className="text-muted-foreground mt-1">
            Created {format(parseISO(order.ordered_at), 'PPP')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => router.push(`/allied-health/occupational-therapy/orders/${orderId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canApprove && (
            <>
              <Button onClick={() => setConfirmAction('approve')}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button variant="destructive" onClick={() => setConfirmAction('reject')}>
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          {canStart && (
            <Button onClick={() => setConfirmAction('start')}>
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
          {canComplete && (
            <Button onClick={() => setConfirmAction('complete')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" onClick={() => setConfirmAction('cancel')}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Treatment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient & Treatment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Patient</h4>
                <p className="font-medium">{order.patient_name}</p>
                <p className="text-sm text-muted-foreground">{order.patient_mrn}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Treatment Type</h4>
                <p className="font-medium">{order.treatment_type_name}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Ordered By</h4>
                <p className="font-medium">{order.ordered_by_name || 'N/A'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Assigned Therapist</h4>
                <p className="font-medium">
                  {order.assigned_therapist_name || 'Not assigned'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Clinical Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{order.clinical_indication || 'No clinical notes'}</p>
            </CardContent>
          </Card>



          {/* Goals */}
          {(order.short_term_goals || order.long_term_goals) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Goals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.short_term_goals && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Short-Term Goals</h4>
                    <p className="whitespace-pre-wrap">{order.short_term_goals}</p>
                  </div>
                )}
                {order.long_term_goals && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Long-Term Goals</h4>
                    <p className="whitespace-pre-wrap">{order.long_term_goals}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Sessions
                </span>
                {order.status === 'IN_PROGRESS' && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/allied-health/occupational-therapy/orders/${orderId}/sessions/new`)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Session
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <LoadingSpinner />
              ) : sessions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No sessions recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/allied-health/occupational-therapy/sessions/${session.id}`)}
                    >
                      <div>
                        <p className="font-medium">Session {session.session_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(session.scheduled_date), 'PPP')}
                        </p>
                      </div>
                      <Badge variant={session.status === 'COMPLETED' ? 'default' : 'outline'}>
                        {session.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionProgress
                completed={order.sessions_completed}
                total={order.total_sessions}
              />
            </CardContent>
          </Card>

          {/* Treatment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Treatment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sessions</span>
                <span className="font-medium">{order.total_sessions}</span>
              </div>
              {order.frequency && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frequency</span>
                  <span className="font-medium">{order.frequency}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-sm">{format(parseISO(order.ordered_at), 'PP')}</span>
              </div>
              {order.completed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-sm">{format(parseISO(order.completed_at), 'PP')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'approve' && 'Approve Order'}
              {confirmAction === 'reject' && 'Reject Order'}
              {confirmAction === 'start' && 'Start Treatment'}
              {confirmAction === 'complete' && 'Complete Treatment'}
              {confirmAction === 'cancel' && 'Cancel Order'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'approve' &&
                'This will approve the order and assign it for therapy.'}
              {confirmAction === 'reject' &&
                'This will reject the order. This action cannot be undone.'}
              {confirmAction === 'start' &&
                'This will start the treatment and enable session recording.'}
              {confirmAction === 'complete' &&
                'This will mark the treatment as completed.'}
              {confirmAction === 'cancel' &&
                'This will cancel the order. Any scheduled sessions will also be cancelled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              className={
                confirmAction === 'reject' || confirmAction === 'cancel'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : ''
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
