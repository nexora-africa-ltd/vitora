/**
 * Invoice Detail Component
 * Displays full invoice information with line items and actions
 */
'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreditCard,
  FileCheck,
  FileX,
  Printer,
  Send,
  Trash2,
  AlertCircle,
  Percent,
  Plus,
  ExternalLink,
  Clock,
  ArrowRightCircle,
  RefreshCw,
  Link2,
  Receipt,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { printInvoice } from '@/lib/documents';
import { SHALogo } from '@/components/ui/sha-logo';
import { ClaimSubmissionButton, ClaimStatusBadge } from '@/components/billing/sha';
import { ActionButton } from '@/components/shared/action-button';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Input } from '@/components/ui/input';
import type { Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types/billing';
import type { Claim, ClaimItem } from '@/lib/types/sha';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/use-permissions';

function formatKES(amount: number): string {
  const formatted = amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `KES ${formatted}`;
}

function toAmount(value: unknown, fallback = 0): number {
  const num = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(num) ? num : fallback;
}

// ============================================================================
// Types
// ============================================================================

interface InvoiceDetailProps {
  invoice: Invoice | null;
  isLoading: boolean;
  onRecordPayment: (invoice: Invoice) => void;
  onFinalize: (invoice: Invoice) => void;
  onCancel: (invoice: Invoice) => void;
  onPrint?: (invoice: Invoice) => void;
  onEmail?: (invoice: Invoice) => void;
  onAddItem?: (invoice: Invoice) => void;
  onRemoveItem?: (invoice: Invoice, itemId: number) => void;
  onApplyDiscount?: (invoice: Invoice) => void;
  onCollectCopay?: (invoice: Invoice) => void;
  onClaimSubmitted?: (claim: Claim) => void;
  linkedClaim?: Claim | null;
  linkedClaimDetail?: Claim | null;
  onUpdateInvoiceItemAllocation?: (
    invoiceId: number,
    itemId: number,
    payload: {
      mode: 'patient' | 'discount';
      discount_amount?: string;
      discount_reason?: string;
    }
  ) => Promise<void>;
  // Proforma-specific actions
  onConvertProforma?: (invoice: Invoice) => void;
  onRenewProforma?: (invoice: Invoice) => void;
}

interface AllocationDraft {
  mode: 'patient' | 'discount';
  discount_amount: string;
  discount_reason: string;
  saving?: boolean;
  error?: string | null;
}

type InvoiceTotalsView = Invoice & {
  gross_total?: string | null;
  sha_credit_amount?: string | null;
  insurance_credit_amount?: string | null;
  payer_credit_total?: string | null;
  patient_copay_amount?: string | null;
  patient_net_due?: string | null;
};

// ============================================================================
// Status Badge Colors
// ============================================================================

const statusColors: Record<InvoiceStatus, string> = {
  PROFORMA: 'bg-purple-100 text-purple-700',
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500',
};

// ============================================================================
// Loading Skeleton
// ============================================================================

function InvoiceDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading invoice details">
      <div className="space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
      <span className="sr-only">Loading invoice details...</span>
    </div>
  );
}

// ============================================================================
// Not Found State
// ============================================================================

