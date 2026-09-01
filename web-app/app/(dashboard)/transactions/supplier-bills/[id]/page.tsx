/**
 * Supplier Bill Detail Page
 *
 * Shows bill details, 3-way matching status, line items, payment history,
 * and actions (approve, record payment, cancel).
 */
'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  DollarSign,
  FileText,
  Package,
  Truck,
  AlertTriangle,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { billingApi } from '@/lib/api/billing';
import { formatCurrency } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/use-toast';
import { usePermissions } from '@/lib/hooks/use-permissions';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  RECEIVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  APPROVED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  PARTIAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const MATCH_COLORS: Record<string, string> = {
  MATCHED: 'text-green-600 dark:text-green-400',
  VARIANCE: 'text-yellow-600 dark:text-yellow-400',
  UNMATCHED: 'text-muted-foreground',
};

export default function SupplierBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canPerformAction } = usePermissions();
  const canApprove = canPerformAction('billing.approve_supplier_bill');
  const canRecordPayment = canPerformAction('billing.record_supplier_payment');
  const billId = Number(params.id);

  const [showPaymentDialog, setShowPaymentDialog] = React.useState(false);
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [paymentNotes, setPaymentNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { data: bill, isLoading } = useQuery({
    queryKey: ['supplier-bill', billId],
    queryFn: () => billingApi.supplierBills.get(billId),
    enabled: !!billId,
  });

  const handleApprove = async () => {
    try {
      await billingApi.supplierBills.approve(billId);
      queryClient.invalidateQueries({ queryKey: ['supplier-bill', billId] });
      toast({ title: 'Bill approved', description: 'The bill has been approved for payment.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to approve bill.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    try {
      await billingApi.supplierBills.cancel(billId);
      queryClient.invalidateQueries({ queryKey: ['supplier-bill', billId] });
      toast({ title: 'Bill cancelled', description: 'The bill has been cancelled.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel bill.', variant: 'destructive' });
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return;
    setIsSubmitting(true);
    try {
      await billingApi.supplierBills.recordPayment({
        bill: billId,
        amount: paymentAmount,
        payment_method: paymentMethod,
        reference_number: paymentRef || undefined,
        payment_date: new Date().toISOString().slice(0, 10),
        notes: paymentNotes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['supplier-bill', billId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] });
      setShowPaymentDialog(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
      toast({ title: 'Payment recorded', description: `KES ${paymentAmount} payment recorded.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to record payment.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  if (!bill) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Bill not found
      </div>
    );
  }

  const canApproveBill = canApprove && (bill.status === 'RECEIVED' || bill.status === 'DRAFT');
  const canPay = canRecordPayment && (bill.status === 'APPROVED' || bill.status === 'PARTIAL');
  const canCancelBill = bill.status !== 'PAID' && bill.status !== 'CANCELLED';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Bill ${bill.bill_number}`}
        helpContent="Supplier bill detail. Approve bills, record payments, and verify 3-way matching between Purchase Order, GRN, and supplier invoice."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canApproveBill && (
              <Button onClick={handleApprove} variant="outline">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
            )}
            {canPay && (
              <Button
                onClick={() => {
                  setPaymentAmount(bill.balance);
                  setShowPaymentDialog(true);
                }}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            )}
            {canCancelBill && (
              <Button onClick={handleCancel} variant="destructive" size="sm">
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium">
            {bill.supplier_name}
            {bill.supplier_invoice_ref && (
              <span className="text-muted-foreground"> • Ref: {bill.supplier_invoice_ref}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Issued {new Date(bill.issue_date).toLocaleDateString()}
            {bill.due_date && ` • Due ${new Date(bill.due_date).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_COLORS[bill.status] || ''} w-fit shrink-0`}>
            {bill.status}
          </Badge>
          <Badge variant="outline" className={MATCH_COLORS[bill.match_status] || ''}>
            {bill.match_status}
          </Badge>
        </div>
      </div>

      {/* 3-Way Match Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3-Way Matching</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MatchCard
              label="Purchase Order"
              value={bill.po_number}
              icon={<FileText className="h-5 w-5 text-blue-500" />}
              linked={!!bill.purchase_order}
            />
            <MatchCard
              label="Goods Received Note"
              value={bill.grn_number}
              icon={<Truck className="h-5 w-5 text-green-500" />}
              linked={!!bill.grn}
            />
            <MatchCard
              label="Supplier Invoice"
              value={bill.supplier_invoice_ref || 'Not provided'}
              icon={<Package className="h-5 w-5 text-purple-500" />}
              linked={!!bill.supplier_invoice_ref}
            />
          </div>
          {bill.match_status === 'VARIANCE' && (
            <div className="mt-3 flex items-center gap-2 rounded bg-yellow-50 p-2 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Amount variance detected between PO, GRN, and bill. Please review line items.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardContent className="relative p-4">
            <p className="text-xs text-muted-foreground">Total Amount</p>
            <p className="text-xl font-bold">{formatCurrency(parseFloat(bill.total_amount))}</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardContent className="relative p-4">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(parseFloat(bill.amount_paid))}
            </p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
            aria-hidden="true"
          />
          <CardContent className="relative p-4">
            <p className="text-xs text-muted-foreground">Balance Due</p>
            <p className="text-xl font-bold text-destructive">
              {formatCurrency(parseFloat(bill.balance))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      {bill.items && bill.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Items</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table className="min-w-[400px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(parseFloat(item.unit_cost))}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(parseFloat(item.total_cost))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {bill.payments && bill.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table className="min-w-[400px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.payment_method.replace('_', ' ')}</TableCell>
                      <TableCell>{payment.reference_number || '—'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(parseFloat(payment.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount (KES)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Balance: {formatCurrency(parseFloat(bill.balance))}
              </p>
            </div>
            <div>
              <Label htmlFor="method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="MPESA">M-Pesa</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ref">Reference Number</Label>
              <Input
                id="ref"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. cheque no. or M-Pesa code"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional payment notes"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={isSubmitting || !paymentAmount}>
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchCard({
  label,
  value,
  icon,
  linked,
}: {
  label: string;
  value: string | null | undefined;
  icon: React.ReactNode;
  linked: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${linked ? 'border-green-200 dark:border-green-800' : 'border-dashed'}`}
    >
      {icon}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value || 'Not linked'}</p>
      </div>
      {linked && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-green-500" />}
    </div>
  );
}
