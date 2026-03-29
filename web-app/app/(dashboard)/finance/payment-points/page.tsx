/**
 * Payment Points (Tills) Config Page
 *
 * CRUD management for payment points / tills / collection accounts.
 * Defines where payments are collected (cash registers, M-Pesa tills,
 * bank accounts) and which method each point accepts.
 */
'use client';

import { useCallback, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Edit,
  Loader2,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Wallet,
  XCircle,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  usePaymentPoints,
  useCreatePaymentPoint,
  useUpdatePaymentPoint,
  useDeletePaymentPoint,
} from '@/lib/hooks/billing';
import type { PaymentPoint, PaymentPointCreateData } from '@/lib/types/billing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'MPESA', label: 'M-Pesa', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Wallet },
  { value: 'INSURANCE', label: 'Insurance', icon: Wallet },
  { value: 'CORPORATE', label: 'Corporate', icon: Wallet },
  { value: 'CHEQUE', label: 'Cheque', icon: Wallet },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

function getMethodBadgeColor(method: string) {
  switch (method) {
    case 'CASH': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'MPESA': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'CARD': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'BANK_TRANSFER': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

function getMethodLabel(method: string) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

// ---------------------------------------------------------------------------
// Payment Point Form Dialog
// ---------------------------------------------------------------------------

function PaymentPointFormDialog({
  open,
  onOpenChange,
  paymentPoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentPoint?: PaymentPoint;
}) {
  const isEdit = !!paymentPoint;
  const createPP = useCreatePaymentPoint();
  const updatePP = useUpdatePaymentPoint();

  const [form, setForm] = useState({
    name: paymentPoint?.name ?? '',
    code: paymentPoint?.code ?? '',
    method: (paymentPoint?.method ?? 'CASH') as PaymentMethod,
    till_number: paymentPoint?.till_number ?? '',
    paybill_number: paymentPoint?.paybill_number ?? '',
    paybill_account_number: paymentPoint?.paybill_account_number ?? '',
    bank_name: paymentPoint?.bank_name ?? '',
    bank_account_name: paymentPoint?.bank_account_name ?? '',
    bank_account_number: paymentPoint?.bank_account_number ?? '',
    bank_branch: paymentPoint?.bank_branch ?? '',
    is_active: paymentPoint?.is_active ?? true,
    notes: paymentPoint?.notes ?? '',
  });

  const isMpesa = form.method === 'MPESA';
  const isBank = form.method === 'BANK_TRANSFER';

  const handleSubmit = useCallback(async () => {
    if (!form.name || !form.code || !form.method) {
      toast.error('Name, code, and method are required');
      return;
    }

    const data: PaymentPointCreateData = {
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
    };

    try {
      if (isEdit && paymentPoint) {
        await updatePP.mutateAsync({ id: paymentPoint.id, data });
        toast.success('Payment point updated');
      } else {
        await createPP.mutateAsync(data);
        toast.success('Payment point created');
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? 'Failed to update payment point' : 'Failed to create payment point');
    }
  }, [form, isEdit, paymentPoint, createPP, updatePP, onOpenChange]);

  const isPending = createPP.isPending || updatePP.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEdit ? 'Edit Payment Point' : 'New Payment Point'}</DialogTitle>
            <HelpPopover content="Payment points represent where money is collected — cash registers, M-Pesa tills, or bank accounts. They appear when recording payments." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pp-name">Name *</Label>
              <Input id="pp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Cash Register" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-code">Code *</Label>
              <Input id="pp-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CASH-01" />
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

          {/* M-Pesa fields */}
          {isMpesa && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-green-600" />
                  M-Pesa Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pp-till">Till Number</Label>
                    <Input id="pp-till" value={form.till_number} onChange={(e) => setForm({ ...form, till_number: e.target.value })} placeholder="123456" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pp-paybill">Paybill Number</Label>
                    <Input id="pp-paybill" value={form.paybill_number} onChange={(e) => setForm({ ...form, paybill_number: e.target.value })} placeholder="888880" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pp-paybill-acc">Paybill Account Number</Label>
                  <Input id="pp-paybill-acc" value={form.paybill_account_number} onChange={(e) => setForm({ ...form, paybill_account_number: e.target.value })} placeholder="Account reference" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bank fields */}
          {isBank && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-purple-600" />
                  Bank Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pp-bank">Bank Name</Label>
                    <Input id="pp-bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="KCB Bank" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pp-branch">Branch</Label>
                    <Input id="pp-branch" value={form.bank_branch} onChange={(e) => setForm({ ...form, bank_branch: e.target.value })} placeholder="Nairobi Branch" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pp-acc-name">Account Name</Label>
                    <Input id="pp-acc-name" value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} placeholder="Facility Name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pp-acc-num">Account Number</Label>
                    <Input id="pp-acc-num" value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} placeholder="1234567890" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Label htmlFor="pp-notes">Notes</Label>
            <Textarea id="pp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes about this payment point" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Payment Point'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PaymentPointsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, refetch } = usePaymentPoints({
    method: methodFilter !== 'all' ? (methodFilter as PaymentPoint['method']) : undefined,
    page,
    page_size: pageSize,
  });

  const paymentPoints = data?.results ?? [];
  const deletePP = useDeletePaymentPoint();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPP, setEditingPP] = useState<PaymentPoint | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // Stats
  const activeCount = paymentPoints.filter((pp) => pp.is_active).length;
  const methodCounts = paymentPoints.reduce<Record<string, number>>((acc, pp) => {
    acc[pp.method] = (acc[pp.method] || 0) + 1;
    return acc;
  }, {});
  const topMethod = Object.entries(methodCounts).sort(([, a], [, b]) => b - a)[0];

  // Pagination
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePP.mutateAsync(deleteTarget.id);
      toast.success(`Payment point "${deleteTarget.name}" deleted`);
    } catch {
      toast.error('Failed to delete payment point');
    }
    setDeleteTarget(null);
  };

  const openEdit = (pp: PaymentPoint) => {
    setEditingPP(pp);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingPP(undefined);
    setDialogOpen(true);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Payment Points"
          helpContent="Manage tills, collection accounts, and payment terminals. Payment points define where and how payments are received — they appear when staff record payments."
        />

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Total Points"
            value={data?.count ?? 0}
            description="Configured"
            icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Active"
            value={activeCount}
            description="Accepting payments"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Methods"
            value={Object.keys(methodCounts).length}
            description="Payment types configured"
            icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Top Method"
            value={topMethod ? getMethodLabel(topMethod[0]) : '—'}
            description={topMethod ? `${topMethod[1]} point(s)` : 'No data'}
            icon={<Banknote className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Filters & Add */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[220px]" aria-label="Filter by payment method">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter by method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Payment Point</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Payment Points
              <Badge variant="secondary" className="ml-1">{data?.count ?? 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={paymentPoints}
                emptyMessage="No payment points configured. Create one to start accepting payments."
                keyExtractor={(pp) => pp.id}
                defaultSortColumn="name"
                defaultSortDirection="asc"
                mobileCard={(pp) => (
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium truncate">{pp.name}</p>
                        <p className="font-mono text-sm text-muted-foreground">{pp.code}</p>
                      </div>
                      <Badge variant={pp.is_active ? 'default' : 'secondary'}>
                        {pp.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={getMethodBadgeColor(pp.method)}>{getMethodLabel(pp.method)}</Badge>
                      {pp.till_number && <span className="text-sm text-muted-foreground">Till: {pp.till_number}</span>}
                      {pp.bank_name && <span className="text-sm text-muted-foreground">{pp.bank_name}</span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(pp)}>
                        <Edit className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ id: pp.id, name: pp.name })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                )}
                columns={[
                  {
                    key: 'name',
                    header: 'Payment Point',
                    sortable: true,
                    cell: (pp) => (
                      <div className="min-w-0">
                        <p className="font-medium truncate">{pp.name}</p>
                        <p className="font-mono text-sm text-muted-foreground truncate">{pp.code}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'method',
                    header: 'Method',
                    sortable: true,
                    cell: (pp) => (
                      <Badge className={getMethodBadgeColor(pp.method)}>
                        {getMethodLabel(pp.method)}
                      </Badge>
                    ),
                  },
                  {
                    key: 'details',
                    header: 'Details',
                    hideOnMobile: true,
                    cell: (pp) => {
                      if (pp.method === 'MPESA') {
                        return (
                          <span className="text-sm text-muted-foreground">
                            {pp.till_number ? `Till: ${pp.till_number}` : ''}
                            {pp.paybill_number ? `Paybill: ${pp.paybill_number}` : ''}
                          </span>
                        );
                      }
                      if (pp.method === 'BANK_TRANSFER') {
                        return (
                          <span className="text-sm text-muted-foreground">
                            {pp.bank_name ? `${pp.bank_name}` : ''}
                            {pp.bank_account_number ? ` • ****${pp.bank_account_number.slice(-4)}` : ''}
                          </span>
                        );
                      }
                      return <span className="text-sm text-muted-foreground">—</span>;
                    },
                  },
                  {
                    key: 'is_active',
                    header: 'Status',
                    sortable: true,
                    sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
                    cell: (pp) => (
                      <Badge variant={pp.is_active ? 'default' : 'secondary'}>
                        {pp.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-[100px] text-right',
                    cell: (pp) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(pp)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ id: pp.id, name: pp.name })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
              Next
            </Button>
          </div>
        )}

        {/* Form Dialog */}
        {dialogOpen && (
          <PaymentPointFormDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setEditingPP(undefined);
            }}
            paymentPoint={editingPP}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete payment point?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{deleteTarget?.name}&rdquo;. Existing payments linked to this point will keep their reference, but new payments cannot use it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PullToRefresh>
  );
}
