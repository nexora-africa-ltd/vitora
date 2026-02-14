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
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import Link from 'next/link';
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold break-all">{order.order_number}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ordered on {formatDateTime(order.ordered_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2 pl-10 sm:pl-0">
          <PriorityBadge priority={order.priority} />
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Status Timeline */}
      {!isCancelled && !isDraft && (
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Order Progress</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="flex items-center justify-between gap-0.5 sm:gap-1 overflow-x-auto pb-2 -mx-1 px-1">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index <= statusIndex;
                const isCurrent = index === statusIndex;

                return (
                  <div
                    key={step.status}
                    className="flex flex-col items-center flex-1 min-w-[48px] sm:min-w-[60px]"
                  >
                    <div className="flex items-center w-full">
                      {index > 0 && (
                        <div
                          className={`flex-1 h-0.5 sm:h-1 ${
                            index <= statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                      <div
                        className={`w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] sm:text-xs ${
                          isCompleted
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        } ${isCurrent ? 'ring-2 ring-primary ring-offset-1 sm:ring-offset-2' : ''}`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </div>
                      {index < STATUS_STEPS.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 sm:h-1 ${
                            index < statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                    </div>
                    <span
                      className={`text-[9px] sm:text-[10px] md:text-xs mt-1.5 sm:mt-2 text-center leading-tight ${
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

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Patient & Order Info */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Patient</p>
                <p className="font-medium text-sm sm:text-base truncate">
                  {order.patient_name || `Patient #${order.patient}`}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:gap-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Ordered By</p>
                <p className="font-medium text-sm sm:text-base truncate">
                  {order.ordered_by_name || `User #${order.ordered_by}`}
                </p>
              </div>
            </div>
            {order.scheduled_datetime && (
              <div className="flex items-start gap-2.5 sm:gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">Scheduled</p>
                  <p className="font-medium text-sm sm:text-base">
                    {formatDateTime(order.scheduled_datetime)}
                    {order.scheduled_room && <span className="block sm:inline"> • {order.scheduled_room}</span>}
                  </p>
                </div>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                Clinical Indication
              </p>
              <p className="text-xs sm:text-sm leading-relaxed">{order.clinical_indication}</p>
            </div>
            {order.relevant_clinical_history && (
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                  Relevant Clinical History
                </p>
                <p className="text-xs sm:text-sm leading-relaxed">{order.relevant_clinical_history}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing Info */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Total Cost</span>
              <span className="text-xl sm:text-2xl font-bold">
                KES {order.total_cost.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Payment Status</span>
              <Badge variant={order.is_paid ? 'default' : 'secondary'} className="text-xs sm:text-sm">
                {order.is_paid ? 'Paid' : 'Unpaid'}
              </Badge>
            </div>
            {order.items.some((item) => item.procedure_code) && (
              <div className="pt-2">
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">SHA Coverage</p>
                <Badge variant="outline" className="gap-1 text-xs">
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
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="text-base sm:text-lg">
            Imaging Procedures ({order.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-2 sm:space-y-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 sm:gap-3 p-2.5 sm:p-3 border rounded-lg"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <ModalityBadge modality={item.modality} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base truncate">{item.procedure_name}</p>
                    <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-xs sm:text-sm text-muted-foreground">
                      <span>{item.procedure_code}</span>
                      {item.laterality !== 'NA' && (
                        <>
                          <span>•</span>
                          <span>{LATERALITY_LABELS[item.laterality]}</span>
                        </>
                      )}
                    </div>
                    {item.specific_instructions && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                        {item.specific_instructions}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t sm:border-t-0 sm:pt-0">
                  <Badge variant={item.is_completed ? 'default' : 'outline'} className="text-xs">
                    {item.is_completed ? 'Completed' : 'Pending'}
                  </Badge>
                  <span className="font-medium text-sm sm:text-base whitespace-nowrap">
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
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
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

      {/* View Images - shown for COMPLETED or REPORTED orders with study */}
      {(order.status === 'COMPLETED' || order.status === 'REPORTED') && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Images Available
            </CardTitle>
            <CardDescription>
              {order.study_instance_uid
                ? 'DICOM images are ready for viewing'
                : 'Imaging completed - awaiting image upload'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {order.study_instance_uid ? (
              <Link href={`/imaging/studies/${order.study_instance_uid}`}>
                <Button className="w-full sm:w-auto">
                  <Eye className="h-4 w-4 mr-2" />
                  View Images
                </Button>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                Images will be available here once they are uploaded by the radiographer.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ImagingOrderDetail;
