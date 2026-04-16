'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  SendHorizonal,
  RotateCcw,
  XCircle,
  Receipt,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type { ETIMSInvoiceStatus } from '@/lib/types/inventory';

const STATUS_CONFIG: Record<ETIMSInvoiceStatus, { label: string; color: string }> = {
  PENDING: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  SUBMITTED: {
    label: 'Submitted',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  FAILED: {
    label: 'Failed',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

function StatusBadge({ status }: { status: ETIMSInvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return <Badge className={`${cfg.color} shrink-0 w-fit`}>{cfg.label}</Badge>;
}

export default function ETIMSInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  const id = Number(rawId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRawData, setShowRawData] = useState(false);

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['etims-invoice', id],
    queryFn: () => inventoryApi.getETIMSInvoice(id),
    enabled: !isNaN(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['etims-invoice', id] });
    queryClient.invalidateQueries({ queryKey: ['etims-invoices'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => inventoryApi.submitETIMSInvoice(id),
    onSuccess: (result) => {
      invalidate();
      toast({ variant: 'success', title: 'Submission queued', description: result.message });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: getApiErrorMessage(err),
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => inventoryApi.retryETIMSInvoice(id),
    onSuccess: (result) => {
      invalidate();
      toast({ variant: 'success', title: 'Retry queued', description: result.message });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Retry failed',
        description: getApiErrorMessage(err),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => inventoryApi.cancelETIMSInvoice(id),
    onSuccess: () => {
      invalidate();
      toast({ variant: 'success', title: 'Invoice cancelled' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Cancel failed',
        description: getApiErrorMessage(err),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load eTIMS invoice details.</AlertDescription>
      </Alert>
    );
  }

  const anyPending = submitMutation.isPending || retryMutation.isPending || cancelMutation.isPending;
  const canSubmit = invoice.status === 'PENDING';
  const canRetry = invoice.status === 'FAILED';
  const canCancel = invoice.status === 'FAILED' || invoice.status === 'PENDING';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`eTIMS Invoice ${invoice.invoice_number}`}
        helpContent="View eTIMS invoice details, submit to KRA, or retry failed submissions."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canSubmit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    {submitMutation.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <SendHorizonal className="mr-1 h-4 w-4" />
                    )}
                    Submit to KRA
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit to KRA?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will queue invoice {invoice.invoice_number} for submission to the KRA eTIMS system.
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
            {canRetry && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={anyPending}>
                    {retryMutation.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-4 w-4" />
                    )}
                    Retry
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Retry submission?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will re-queue invoice {invoice.invoice_number} for submission.
                      Retry count: {invoice.retry_count}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => retryMutation.mutate()}>
                      Retry
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={anyPending}>
                    {cancelMutation.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-1 h-4 w-4" />
                    )}
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel eTIMS submission?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the eTIMS submission for invoice {invoice.invoice_number}. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => cancelMutation.mutate()}
                    >
                      Cancel Invoice
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
            {invoice.patient_name || 'No patient'}
            <span className="text-muted-foreground"> &bull; {invoice.invoice_number}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(invoice.created_at).toLocaleDateString()}
            {invoice.submitted_at && ` • Submitted ${new Date(invoice.submitted_at).toLocaleDateString()}`}
            {invoice.confirmed_at && ` • Confirmed ${new Date(invoice.confirmed_at).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          {invoice.retry_count > 0 && (
            <Badge variant="outline" className="text-xs">
              {invoice.retry_count} retries
            </Badge>
          )}
        </div>
      </div>

      {/* Error message */}
      {invoice.status === 'FAILED' && invoice.error_message && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Error: </span>
            {invoice.error_message}
          </AlertDescription>
        </Alert>
      )}

      {/* Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Number</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Patient</span>
              <span>{invoice.patient_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-medium">
                KES {Number(invoice.invoice_total).toLocaleString()}
              </span>
            </div>
            {invoice.dispensing && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dispensing</span>
                <span>{invoice.dispensing}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">eTIMS Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipt Number</span>
              <span className="font-medium">{invoice.etims_receipt_number || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={invoice.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted At</span>
              <span>{invoice.submitted_at ? new Date(invoice.submitted_at).toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confirmed At</span>
              <span>{invoice.confirmed_at ? new Date(invoice.confirmed_at).toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Retry Count</span>
              <span>{invoice.retry_count}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      {invoice.items && invoice.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.item_code}</TableCell>
                      <TableCell>{item.item_name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(item.unit_price).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(item.tax_amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {Number(item.total).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw eTIMS data (expandable) */}
      {invoice.etims_internal_data && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setShowRawData(!showRawData)}
          >
            <div className="flex items-center gap-2">
              {showRawData ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <CardTitle className="text-base">Raw eTIMS Data</CardTitle>
            </div>
          </CardHeader>
          {showRawData && (
            <CardContent>
              <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto max-h-64">
                {JSON.stringify(invoice.etims_internal_data, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
