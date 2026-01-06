'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Beaker,
  Download,
  Play,
  Send,
  FlaskConical,
} from 'lucide-react';
import { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';
import {
  useLabOrder,
  useCollectSpecimen,
  useCancelLabOrder,
  useSubmitLabOrder,
} from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { LabResultsBadge } from './lab-results-badge';
import { laboratoryApi } from '@/lib/api/laboratory';

interface LabOrderDetailProps {
  orderNumber: string;
}

const STATUS_CONFIG: Record<LabOrderStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  DRAFT: { label: 'Draft', variant: 'outline', icon: FileText },
  ORDERED: { label: 'Ordered', variant: 'secondary', icon: Clock },
  SPECIMEN_COLLECTED: { label: 'Specimen Collected', variant: 'secondary', icon: Beaker },
  IN_PROGRESS: { label: 'In Progress', variant: 'default', icon: Clock },
  COMPLETED: { label: 'Completed', variant: 'default', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; className: string }> = {
  ROUTINE: { label: 'Routine', className: 'bg-gray-100 text-gray-700' },
  URGENT: { label: 'Urgent', className: 'bg-orange-100 text-orange-700' },
  STAT: { label: 'STAT', className: 'bg-red-100 text-red-700 font-bold' },
};

export function LabOrderDetail({ orderNumber }: LabOrderDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [cancelReason, setCancelReason] = useState('');
  const [sampleId, setSampleId] = useState('');

  const { data: order, isLoading, error } = useLabOrder(orderNumber);
  const submitOrder = useSubmitLabOrder();
  const collectSpecimen = useCollectSpecimen();
  const cancelOrder = useCancelLabOrder();

  if (isLoading) {
    return <LabOrderDetailSkeleton />;
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground mb-4">
          {error?.message || 'Unable to load lab order details.'}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status];
  const priorityConfig = PRIORITY_CONFIG[order.priority];
  const StatusIcon = statusConfig.icon;

  const canSubmit = order.status === 'DRAFT' && order.items.length > 0;
  const canCollectSpecimen = order.status === 'ORDERED';
  const canEnterResults = order.status === 'SPECIMEN_COLLECTED' || order.status === 'IN_PROGRESS';
  const canCancel = ['DRAFT', 'ORDERED'].includes(order.status);
  const hasCriticalResults = order.items.some(item => item.result?.is_critical_result);
  
  // Check if all tests have results entered
  const allResultsEntered = order.items.length > 0 && order.items.every(item => item.has_result);
  const pendingResults = order.items.filter(item => !item.has_result).length;

  const handleSubmit = async () => {
    try {
      await submitOrder.mutateAsync(orderNumber);
      toast({
        title: 'Order submitted',
        description: 'Lab order has been submitted for processing.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit order',
        variant: 'destructive',
      });
    }
  };

  const handleCollectSpecimen = async () => {
    try {
      await collectSpecimen.mutateAsync({ orderNumber, sampleId });
      toast({
        title: 'Specimen collected',
        description: 'Specimen collection has been recorded.',
      });
      setSampleId('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to record specimen collection',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a cancellation reason.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await cancelOrder.mutateAsync({ orderNumber, reason: cancelReason });
      toast({
        title: 'Order cancelled',
        description: 'Lab order has been cancelled.',
      });
      setCancelReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel order',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadRequisition = async () => {
    try {
      const blob = await laboratoryApi.getRequisitionPdf(orderNumber);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `requisition_${orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to download requisition PDF',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {order.order_number}
              {hasCriticalResults && (
                <AlertTriangle className="h-6 w-6 text-red-500" />
              )}
            </h1>
            <p className="text-muted-foreground">
              Created {formatDateTime(order.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {order.order_type === 'EXTERNAL' && (
            <Button variant="outline" onClick={handleDownloadRequisition}>
              <Download className="h-4 w-4 mr-2" />
              Requisition PDF
            </Button>
          )}
          
          {canSubmit && (
            <Button onClick={handleSubmit} disabled={submitOrder.isPending}>
              {submitOrder.isPending ? 'Submitting...' : 'Submit Order'}
            </Button>
          )}

          {canCollectSpecimen && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <Beaker className="h-4 w-4 mr-2" />
                  Collect Specimen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Record Specimen Collection</AlertDialogTitle>
                  <AlertDialogDescription>
                    Enter the sample ID/barcode if available.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <input
                    type="text"
                    placeholder="Sample ID (optional)"
                    value={sampleId}
                    onChange={(e) => setSampleId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCollectSpecimen}>
                    Confirm Collection
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canEnterResults && (
            <Link href={`/laboratory/orders/${orderNumber}/results`}>
              <Button>
                <FlaskConical className="h-4 w-4 mr-2" />
                {pendingResults > 0 ? `Enter Results (${pendingResults} pending)` : 'View/Edit Results'}
              </Button>
            </Link>
          )}

          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Cancel Order</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Lab Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    Please provide a reason for cancellation.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Textarea
                    placeholder="Cancellation reason..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Order</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Cancel Order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Status & Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-full',
                statusConfig.variant === 'destructive' ? 'bg-red-100' :
                statusConfig.variant === 'default' ? 'bg-green-100' : 'bg-gray-100'
              )}>
                <StatusIcon className={cn(
                  'h-5 w-5',
                  statusConfig.variant === 'destructive' ? 'text-red-600' :
                  statusConfig.variant === 'default' ? 'text-green-600' : 'text-gray-600'
                )} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium">{order.patient_name}</p>
                <p className="text-xs text-muted-foreground">{order.patient_mrn}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-full', priorityConfig.className)}>
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                <Badge className={priorityConfig.className}>{priorityConfig.label}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Details */}
      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Order Type</p>
              <p className="font-medium">{order.order_type === 'IN_HOUSE' ? 'In-House' : 'External'}</p>
            </div>
            {order.external_lab && (
              <div>
                <p className="text-muted-foreground">External Lab</p>
                <p className="font-medium">{order.external_lab}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Ordered By</p>
              <p className="font-medium">{order.ordered_by_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Cost</p>
              <p className="font-medium">{formatCurrency(order.total_cost)}</p>
            </div>
          </div>

          {order.clinical_notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Clinical Notes</p>
                <p className="text-sm">{order.clinical_notes}</p>
              </div>
            </>
          )}

          {order.cancellation_reason && (
            <>
              <Separator />
              <div className="bg-red-50 p-3 rounded-md">
                <p className="text-sm font-medium text-red-700 mb-1">Cancellation Reason</p>
                <p className="text-sm text-red-600">{order.cancellation_reason}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Test Items */}
      <Card>
        <CardHeader>
          <CardTitle>Tests ({order.items.length})</CardTitle>
          <CardDescription>Laboratory tests in this order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'p-4 border rounded-lg',
                  item.result?.is_critical_result && 'border-red-300 bg-red-50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.test_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {item.test_code}
                      </Badge>
                    </div>
                    {item.special_instructions && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Note: {item.special_instructions}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(item.unit_cost)}</p>
                    <LabResultsBadge 
                      hasResult={item.has_result}
                      result={item.result}
                    />
                  </div>
                </div>

                {/* Show result details if available */}
                {item.result && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Value</p>
                        <p className="font-medium">
                          {item.result.numeric_value ?? item.result.text_value ?? item.result.option_value ?? '-'}
                        </p>
                      </div>
                      {item.result.reference_range_text && (
                        <div>
                          <p className="text-muted-foreground">Reference</p>
                          <p className="font-medium">{item.result.reference_range_text}</p>
                        </div>
                      )}
                      {item.result.result_flag && (
                        <div>
                          <p className="text-muted-foreground">Flag</p>
                          <Badge 
                            variant={
                              item.result.result_flag.includes('CRITICAL') ? 'destructive' :
                              ['LOW', 'HIGH', 'ABNORMAL'].includes(item.result.result_flag) ? 'secondary' :
                              'outline'
                            }
                          >
                            {item.result.result_flag}
                          </Badge>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant={item.result.verification_status === 'VERIFIED' ? 'default' : 'outline'}>
                          {item.result.verification_status}
                        </Badge>
                      </div>
                    </div>
                    {item.result.interpretation && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Interpretation</p>
                        <p className="text-sm">{item.result.interpretation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LabOrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
