'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ShoppingCart,
  Loader2,
  XCircle,
  Package,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import type {
  ReorderSuggestion,
  ReorderUrgency,
  ReorderStatus,
} from '@/lib/types/inventory';

const URGENCY_CONFIG: Record<ReorderUrgency, { label: string; color: string }> = {
  CRITICAL: {
    label: 'Critical',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  HIGH: {
    label: 'High',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
  MEDIUM: {
    label: 'Medium',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  LOW: {
    label: 'Low',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
};

const STATUS_CONFIG: Record<ReorderStatus, { label: string; color: string }> = {
  PENDING: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  CONVERTED_TO_PO: {
    label: 'Converted',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  DISMISSED: {
    label: 'Dismissed',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

function UrgencyBadge({ urgency }: { urgency: ReorderUrgency }) {
  const cfg = URGENCY_CONFIG[urgency] ?? URGENCY_CONFIG.MEDIUM;
  return <Badge className={`${cfg.color} shrink-0 w-fit`}>{cfg.label}</Badge>;
}

function StatusBadge({ status }: { status: ReorderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return <Badge className={`${cfg.color} shrink-0 w-fit`}>{cfg.label}</Badge>;
}

export default function ReorderSuggestionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Action dialogs
  const [convertTarget, setConvertTarget] = useState<ReorderSuggestion | null>(null);
  const [dismissTarget, setDismissTarget] = useState<ReorderSuggestion | null>(null);

  const params = {
    page,
    ...(urgencyFilter !== 'all' ? { urgency: urgencyFilter as ReorderUrgency } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter as ReorderStatus } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reorder-suggestions', params],
    queryFn: () => inventoryApi.listReorderSuggestions(params),
  });

  const suggestions = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  const criticalCount = suggestions.filter((s) => s.urgency === 'CRITICAL').length;
  const highCount = suggestions.filter((s) => s.urgency === 'HIGH').length;
  const pendingCount = suggestions.filter((s) => s.status === 'PENDING').length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reorder-suggestions'] });

  const convertMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.convertReorderToPO(id),
    onSuccess: (result) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({
        variant: 'success',
        title: 'Purchase order created',
        description: result.message,
      });
      setConvertTarget(null);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create PO',
        description: getApiErrorMessage(err),
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.dismissReorderSuggestion(id),
    onSuccess: () => {
      invalidate();
      toast({ variant: 'success', title: 'Suggestion dismissed' });
      setDismissTarget(null);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to dismiss',
        description: getApiErrorMessage(err),
      });
    },
  });

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Reorder Suggestions"
          helpContent="Automated reorder suggestions based on demand forecasts and current stock levels. Convert suggestions to purchase orders or dismiss them."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <p className="text-xl font-bold mt-1">{isLoading ? '...' : totalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="text-xs text-muted-foreground">Critical</p>
              </div>
              <p className="text-xl font-bold mt-1 text-red-600">{isLoading ? '...' : criticalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <p className="text-xs text-muted-foreground">High</p>
              </div>
              <p className="text-xl font-bold mt-1 text-orange-600">{isLoading ? '...' : highCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <p className="text-xl font-bold mt-1 text-amber-600">{isLoading ? '...' : pendingCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={urgencyFilter} onValueChange={(v) => { setUrgencyFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONVERTED_TO_PO">Converted</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load reorder suggestions.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={suggestions}
              keyExtractor={(s) => s.id}
              columns={[
                {
                  key: 'drug_name',
                  header: 'Drug',
                  sortable: true,
                  cell: (s) => <span className="font-medium">{s.drug_name}</span>,
                },
                {
                  key: 'supplier_name',
                  header: 'Supplier',
                  sortable: true,
                  cell: (s) => s.supplier_name || <span className="text-muted-foreground">—</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'current_stock',
                  header: 'Current',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (s) => <span className="font-mono">{Number(s.current_stock).toLocaleString()}</span>,
                },
                {
                  key: 'reorder_point',
                  header: 'Reorder Pt',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (s) => <span className="font-mono">{Number(s.reorder_point).toLocaleString()}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'suggested_quantity',
                  header: 'Suggested Qty',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (s) => (
                    <span className="font-mono font-medium">{Number(s.suggested_quantity).toLocaleString()}</span>
                  ),
                },
                {
                  key: 'urgency',
                  header: 'Urgency',
                  sortable: true,
                  cell: (s) => <UrgencyBadge urgency={s.urgency} />,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (s) => <StatusBadge status={s.status} />,
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (s) =>
                    s.status === 'PENDING' ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={!s.supplier}
                          onClick={(e) => { e.stopPropagation(); setConvertTarget(s); }}
                        >
                          <ShoppingCart className="mr-1 h-3 w-3" />
                          To PO
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); setDismissTarget(s); }}
                        >
                          <XCircle className="mr-1 h-3 w-3" />
                          Dismiss
                        </Button>
                      </div>
                    ) : s.status === 'CONVERTED_TO_PO' && s.purchase_order ? (
                      <Button
                        size="sm"
                        variant="link"
                        className="h-7 text-xs p-0"
                        onClick={(e) => { e.stopPropagation(); router.push(`/inventory/purchase-orders/${s.purchase_order}`); }}
                      >
                        View PO
                      </Button>
                    ) : null,
                },
              ]}
              mobileCard={(s) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.drug_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.supplier_name || 'No supplier'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <UrgencyBadge urgency={s.urgency} />
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Current</span>
                      <p className="font-mono font-medium">{Number(s.current_stock).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reorder</span>
                      <p className="font-mono">{Number(s.reorder_point).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Suggested</span>
                      <p className="font-mono font-medium">{Number(s.suggested_quantity).toLocaleString()}</p>
                    </div>
                  </div>
                  {s.status === 'PENDING' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        disabled={!s.supplier}
                        onClick={(e) => { e.stopPropagation(); setConvertTarget(s); }}
                      >
                        Convert to PO
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); setDismissTarget(s); }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </Card>
              )}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} suggestions)
                </p>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Convert to PO Dialog */}
      <AlertDialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new purchase order for{' '}
              <strong>{convertTarget?.drug_name}</strong> with suggested quantity of{' '}
              <strong>{convertTarget ? Number(convertTarget.suggested_quantity).toLocaleString() : ''}</strong>{' '}
              from <strong>{convertTarget?.supplier_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => convertTarget && convertMutation.mutate(convertTarget.id)}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dismiss Dialog */}
      <AlertDialog open={!!dismissTarget} onOpenChange={(open) => !open && setDismissTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss suggestion?</AlertDialogTitle>
            <AlertDialogDescription>
              Dismiss the reorder suggestion for <strong>{dismissTarget?.drug_name}</strong>?
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => dismissTarget && dismissMutation.mutate(dismissTarget.id)}
              disabled={dismissMutation.isPending}
            >
              {dismissMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
}
