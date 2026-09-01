/**
 * Receive Payment Modal
 *
 * A modal for receiving payments against outstanding invoices.
 * Allows searching for patients/invoices and recording payments.
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  Search,
  Loader2,
  Receipt,
  FileText,
  CheckCircle2,
  Printer,
  ExternalLink,
  AlertCircle,
  Banknote,
  Plus,
} from 'lucide-react';
import { PaymentForm } from './PaymentForm';
import { useInvoices, useCreatePayment, usePaymentReceipt } from '@/lib/hooks/billing';
import { useToast } from '@/lib/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Invoice, PaymentCreateData, Receipt as ReceiptType } from '@/lib/types/billing';

// ============================================================================
// Types
// ============================================================================

interface ReceivePaymentModalProps {
  /** Trigger element */
  trigger?: React.ReactNode;
  /** Whether modal is open (controlled) */
  open?: boolean;
  /** Callback when modal open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Callback after successful payment */
  onPaymentSuccess?: (receipt: ReceiptType) => void;
}

type ModalStep = 'search' | 'payment' | 'success';

function toAmount(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInvoicePayableBalance(invoice: Invoice): number {
  const grossTotal = toAmount(invoice.total_amount);
  const paidAmount = toAmount(invoice.amount_paid);
  const patientNetDueRaw = Number.parseFloat(String(invoice.patient_net_due ?? ''));
  if (Number.isFinite(patientNetDueRaw)) {
    return Math.max(0, patientNetDueRaw - paidAmount);
  }

  const balanceDue = Number.parseFloat(String(invoice.balance_due ?? ''));
  if (Number.isFinite(balanceDue)) {
    return Math.max(0, balanceDue);
  }

  const balanceRaw = Number.parseFloat(String(invoice.balance ?? ''));
  if (Number.isFinite(balanceRaw)) {
    return Math.max(0, balanceRaw);
  }

  return Math.max(0, grossTotal - paidAmount);
}

// ============================================================================
// Invoice Status Badge
// ============================================================================

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

function InvoiceStatusBadge({ status }: { status: string }) {
  return <Badge className={statusColors[status] || 'bg-gray-100 text-gray-700'}>{status}</Badge>;
}

// ============================================================================
// Search Step Component
// ============================================================================

interface SearchStepProps {
  onSelectInvoice: (invoice: Invoice) => void;
  onCreateInvoice: () => void;
}

function SearchStep({ onSelectInvoice, onCreateInvoice }: SearchStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch outstanding invoices
  const { data, isLoading, error } = useInvoices({
    search: debouncedSearch || undefined,
    status__in: 'PENDING,PARTIAL,OVERDUE',
    page_size: 50,
    ordering: '-invoice_date',
  });

  // Filter for payable invoices only (patient-facing payable balance > 0)
  const payableInvoices = React.useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter((inv) => getInvoicePayableBalance(inv) > 0);
  }, [data?.results]);

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load invoices</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isLoading && payableInvoices.length === 0) {
    return (
      <div className="space-y-4">
        {/* Search Input */}
        <div className="space-y-2">
          <Label htmlFor="invoice-search">Search Patient or Invoice</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="invoice-search"
              placeholder="Search by patient name, MRN, or invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
        </div>

        <div className="py-8 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>No outstanding invoices found</p>
          {searchTerm ? (
            <p className="mt-1 text-sm">Try a different search term</p>
          ) : (
            <p className="mt-1 text-sm">Create an invoice first to receive payment</p>
          )}
          <Button variant="default" size="sm" className="mt-4 gap-2" onClick={onCreateInvoice}>
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="space-y-2">
        <Label htmlFor="invoice-search">Search Patient or Invoice</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="invoice-search"
            placeholder="Search by patient name, MRN, or invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {isLoading ? 'Searching...' : `${payableInvoices.length} outstanding invoice(s)`}
      </div>

      {/* Invoice List */}
      <ScrollArea className="h-[300px] rounded-lg border">
        <div className="p-2">
          <ResponsiveTable
            data={payableInvoices}
            keyExtractor={(invoice) => invoice.id}
            isLoading={isLoading}
            emptyMessage="No outstanding invoices found"
            columns={[
              {
                key: 'invoice_number',
                header: 'Invoice',
                sortable: true,
                cell: (invoice) => (
                  <span className="font-mono text-sm">{invoice.invoice_number}</span>
                ),
              },
              {
                key: 'patient',
                header: 'Patient',
                sortable: true,
                sortFn: (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
                cell: (invoice) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{invoice.patient_name}</p>
                    <p className="text-xs text-muted-foreground">{invoice.patient_mrn}</p>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
                hideOnMobile: true,
              },
              {
                key: 'balance_due',
                header: 'Payable',
                sortable: true,
                sortType: 'number',
                sortFn: (a, b) => getInvoicePayableBalance(a) - getInvoicePayableBalance(b),
                cell: (invoice) => (
                  <span className="font-medium text-red-600">
                    {formatCurrency(getInvoicePayableBalance(invoice))}
                  </span>
                ),
                className: 'text-right',
              },
            ]}
            mobileCard={(invoice) => (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate font-mono text-sm">{invoice.invoice_number}</span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <p className="truncate text-sm font-medium">{invoice.patient_name}</p>
                    <p className="text-xs text-muted-foreground">{invoice.patient_mrn}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-red-600">
                      {formatCurrency(getInvoicePayableBalance(invoice))}
                    </p>
                  </div>
                </div>
              </Card>
            )}
            onRowClick={onSelectInvoice}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Payment Step Component
// ============================================================================

interface PaymentStepProps {
  invoice: Invoice;
  onBack: () => void;
  onSuccess: (paymentId: number) => void;
}

function PaymentStep({ invoice, onBack, onSuccess }: PaymentStepProps) {
  const { toast } = useToast();
  const createPayment = useCreatePayment();
  const payableBalance = getInvoicePayableBalance(invoice);

  const handleSubmit = async (data: PaymentCreateData) => {
    try {
      const payment = await createPayment.mutateAsync(data);
      toast({
        title: 'Payment Recorded',
        description: `Payment of ${formatCurrency(parseFloat(data.amount))} recorded successfully`,
      });
      onSuccess(payment.id);
    } catch (error) {
      toast({
        title: 'Payment Failed',
        description: error instanceof Error ? error.message : 'Failed to record payment',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Invoice Summary */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{invoice.invoice_number}</span>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {invoice.patient_name} • {invoice.patient_mrn}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs text-muted-foreground sm:text-sm">Payable Balance</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(payableBalance)}</p>
        </div>
      </div>

      {/* Payment Form */}
      <PaymentForm
        invoice={invoice}
        isLoading={createPayment.isPending}
        onSubmit={handleSubmit}
        onCancel={onBack}
      />
    </div>
  );
}

// ============================================================================
// Success Step Component
// ============================================================================

interface SuccessStepProps {
  paymentId: number;
  onDone: () => void;
  onNewPayment: () => void;
}

function SuccessStep({ paymentId, onDone, onNewPayment }: SuccessStepProps) {
  const router = useRouter();
  const { data: receipt, isLoading } = usePaymentReceipt(paymentId);

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">Loading receipt...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success Icon */}
      <div className="py-3 text-center sm:py-4">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 sm:mb-4 sm:h-16 sm:w-16">
          <CheckCircle2 className="h-7 w-7 text-green-600 sm:h-8 sm:w-8" />
        </div>
        <h3 className="text-lg font-semibold sm:text-xl">Payment Received</h3>
        <p className="text-sm text-muted-foreground">Receipt generated successfully</p>
      </div>

      {/* Receipt Summary */}
      {receipt && (
        <Card>
          <CardContent className="space-y-2 pt-4 sm:space-y-3">
            <div className="flex justify-between gap-2">
              <span className="text-sm text-muted-foreground">Receipt #</span>
              <span className="truncate font-mono text-sm">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-sm text-muted-foreground">Patient</span>
              <span className="truncate text-right text-sm">{receipt.patient_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-bold text-green-600">
                {formatCurrency(parseFloat(receipt.amount))}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-sm text-muted-foreground">Method</span>
              <span className="text-sm">{receipt.payment_method}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="text-sm">{formatDate(receipt.receipt_date)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1 gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => router.push(`/transactions/receipts/${receipt?.id}`)}
        >
          <ExternalLink className="h-4 w-4" />
          View Details
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-2 sm:flex-row">
        <Button variant="secondary" className="flex-1 gap-2" onClick={onNewPayment}>
          <Banknote className="h-4 w-4" />
          New Payment
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function ReceivePaymentModal({
  trigger,
  open,
  onOpenChange,
  onPaymentSuccess,
}: ReceivePaymentModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>('search');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [completedPaymentId, setCompletedPaymentId] = useState<number | null>(null);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  // Reset state when modal closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setIsOpen(newOpen);
      if (!newOpen) {
        // Delay reset to allow close animation
        setTimeout(() => {
          setStep('search');
          setSelectedInvoice(null);
          setCompletedPaymentId(null);
        }, 200);
      }
    },
    [setIsOpen]
  );

  const handleSelectInvoice = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setStep('payment');
  }, []);

  const handlePaymentSuccess = useCallback((paymentId: number) => {
    setCompletedPaymentId(paymentId);
    setStep('success');
  }, []);

  const handleNewPayment = useCallback(() => {
    setStep('search');
    setSelectedInvoice(null);
    setCompletedPaymentId(null);
  }, []);

  const handleDone = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleBack = useCallback(() => {
    setStep('search');
    setSelectedInvoice(null);
  }, []);

  const handleCreateInvoice = useCallback(() => {
    toast({
      title: 'Redirecting to Invoice Creation',
      description: 'Create an invoice first, then return to receive payment.',
    });
    handleOpenChange(false);
    router.push('/transactions/invoices/new');
  }, [toast, handleOpenChange, router]);

  // Get title based on step
  const getTitle = () => {
    switch (step) {
      case 'search':
        return 'Receive Payment';
      case 'payment':
        return 'Record Payment';
      case 'success':
        return 'Payment Complete';
    }
  };

  // Get help content based on step
  const getHelpContent = () => {
    switch (step) {
      case 'search':
        return 'Search for an outstanding invoice by patient name, MRN, or invoice number to receive payment.';
      case 'payment':
        return 'Enter payment details including method and amount for the selected invoice.';
      case 'success':
        return 'Payment has been recorded successfully. You can print the receipt or start a new payment.';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 shrink-0" />
            <DialogTitle>{getTitle()}</DialogTitle>
            <HelpPopover content={getHelpContent()} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === 'search' && (
            <SearchStep
              onSelectInvoice={handleSelectInvoice}
              onCreateInvoice={handleCreateInvoice}
            />
          )}
          {step === 'payment' && selectedInvoice && (
            <PaymentStep
              invoice={selectedInvoice}
              onBack={handleBack}
              onSuccess={handlePaymentSuccess}
            />
          )}
          {step === 'success' && completedPaymentId && (
            <SuccessStep
              paymentId={completedPaymentId}
              onDone={handleDone}
              onNewPayment={handleNewPayment}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReceivePaymentModal;
