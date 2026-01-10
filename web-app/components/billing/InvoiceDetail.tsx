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
  Shield,
  ExternalLink,
} from 'lucide-react';
import { ClaimSubmissionButton, ClaimStatusBadge } from '@/components/billing/sha';
import type { Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types/billing';
import type { Claim } from '@/lib/types/sha';
import { formatCurrency, formatDate } from '@/lib/utils/format';

function formatKES(amount: number): string {
  const formatted = amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `KES ${formatted}`;
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
  onClaimSubmitted?: (claim: Claim) => void;
  linkedClaim?: Claim | null;
}

// ============================================================================
// Status Badge Colors
// ============================================================================

const statusColors: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
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
      <AlertDescription>
        Invoice not found. Please select a valid invoice.
      </AlertDescription>
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
  onClaimSubmitted,
  linkedClaim,
}: InvoiceDetailProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);

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
  const isPaid = invoice.status === 'PAID';
  const isOverdue = invoice.status === 'OVERDUE';

  const subtotal = parseFloat(invoice.subtotal || invoice.total_amount);
  const discount = parseFloat(invoice.discount_amount || '0');
  const total = parseFloat(invoice.total_amount);
  const paid = parseFloat(invoice.amount_paid || '0');
  const balance = total - paid;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold">{invoice.invoice_number}</h2>
          <p className="text-muted-foreground">
            Created {formatDate(invoice.invoice_date)}
          </p>
        </div>
        <Badge className={statusColors[invoice.status]} data-testid="invoice-status">
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

      {/* Patient & Invoice Info Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Patient Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Patient
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{invoice.patient_name}</div>
            {invoice.patient_mrn && (
              <div className="text-sm text-muted-foreground">
                MRN: {invoice.patient_mrn}
              </div>
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
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold">{formatKES(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid:</span>
                <span className="text-green-600">{formatKES(paid)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="font-medium">Balance:</span>
                <span className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatKES(balance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SHA Claim Status Card - Show for finalized invoices */}
      {['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].includes(invoice.status) && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
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
                      <span className="text-sm font-mono text-muted-foreground">
                        {linkedClaim.sha_reference}
                      </span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/billing/sha-claims/${linkedClaim.id}`}>
                      View Claim
                      <ExternalLink className="h-3 w-3 ml-1" />
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
                  encounterId={invoice.encounter}
                  onSuccess={onClaimSubmitted}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          {canEdit && onAddItem && (
            <Button variant="outline" size="sm" onClick={() => onAddItem(invoice)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
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
                        <div className="text-sm text-muted-foreground">
                          {item.description}
                        </div>
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
                <TableCell colSpan={canEdit && onRemoveItem ? 3 : 2}>Subtotal</TableCell>
                <TableCell className="text-right" colSpan={canEdit && onRemoveItem ? 2 : 1}>
                  {formatKES(subtotal)}
                </TableCell>
              </TableRow>
              {discount > 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit && onRemoveItem ? 3 : 2} className="text-green-600">
                    Discount
                    {invoice.discount_type === 'PERCENTAGE' && (() => {
                      const pct = parseFloat(invoice.discount_value || '0');
                      if (!Number.isFinite(pct) || pct <= 0) return '';
                      const pctLabel = Number.isInteger(pct) ? `${pct}%` : `${pct}%`;
                      return ` (${pctLabel})`;
                    })()}
                  </TableCell>
                  <TableCell className="text-right text-green-600" colSpan={canEdit && onRemoveItem ? 2 : 1}>
                    -{formatKES(discount)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="font-bold">
                <TableCell colSpan={canEdit && onRemoveItem ? 3 : 2}>Total</TableCell>
                <TableCell className="text-right" colSpan={canEdit && onRemoveItem ? 2 : 1}>
                  {formatKES(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 justify-end">
        {/* Print */}
        <Button
          variant="outline"
          onClick={() => {
            if (onPrint) {
              onPrint(invoice);
              return;
            }
            window.print();
          }}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>

        {/* Email */}
        {onEmail && (
          <Button variant="outline" onClick={() => onEmail(invoice)}>
            <Send className="h-4 w-4 mr-2" />
            Email
          </Button>
        )}

        {/* Apply Discount (Draft only) */}
        {canEdit && onApplyDiscount && (
          <Button variant="outline" onClick={() => onApplyDiscount(invoice)}>
            <Percent className="h-4 w-4 mr-2" />
            Discount
          </Button>
        )}

        {/* Finalize (Draft only) */}
        {canFinalize && (
          <Button
            variant="outline"
            className="border-green-500 text-green-600 hover:bg-green-50"
            onClick={() => onFinalize(invoice)}
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Finalize
          </Button>
        )}

        {/* Cancel (Draft/Pending only) */}
        {canCancel && (
          <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-red-500 text-red-600 hover:bg-red-50">
                <FileX className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Invoice?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel invoice {invoice.invoice_number}?
                  This action cannot be undone.
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
        )}

        {/* Record Payment */}
        {canRecordPayment && (
          <Button onClick={() => onRecordPayment(invoice)}>
            <CreditCard className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        )}

        {/* Paid Badge */}
        {isPaid && (
          <Badge className="bg-green-100 text-green-700 px-4 py-2">
            ✓ Fully Paid
          </Badge>
        )}
      </div>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
