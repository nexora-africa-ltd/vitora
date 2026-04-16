'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Minus,
  Pill,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { WardStock, WardTransactionType } from '@/lib/types/inventory';

const transactionTypeLabels: Record<WardTransactionType, string> = {
  CONSUME: 'Consume',
  REPLENISH: 'Replenish',
  RETURN: 'Return',
  ADJUSTMENT: 'Adjustment',
};

const transactionTypeColors: Record<WardTransactionType, string> = {
  CONSUME: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REPLENISH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  RETURN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ADJUSTMENT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

export default function WardStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = parseInt(resolvedParams.id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Action dialog states
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [replenishOpen, setReplenishOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  // Form states
  const [consumeQty, setConsumeQty] = useState('');
  const [consumeNotes, setConsumeNotes] = useState('');
  const [replenishQty, setReplenishQty] = useState('');
  const [replenishNotes, setReplenishNotes] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  const {
    data: wardStock,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory-ward-stock', id],
    queryFn: () => inventoryApi.getWardStock(id),
    enabled: !isNaN(id),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['inventory-ward-transactions', id],
    queryFn: () => inventoryApi.listWardTransactions({ ward_stock: id, page_size: 50 }),
    enabled: !isNaN(id),
  });

  function onActionSuccess(updated: WardStock, label: string) {
    queryClient.setQueryData(['inventory-ward-stock', id], updated);
    queryClient.invalidateQueries({ queryKey: ['inventory-ward-stock'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-ward-transactions', id] });
    toast({ variant: 'success', title: `Stock ${label} successfully` });
  }

  function onActionError(err: unknown, label: string) {
    toast({
      variant: 'destructive',
      title: `Failed to ${label}`,
      description: getApiErrorMessage(err),
    });
  }

  const consumeMutation = useMutation({
    mutationFn: () =>
      inventoryApi.consumeWardStock(id, {
        quantity: Number(consumeQty),
        notes: consumeNotes || undefined,
      }),
    onSuccess: (data) => {
      onActionSuccess(data, 'consumed');
      setConsumeOpen(false);
      setConsumeQty('');
      setConsumeNotes('');
    },
    onError: (err) => onActionError(err, 'consume stock'),
  });

  const replenishMutation = useMutation({
    mutationFn: () =>
      inventoryApi.replenishWardStock(id, {
        quantity: Number(replenishQty),
        notes: replenishNotes || undefined,
      }),
    onSuccess: (data) => {
      onActionSuccess(data, 'replenished');
      setReplenishOpen(false);
      setReplenishQty('');
      setReplenishNotes('');
    },
    onError: (err) => onActionError(err, 'replenish stock'),
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      inventoryApi.returnWardStock(id, {
        quantity: Number(returnQty),
        notes: returnNotes || undefined,
      }),
    onSuccess: (data) => {
      onActionSuccess(data, 'returned');
      setReturnOpen(false);
      setReturnQty('');
      setReturnNotes('');
    },
    onError: (err) => onActionError(err, 'return stock'),
  });

  const anyPending =
    consumeMutation.isPending || replenishMutation.isPending || returnMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !wardStock) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load ward stock details.</AlertDescription>
      </Alert>
    );
  }

  const fillPercent = wardStock.max_level > 0
    ? Math.min(100, Math.round((wardStock.quantity_available / wardStock.max_level) * 100))
    : 0;

  const transactions = txData?.results || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={wardStock.drug_name}
        helpContent="View ward stock levels and perform consume, replenish, or return actions. Transaction history shows all movements."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConsumeOpen(true)}
              disabled={anyPending || wardStock.quantity_available <= 0}
            >
              <Minus className="mr-1 h-4 w-4" />
              Consume
            </Button>
            <Button size="sm" onClick={() => setReplenishOpen(true)} disabled={anyPending}>
              <ArrowDownToLine className="mr-1 h-4 w-4" />
              Replenish
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReturnOpen(true)}
              disabled={anyPending || wardStock.quantity_available <= 0}
            >
              <ArrowUpFromLine className="mr-1 h-4 w-4" />
              Return to Store
            </Button>
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{wardStock.drug_name}</span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {wardStock.store_location_name}
            {wardStock.last_replenished_at && (
              <> · Last replenished {new Date(wardStock.last_replenished_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <div className="shrink-0">
          {wardStock.is_below_par ? (
            <Badge
              variant="outline"
              className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 w-fit"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Below Par
            </Badge>
          ) : wardStock.is_above_max ? (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-fit"
            >
              Above Max
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 w-fit"
            >
              OK
            </Badge>
          )}
        </div>
      </div>

      {/* Stock Level Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock Levels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Stock</span>
              <span className="font-bold text-lg">{wardStock.quantity_available}</span>
            </div>
            <Progress
              value={fillPercent}
              className={`h-3 ${
                wardStock.is_below_par
                  ? '[&>div]:bg-destructive'
                  : wardStock.is_above_max
                    ? '[&>div]:bg-amber-500'
                    : '[&>div]:bg-green-500'
              }`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>Par: {wardStock.par_level}</span>
              <span>Max: {wardStock.max_level}</span>
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Quantity Available</dt>
              <dd className="font-medium">{wardStock.quantity_available}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Par Level</dt>
              <dd className="font-medium">{wardStock.par_level}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Max Level</dt>
              <dd className="font-medium">{wardStock.max_level}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reorder Qty</dt>
              <dd className="font-medium">{wardStock.reorder_quantity}</dd>
            </div>
          </dl>

          {wardStock.is_below_par && wardStock.reorder_quantity > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Stock is below par level. Suggested reorder quantity: <strong>{wardStock.reorder_quantity}</strong> units.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Transaction History ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {txLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[550px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(tx.performed_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={transactionTypeColors[tx.transaction_type]}
                        >
                          {transactionTypeLabels[tx.transaction_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span
                          className={
                            tx.transaction_type === 'CONSUME'
                              ? 'text-destructive'
                              : tx.transaction_type === 'REPLENISH'
                                ? 'text-green-600 dark:text-green-400'
                                : ''
                          }
                        >
                          {tx.transaction_type === 'CONSUME' ? '-' : '+'}
                          {tx.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{tx.performed_by_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {tx.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consume Dialog */}
      <Dialog open={consumeOpen} onOpenChange={setConsumeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Consume Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="consume-qty">
                Quantity (max: {wardStock.quantity_available})
              </Label>
              <Input
                id="consume-qty"
                type="number"
                min={1}
                max={wardStock.quantity_available}
                value={consumeQty}
                onChange={(e) => setConsumeQty(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <Label htmlFor="consume-notes">Notes (optional)</Label>
              <Textarea
                id="consume-notes"
                rows={2}
                value={consumeNotes}
                onChange={(e) => setConsumeNotes(e.target.value)}
                placeholder="e.g., Patient MRN, reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsumeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => consumeMutation.mutate()}
              disabled={
                consumeMutation.isPending ||
                !consumeQty ||
                Number(consumeQty) < 1 ||
                Number(consumeQty) > wardStock.quantity_available
              }
            >
              {consumeMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Consume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replenish Dialog */}
      <Dialog open={replenishOpen} onOpenChange={setReplenishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replenish Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="replenish-qty">Quantity</Label>
              <Input
                id="replenish-qty"
                type="number"
                min={1}
                value={replenishQty}
                onChange={(e) => setReplenishQty(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <Label htmlFor="replenish-notes">Notes (optional)</Label>
              <Textarea
                id="replenish-notes"
                rows={2}
                value={replenishNotes}
                onChange={(e) => setReplenishNotes(e.target.value)}
                placeholder="e.g., Source batch, reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplenishOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => replenishMutation.mutate()}
              disabled={
                replenishMutation.isPending || !replenishQty || Number(replenishQty) < 1
              }
            >
              {replenishMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Replenish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to Store Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return to Store</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="return-qty">
                Quantity (max: {wardStock.quantity_available})
              </Label>
              <Input
                id="return-qty"
                type="number"
                min={1}
                max={wardStock.quantity_available}
                value={returnQty}
                onChange={(e) => setReturnQty(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <Label htmlFor="return-notes">Notes (optional)</Label>
              <Textarea
                id="return-notes"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g., Reason for return"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => returnMutation.mutate()}
              disabled={
                returnMutation.isPending ||
                !returnQty ||
                Number(returnQty) < 1 ||
                Number(returnQty) > wardStock.quantity_available
              }
            >
              {returnMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
