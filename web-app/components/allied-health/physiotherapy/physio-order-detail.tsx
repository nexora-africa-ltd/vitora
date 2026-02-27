/**
 * Physiotherapy Order Detail
 * Shows full order information with sessions
 */

'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Clock,
  User,
  Activity,
  Target,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  Pause,
  Plus,
} from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { OrderStatusBadge, PriorityBadge, SessionProgress } from '@/components/allied-health';
import { PhysioSessionTable } from './physio-session-table';
import {
  usePhysioOrder,
  usePhysioOrderSessions,
  useApprovePhysioOrder,
  useRejectPhysioOrder,
  useStartPhysioOrder,
  useCompletePhysioOrder,
  useCancelPhysioOrder,
  useGeneratePhysioSessions,
} from '@/lib/hooks/use-physiotherapy';
import type { PhysiotherapyOrder } from '@/lib/types/physiotherapy';
import { useToast } from '@/lib/hooks/use-toast';

interface PhysioOrderDetailProps {
  orderId: number;
}

export function PhysioOrderDetail({ orderId }: PhysioOrderDetailProps) {
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const { data: order, isLoading, error } = usePhysioOrder(orderId);
  const { data: sessionsData, isLoading: sessionsLoading } = usePhysioOrderSessions(orderId);

  const approveMutation = useApprovePhysioOrder();
  const rejectMutation = useRejectPhysioOrder();
  const startMutation = useStartPhysioOrder();
  const completeMutation = useCompletePhysioOrder();
  const cancelMutation = useCancelPhysioOrder();
  const generateSessionsMutation = useGeneratePhysioSessions();

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
          toast({ title: 'Order approved successfully' });
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
        case 'generate':
          await generateSessionsMutation.mutateAsync({ id: orderId });
          toast({ title: 'Sessions generated' });
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
  const canComplete = order.status === 'IN_PROGRESS' && order.completed_sessions >= order.total_sessions;
  const canCancel = ['PENDING', 'APPROVED', 'IN_PROGRESS'].includes(order.status);
  const canGenerateSessions = ['APPROVED', 'IN_PROGRESS'].includes(order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.order_number}</h1>
            <OrderStatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} showIcon />
          </div>
          <p className="text-muted-foreground mt-1">
            Created {format(parseISO(order.created_at), 'PPP')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
              Start Treatment
            </Button>
          )}
          {canGenerateSessions && (
            <Button variant="outline" onClick={() => handleAction('generate')}>
              <Plus className="h-4 w-4 mr-2" />
              Generate Sessions
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
                <p className="font-medium">{order.patient.full_name}</p>
                <p className="text-sm text-muted-foreground">{order.patient.mrn}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Treatment Type</h4>
                <p className="font-medium">{order.treatment_type.name}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {order.treatment_type.category.toLowerCase().replace('_', ' ')}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Ordered By</h4>
                <p className="font-medium">{order.ordered_by.full_name}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Assigned Therapist</h4>
                <p className="font-medium">
                  {order.assigned_therapist?.full_name || 'Not assigned'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Clinical Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{order.clinical_notes || 'No clinical notes'}</p>
            </CardContent>
          </Card>

          {/* Goals & Precautions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Goals & Safety
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.goals && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Goals</h4>
                  <p className="whitespace-pre-wrap">{order.goals}</p>
                </div>
              )}
              {order.contraindications && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Contraindications
                  </h4>
                  <p className="whitespace-pre-wrap text-destructive">
                    {order.contraindications}
                  </p>
                </div>
              )}
              {order.precautions && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Precautions</h4>
                  <p className="whitespace-pre-wrap">{order.precautions}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sessions Tab */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Sessions
                <HelpPopover content="View and manage therapy sessions for this order" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <LoadingSpinner />
              ) : (
                <PhysioSessionTable
                  sessions={sessionsData?.results || []}
                  orderId={orderId}
                />
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
                completed={order.completed_sessions}
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
                <span className="font-medium">{order.recommended_sessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frequency</span>
                <span className="font-medium">{order.frequency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{order.duration_per_session} min</span>
              </div>
              {order.equipment_needed && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Equipment</span>
                  <span className="font-medium">{order.equipment_needed}</span>
                </div>
              )}
              {order.treatment_type?.sha_claimable && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SHA Code</span>
                  <Badge variant="outline">{order.treatment_type?.sha_intervention_code}</Badge>
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
                'This will approve the order and make it available for session scheduling.'}
              {confirmAction === 'reject' &&
                'This will reject the order. This action cannot be undone.'}
              {confirmAction === 'start' &&
                'This will start the treatment and enable session completion.'}
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
