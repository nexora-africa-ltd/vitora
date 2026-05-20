'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { StockCountStatus, StockCountDetail, StockCountItem } from '@/lib/types/inventory';

const statusLabels: Record<StockCountStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<StockCountStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  COMPLETED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STEPS: StockCountStatus[] = ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'APPROVED'];

function CountStepper({ status }: { status: StockCountStatus }) {
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

export default function StockCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = parseInt(resolvedParams.id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Inline editing state: { itemId → { counted_quantity, variance_reason } }
  const [editedItems, setEditedItems] = useState<
    Record<number, { counted_quantity: string; variance_reason: string }>
  >({});
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const { canPerformAction } = usePermissions();

  const {
    data: count,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory-stock-count', id],
    queryFn: () => inventoryApi.getStockCount(id),
    enabled: !isNaN(id),
  });

  const [itemsPage, setItemsPage] = useState(1);
  const { data: itemsData } = useQuery({
    queryKey: ['inventory-stock-count-items', id, itemsPage],
    queryFn: () => inventoryApi.listStockCountItems(id, { page: itemsPage, page_size: 50 }),
    enabled: !isNaN(id) && !!count,
  });
  const items = itemsData?.results || [];
  const totalItemPages = Math.ceil((itemsData?.count || 0) / 50);

  function onActionSuccess(updated: StockCountDetail, label: string) {
    queryClient.setQueryData(['inventory-stock-count', id], updated);
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-counts'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-count-items', id] });
    toast({ variant: 'success', title: `Count ${label}` });
  }

  function onActionError(err: unknown, label: string) {
    toast({
      variant: 'destructive',
      title: `Failed to ${label}`,
      description: getApiErrorMessage(err),
    });
  }

  const generateMutation = useMutation({
    mutationFn: () => inventoryApi.generateStockCountItems(id),
    onSuccess: (result) => {
      // generate_items returns {created, total}, refetch full detail
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-count', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-count-items', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-counts'] });
      toast({
        variant: 'success',
        title: `Generated ${result.created} items (${result.total} total)`,
      });
    },
    onError: (err) => onActionError(err, 'generate items'),
  });

  const startMutation = useMutation({
    mutationFn: () => inventoryApi.startStockCount(id),
    onSuccess: (data) => onActionSuccess(data, 'started'),
    onError: (err) => onActionError(err, 'start count'),
  });

  const completeMutation = useMutation({
    mutationFn: () => inventoryApi.completeStockCount(id),
    onSuccess: (data) => onActionSuccess(data, 'completed'),
    onError: (err) => onActionError(err, 'complete count'),
  });

  const approveMutation = useMutation({
    mutationFn: () => inventoryApi.approveStockCount(id),
    onSuccess: (data) => onActionSuccess(data, 'approved'),
    onError: (err) => onActionError(err, 'approve count'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => inventoryApi.cancelStockCount(id),
    onSuccess: (data) => onActionSuccess(data, 'cancelled'),
    onError: (err) => onActionError(err, 'cancel count'),
  });

  async function saveItem(item: StockCountItem) {
    const edit = editedItems[item.id];
    if (!edit) return;
    const qty = parseInt(edit.counted_quantity, 10);
    if (isNaN(qty) || qty < 0) {
      toast({ variant: 'destructive', title: 'Enter a valid quantity' });
      return;
    }
    setSavingItemId(item.id);
    try {
      await inventoryApi.updateStockCountItem(id, item.id, {
        counted_quantity: qty,
        variance_reason: edit.variance_reason || undefined,
      });
      // Refetch to update all computed fields
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-count', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-count-items', id] });
      setEditedItems((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast({ variant: 'success', title: `Saved count for ${item.drug_name}` });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to save count',
        description: getApiErrorMessage(err),
      });
    } finally {
      setSavingItemId(null);
    }
  }

  function getEditValue(item: StockCountItem) {
    return editedItems[item.id] ?? {
      counted_quantity: item.counted_quantity != null ? String(item.counted_quantity) : '',
      variance_reason: item.variance_reason || '',
    };
  }

  function setEditField(itemId: number, field: 'counted_quantity' | 'variance_reason', value: string) {
    setEditedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...getEditValue(items.find((i) => i.id === itemId)!),
        ...prev[itemId],
        [field]: value,
      },
    }));
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !count) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load stock count details.</AlertDescription>
      </Alert>
    );
  }

  const isDraft = count.status === 'DRAFT';
  const isInProgress = count.status === 'IN_PROGRESS';
  const isEditable = isDraft || isInProgress;
  const isCompleted = count.status === 'COMPLETED';
  const canApproveCount = isCompleted && canPerformAction('inventory.approve_stock_count' as never);
  const canCancel = !['APPROVED', 'CANCELLED'].includes(count.status);
  const hasItems = count.item_count > 0;
  const anyPending =
    generateMutation.isPending ||
    startMutation.isPending ||
    completeMutation.isPending ||
    approveMutation.isPending ||
    cancelMutation.isPending ||
    savingItemId !== null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Count ${count.count_number}`}
        helpContent="View count details, record physical quantities, and advance through the workflow. Approving a completed count auto-creates stock adjustments for any variances."
        actions={
          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateMutation.mutate()}
                  disabled={anyPending}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardList className="mr-1 h-4 w-4" />
                  )}
                  Generate Items
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={anyPending || !hasItems}>
                      <Play className="mr-1 h-4 w-4" />
                      Start Count
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start Stock Count?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will move the count to In Progress. Staff can begin recording physical quantities.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => startMutation.mutate()}>
                        Start
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {isInProgress && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    <Check className="mr-1 h-4 w-4" />
                    Complete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Complete Stock Count?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All items must have been counted. This moves the count to review stage.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => completeMutation.mutate()}>
                      Complete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canApproveCount && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={anyPending}>
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Stock Count?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will create stock adjustments for all variances and finalize the count. This action cannot be undone.
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
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={anyPending}>
                    Cancel Count
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Stock Count?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the count. No stock adjustments will be created.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => cancelMutation.mutate()}
                    >
                      Cancel Count
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      {/* Progress stepper */}
      <Card>
        <CardContent className="py-3 px-4">
          <CountStepper status={count.status} />
        </CardContent>
      </Card>

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {count.count_number}
            <span className="text-muted-foreground"> · {count.store_location_name || 'All locations'}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {new Date(count.created_at).toLocaleDateString()} by {count.started_by_name}
          </p>
        </div>
        <Badge variant="outline" className={`${statusColors[count.status]} shrink-0 w-fit`}>
          {statusLabels[count.status]}
        </Badge>
      </div>

      {/* Variance summary */}
      {hasItems && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-lg font-bold">{count.item_count}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Counted</p>
              <p className="text-lg font-bold">{count.total_items_counted}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-lg font-bold">{count.item_count - count.total_items_counted}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Discrepancies</p>
              <p className={`text-lg font-bold ${count.total_discrepancies > 0 ? 'text-destructive' : ''}`}>
                {count.total_discrepancies}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Count Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Count Items ({count.item_count})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {!hasItems ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-2">
                No items generated yet.
              </p>
              {isDraft && (
                <p className="text-xs text-muted-foreground">
                  Click &quot;Generate Items&quot; to populate from current stock batches.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Drug</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead className="text-right">System Qty</TableHead>
                    <TableHead className="text-right">
                      {isEditable ? 'Counted Qty *' : 'Counted Qty'}
                    </TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    {isEditable && <TableHead>Reason</TableHead>}
                    {isEditable && <TableHead className="w-[60px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const edit = getEditValue(item);
                    const isSaving = savingItemId === item.id;
                    const hasEdit = editedItems[item.id] != null;
                    return (
                      <TableRow
                        key={item.id}
                        className={
                          item.has_discrepancy
                            ? 'bg-red-50/50 dark:bg-red-950/10'
                            : ''
                        }
                      >
                        <TableCell className="font-medium text-sm">
                          {item.drug_name}
                        </TableCell>
                        <TableCell className="text-sm">{item.batch_number}</TableCell>
                        <TableCell className="text-right text-sm">
                          {item.system_quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditable ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 ml-auto text-right h-8 text-sm"
                              value={edit.counted_quantity}
                              onChange={(e) =>
                                setEditField(item.id, 'counted_quantity', e.target.value)
                              }
                            />
                          ) : (
                            <span className="text-sm">
                              {item.counted_quantity ?? '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {(() => {
                            const countedStr = edit.counted_quantity;
                            const counted = countedStr !== '' ? parseInt(countedStr, 10) : NaN;
                            const variance = !isNaN(counted) ? counted - item.system_quantity : (item.variance ?? NaN);
                            if (isNaN(variance)) return <span className="text-sm text-muted-foreground">—</span>;
                            return (
                              <span
                                className={`text-sm font-medium ${
                                  variance !== 0
                                    ? variance > 0
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-destructive'
                                    : ''
                                }`}
                              >
                                {variance > 0 ? '+' : ''}
                                {variance}
                              </span>
                            );
                          })()}
                        </TableCell>
                        {isEditable && (
                          <TableCell>
                            <Input
                              className="w-32 h-8 text-sm"
                              placeholder="Reason"
                              value={edit.variance_reason}
                              onChange={(e) =>
                                setEditField(item.id, 'variance_reason', e.target.value)
                              }
                            />
                          </TableCell>
                        )}
                        {isEditable && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => saveItem(item)}
                              disabled={isSaving || !hasEdit}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {totalItemPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Page {itemsPage} of {totalItemPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setItemsPage((p) => Math.max(1, p - 1))} disabled={itemsPage <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setItemsPage((p) => Math.min(totalItemPages, p + 1))} disabled={itemsPage >= totalItemPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Count Type</dt>
              <dd className="font-medium capitalize">{count.count_type.toLowerCase().replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Store Location</dt>
              <dd className="font-medium">{count.store_location_name || 'All locations'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Started By</dt>
              <dd className="font-medium">{count.started_by_name}</dd>
            </div>
            {count.started_at && (
              <div>
                <dt className="text-muted-foreground">Started At</dt>
                <dd className="font-medium">{new Date(count.started_at).toLocaleString()}</dd>
              </div>
            )}
            {count.completed_at && (
              <div>
                <dt className="text-muted-foreground">Completed At</dt>
                <dd className="font-medium">{new Date(count.completed_at).toLocaleString()}</dd>
              </div>
            )}
            {count.approved_by_name && (
              <div>
                <dt className="text-muted-foreground">Approved By</dt>
                <dd className="font-medium">{count.approved_by_name}</dd>
              </div>
            )}
            {count.approved_at && (
              <div>
                <dt className="text-muted-foreground">Approved At</dt>
                <dd className="font-medium">{new Date(count.approved_at).toLocaleString()}</dd>
              </div>
            )}
          </dl>

          {count.notes && (
            <div className="mt-4 pt-4 border-t text-sm">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{count.notes}</p>
            </div>
          )}

          {count.total_discrepancies > 0 && count.status === 'COMPLETED' && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This count has <strong>{count.total_discrepancies}</strong> discrepancies.
                Approving will create stock adjustment records to reconcile the differences.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
