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
  onMpesaPayment?: (phoneNumber: string, amount: number) => void;
}

const paymentFormSchema = z.object({
  payment_method: z.enum(['CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'INSURANCE'] as const),
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
  const computedBalance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid || '0');
  const balanceDue = invoice.balance_due ? parseFloat(invoice.balance_due) : Number.NaN;
  const balance = Number.isFinite(balanceDue) ? balanceDue : computedBalance;

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      payment_method: 'CASH',
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

    if (values.payment_method === 'MPESA') {
      if (!values.phone_number || !isValidKenyanPhoneNumber(values.phone_number)) {
        form.setError('phone_number', {
          type: 'manual',
          message: 'Enter a valid Kenyan phone number',
        });
        return;
      }
    }

    // For M-Pesa, initiate STK Push instead of direct payment
    if (values.payment_method === 'MPESA' && onMpesaPayment && values.phone_number) {
      onMpesaPayment(values.phone_number, values.amount);
      return;
    }

    const data: PaymentCreateData = {
      invoice: invoice.id,
      method: values.payment_method,
      amount: values.amount.toFixed(2),
    };

    if (values.notes && values.notes.trim()) {
      data.notes = values.notes;
    }

    if (values.payment_method === 'MPESA' && values.phone_number) {
      data.mpesa_phone_number = values.phone_number;
    }

    if (values.payment_method === 'CARD') {
      if (values.card_last_four) data.card_last_four = values.card_last_four;
      if (values.card_type) data.card_type = values.card_type;
    }
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                  onValueChange={field.onChange}
                  className="grid gap-3"
                >
                  {([
                    { value: 'CASH' as const, label: 'Cash', icon: paymentMethodIcons.CASH },
                    { value: 'MPESA' as const, label: 'M-Pesa', icon: paymentMethodIcons.MPESA },
                    { value: 'CARD' as const, label: 'Card', icon: paymentMethodIcons.CARD },
                  ]).map((method) => (
                    <div key={method.value} className="flex items-center space-x-3">
                      <RadioGroupItem value={method.value} id={`method-${method.value}`} />
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
              <FormMessage />
            </FormItem>
          )}
        />

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

        {/* Form Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
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
