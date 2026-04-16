'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Loader2, Package } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/lib/hooks/use-toast';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import type { GRNStatus } from '@/lib/types/inventory';

const statusLabels: Record<GRNStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<GRNStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-green-100 text-green-700',
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

export default function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const grnId = parseInt(resolvedParams.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ['inventory-goods-receipt', grnId],
    queryFn: () => inventoryApi.getGoodsReceipt(grnId),
  });

  const confirmMutation = useMutation({
    mutationFn: () => inventoryApi.confirmGoodsReceipt(grnId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-goods-receipt', grnId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-purchase-order'] });
      toast({ variant: 'success', title: 'Goods receipt confirmed — stock updated' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to confirm', description: getApiErrorMessage(err) });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => inventoryApi.cancelGoodsReceipt(grnId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-goods-receipt', grnId], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-goods-receipts'] });
      toast({ variant: 'success', title: 'Goods receipt cancelled' });
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

  if (error || !grn) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error instanceof Error ? error.message : 'Goods receipt not found'}</AlertDescription>
      </Alert>
    );
  }

  const canConfirm = grn.status === 'DRAFT';
  const canCancel = grn.status === 'DRAFT';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`GRN ${grn.grn_number}`}
        helpContent="View goods receipt details, batch information, and expiry dates. Confirm to update stock levels."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canConfirm && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Confirm Receipt
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Goods Receipt?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will update inventory stock levels for {grn.total_items} items
                      totaling {formatCurrency(grn.total_amount)}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive">
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Goods Receipt?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel GRN {grn.grn_number}. No stock updates will be made.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel GRN
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {grn.supplier_name}
            {grn.po_number && <span className="text-muted-foreground"> · PO {grn.po_number}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Received {formatDate(grn.received_date)} by {grn.received_by_name || '—'}
            {grn.delivery_note_number && <> · DN: {grn.delivery_note_number}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold">{formatCurrency(grn.total_amount)}</span>
          <Badge className={`${statusColors[grn.status]} shrink-0 w-fit`}>
            {statusLabels[grn.status]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Received Items ({grn.items?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {grn.items && grn.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Drug</th>
                      <th className="pb-2 pr-3 font-medium">Batch</th>
                      <th className="pb-2 pr-3 font-medium">Expiry</th>
                      <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                      <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grn.items.map((item) => {
                      const lineTotal = Number(item.quantity_received) * Number(item.cost_price);
                      const isExpiringSoon = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 90 * 86400000);
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2.5 pr-3">{item.drug_name}</td>
                          <td className="py-2.5 pr-3 font-mono text-xs">{item.batch_number}</td>
                          <td className="py-2.5 pr-3">
                            <span className={isExpiringSoon ? 'text-amber-600 font-medium' : ''}>
                              {formatDate(item.expiry_date)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right">{item.quantity_received}</td>
                          <td className="py-2.5 pr-3 text-right">{formatCurrency(item.cost_price)}</td>
                          <td className="py-2.5 text-right font-medium">{formatCurrency(lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={5} className="py-2.5 text-right font-medium">Total</td>
                      <td className="py-2.5 text-right font-bold">{formatCurrency(grn.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No items</p>
            )}
          </CardContent>
        </Card>

        {/* Details sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Receipt Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Supplier</p>
                <p className="text-muted-foreground">{grn.supplier_name}</p>
              </div>
              {grn.po_number && (
                <div>
                  <p className="font-medium">Purchase Order</p>
                  <button
                    className="text-primary hover:underline text-sm"
                    onClick={() => grn.purchase_order && router.push(`/inventory/purchase-orders/${grn.purchase_order}`)}
                  >
                    {grn.po_number}
                  </button>
                </div>
              )}
              <div>
                <p className="font-medium">Received Date</p>
                <p className="text-muted-foreground">{formatDate(grn.received_date)}</p>
              </div>
              <div>
                <p className="font-medium">Received By</p>
                <p className="text-muted-foreground">{grn.received_by_name || '—'}</p>
              </div>
              {grn.delivery_note_number && (
                <div>
                  <p className="font-medium">Delivery Note #</p>
                  <p className="text-muted-foreground">{grn.delivery_note_number}</p>
                </div>
              )}
              {grn.invoice_number && (
                <div>
                  <p className="font-medium">Invoice #</p>
                  <p className="text-muted-foreground">{grn.invoice_number}</p>
                </div>
              )}
              {grn.confirmed_by_name && (
                <div>
                  <p className="font-medium">Confirmed By</p>
                  <p className="text-muted-foreground">{grn.confirmed_by_name} · {formatDate(grn.confirmed_at)}</p>
                </div>
              )}
              {grn.notes && (
                <div>
                  <p className="font-medium">Notes</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{grn.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
