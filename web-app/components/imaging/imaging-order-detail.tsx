/**
 * Imaging order detail view component.
 * Displays full order information with status timeline and actions.
 */
'use client';

import { useState, useCallback, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils/format';
import { toast } from '@/lib/hooks';
import {
  useImagingOrder,
  useSubmitImagingOrder,
  useScheduleImagingOrder,
  useImagingResources,
  useStartImagingOrder,
  useCompleteImagingOrder,
  useCancelImagingOrder,
} from '@/lib/hooks/use-imaging';
import {
  ImagingOrder,
  ImagingOrderStatus,
  LATERALITY_LABELS,
  MODALITY_LABELS,
  ImagingModality,
} from '@/lib/types/imaging';
import { OrderStatusBadge } from './order-status-badge';
import { PriorityBadge } from './priority-badge';
import { ModalityBadge } from './modality-badge';
import { shaApi } from '@/lib/api/sha';

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

function getModalityLabel(modalityCode: string): string {
  if ((modalityCode as ImagingModality) in MODALITY_LABELS) {
    return MODALITY_LABELS[modalityCode as ImagingModality];
  }
  return modalityCode;
}

function parseSchedulingError(error: unknown): { title: string; description: string } {
  if (
    error instanceof AxiosError &&
    error.response?.data &&
    typeof error.response.data === 'object'
  ) {
    const data = error.response.data as { error?: unknown };
    if (typeof data.error === 'string') {
      const modalityMismatch = data.error.match(
        /Resource\s+(.+?)\s+does not support modality\s+([A-Z]+)\.\s*Supported:\s*\[(.*?)\]/i
      );

      if (modalityMismatch) {
        const resourceCode = modalityMismatch[1]?.trim() || 'selected room';
        const requestedModalityCode = modalityMismatch[2]?.trim() || '';
        const supportedRaw = modalityMismatch[3]?.trim() || '';
        const supportedCodes = supportedRaw
          ? supportedRaw
              .split(',')
              .map((value) => value.replace(/[\[\]'"\s]/g, '').trim())
              .filter(Boolean)
          : [];

        const requestedLabel = getModalityLabel(requestedModalityCode);
        const title = `Selected room cannot perform ${requestedLabel.toLowerCase()}`;

        if (supportedCodes.length === 0) {
          return {
            title,
            description: `${resourceCode} has no imaging modalities configured. Choose a room configured for ${requestedModalityCode}, or update the room's supported modalities in Scheduling Resources.`,
          };
        }

        const supportedLabels = supportedCodes.map(getModalityLabel).join(', ');
        return {
          title,
          description: `${resourceCode} supports ${supportedLabels}. Choose a ${requestedLabel.toLowerCase()}-capable room.`,
        };
      }

      return {
        title: 'Error scheduling order',
        description: data.error,
      };
    }
  }

  return {
    title: 'Error scheduling order',
    description: error instanceof Error ? error.message : 'An error occurred',
  };
}

export function ImagingOrderDetail({ orderNumber }: ImagingOrderDetailProps) {
  const router = useRouter();
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [resourceSearch, setResourceSearch] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [eligibilityStatus, setEligibilityStatus] = useState<boolean | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const { data: order, isLoading, error } = useImagingOrder(orderNumber);
  const submitOrder = useSubmitImagingOrder();
  const scheduleOrder = useScheduleImagingOrder();
  const startOrder = useStartImagingOrder();
  const completeOrder = useCompleteImagingOrder();
  const cancelOrder = useCancelImagingOrder();
  const { data: imagingResources = [], isLoading: loadingImagingResources } = useImagingResources(
    undefined,
    scheduleDialogOpen
  );
  const deferredResourceSearch = useDeferredValue(resourceSearch);
  const normalizedResourceSearch = deferredResourceSearch.trim().toLowerCase();
  const visibleResources = imagingResources.filter((resource) => {
    if (!normalizedResourceSearch) return true;
    const roomNumber = resource.metadata.room_number || '';
    return `${resource.name} ${resource.code} ${roomNumber}`
      .toLowerCase()
      .includes(normalizedResourceSearch);
  });
  const selectedResource = imagingResources.find((resource) => resource.id === selectedResourceId);

  const isActionLoading =
    submitOrder.isPending ||
    scheduleOrder.isPending ||
    startOrder.isPending ||
    completeOrder.isPending ||
    cancelOrder.isPending;

  const handleCheckEligibility = useCallback(async () => {
    if (!order) return;
    setEligibilityLoading(true);
    try {
      const result = await shaApi.checkPatientEligibility(order.patient);
      setEligibilityStatus(result.is_eligible);
      toast({
        title: result.is_eligible ? 'Patient is eligible' : 'Patient not eligible',
        description: result.message,
        variant: result.is_eligible ? 'default' : 'destructive',
      });
    } catch (err) {
      setEligibilityStatus(false);
      toast({
        title: 'Eligibility check failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setEligibilityLoading(false);
    }
  }, [order]);

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
          resource_id: selectedResourceId || undefined,
        },
      });
      toast({ title: 'Order scheduled successfully' });
      setScheduleDialogOpen(false);
    } catch (error) {
      const parsedError = parseSchedulingError(error);
      toast({
        title: parsedError.title,
        description: parsedError.description,
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
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Order Not Found</h2>
        <p className="mb-4 text-muted-foreground">The imaging order could not be loaded.</p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
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
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="break-all text-lg font-bold sm:text-xl md:text-2xl">
              {order.order_number}
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Ordered on {formatDateTime(order.ordered_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0">
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
            <div className="-mx-1 flex items-center justify-between gap-0.5 overflow-x-auto px-1 pb-2 sm:gap-1">
              {STATUS_STEPS.map((step, index) => {
                const isCompleted = index <= statusIndex;
                const isCurrent = index === statusIndex;

                return (
                  <div
                    key={step.status}
                    className="flex min-w-[48px] flex-1 flex-col items-center sm:min-w-[60px]"
                  >
                    <div className="flex w-full items-center">
                      {index > 0 && (
                        <div
                          className={`h-0.5 flex-1 sm:h-1 ${
                            index <= statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] sm:h-7 sm:w-7 sm:text-xs md:h-8 md:w-8 ${
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
                          className={`h-0.5 flex-1 sm:h-1 ${
                            index < statusIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                        />
                      )}
                    </div>
                    <span
                      className={`mt-1.5 text-center text-[9px] leading-tight sm:mt-2 sm:text-[10px] md:text-xs ${
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
          <CardContent className="space-y-3 px-4 sm:space-y-4 sm:px-6">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground sm:text-sm">Patient</p>
                <p className="truncate text-sm font-medium sm:text-base">
                  {order.patient_name || `Patient #${order.patient}`}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground sm:text-sm">Ordered By</p>
                <p className="truncate text-sm font-medium sm:text-base">
                  {order.ordered_by_name || `User #${order.ordered_by}`}
                </p>
              </div>
            </div>
            {order.scheduled_datetime && (
              <div className="flex items-start gap-2.5 sm:gap-3">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground sm:text-sm">Scheduled</p>
                  <p className="text-sm font-medium sm:text-base">
                    {formatDateTime(order.scheduled_datetime)}
                    {order.scheduled_room && (
                      <span className="block sm:inline"> • {order.scheduled_room}</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            <Separator />
            <div>
              <p className="mb-1 text-xs text-muted-foreground sm:text-sm">Clinical Indication</p>
              <p className="text-xs leading-relaxed sm:text-sm">{order.clinical_indication}</p>
            </div>
            {order.relevant_clinical_history && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground sm:text-sm">
                  Relevant Clinical History
                </p>
                <p className="text-xs leading-relaxed sm:text-sm">
                  {order.relevant_clinical_history}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing Info */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:space-y-4 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Total Cost</span>
              <span className="text-xl font-bold sm:text-2xl">
                KES {order.total_cost.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Payment Status</span>
              <Badge
                variant={order.is_paid ? 'default' : 'secondary'}
                className="text-xs sm:text-sm"
              >
                {order.is_paid ? 'Paid' : 'Unpaid'}
              </Badge>
            </div>
            {(order.items ?? []).some((item) => item.procedure_code) && (
              <div className="pt-2">
                <p className="mb-2 text-xs text-muted-foreground sm:text-sm">SHA Coverage</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={eligibilityLoading}
                    onClick={handleCheckEligibility}
                  >
                    {eligibilityLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <DollarSign className="h-3 w-3" />
                    )}
                    Check Patient Eligibility
                  </Button>
                  {eligibilityStatus !== null && (
                    <span className="relative flex h-3 w-3">
                      <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                          eligibilityStatus ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      />
                      <span
                        className={`relative inline-flex h-3 w-3 rounded-full ${
                          eligibilityStatus ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                    </span>
                  )}
                  {eligibilityStatus !== null && (
                    <span
                      className={`text-xs font-medium ${eligibilityStatus ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {eligibilityStatus ? 'Eligible' : 'Not Eligible'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Procedures */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="text-base sm:text-lg">
            Imaging Procedures ({(order.items ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-2 sm:space-y-3">
            {(order.items ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border p-2.5 sm:gap-3 sm:p-3"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <ModalityBadge modality={item.modality} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium sm:text-base">
                      {item.procedure_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground sm:gap-x-2 sm:text-sm">
                      <span>{item.procedure_code}</span>
                      {item.laterality !== 'NA' && (
                        <>
                          <span>•</span>
                          <span>{LATERALITY_LABELS[item.laterality]}</span>
                        </>
                      )}
                    </div>
                    {item.specific_instructions && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                        {item.specific_instructions}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-1 sm:border-t-0 sm:pt-0">
                  <Badge variant={item.is_completed ? 'default' : 'outline'} className="text-xs">
                    {item.is_completed ? 'Completed' : 'Pending'}
                  </Badge>
                  <span className="whitespace-nowrap text-sm font-medium sm:text-base">
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
                  {submitOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Send className="mr-2 h-4 w-4" />
                  Submit Order
                </Button>
              )}

              {/* Schedule (ORDERED -> SCHEDULED) */}
              {order.status === 'ORDERED' && (
                <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={isActionLoading}>
                      <Calendar className="mr-2 h-4 w-4" />
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
                        <Label>Radiology room</Label>
                        <Popover open={resourcePickerOpen} onOpenChange={setResourcePickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={resourcePickerOpen}
                              className="w-full justify-between font-normal"
                            >
                              <span className="truncate">
                                {selectedResource
                                  ? selectedResource.name
                                  : scheduleRoom
                                    ? `Custom room: ${scheduleRoom}`
                                    : 'Select a radiology room'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[--radix-popover-trigger-width] p-0"
                            align="start"
                          >
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search radiology rooms..."
                                value={resourceSearch}
                                onValueChange={setResourceSearch}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {loadingImagingResources
                                    ? 'Loading radiology rooms...'
                                    : 'No radiology rooms found.'}
                                </CommandEmpty>
                                <CommandGroup heading="Radiology rooms">
                                  {visibleResources.map((resource) => (
                                    <CommandItem
                                      key={resource.id}
                                      value={String(resource.id)}
                                      onSelect={() => {
                                        setSelectedResourceId(resource.id);
                                        setScheduleRoom(resource.name);
                                        setResourcePickerOpen(false);
                                        setResourceSearch('');
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          selectedResourceId === resource.id
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        }`}
                                      />
                                      <span className="truncate">{resource.name}</span>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {resource.code}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="schedule-room">Or enter a room manually</Label>
                        <Input
                          id="schedule-room"
                          placeholder="e.g., Radiology Room 1"
                          value={scheduleRoom}
                          onChange={(e) => {
                            setScheduleRoom(e.target.value);
                            setSelectedResourceId(null);
                          }}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSchedule} disabled={isActionLoading}>
                        {scheduleOrder.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  {startOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Play className="mr-2 h-4 w-4" />
                  Start Imaging
                </Button>
              )}

              {/* Complete (IN_PROGRESS -> COMPLETED) */}
              {order.status === 'IN_PROGRESS' && (
                <Button onClick={handleComplete} disabled={isActionLoading}>
                  {completeOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Complete Imaging
                </Button>
              )}

              {/* Cancel */}
              {['DRAFT', 'ORDERED', 'SCHEDULED'].includes(order.status) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isActionLoading}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel Order
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Imaging Order?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. The order will be marked as cancelled.
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
                        {cancelOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
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
                  <Eye className="mr-2 h-4 w-4" />
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

      {/* Radiology Report - shown for COMPLETED or REPORTED orders */}
      {(order.status === 'COMPLETED' || order.status === 'REPORTED') && (
        <Card
          className={
            order.status === 'REPORTED'
              ? 'border-green-500/20 bg-green-50/50 dark:bg-green-950/20'
              : ''
          }
        >
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="h-5 w-5" />
              Radiology Report
            </CardTitle>
            <CardDescription>
              {order.status === 'REPORTED'
                ? 'Final report is available'
                : 'Create or view the radiology report'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <Link href={`/imaging/orders/${orderNumber}/report`}>
              <Button
                variant={order.status === 'REPORTED' ? 'default' : 'outline'}
                className="w-full sm:w-auto"
              >
                <FileText className="mr-2 h-4 w-4" />
                {order.status === 'REPORTED' ? 'View Report' : 'Create Report'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ImagingOrderDetail;
