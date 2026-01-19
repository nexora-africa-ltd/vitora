/**
 * Payment Form Component
 * Form for recording payments with multiple payment methods
 */
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Smartphone, Banknote, Building } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePaymentPoints } from '@/lib/hooks/billing';
import type { Invoice, PaymentMethod, PaymentCreateData } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types & Validation Schema
// ============================================================================

interface PaymentFormProps {
  invoice: Invoice;
  isLoading?: boolean;
  onSubmit: (data: PaymentCreateData) => void;
  onCancel: () => void;
  onMpesaPayment?: (data: {
    invoiceId: number;
    phoneNumber: string;
    amount: number;
    paymentPointId: number;
  }) => void;
}

const paymentFormSchema = z.object({
  payment_method: z.enum(['CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'INSURANCE'] as const),
  payment_point: z.string().min(1, 'Select a till/account'),
  amount: z.number().positive('Amount must be positive'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  phone_number: z.string().optional(),
  cash_received: z.number().optional(),
  card_last_four: z.string().optional(),
  card_type: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

// ============================================================================
// Payment Method Icons
// ============================================================================

const paymentMethodIcons: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  BANK_TRANSFER: <Building className="h-4 w-4" />,
  INSURANCE: <Building className="h-4 w-4" />,

};

function formatKES(amount: number): string {
  return `KES ${amount.toFixed(2)}`;
}

function isValidKenyanPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Accept: 0712345678, 254712345678, +254712345678 (and same for 1xx)
  const normalized = trimmed.startsWith('+') ? trimmed : trimmed;
  const digitsOnly = normalized.replace(/[^\d+]/g, '');
  return /^(0|254|\+254)?[17]\d{8}$/.test(digitsOnly);
}

// ============================================================================
// Main Component
// ============================================================================

export function PaymentForm({
  invoice,
  isLoading,
  onSubmit,
  onCancel,
  onMpesaPayment,
}: PaymentFormProps) {
  const isInsuranceOrSHAInvoice = Boolean(
    (invoice as any).sha_claim_number ||
      (invoice as any).payment_type === 'insurance' ||
      ((invoice as any).insurance_provider && String((invoice as any).insurance_provider).trim()) ||
      (invoice as any).insurance_amount
  );

  const computedBalance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid || '0');
  const balanceDue = invoice.balance_due ? parseFloat(invoice.balance_due) : Number.NaN;
  const balance = Number.isFinite(balanceDue) ? balanceDue : computedBalance;

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      payment_method: isInsuranceOrSHAInvoice ? 'BANK_TRANSFER' : 'CASH',
      payment_point: '',
      amount: balance,
      reference_number: '',
      notes: '',
      phone_number: '',
      cash_received: balance,
      card_last_four: '',
      card_type: '',
    },
  });

  const watchedMethod = form.watch('payment_method');
  const watchedAmount = form.watch('amount');
  const watchedCashReceived = form.watch('cash_received');

  // Force bank transfer for SHA/insurance invoices
  React.useEffect(() => {
    if (isInsuranceOrSHAInvoice) {
      form.setValue('payment_method', 'BANK_TRANSFER', { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInsuranceOrSHAInvoice]);

  // Clear selected payment point whenever method changes
  React.useEffect(() => {
    form.setValue('payment_point', '', { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedMethod]);

  const paymentPointsQuery = usePaymentPoints({
    method: watchedMethod,
    is_active: true,
  });

  const paymentPoints = paymentPointsQuery.data?.results || [];

  // Auto-select a payment point when available (prevents accidental blank submissions)
  React.useEffect(() => {
    if (paymentPointsQuery.isLoading) return;
    if (!paymentPoints.length) return;
    const first = paymentPoints[0];
    if (!first) return;
    const current = form.getValues('payment_point');
    if (current) return;
    form.setValue('payment_point', String(first.id), { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentPointsQuery.isLoading, paymentPoints]);

  // Calculate change for cash payments
  const cashChange = watchedMethod === 'CASH' && watchedCashReceived
    ? Math.max(0, watchedCashReceived - watchedAmount)
    : 0;

  const handleSubmit = (values: PaymentFormValues) => {
    if (values.amount > balance) {
      form.setError('amount', {
        type: 'manual',
        message: 'Amount cannot exceed balance',
      });
      return;
    }

    if (!values.payment_point) {
      form.setError('payment_point', {
        type: 'manual',
        message: 'Select a till/account',
      });
      return;
    }

    if (values.payment_method === 'MPESA') {
      if (!values.phone_number || !isValidKenyanPhoneNumber(values.phone_number)) {
        form.setError('phone_number', {
          type: 'manual',
          message: 'Enter a valid Kenyan phone number',
        });
        return;
      }
    }

    const data: PaymentCreateData = {
      invoice: invoice.id,
      method: values.payment_method,
      payment_point: Number(values.payment_point),
      amount: values.amount.toFixed(2),
    };

    if (values.notes && values.notes.trim()) {
      data.notes = values.notes;
    }

    const paymentDetails: Record<string, unknown> = {};

    if (values.reference_number && values.reference_number.trim()) {
      paymentDetails.reference_number = values.reference_number.trim();
    }

    if (values.payment_method === 'MPESA' && values.phone_number) {
      data.mpesa_phone = values.phone_number;
    }

    if (values.payment_method === 'CARD') {
      if (values.card_last_four) paymentDetails.card_last_four = values.card_last_four;
      if (values.card_type) paymentDetails.card_type = values.card_type;
    }

    if (Object.keys(paymentDetails).length > 0) {
      data.payment_details = paymentDetails;
    }

    // Optional M-Pesa flow: allow the UI to initiate STK push when provided
    if (
      values.payment_method === 'MPESA' &&
      onMpesaPayment &&
      values.phone_number &&
      values.payment_point
    ) {
      onMpesaPayment({
        invoiceId: invoice.id,
        phoneNumber: values.phone_number,
        amount: values.amount,
        paymentPointId: Number(values.payment_point),
      });
      return;
    }
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col max-h-[70vh]">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 pb-4">
        {/* Invoice Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invoice: {invoice.invoice_number}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-2 font-medium">
                  {formatCurrency(parseFloat(invoice.total_amount))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Paid:</span>
                <span className="ml-2 font-medium text-green-600">
                  {formatCurrency(parseFloat(invoice.amount_paid || '0'))}
                </span>
              </div>
              <div className="col-span-2 pt-2 border-t">
                <span className="text-muted-foreground">Balance Due:</span>
                <span className="ml-2 font-bold text-lg">
                  {formatCurrency(balance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <FormField
          control={form.control}
          name="payment_method"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method *</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => {
                    if (isInsuranceOrSHAInvoice) return;
                    field.onChange(value);
                  }}
                  className="grid gap-3"
                >
                  {([
                    { value: 'CASH' as const, label: 'Cash', icon: paymentMethodIcons.CASH },
                    { value: 'MPESA' as const, label: 'M-Pesa', icon: paymentMethodIcons.MPESA },
                    { value: 'CARD' as const, label: 'Card', icon: paymentMethodIcons.CARD },
                    { value: 'BANK_TRANSFER' as const, label: 'Bank Transfer', icon: paymentMethodIcons.BANK_TRANSFER },
                  ]).map((method) => (
                    <div key={method.value} className="flex items-center space-x-3">
                      <RadioGroupItem
                        value={method.value}
                        id={`method-${method.value}`}
                        disabled={isInsuranceOrSHAInvoice && method.value !== 'BANK_TRANSFER'}
                      />
                      <label
                        htmlFor={`method-${method.value}`}
                        className="flex items-center gap-2 text-sm font-medium leading-none"
                      >
                        {method.icon}
                        {method.label}
                      </label>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
              {isInsuranceOrSHAInvoice && (
                <FormDescription>
                  SHA/insurance invoices are paid via bank transfer (method is locked).
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Payment Point */}
        <FormField
          control={form.control}
          name="payment_point"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Till / Account *</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger role="combobox" aria-label="Till / Account">
                    <SelectValue
                      placeholder={
                        paymentPointsQuery.isLoading
                          ? 'Loading payment points…'
                          : paymentPoints.length
                          ? 'Select a till/account'
                          : 'No payment points available'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentPoints.map((pp) => (
                      <SelectItem key={pp.id} value={String(pp.id)}>
                        {pp.name} ({pp.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Choose the till/bank account used for this payment.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {!paymentPointsQuery.isLoading && paymentPoints.length === 0 && (
          <Alert>
            <AlertDescription>
              No active payment points are configured for {watchedMethod.replace('_', ' ')}.
              Create one in Admin → Billing → Payment points.
            </AlertDescription>
          </Alert>
        )}

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (KES) *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>
                Maximum: {formatCurrency(balance)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* M-Pesa Phone Number */}
        {watchedMethod === 'MPESA' && (
          <FormField
            control={form.control}
            name="phone_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number *</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="0712345678"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Enter the M-Pesa registered phone number
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Card Details */}
        {watchedMethod === 'CARD' && (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="card_last_four"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last 4 Digits *</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="1234"
                      maxLength={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="card_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Type *</FormLabel>
                  <FormControl>
                    <Input placeholder="Visa / MasterCard" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Cash Received (for cash payments) */}
        {watchedMethod === 'CASH' && (
          <>
            <FormField
              control={form.control}
              name="cash_received"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cash Received (KES)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {cashChange > 0 && (
              <Alert>
                <AlertDescription className="flex justify-between items-center">
                  <span>Change</span>
                  <span className="font-bold text-lg" data-testid="cash-change">
                    {formatKES(cashChange)}
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Reference Number (for non-cash) */}
        {watchedMethod !== 'CASH' && (
          <FormField
            control={form.control}
            name="reference_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {watchedMethod === 'MPESA' ? 'M-Pesa Transaction Code' : 'Reference Number'}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      watchedMethod === 'MPESA'
                        ? 'e.g., QK12ABC456'
                        : 'Transaction reference'
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any payment notes..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
          </div>
        </ScrollArea>

        {/* Form Actions - Outside ScrollArea so always visible */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || paymentPointsQuery.isLoading || paymentPoints.length === 0}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {watchedMethod === 'MPESA' && onMpesaPayment
              ? 'Send M-Pesa Request'
              : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
