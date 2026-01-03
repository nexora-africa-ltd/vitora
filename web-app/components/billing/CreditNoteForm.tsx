/**
 * Credit Note Form Component
 * Form for requesting credit notes/refunds
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Invoice, CreditNoteCreateData } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types & Validation Schema
// ============================================================================

interface CreditNoteFormProps {
  invoice: Invoice;
  isLoading?: boolean;
  onSubmit: (data: CreditNoteCreateData) => void;
  onCancel: () => void;
}

const creditNoteReasons = [
  { value: 'SERVICE_NOT_RENDERED', label: 'Service Not Rendered' },
  { value: 'DUPLICATE_CHARGE', label: 'Duplicate Charge' },
  { value: 'PRICING_ERROR', label: 'Pricing Error' },
  { value: 'PATIENT_COMPLAINT', label: 'Patient Complaint' },
  { value: 'INSURANCE_ADJUSTMENT', label: 'Insurance Adjustment' },
  { value: 'OTHER', label: 'Other' },
];

const creditNoteFormSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  items: z.array(z.number()).optional(),
});

type CreditNoteFormValues = z.infer<typeof creditNoteFormSchema>;

// ============================================================================
// Main Component
// ============================================================================

export function CreditNoteForm({
  invoice,
  isLoading,
  onSubmit,
  onCancel,
}: CreditNoteFormProps) {
  const maxAmount = parseFloat(invoice.paid_amount || '0');

  const form = useForm<CreditNoteFormValues>({
    resolver: zodResolver(creditNoteFormSchema),
    defaultValues: {
      reason: '',
      amount: maxAmount,
      description: '',
      items: [],
    },
  });

  const handleSubmit = (values: CreditNoteFormValues) => {
    const data: CreditNoteCreateData = {
      invoice: invoice.id,
      reason: values.reason,
      amount: values.amount.toString(),
      description: values.description,
      items: values.items,
    };
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Invoice Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Credit Note for Invoice: {invoice.invoice_number}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Patient:</span>
                <span className="ml-2 font-medium">{invoice.patient_name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Paid:</span>
                <span className="ml-2 font-medium text-green-600">
                  {formatCurrency(maxAmount)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reason */}
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason for Credit Note *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {creditNoteReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <FormLabel>Credit Amount (KES) *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  max={maxAmount}
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>
                Maximum: {formatCurrency(maxAmount)} (total paid)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Provide detailed description of the credit note request..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                This will be reviewed by a supervisor before approval
              </FormDescription>
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
            Submit Request
          </Button>
        </div>
      </form>
    </Form>
  );
}
