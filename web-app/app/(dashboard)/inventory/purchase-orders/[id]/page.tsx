'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Send, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/lib/hooks/use-toast';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import type { PurchaseOrderStatus } from '@/lib/types/inventory';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const poId = parseInt(resolvedParams.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canPerformAction } = usePermissions();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: po, isLoading, error } = useQuery({
    queryKey: ['inventory-purchase-order', poId],
    queryFn: () => inventoryApi.getPurchaseOrder(poId),
  });

  const submitMutation = useMutation({
    mutationFn: () => inventoryApi.submitPurchaseOrder(poId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-purchase-order', poId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-purchase-orders'] });
      toast({ variant: 'success', title: 'Purchase order submitted for approval' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to submit', description: getApiErrorMessage(err) });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => inventoryApi.approvePurchaseOrder(poId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-purchase-order', poId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-purchase-orders'] });
      toast({ variant: 'success', title: 'Purchase order approved' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to approve', description: getApiErrorMessage(err) });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => inventoryApi.cancelPurchaseOrder(poId, { reason }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-purchase-order', poId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-purchase-orders'] });
      setCancelDialogOpen(false);
      setCancelReason('');
      toast({ variant: 'success', title: 'Purchase order cancelled' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to cancel', description: getApiErrorMessage(err) });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !po) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error instanceof Error ? error.message : 'Purchase order not found'}</AlertDescription>
      </Alert>
    );
  }

  const canSubmit = po.status === 'DRAFT';
  const canApprove = po.status === 'SUBMITTED' && canPerformAction('inventory.approve_po' as never);
  const canCancel = ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(po.status);
  const canCreateGRN = po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`PO ${po.po_number}`}
        helpContent="View purchase order details, line items, and manage the approval workflow. Create goods receipt notes from approved orders."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canSubmit && (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Submit
              </Button>
            )}
            {canApprove && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" className="bg-blue-600 hover:bg-blue-700">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Purchase Order?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve PO {po.po_number} for {formatCurrency(po.total_amount)}.
                      The supplier can then be notified to fulfill the order.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                      Approve
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canCreateGRN && (
              <Button variant="outline" onClick={() => router.push(`/inventory/goods-receipt/new?po=${po.id}`)}>
                <FileText className="mr-2 h-4 w-4" />
                Create GRN
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" className="text-destructive" onClick={() => setCancelDialogOpen(true)}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {po.supplier_name}
            <span className="text-muted-foreground"> · {formatDate(po.order_date)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Ordered by {po.ordered_by_name || '—'}
            {po.expected_delivery_date && <> · Expected {formatDate(po.expected_delivery_date)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold">{formatCurrency(po.total_amount)}</span>
          <Badge className={`${statusColors[po.status]} shrink-0 w-fit`}>
            {statusLabels[po.status]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Line Items (wider column) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Line Items ({po.items?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {po.items && po.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Drug</th>
                      <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                      <th className="pb-2 pr-4 font-medium text-right">Unit Price</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">{item.drug_name}</td>
                        <td className="py-2.5 pr-4 text-right">{item.quantity_ordered}</td>
                        <td className="py-2.5 pr-4 text-right">{formatCurrency(item.unit_cost)}</td>
                        <td className="py-2.5 text-right font-medium">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={3} className="py-2.5 text-right font-medium">Total</td>
                      <td className="py-2.5 text-right font-bold">{formatCurrency(po.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No items yet</p>
            )}
          </CardContent>
        </Card>

        {/* Details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Supplier</p>
                <p className="text-muted-foreground">{po.supplier_name}</p>
              </div>
              <div>
                <p className="font-medium">Order Date</p>
                <p className="text-muted-foreground">{formatDate(po.order_date)}</p>
              </div>
              <div>
                <p className="font-medium">Expected Delivery</p>
                <p className="text-muted-foreground">{formatDate(po.expected_delivery_date)}</p>
              </div>
              <div>
                <p className="font-medium">Ordered By</p>
                <p className="text-muted-foreground">{po.ordered_by_name || '—'}</p>
              </div>
              {po.approved_by_name && (
                <div>
                  <p className="font-medium">Approved By</p>
                  <p className="text-muted-foreground">{po.approved_by_name} · {formatDate(po.approved_at)}</p>
                </div>
              )}
              {po.cancellation_reason && (
                <div>
                  <p className="font-medium">Cancellation Reason</p>
                  <p className="text-muted-foreground">{po.cancellation_reason}</p>
                </div>
              )}
              {po.notes && (
                <div>
                  <p className="font-medium">Notes</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="cancel-reason">Reason for cancellation *</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this PO being cancelled?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Back</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(cancelReason.trim())}
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