function InvoiceNotFound() {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>Invoice not found. Please select a valid invoice.</AlertDescription>
    </Alert>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceDetail({
  invoice,
  isLoading,
  onRecordPayment,
  onFinalize,
  onCancel,
  onPrint,
  onEmail,
  onAddItem,
  onRemoveItem,
  onApplyDiscount,
  onCollectCopay,
  onClaimSubmitted,
  linkedClaim,
  linkedClaimDetail,
  onUpdateInvoiceItemAllocation,
  onConvertProforma,
  onRenewProforma,
}: InvoiceDetailProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [editingInvoiceItemId, setEditingInvoiceItemId] = React.useState<number | null>(null);
  const [allocationDrafts, setAllocationDrafts] = React.useState<Record<number, AllocationDraft>>(
    {}
  );
  const { hasPermission } = usePermissions();
  const invoiceItems = React.useMemo(() => invoice?.items || [], [invoice?.items]);

  const claimItems = React.useMemo<ClaimItem[]>(() => {
    const raw = (linkedClaimDetail as (Claim & { items?: unknown }) | null)?.items;
    return Array.isArray(raw) ? (raw as ClaimItem[]) : [];
  }, [linkedClaimDetail]);

  const claimItemByInvoiceItemId = React.useMemo(() => {
    const map = new Map<number, ClaimItem>();
    for (const item of claimItems) {
      if (typeof item.invoice_item === 'number') {
        map.set(item.invoice_item, item);
      }
    }
    return map;
  }, [claimItems]);

  const pendingAllocationCount = React.useMemo(
    () =>
      invoiceItems
        .map((item) => claimItemByInvoiceItemId.get(item.id))
        .filter((item): item is ClaimItem => !!item)
        .filter((item) => item.allocation_status === 'pending').length,
    [invoiceItems, claimItemByInvoiceItemId]
  );

  React.useEffect(() => {
    if (invoiceItems.length === 0) {
      setAllocationDrafts({});
      return;
    }
    setAllocationDrafts((prev) => {
      const next: Record<number, AllocationDraft> = {};
      for (const item of invoiceItems) {
        const claimItem = claimItemByInvoiceItemId.get(item.id);
        const discountAmount = String(claimItem?.discount_amount ?? item.discount_amount ?? '0.00');
        next[item.id] = prev[item.id] ?? {
          mode: Number(discountAmount || '0') > 0 ? 'discount' : 'patient',
          discount_amount: discountAmount,
          discount_reason: String(claimItem?.discount_reason ?? ''),
          saving: false,
          error: null,
        };
      }
      return next;
    });
  }, [invoiceItems, claimItemByInvoiceItemId]);

  const updateAllocationDraft = React.useCallback(
    (invoiceItemId: number, patch: Partial<AllocationDraft>) => {
      setAllocationDrafts((prev) => ({
        ...prev,
        [invoiceItemId]: {
          ...(prev[invoiceItemId] ?? {
            mode: 'patient',
            discount_amount: '0.00',
            discount_reason: '',
            saving: false,
            error: null,
          }),
          ...patch,
        },
      }));
    },
    []
  );

  const saveAllocation = React.useCallback(
    async (invoiceItemId: number) => {
      if (!invoice?.id || !onUpdateInvoiceItemAllocation) return;
      const claimItem = claimItemByInvoiceItemId.get(invoiceItemId);
      if (claimItem) return;
      const draft = allocationDrafts[invoiceItemId];
      if (!draft) return;

      updateAllocationDraft(invoiceItemId, { saving: true, error: null });
      try {
        await onUpdateInvoiceItemAllocation(
          invoice.id,
          invoiceItemId,
          draft.mode === 'patient'
            ? { mode: 'patient' }
            : {
                mode: 'discount',
                discount_amount: draft.discount_amount,
                discount_reason: draft.discount_reason,
              }
        );
        setEditingInvoiceItemId(null);
      } catch (error: unknown) {
        const message =
          (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          (error as { message?: string })?.message ||
          'Failed to update allocation';
        updateAllocationDraft(invoiceItemId, { error: String(message) });
      } finally {
        updateAllocationDraft(invoiceItemId, { saving: false });
      }
    },
    [
      invoice?.id,
      onUpdateInvoiceItemAllocation,
      claimItemByInvoiceItemId,
      allocationDrafts,
      updateAllocationDraft,
    ]
  );

  if (isLoading) {
    return <InvoiceDetailSkeleton />;
  }

  if (!invoice) {
    return <InvoiceNotFound />;
  }

  const canEdit = invoice.status === 'DRAFT';
  const canFinalize = invoice.status === 'DRAFT' && (invoice.items?.length ?? 0) > 0;
  const canRecordPayment = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(invoice.status);
  const canCancel = ['DRAFT', 'PENDING'].includes(invoice.status);
  const canEditAllocation = hasPermission('billing.change_shaclaimitem');
  const canApplyLineDiscount = hasPermission('billing.apply_discount');
  const showShaPanels =
    String(invoice.payer_type || '').toLowerCase() === 'sha' ||
    !!invoice.sha_claim_number ||
    !!linkedClaim ||
    !!linkedClaimDetail;
  const isPaid = invoice.status === 'PAID';
  const isOverdue = invoice.status === 'OVERDUE';

  // Proforma-specific flags
  const isProforma = invoice.status === 'PROFORMA';
  const canConvertProforma = isProforma && invoice.can_convert;
  const canRenewProforma = isProforma && !invoice.is_valid;
  const isConvertedFromProforma = !!invoice.converted_from_proforma;
  const insuranceClaimHref = (() => {
    const payers = (
      invoice as Invoice & {
        payers?: Array<{ insurance_claim?: number | null }>;
      }
    ).payers;
    const payerWithInsuranceClaim = payers?.find(
      (payer) => typeof payer.insurance_claim === 'number' && payer.insurance_claim > 0
    );
    if (payerWithInsuranceClaim?.insurance_claim) {
      return `/insurance/claims/${payerWithInsuranceClaim.insurance_claim}`;
    }
    return '/insurance/claims';
  })();

  const notesWithClaimLinks = (() => {
    const noteText = invoice.notes || '';
    if (!noteText) return null;

    const claimRegex = /\bIC-\d{8}-\d{4}\b/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const match of noteText.matchAll(claimRegex)) {
      const claimNumber = match[0];
      const start = match.index ?? 0;

      if (start > lastIndex) {
        parts.push(noteText.slice(lastIndex, start));
      }

      parts.push(
        <Link
          key={`${claimNumber}-${start}`}
          href={insuranceClaimHref}
          className="inline-flex items-center gap-1 font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
        >
          {claimNumber}
          <ExternalLink className="h-3 w-3" />
        </Link>
      );

      lastIndex = start + claimNumber.length;
    }

    if (lastIndex < noteText.length) {
      parts.push(noteText.slice(lastIndex));
    }

    return parts.length ? parts : noteText;
  })();

  const invoiceTotals = invoice as InvoiceTotalsView;
  const subtotal = toAmount(invoice.subtotal || invoice.total_amount);
  const discount = toAmount(invoice.discount_amount, 0);
  const grossTotal = toAmount(invoiceTotals.gross_total, toAmount(invoice.total_amount));
  const shaCredit = toAmount(invoiceTotals.sha_credit_amount, 0);
  const insuranceCredit = toAmount(invoiceTotals.insurance_credit_amount, 0);
  const payerCreditTotal = toAmount(
    invoiceTotals.payer_credit_total,
    Math.max(0, shaCredit + insuranceCredit)
  );
  const patientCopayAmount = toAmount(invoiceTotals.patient_copay_amount, 0);
  const patientNetDue = toAmount(
    invoiceTotals.patient_net_due,
    Math.max(0, grossTotal - payerCreditTotal)
  );
  const total = grossTotal;
  const paid = toAmount(invoice.amount_paid || '0');
  const balance = Math.max(0, patientNetDue - paid);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Invoice Summary Bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 flex-col gap-1" data-testid="invoice-number">
          {(invoice.patient_name || invoice.patient_mrn) && (
            <p className="truncate text-sm font-medium">
              {invoice.patient_name || ''}
              {invoice.patient_name && invoice.patient_mrn ? ' • ' : ''}
              <span className="text-muted-foreground">{invoice.patient_mrn || ''}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground sm:text-sm">
            Created {formatDate(invoice.invoice_date)}
          </p>
        </div>
        <Badge
          className={`${statusColors[invoice.status]} w-fit shrink-0 self-start sm:self-auto`}
          data-testid="invoice-status"
        >
          {invoice.status}
        </Badge>
      </div>

      {/* Overdue Warning */}
      {isOverdue && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This invoice is overdue. The due date was {formatDate(invoice.due_date)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Proforma Validity Banner */}
      {isProforma && (
        <Alert
          className={
            invoice.is_valid
              ? 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
          }
        >
          <Clock className={`h-4 w-4 ${invoice.is_valid ? 'text-purple-600' : 'text-red-600'}`} />
          <AlertDescription className="flex items-center justify-between">
            <div>
              {invoice.is_valid ? (
                <>
                  <span className="font-medium">Proforma Invoice</span>
                  {invoice.days_until_expiry !== undefined && invoice.days_until_expiry >= 0 && (
                    <span className="ml-2 text-muted-foreground">
                      • Valid for {invoice.days_until_expiry} more{' '}
                      {invoice.days_until_expiry === 1 ? 'day' : 'days'}
                      {invoice.valid_until && ` (until ${formatDate(invoice.valid_until)})`}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium text-red-700">Expired Proforma</span>
                  <span className="ml-2 text-muted-foreground">
                    • This proforma has expired and cannot be converted to an invoice.
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {canConvertProforma && onConvertProforma && (
                <Button
                  size="sm"
                  onClick={() => onConvertProforma(invoice)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <ArrowRightCircle className="mr-1 h-4 w-4" />
                  Convert to Invoice
                </Button>
              )}
              {canRenewProforma && onRenewProforma && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRenewProforma(invoice)}
                  className="border-red-500 text-red-600 hover:bg-red-50"
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Renew
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Converted from Proforma Link */}
      {isConvertedFromProforma && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <Link2 className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <span className="text-muted-foreground">
              This invoice was converted from proforma{' '}
              <Link
                href={`/billing/invoices/${invoice.converted_from_proforma}`}
                className="font-medium text-blue-600 hover:underline"
              >
                PRO-{invoice.converted_from_proforma}
              </Link>
              {invoice.converted_at && <> on {formatDate(invoice.converted_at)}</>}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Patient & Invoice Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Patient Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{invoice.patient_name}</div>
            {invoice.patient_mrn && (
              <div className="text-sm text-muted-foreground">MRN: {invoice.patient_mrn}</div>
            )}
          </CardContent>
        </Card>

        {/* Payment Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross:</span>
                <span className="font-semibold">{formatKES(total)}</span>
              </div>
              {payerCreditTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payer Credits:</span>
                  <span className="text-emerald-700">-{formatKES(payerCreditTotal)}</span>
                </div>
              )}
              {patientCopayAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patient Copay:</span>
                  <span className="text-amber-700">{formatKES(patientCopayAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Due:</span>
                <span className="font-semibold">{formatKES(patientNetDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid:</span>
                <span className="text-green-600">{formatKES(paid)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="font-medium">Patient Balance:</span>
                <span className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatKES(balance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SHA Claim Status Card - Show only for insurance/SHA invoices */}
      {['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].includes(invoice.status) && showShaPanels && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <SHALogo size="md" />
              <CardTitle className="text-sm font-medium">SHA Insurance Claim</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {linkedClaim ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClaimStatusBadge status={linkedClaim.status} />
                    {linkedClaim.sha_reference && (
                      <span className="font-mono text-sm text-muted-foreground">
                        {linkedClaim.sha_reference}
                      </span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/transactions/sha-claims/${linkedClaim.id}`}>
                      View Claim
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
                {linkedClaim.approved_amount && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Approved: </span>
                    <span className="font-medium text-green-600">
                      {formatKES(parseFloat(linkedClaim.approved_amount))}
                    </span>
                  </div>
                )}
              </div>
            ) : invoice.sha_claim_number ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Claim Reference</p>
                  <p className="font-mono">{invoice.sha_claim_number}</p>
                </div>
                <Badge variant="outline">Submitted</Badge>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Submit this invoice to SHA for insurance reimbursement.
                </p>
                <ClaimSubmissionButton
                  invoiceId={invoice.id}
                  encounterId={invoice.encounter ?? 0}
                  onSuccess={onClaimSubmitted}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Line Items</CardTitle>
          {canEdit && onAddItem && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddItem(invoice)}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {showShaPanels && (
            <div className="mb-3 rounded border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Payer allocation review: {pendingAllocationCount} pending line(s)
            </div>
          )}
          <div className="-mx-0 overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="w-16 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-28 text-right">Gross</TableHead>
                  {showShaPanels && (
                    <>
                      <TableHead className="w-28 text-right">SHA</TableHead>
                      <TableHead className="w-28 text-right">Patient</TableHead>
                      <TableHead className="w-36 text-right">Discount</TableHead>
                      <TableHead className="w-40">Status</TableHead>
                    </>
                  )}
                  {canEdit && onRemoveItem && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoice.items || []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.service_name}</div>
                        {item.description && item.description !== item.service_name && (
                          <div className="text-sm text-muted-foreground">{item.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatKES(parseFloat(item.unit_price))}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatKES(parseFloat(item.line_total))}
                    </TableCell>
                    {showShaPanels &&
                      (() => {
                        const claimItem = claimItemByInvoiceItemId.get(item.id);
                        const draft = allocationDrafts[item.id];
                        const isEditing = editingInvoiceItemId === item.id;
                        const canEditThisRow = !!(
                          canEditAllocation &&
                          !claimItem &&
                          invoice?.id &&
                          onUpdateInvoiceItemAllocation
                        );
                        const isLinkedToClaimLine = !!claimItem;
                        const statusPending = claimItem?.allocation_status === 'pending';
                        const lineTotal = parseFloat(String(item.line_total || '0'));
                        const shaAmount = parseFloat(
                          String(
                            claimItem?.sha_covered_amount || item.insurance_approved_amount || '0'
                          )
                        );
                        const discountAmount = parseFloat(
                          String(claimItem?.discount_amount || item.discount_amount || '0')
                        );
                        const patientAmount = Math.max(0, lineTotal - shaAmount - discountAmount);

                        return (
                          <>
                            <TableCell className="text-right">{formatKES(shaAmount)}</TableCell>
                            <TableCell className="text-right">{formatKES(patientAmount)}</TableCell>
                            <TableCell>
                              {isEditing && draft && draft.mode === 'discount' ? (
                                <div className="space-y-1">
                                  <Input
                                    value={draft.discount_amount}
                                    onChange={(e) =>
                                      updateAllocationDraft(item.id, {
                                        discount_amount: e.target.value,
                                      })
                                    }
                                    className="h-8 text-right text-xs"
                                    disabled={!canApplyLineDiscount}
                                  />
                                  <Input
                                    value={draft.discount_reason}
                                    onChange={(e) =>
                                      updateAllocationDraft(item.id, {
                                        discount_reason: e.target.value,
                                      })
                                    }
                                    className="h-8 text-xs"
                                    placeholder="Reason required if discount > 0"
                                    disabled={!canApplyLineDiscount}
                                  />
                                </div>
                              ) : (
                                <div className="text-right">
                                  <div>{formatKES(discountAmount)}</div>
                                  {claimItem?.discount_reason ? (
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {claimItem.discount_reason}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge
                                  className={
                                    !isLinkedToClaimLine
                                      ? 'bg-slate-100 text-slate-700'
                                      : statusPending
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                  }
                                >
                                  {!isLinkedToClaimLine
                                    ? 'Unlinked'
                                    : statusPending
                                      ? 'Pending allocation'
                                      : 'Resolved'}
                                </Badge>
                                {draft?.error ? (
                                  <p className="text-[11px] text-destructive">{draft.error}</p>
                                ) : null}
                                {canEditThisRow ? (
                                  <div className="flex gap-1">
                                    {isEditing ? (
                                      <>
                                        <select
                                          value={draft?.mode || 'patient'}
                                          onChange={(e) =>
                                            updateAllocationDraft(item.id, {
                                              mode: e.target.value as 'patient' | 'discount',
                                            })
                                          }
                                          className="h-7 rounded border border-input bg-background px-2 text-[11px]"
                                          disabled={!!draft?.saving}
                                        >
                                          <option value="patient">Set patient payer</option>
                                          <option value="discount">Apply discount</option>
                                        </select>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-[11px]"
                                          onClick={() => void saveAllocation(item.id)}
                                          disabled={
                                            !!draft?.saving ||
                                            (draft?.mode === 'discount' && !canApplyLineDiscount)
                                          }
                                        >
                                          {draft?.saving ? 'Saving…' : 'Save'}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-[11px]"
                                          onClick={() => setEditingInvoiceItemId(null)}
                                          disabled={!!draft?.saving}
                                        >
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => {
                                          const currentDiscount = Number(
                                            draft?.discount_amount || item.discount_amount || '0'
                                          );
                                          updateAllocationDraft(item.id, {
                                            mode: currentDiscount > 0 ? 'discount' : 'patient',
                                          });
                                          setEditingInvoiceItemId(item.id);
                                        }}
                                      >
                                        Edit allocation
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-muted-foreground">
                                    {claimItem ? 'Read-only (linked SHA line)' : 'Read-only'}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </>
                        );
                      })()}
                    {canEdit && onRemoveItem && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => onRemoveItem(invoice, item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={showShaPanels ? 7 : 3}>Subtotal</TableCell>
                  <TableCell className="text-right">{formatKES(subtotal)}</TableCell>
                  {canEdit && onRemoveItem && <TableCell />}
                </TableRow>
                {discount > 0 && (
                  <TableRow>
                    <TableCell colSpan={showShaPanels ? 7 : 3} className="text-green-600">
                      Discount
                      {invoice.discount_type === 'PERCENTAGE' &&
                        (() => {
                          const pct = parseFloat(invoice.discount_value || '0');
                          if (!Number.isFinite(pct) || pct <= 0) return '';
                          const pctLabel = Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
                          return ` (${pctLabel})`;
                        })()}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      -{formatKES(discount)}
                    </TableCell>
                    {canEdit && onRemoveItem && <TableCell />}
                  </TableRow>
                )}
                <TableRow className="font-bold">
                  <TableCell colSpan={showShaPanels ? 7 : 3}>Total</TableCell>
                  <TableCell className="text-right">{formatKES(total)}</TableCell>
                  {canEdit && onRemoveItem && <TableCell />}
                </TableRow>
                {shaCredit > 0 && (
                  <TableRow>
                    <TableCell colSpan={showShaPanels ? 7 : 3} className="text-emerald-700">
                      SHA Credit
                    </TableCell>
                    <TableCell className="text-right text-emerald-700">
                      -{formatKES(shaCredit)}
                    </TableCell>
                    {canEdit && onRemoveItem && <TableCell />}
                  </TableRow>
                )}
                {insuranceCredit > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showShaPanels ? 7 : 3}
                      className="text-emerald-700 dark:text-emerald-300"
                    >
                      Insurance Reserve/Credit
                    </TableCell>
                    <TableCell className="text-right text-emerald-700 dark:text-emerald-300">
                      -{formatKES(insuranceCredit)}
                    </TableCell>
                    {canEdit && onRemoveItem && <TableCell />}
                  </TableRow>
                )}
                {payerCreditTotal > 0 && (
                  <TableRow>
                    <TableCell colSpan={showShaPanels ? 7 : 3} className="text-muted-foreground">
                      Total Payer Credits
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      -{formatKES(payerCreditTotal)}
                    </TableCell>
                    {canEdit && onRemoveItem && <TableCell />}
                  </TableRow>
                )}
                {patientCopayAmount > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showShaPanels ? 7 : 3}
                      className="text-amber-700 dark:text-amber-300"
                    >
                      Patient Copay
                    </TableCell>
                    <TableCell className="text-right text-amber-700 dark:text-amber-300">
                      {formatKES(patientCopayAmount)}
                    </TableCell>
                    {canEdit && onRemoveItem && <TableCell />}
                  </TableRow>
                )}
                <TableRow className="bg-emerald-50/60 font-bold dark:bg-emerald-950/40">
                  <TableCell colSpan={showShaPanels ? 7 : 3}>Patient Net Due</TableCell>
                  <TableCell className="text-right text-emerald-800 dark:text-emerald-200">
                    {formatKES(patientNetDue)}
                  </TableCell>
                  {canEdit && onRemoveItem && <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {/* Draft autosave indicator */}
        {canEdit && (
          <div className="inline-flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 sm:mr-auto">
            <CheckCircle2 className="h-4 w-4" />
            <span>Auto-saved</span>
          </div>
        )}

        {/* Print Invoice */}
        <Button
          variant="outline"
          onClick={() => (onPrint ? onPrint(invoice) : printInvoice({ invoice }))}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Invoice
        </Button>

        {/* Print Receipt - Show for paid/partial invoices */}
        {(isPaid || invoice.status === 'PARTIAL') && parseFloat(invoice.amount_paid || '0') > 0 && (
          <Button variant="outline" asChild>
            <Link href={`/transactions/payments?invoice=${invoice.id}`}>
              <Receipt className="mr-2 h-4 w-4" />
              View Payments
            </Link>
          </Button>
        )}

        {/* Email */}
        {onEmail && (
          <Button variant="outline" onClick={() => onEmail(invoice)}>
            <Send className="mr-2 h-4 w-4" />
            Email
          </Button>
        )}

        {/* Apply Discount (Draft only) */}
        {canEdit && onApplyDiscount && (
          <ActionButton
            action="billing.apply_discount"
            variant="outline"
            onClick={() => onApplyDiscount(invoice)}
          >
            <Percent className="mr-2 h-4 w-4" />
            Discount
          </ActionButton>
        )}

        {/* Collect Copay (Draft only) */}
        {canEdit && onCollectCopay && patientCopayAmount > 0 && (
          <Button variant="outline" onClick={() => onCollectCopay(invoice)}>
            <CreditCard className="mr-2 h-4 w-4" />
            Collect Copay
          </Button>
        )}

        {/* Finalize (Draft only) */}
        {canFinalize && (
          <Button
            variant="outline"
            className="border-green-500 text-green-600 hover:bg-green-50"
            onClick={() => onFinalize(invoice)}
          >
            <FileCheck className="mr-2 h-4 w-4" />
            Finalize
          </Button>
        )}

        {/* Convert Proforma (valid proformas only) */}
        {canConvertProforma && onConvertProforma && (
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            onClick={() => onConvertProforma(invoice)}
          >
            <ArrowRightCircle className="mr-2 h-4 w-4" />
            Convert to Invoice
          </Button>
        )}

        {/* Renew Proforma (expired proformas only) */}
        {canRenewProforma && onRenewProforma && (
          <Button
            variant="outline"
            className="border-amber-500 text-amber-600 hover:bg-amber-50"
            onClick={() => onRenewProforma(invoice)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Renew Proforma
          </Button>
        )}

        {/* Cancel (Draft/Pending only) */}
        {canCancel && (
          <PermissionGate action="billing.void_invoice">
            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-red-500 text-red-600 hover:bg-red-50">
                  <FileX className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Invoice?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel invoice {invoice.invoice_number}? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>No, keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      onCancel(invoice);
                      setCancelDialogOpen(false);
                    }}
                  >
                    Yes, cancel invoice
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </PermissionGate>
        )}

        {/* Record Payment */}
        {canRecordPayment && (
          <ActionButton action="billing.record_payment" onClick={() => onRecordPayment(invoice)}>
            <CreditCard className="mr-2 h-4 w-4" />
            Record Payment
          </ActionButton>
        )}

        {/* Paid Badge */}
        {isPaid && <Badge className="bg-green-100 px-4 py-2 text-green-700">✓ Fully Paid</Badge>}
      </div>

      {/* Notes */}
      {invoice.notes && (
        <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900 dark:text-blue-100">
              <FileText className="h-4 w-4" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed text-blue-900/90 dark:text-blue-100/90">
              {notesWithClaimLinks}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
