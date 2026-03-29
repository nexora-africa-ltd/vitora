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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, CreditCard, Smartphone, Banknote, Building, Receipt, Lock, Info, ShieldCheck, ShieldX } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePaymentPoints, useVerifyMpesaTransaction } from '@/lib/hooks/billing';
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
  mpesa_mode: z.enum(['stk_push', 'manual'] as const).optional(),
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
  CORPORATE: <Building className="h-4 w-4" />,
  CHEQUE: <Receipt className="h-4 w-4" />,
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
    (invoice as any).payment_type === 'insurance'
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
      mpesa_mode: 'stk_push',
      cash_received: balance,
      card_last_four: '',
      card_type: '',
    },
  });

  const watchedMethod = form.watch('payment_method');
  const watchedAmount = form.watch('amount');
  const watchedCashReceived = form.watch('cash_received');
  const watchedMpesaMode = form.watch('mpesa_mode');

  // M-Pesa manual verification
  const verifyMpesa = useVerifyMpesaTransaction();
  const [verificationResult, setVerificationResult] = React.useState<{
    verified: boolean;
    error: string | null;
  } | null>(null);

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
      if (values.mpesa_mode === 'stk_push') {
        if (!values.phone_number || !isValidKenyanPhoneNumber(values.phone_number)) {
          form.setError('phone_number', {
            type: 'manual',
            message: 'Enter a valid Kenyan phone number',
          });
          return;
        }
      } else {
        // Manual mode — transaction code is required and must be verified
        if (!values.reference_number || !values.reference_number.trim()) {
          form.setError('reference_number', {
            type: 'manual',
            message: 'Enter the M-Pesa transaction code from the confirmation SMS',
          });
          return;
        }
        if (!verificationResult?.verified) {
          form.setError('reference_number', {
            type: 'manual',
            message: 'Verify the M-Pesa transaction code before recording payment',
          });
          return;
        }
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

    // M-Pesa STK Push flow: only when in stk_push mode
    if (
      values.payment_method === 'MPESA' &&
      values.mpesa_mode === 'stk_push' &&
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

    // For manual M-Pesa, store the transaction code as mpesa receipt number
    if (values.payment_method === 'MPESA' && values.mpesa_mode === 'manual') {
      if (values.reference_number?.trim()) {
        data.mpesa_receipt_number = values.reference_number.trim();
      }
      if (values.phone_number?.trim()) {
        data.mpesa_phone = values.phone_number.trim();
      }
    }

    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col max-h-[calc(80vh-8rem)]">
        <ScrollArea className="flex-1 overflow-y-auto pr-1">
        <div className="space-y-6 pb-4 px-1">
        {/* Invoice Summary */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="cursor-help border-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    Invoice: {invoice.invoice_number}
                  </CardTitle>
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
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>Invoice details are read-only. To modify, go to the invoice page.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
                  ]).map((method) => {
                    const isDisabled = isInsuranceOrSHAInvoice && method.value !== 'BANK_TRANSFER';
                    return (
                      <TooltipProvider key={method.value}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center space-x-3">
                              <RadioGroupItem
                                value={method.value}
                                id={`method-${method.value}`}
                                disabled={isDisabled}
                              />
                              <label
                                htmlFor={`method-${method.value}`}
                                className={`flex items-center gap-2 text-sm font-medium leading-none ${
                                  isDisabled ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              >
                                {method.icon}
                                {method.label}
                                {isDisabled && <Lock className="h-3 w-3" />}
                              </label>
                            </div>
                          </TooltipTrigger>
                          {isDisabled && (
                            <TooltipContent side="right">
                              <p>Not available for SHA/insurance invoices</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </RadioGroup>
              </FormControl>
              {isInsuranceOrSHAInvoice && (
                <FormDescription className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  SHA/insurance invoices require bank transfer payment.
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

        {/* M-Pesa Mode & Fields */}
        {watchedMethod === 'MPESA' && (
          <div className="space-y-4">
            {/* M-Pesa mode selector */}
            <FormField
              control={form.control}
              name="mpesa_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>M-Pesa Payment Mode *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3"
                    >
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="stk_push" id="mpesa-stk" />
                        <label htmlFor="mpesa-stk" className="text-sm font-medium cursor-pointer">
                          <span>Send STK Push</span>
                          <span className="block text-xs text-muted-foreground font-normal">
                            Send a payment prompt to the patient&apos;s phone
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="manual" id="mpesa-manual" />
                        <label htmlFor="mpesa-manual" className="text-sm font-medium cursor-pointer">
                          <span>Record M-Pesa Payment</span>
                          <span className="block text-xs text-muted-foreground font-normal">
                            Patient already paid — enter the transaction code
                          </span>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* STK Push: phone number required */}
            {watchedMpesaMode === 'stk_push' && (
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
                      Enter the M-Pesa registered phone number to receive the prompt
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Manual: transaction code required, phone optional */}
            {watchedMpesaMode === 'manual' && (
              <>
                <FormField
                  control={form.control}
                  name="reference_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>M-Pesa Transaction Code *</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="e.g. SLK4H42RQO"
                            className="uppercase"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                              setVerificationResult(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const code = field.value?.trim();
                                if (!code || verifyMpesa.isPending) return;
                                verifyMpesa.mutateAsync(code).then((result) => {
                                  setVerificationResult(result);
                                  if (!result.verified && result.error) {
                                    form.setError('reference_number', {
                                      type: 'manual',
                                      message: result.error,
                                    });
                                  }
                                }).catch(() => {
                                  setVerificationResult({ verified: false, error: 'Verification request failed' });
                                });
                              }
                            }}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={!field.value?.trim() || verifyMpesa.isPending}
                          onClick={async () => {
                            const code = field.value?.trim();
                            if (!code) return;
                            try {
                              const result = await verifyMpesa.mutateAsync(code);
                              setVerificationResult(result);
                              if (!result.verified && result.error) {
                                form.setError('reference_number', {
                                  type: 'manual',
                                  message: result.error,
                                });
                              }
                            } catch {
                              setVerificationResult({ verified: false, error: 'Verification request failed' });
                            }
                          }}
                        >
                          {verifyMpesa.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Verify
                            </>
                          )}
                        </Button>
                      </div>
                      {verificationResult && (
                        <div className={`flex items-center gap-1.5 text-xs mt-1 ${
                          verificationResult.verified ? 'text-green-600' : 'text-destructive'
                        }`}>
                          {verificationResult.verified ? (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Transaction code verified
                            </>
                          ) : (
                            <>
                              <ShieldX className="h-3.5 w-3.5" />
                              {verificationResult.error || 'Verification failed'}
                            </>
                          )}
                        </div>
                      )}
                      {!verificationResult && (
                        <FormDescription>
                          Enter the code from the patient&apos;s M-Pesa confirmation SMS and verify it
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="0712345678"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional — for record-keeping
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
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

        {/* Reference Number (for non-cash, non-mpesa) */}
        {watchedMethod !== 'CASH' && watchedMethod !== 'MPESA' && (
          <FormField
            control={form.control}
            name="reference_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Transaction reference"
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

        {/* Form Actions - Outside scroll area so always visible */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isLoading ||
              paymentPointsQuery.isLoading ||
              paymentPoints.length === 0 ||
              (watchedMethod === 'MPESA' && watchedMpesaMode === 'manual' && !verificationResult?.verified)
            }
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {watchedMethod === 'MPESA' && watchedMpesaMode === 'stk_push' && onMpesaPayment
              ? 'Send M-Pesa Request'
              : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
