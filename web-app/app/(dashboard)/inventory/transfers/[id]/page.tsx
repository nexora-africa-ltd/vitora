'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2, Package, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { TransferStatus, StockTransferDetail } from '@/lib/types/inventory';

const statusLabels: Record<TransferStatus, string> = {
  DRAFT: 'Draft',
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  IN_TRANSIT: 'In Transit',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<TransferStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  REQUESTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  APPROVED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  IN_TRANSIT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  RECEIVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STEPS: TransferStatus[] = ['DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED'];

function TransferStepper({ status }: { status: TransferStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center justify-center py-2">
        <Badge variant="outline" className={statusColors.CANCELLED}>
          <X className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto py-2">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center justify-center h-7 w-7 rounded-full border-2 text-xs font-medium ${
                isCompleted
                  ? 'border-green-500 bg-green-500 text-white'
                  : isCurrent
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-xs hidden sm:inline ${
                isCurrent ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              {statusLabels[step]}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-4 sm:w-8 ${
                  isCompleted ? 'bg-green-500' : 'bg-muted-foreground/20'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StockTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = parseInt(resolvedParams.id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const { canPerformAction } = usePermissions();

  const {
    data: transfer,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory-transfer', id],
    queryFn: () => inventoryApi.getTransfer(id),
    enabled: !isNaN(id),
  });

  function onActionSuccess(updated: StockTransferDetail, label: string) {
    queryClient.setQueryData(['inventory-transfer', id], updated);
    queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
    toast({ variant: 'success', title: `Transfer ${label}` });
  }

  function onActionError(err: unknown, label: string) {
    toast({
      variant: 'destructive',
      title: `Failed to ${label}`,
      description: getApiErrorMessage(err),
    });
  }

  const submitMutation = useMutation({
    mutationFn: () => inventoryApi.submitTransfer(id),
    onSuccess: (data) => onActionSuccess(data, 'submitted'),
    onError: (err) => onActionError(err, 'submit transfer'),
  });

  const approveMutation = useMutation({
    mutationFn: () => inventoryApi.approveTransfer(id),
    onSuccess: (data) => onActionSuccess(data, 'approved'),
    onError: (err) => onActionError(err, 'approve transfer'),
  });

  const dispatchMutation = useMutation({
    mutationFn: () => inventoryApi.dispatchTransfer(id),
    onSuccess: (data) => onActionSuccess(data, 'dispatched'),
    onError: (err) => onActionError(err, 'dispatch transfer'),
  });

  const receiveMutation = useMutation({
    mutationFn: () => inventoryApi.receiveTransfer(id),
    onSuccess: (data) => onActionSuccess(data, 'received'),
    onError: (err) => onActionError(err, 'receive transfer'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => inventoryApi.cancelTransfer(id, { reason: cancelReason || undefined }),
    onSuccess: (data) => {
      onActionSuccess(data, 'cancelled');
      setCancelOpen(false);
      setCancelReason('');
    },
    onError: (err) => onActionError(err, 'cancel transfer'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load transfer details.</AlertDescription>
      </Alert>
    );
  }

  const canSubmit = transfer.status === 'DRAFT';
  const canApprove = transfer.status === 'REQUESTED' && canPerformAction('inventory.approve_transfer' as never);
  const canDispatch = transfer.status === 'APPROVED';
  const canReceive = transfer.status === 'IN_TRANSIT';
  const canCancel = !['RECEIVED', 'CANCELLED'].includes(transfer.status);
  const anyPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    dispatchMutation.isPending ||
    receiveMutation.isPending ||
    cancelMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Transfer ${transfer.transfer_number}`}
        helpContent="View transfer details, track progress, and perform workflow actions."
        actions={
          <div className="flex flex-wrap gap-2">
            {canSubmit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    Submit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit Transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will submit the transfer request for approval.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => submitMutation.mutate()}>
                      Submit
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canApprove && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve the transfer for dispatch.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => approveMutation.mutate()}>
                      Approve
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canDispatch && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    <Truck className="mr-1 h-4 w-4" />
                    Dispatch
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Dispatch Transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will deduct stock from the source location and mark the transfer as in transit.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => dispatchMutation.mutate()}>
                      Dispatch
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canReceive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    <Package className="mr-1 h-4 w-4" />
                    Receive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Receive Transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will create stock at the destination location and mark the transfer as received.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => receiveMutation.mutate()}>
                      Receive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canCancel && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  disabled={anyPending}
                >
                  Cancel Transfer
                </Button>
                <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Cancel Transfer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Textarea
                        placeholder="Reason for cancellation (optional)"
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCancelOpen(false)}>
                        Close
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Cancel Transfer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        }
      />

      {/* Progress stepper */}
      <Card>
        <CardContent className="py-3 px-4">
          <TransferStepper status={transfer.status} />
        </CardContent>
      </Card>

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-medium">
            <span className="truncate">{transfer.source_facility_name}</span>
            {transfer.source_store_name && (
              <span className="text-muted-foreground text-xs">({transfer.source_store_name})</span>
            )}
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{transfer.destination_facility_name}</span>
            {transfer.destination_store_name && (
              <span className="text-muted-foreground text-xs">
                ({transfer.destination_store_name})
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Requested {new Date(transfer.request_date).toLocaleDateString()} by{' '}
            {transfer.requested_by_name}
          </p>
        </div>
        <Badge variant="outline" className={`${statusColors[transfer.status]} shrink-0 w-fit`}>
          {statusLabels[transfer.status]}
        </Badge>
      </div>

      {/* Timeline details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Request Date</dt>
              <dd className="font-medium">{new Date(transfer.request_date).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Requested By</dt>
              <dd className="font-medium">{transfer.requested_by_name}</dd>
            </div>
            {transfer.approved_by_name && (
              <>
                <div>
                  <dt className="text-muted-foreground">Approved By</dt>
                  <dd className="font-medium">{transfer.approved_by_name}</dd>
                </div>
                {transfer.approved_at && (
                  <div>
                    <dt className="text-muted-foreground">Approved At</dt>
                    <dd className="font-medium">
                      {new Date(transfer.approved_at).toLocaleString()}
                    </dd>
                  </div>
                )}
              </>
            )}
            {transfer.dispatched_by_name && (
              <>
                <div>
                  <dt className="text-muted-foreground">Dispatched By</dt>
                  <dd className="font-medium">{transfer.dispatched_by_name}</dd>
                </div>
                {transfer.dispatched_at && (
                  <div>
                    <dt className="text-muted-foreground">Dispatched At</dt>
                    <dd className="font-medium">
                      {new Date(transfer.dispatched_at).toLocaleString()}
                    </dd>
                  </div>
                )}
              </>
            )}
            {transfer.received_by_name && (
              <>
                <div>
                  <dt className="text-muted-foreground">Received By</dt>
                  <dd className="font-medium">{transfer.received_by_name}</dd>
                </div>
                {transfer.received_at && (
                  <div>
                    <dt className="text-muted-foreground">Received At</dt>
                    <dd className="font-medium">
                      {new Date(transfer.received_at).toLocaleString()}
                    </dd>
                  </div>
                )}
              </>
            )}
            {transfer.cancelled_at && (
              <div>
                <dt className="text-muted-foreground">Cancelled At</dt>
                <dd className="font-medium">
                  {new Date(transfer.cancelled_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>

          {transfer.notes && (
            <div className="mt-4 pt-4 border-t text-sm">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{transfer.notes}</p>
            </div>
          )}

          {transfer.cancellation_reason && (
            <div className="mt-4 pt-4 border-t text-sm">
              <p className="text-muted-foreground mb-1">Cancellation Reason</p>
              <p className="whitespace-pre-wrap text-destructive">{transfer.cancellation_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Transfer Items ({transfer.items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table className="min-w-[550px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Drug</TableHead>
                  <TableHead>Batch #</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="hidden sm:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.items && transfer.items.length > 0 ? (
                  transfer.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.drug_name}</TableCell>
                      <TableCell>{item.source_batch_number || '—'}</TableCell>
                      <TableCell className="text-right">{item.quantity_requested}</TableCell>
                      <TableCell className="text-right">{item.quantity_dispatched}</TableCell>
                      <TableCell className="text-right">{item.quantity_received}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                        {item.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No items
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
