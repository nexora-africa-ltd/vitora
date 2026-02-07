/**
 * Imaging order detail view component.
 * Displays full order information with status timeline and actions.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  DollarSign,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';
import { toast } from '@/lib/hooks';
import {
  useImagingOrder,
  useSubmitImagingOrder,
  useScheduleImagingOrder,
  useStartImagingOrder,
  useCompleteImagingOrder,
  useCancelImagingOrder,
} from '@/lib/hooks/use-imaging';
import {
  ImagingOrder,
  ImagingOrderStatus,
  LATERALITY_LABELS,
} from '@/lib/types/imaging';
import { OrderStatusBadge } from './order-status-badge';
import { PriorityBadge } from './priority-badge';
import { ModalityBadge } from './modality-badge';

interface ImagingOrderDetailProps {
  orderNumber: string;
}

// Status timeline steps
const STATUS_STEPS: { status: ImagingOrderStatus; label: string }[] = [
  { status: 'ORDERED', label: 'Ordered' },
  { status: 'SCHEDULED', label: 'Scheduled' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'COMPLETED', label: 'Completed' },
  { status: 'REPORTED', label: 'Reported' },
];

function getStatusIndex(status: ImagingOrderStatus): number {
  if (status === 'DRAFT') return -1;
  if (status === 'CANCELLED') return -2;
  return STATUS_STEPS.findIndex((s) => s.status === status);
}

export function ImagingOrderDetail({ orderNumber }: ImagingOrderDetailProps) {
  const router = useRouter();
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const { data: order, isLoading, error } = useImagingOrder(orderNumber);
  const submitOrder = useSubmitImagingOrder();
  const scheduleOrder = useScheduleImagingOrder();
  const startOrder = useStartImagingOrder();
  const completeOrder = useCompleteImagingOrder();
  const cancelOrder = useCancelImagingOrder();

  const isActionLoading =
    submitOrder.isPending ||
    scheduleOrder.isPending ||
    startOrder.isPending ||
    completeOrder.isPending ||
    cancelOrder.isPending;

  const handleSubmit = async () => {
    try {
      await submitOrder.mutateAsync(orderNumber);
      toast({ title: 'Order submitted successfully' });
    } catch (error) {
      toast({
        title: 'Error submitting order',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate) {
      toast({ title: 'Please select a date and time', variant: 'destructive' });
      return;
    }

    try {
      await scheduleOrder.mutateAsync({
        orderNumber,
        data: {
          scheduled_datetime: new Date(scheduleDate).toISOString(),
          scheduled_room: scheduleRoom || undefined,
        },
      });
      toast({ title: 'Order scheduled successfully' });
      setScheduleDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error scheduling order',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleStart = async () => {
    try {
      await startOrder.mutateAsync(orderNumber);
      toast({ title: 'Imaging started' });
    } catch (error) {
      toast({
        title: 'Error starting imaging',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleComplete = async () => {
    try {
      await completeOrder.mutateAsync(orderNumber);
      toast({ title: 'Imaging completed' });
    } catch (error) {
      toast({
        title: 'Error completing imaging',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelOrder.mutateAsync({
        orderNumber,
        data: { reason: cancelReason || undefined },
      });
      toast({ title: 'Order cancelled' });
      setCancelReason('');
    } catch (error) {
      toast({
        title: 'Error cancelling order',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Order Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The imaging order could not be loaded.
        </p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const statusIndex = getStatusIndex(order.status);
  const isCancelled = order.status === 'CANCELLED';
  const isDraft = order.status === 'DRAFT';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">
              Ordered on {formatDateTime(order.ordered_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-12 sm:ml-0">
          <PriorityBadge priority={order.priority} />
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Status Timeline */}
      {!isCancelled && !isDraft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between overflow-x-auto pb-2">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index <= statusIndex;
                const isCurrent = index === statusIndex;

                return (
                  <div
                    key={step.status}
                    className="flex flex-col items-center flex-1 min-w-[60px]"
                  >
                    <div className="flex items-center w-full">
                      {index > 0 && (
                        <div
                          className={`flex-1 h-1 ${
                            index <= statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                      <div
                        className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCompleted
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        } ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        ) : (
                          <span className="text-[10px] sm:text-xs">{index + 1}</span>
                        )}
                      </div>
                      {index < STATUS_STEPS.length - 1 && (
                        <div
                          className={`flex-1 h-1 ${
                            index < statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                    </div>
                    <span
                      className={`text-[10px] sm:text-xs mt-2 text-center ${
                        isCurrent ? 'font-medium text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Patient & Order Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium">
                  {order.patient_name || `Patient #${order.patient}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Ordered By</p>
                <p className="font-medium">
                  {order.ordered_by_name || `User #${order.ordered_by}`}
                </p>
              </div>
            </div>
            {order.scheduled_datetime && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled</p>
                  <p className="font-medium">
                    {formatDateTime(order.scheduled_datetime)}
                    {order.scheduled_room && ` • ${order.scheduled_room}`}
                  </p>
                </div>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Clinical Indication
              </p>
              <p className="text-sm">{order.clinical_indication}</p>
            </div>
            {order.relevant_clinical_history && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Relevant Clinical History
                </p>
                <p className="text-sm">{order.relevant_clinical_history}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="text-2xl font-bold">
                KES {order.total_cost.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment Status</span>
              <Badge variant={order.is_paid ? 'default' : 'secondary'}>
                {order.is_paid ? 'Paid' : 'Unpaid'}
              </Badge>
            </div>
            {order.items.some((item) => item.procedure_code) && (
              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-2">SHA Coverage</p>
                <Badge variant="outline" className="gap-1">
                  <DollarSign className="h-3 w-3" />
                  Check Patient Eligibility
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Procedures */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            Imaging Procedures ({order.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <ModalityBadge modality={item.modality} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.procedure_name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      <span>{item.procedure_code}</span>
                      {item.laterality !== 'NA' && (
                        <>
                          <span>•</span>
                          <span>{LATERALITY_LABELS[item.laterality]}</span>
                        </>
                      )}
                    </div>
                    {item.specific_instructions && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {item.specific_instructions}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <Badge variant={item.is_completed ? 'default' : 'outline'}>
                    {item.is_completed ? 'Completed' : 'Pending'}
                  </Badge>
                  <span className="font-medium whitespace-nowrap">
                    KES {item.unit_cost.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {!isCancelled && order.status !== 'REPORTED' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {/* Submit (DRAFT -> ORDERED) */}
              {isDraft && (
                <Button onClick={handleSubmit} disabled={isActionLoading}>
                  {submitOrder.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Send className="h-4 w-4 mr-2" />
                  Submit Order
                </Button>
              )}

              {/* Schedule (ORDERED -> SCHEDULED) */}
              {order.status === 'ORDERED' && (
                <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={isActionLoading}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule Imaging</DialogTitle>
                      <DialogDescription>
                        Set the date, time, and room for this imaging order.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="schedule-date">Date & Time *</Label>
                        <Input
                          id="schedule-date"
                          type="datetime-local"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="schedule-room">Room</Label>
                        <Input
                          id="schedule-room"
                          placeholder="e.g., Radiology Room 1"
                          value={scheduleRoom}
                          onChange={(e) => setScheduleRoom(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setScheduleDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleSchedule} disabled={isActionLoading}>
                        {scheduleOrder.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Schedule
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* Start (ORDERED/SCHEDULED -> IN_PROGRESS) */}
              {(order.status === 'ORDERED' || order.status === 'SCHEDULED') && (
                <Button onClick={handleStart} disabled={isActionLoading}>
                  {startOrder.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Play className="h-4 w-4 mr-2" />
                  Start Imaging
                </Button>
              )}

              {/* Complete (IN_PROGRESS -> COMPLETED) */}
              {order.status === 'IN_PROGRESS' && (
                <Button onClick={handleComplete} disabled={isActionLoading}>
                  {completeOrder.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Imaging
                </Button>
              )}

              {/* Cancel */}
              {['DRAFT', 'ORDERED', 'SCHEDULED'].includes(order.status) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isActionLoading}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Order
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Imaging Order?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. The order will be marked as
                        cancelled.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label htmlFor="cancel-reason">Cancellation Reason</Label>
                      <Textarea
                        id="cancel-reason"
                        placeholder="Enter reason for cancellation..."
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Order</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {cancelOrder.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Cancel Order
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ImagingOrderDetail;
