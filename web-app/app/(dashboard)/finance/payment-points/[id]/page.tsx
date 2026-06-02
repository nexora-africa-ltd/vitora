/**
 * Payment Point Detail Page
 *
 * Drill-down view showing payment point details and payments processed through it.
 */
'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit,
  Loader2,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { usePaymentPoint, useUpdatePaymentPoint, usePayments } from '@/lib/hooks/billing';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import type { Payment, PaymentPoint as PaymentPointType } from '@/lib/types/billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMethodIcon(method: string) {
  switch (method) {
    case 'CASH': return <Banknote className="h-5 w-5 text-emerald-600" />;
    case 'MPESA': return <Smartphone className="h-5 w-5 text-green-600" />;
    case 'CARD': return <CreditCard className="h-5 w-5 text-blue-600" />;
    case 'BANK_TRANSFER': return <Wallet className="h-5 w-5 text-purple-600" />;
    default: return <Wallet className="h-5 w-5 text-muted-foreground" />;
  }
}

function getMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    MPESA: 'M-Pesa',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer',
    INSURANCE: 'Insurance',
    CORPORATE: 'Corporate',
    CHEQUE: 'Cheque',
  };
  return labels[method] ?? method;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Completed</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Pending</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">Failed</Badge>;
    case 'REVERSED':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Reversed</Badge>;
    case 'REFUNDED':
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Refunded</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'CHEQUE', label: 'Cheque' },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PaymentPointDetailPage() {
  const { id } = useParams();
  const pointId = Number(id);
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('billing.manage_config');
  const [page, setPage] = useState(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const pageSize = 20;

  const { data: paymentPoint, isLoading: ppLoading, refetch: refetchPoint } = usePaymentPoint(
    isNaN(pointId) ? null : pointId
  );

  const { data: paymentsData, isLoading: paymentsLoading, refetch } = usePayments({
    payment_point: isNaN(pointId) ? undefined : pointId,
    page,
    page_size: pageSize,
    ordering: '-payment_date',
  });

  const payments = paymentsData?.results ?? [];
  const totalCount = paymentsData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Stats
  const completedPayments = payments.filter((p: Payment) => p.status === 'COMPLETED');
  const totalCollected = completedPayments.reduce(
    (sum: number, p: Payment) => sum + parseFloat(p.amount),
    0
  );

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  if (ppLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!paymentPoint) {
    return (
      <div className="space-y-4">
        <PageHeader title="Payment Point Not Found" />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            This payment point does not exist or you don&apos;t have access.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={paymentPoint.name}
          helpContent="View payment point details and all payments processed through this till or account."
          actions={
            canManage ? (
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            ) : undefined
          }
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3 min-w-0">
            {getMethodIcon(paymentPoint.method)}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {paymentPoint.name}
                <span className="ml-2 font-mono text-muted-foreground">{paymentPoint.code}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {getMethodLabel(paymentPoint.method)}
                {paymentPoint.till_number && ` • Till: ${paymentPoint.till_number}`}
                {paymentPoint.paybill_number && ` • Paybill: ${paymentPoint.paybill_number}`}
                {paymentPoint.bank_name && ` • ${paymentPoint.bank_name}`}
                {paymentPoint.bank_account_number && ` • ****${paymentPoint.bank_account_number.slice(-4)}`}
              </p>
            </div>
          </div>
          <Badge variant={paymentPoint.is_active ? 'default' : 'secondary'} className="shrink-0 w-fit self-start sm:self-auto">
            {paymentPoint.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <AdminStatCard
            title="Total Payments"
            value={totalCount}
            description="Through this point"
            icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Collected (this page)"
            value={formatCurrency(totalCollected)}
            description={`${completedPayments.length} completed`}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Created"
            value={formatDateTime(paymentPoint.created_at)}
            description={paymentPoint.created_by_username ? `By ${paymentPoint.created_by_username}` : undefined}
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Notes */}
        {paymentPoint.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{paymentPoint.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Payments
              <Badge variant="secondary" className="ml-1">{totalCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={payments}
                emptyMessage="No payments recorded through this payment point yet."
                keyExtractor={(p: Payment) => p.id}
                defaultSortColumn="payment_date"
                defaultSortDirection="desc"
                mobileCard={(p: Payment) => (
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{formatCurrency(parseFloat(p.amount))}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {p.patient_name || p.invoice_number || `Invoice #${p.invoice}`}
                        </p>
                      </div>
                      {getStatusBadge(p.status)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(p.payment_date || p.created_at)}
                      {p.payment_reference && ` • ${p.payment_reference}`}
                    </p>
                  </Card>
                )}
                columns={[
                  {
                    key: 'payment_reference',
                    header: 'Reference',
                    sortable: true,
                    cell: (p: Payment) => (
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.payment_reference}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.patient_name || p.invoice_number || `Invoice #${p.invoice}`}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'amount',
                    header: 'Amount',
                    sortable: true,
                    sortType: 'number' as const,
                    sortFn: (a: Payment, b: Payment) => parseFloat(a.amount) - parseFloat(b.amount),
                    cell: (p: Payment) => (
                      <span className="font-medium">{formatCurrency(parseFloat(p.amount))}</span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    cell: (p: Payment) => getStatusBadge(p.status),
                  },
                  {
                    key: 'payment_date',
                    header: 'Date',
                    sortable: true,
                    sortType: 'date' as const,
                    hideOnMobile: true,
                    cell: (p: Payment) => (
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(p.payment_date || p.created_at)}
                      </span>
                    ),
                  },
                  {
                    key: 'received_by_username',
                    header: 'Received By',
                    hideOnMobile: true,
                    cell: (p: Payment) => (
                      <span className="text-sm text-muted-foreground">
                        {p.received_by_username || '—'}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}

        {/* Edit Dialog */}
        {editDialogOpen && paymentPoint && (
          <EditPaymentPointDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            paymentPoint={paymentPoint}
            onSuccess={() => { refetchPoint(); }}
          />
        )}
      </div>
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------------------
// Edit Payment Point Dialog
// ---------------------------------------------------------------------------

function EditPaymentPointDialog({
  open,
  onOpenChange,
  paymentPoint,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentPoint: PaymentPointType;
  onSuccess: () => void;
}) {
  const updatePP = useUpdatePaymentPoint();

  const [form, setForm] = useState({
    name: paymentPoint.name,
    code: paymentPoint.code,
    method: paymentPoint.method as PaymentMethod,
    till_number: paymentPoint.till_number ?? '',
    paybill_number: paymentPoint.paybill_number ?? '',
    paybill_account_number: paymentPoint.paybill_account_number ?? '',
    bank_name: paymentPoint.bank_name ?? '',
    bank_account_name: paymentPoint.bank_account_name ?? '',
    bank_account_number: paymentPoint.bank_account_number ?? '',
    bank_branch: paymentPoint.bank_branch ?? '',
    is_active: paymentPoint.is_active,
    notes: paymentPoint.notes ?? '',
  });

  const isMpesa = form.method === 'MPESA';
  const isBank = form.method === 'BANK_TRANSFER';

  const handleSubmit = useCallback(async () => {
    if (!form.name || !form.code || !form.method) {
      toast.error('Name, code, and method are required');
      return;
    }

    try {
      await updatePP.mutateAsync({
        id: paymentPoint.id,
        data: {
          name: form.name,
          code: form.code,
          method: form.method,
          till_number: form.till_number || undefined,
          paybill_number: form.paybill_number || undefined,
          paybill_account_number: form.paybill_account_number || undefined,
          bank_name: form.bank_name || undefined,
          bank_account_name: form.bank_account_name || undefined,
          bank_account_number: form.bank_account_number || undefined,
          bank_branch: form.bank_branch || undefined,
          is_active: form.is_active,
          notes: form.notes || undefined,
        },
      });
      toast.success('Payment point updated');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }, [form, paymentPoint.id, updatePP, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Edit Payment Point</DialogTitle>
            <HelpPopover content="Update payment point details. Changes take effect immediately for new payments." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pp-name">Name *</Label>
              <Input id="pp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-code">Code *</Label>
              <Input id="pp-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pp-method">Payment Method *</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PaymentMethod })}>
                <SelectTrigger id="pp-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="pp-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="pp-active">Active</Label>
            </div>
          </div>

          {isMpesa && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pp-till">Till Number</Label>
                <Input id="pp-till" value={form.till_number} onChange={(e) => setForm({ ...form, till_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-paybill">Paybill Number</Label>
                <Input id="pp-paybill" value={form.paybill_number} onChange={(e) => setForm({ ...form, paybill_number: e.target.value })} />
              </div>
            </div>
          )}

          {isBank && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pp-bank">Bank Name</Label>
                <Input id="pp-bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-acc-num">Account Number</Label>
                <Input id="pp-acc-num" value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pp-notes">Notes</Label>
            <Textarea id="pp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updatePP.isPending}>
            {updatePP.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
