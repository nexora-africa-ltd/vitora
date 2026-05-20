/**
 * Invoice Form Component
 * Form for creating and editing invoices
 */
'use client';

import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2, Loader2, FileText, Clock } from 'lucide-react';
import { ShiftGate } from '@/components/shared/shift-gate';
import { format, addDays } from 'date-fns';
import type { Invoice, InvoiceCreateData, InvoicePaymentType, Service, ProformaCreateData } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types & Validation Schema
// ============================================================================

interface InvoiceFormProps {
  invoice?: Invoice;
  patients: Array<{ id: number; name: string; mrn: string }>;
  services: Service[];
  isLoading?: boolean;
  onSubmit: (data: InvoiceCreateData) => void;
  onSubmitProforma?: (data: ProformaCreateData) => void;
  onCancel: () => void;
  onPatientChange?: (patientId: number | null) => void;
  initialPatient?: number;
  /** Default invoice type - 'invoice' or 'proforma' */
  defaultType?: 'invoice' | 'proforma';
  /** Whether to show the invoice type toggle */
  showTypeToggle?: boolean;
}

interface LineItem {
  service_id: number;
  quantity: number;
  unit_price: number;
  description?: string;
}

const lineItemSchema = z.object({
  service_id: z.number().min(1, 'Service is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Price cannot be negative'),
  description: z.string().optional(),
});

const PAYMENT_TYPE_OPTIONS: { value: InvoicePaymentType; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'INSURANCE', label: 'Insurance / SHA' },
  { value: 'CORPORATE', label: 'Corporate Account' },
];

const invoiceFormSchema = z.object({
  patient: z.number().min(1, 'Patient is required'),
  encounter: z.number().optional(),
  due_date: z.date({ required_error: 'Due date is required' }),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, 'At least one item is required'),
  // Payment type
  payment_type: z.enum(['CASH', 'MPESA', 'INSURANCE', 'CORPORATE', 'MIXED']).default('CASH'),
  // Proforma-specific fields
  invoice_type: z.enum(['invoice', 'proforma']).default('invoice'),
  valid_until: z.date().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceForm({
  invoice,
  patients,
  services,
  isLoading,
  onSubmit,
  onSubmitProforma,
  onCancel,
  onPatientChange,
  initialPatient,
  defaultType = 'invoice',
  showTypeToggle = true,
}: InvoiceFormProps) {
  const isEditing = !!invoice;

  const form = useForm<InvoiceFormValues, unknown, InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      patient: invoice?.patient || initialPatient || 0,
      encounter: invoice?.encounter || undefined,
      due_date: invoice?.due_date ? new Date(invoice.due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: invoice?.notes || '',
      payment_type: (invoice?.payment_type?.toUpperCase() as InvoicePaymentType) || 'CASH',
      invoice_type: invoice?.status === 'PROFORMA' ? 'proforma' : defaultType,
      valid_until: invoice?.valid_until ? new Date(invoice.valid_until) : addDays(new Date(), 30),
      items: invoice?.items?.map((item) => ({
        service_id: item.service ?? undefined,
        quantity: parseInt(item.quantity, 10) || 1,
        unit_price: parseFloat(item.unit_price),
        description: item.description || '',
      })) || [{ service_id: 0, quantity: 1, unit_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Calculate totals
  const watchedItems = form.watch('items');
  const watchedInvoiceType = form.watch('invoice_type');
  const isProforma = watchedInvoiceType === 'proforma';
  const subtotal = watchedItems.reduce(
    (acc, item) => acc + (item.quantity || 0) * (item.unit_price || 0),
    0
  );

  // Handle service selection - auto-fill price
  const handleServiceChange = (index: number, serviceId: number) => {
    const service = services.find((s) => s.id === serviceId);
    if (service) {
      form.setValue(`items.${index}.service_id`, serviceId);
      form.setValue(`items.${index}.unit_price`, parseFloat(service.unit_price));
    }
  };

  const handleSubmit = (values: InvoiceFormValues) => {
    if (values.invoice_type === 'proforma' && onSubmitProforma) {
      const data: ProformaCreateData = {
        patient: values.patient,
        encounter: values.encounter,
        due_date: format(values.due_date, 'yyyy-MM-dd'),
        notes: values.notes,
        status: 'PROFORMA',
        valid_until: values.valid_until ? format(values.valid_until, 'yyyy-MM-dd') : undefined,
      };
      onSubmitProforma(data);
    } else {
      const data: InvoiceCreateData = {
        patient: values.patient,
        encounter: values.encounter,
        due_date: format(values.due_date, 'yyyy-MM-dd'),
        notes: values.notes,
        payment_type: values.payment_type,
      };
      onSubmit(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-6">
        {/* Invoice Type Toggle */}
        {showTypeToggle && !isEditing && (
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Document Type</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <FormField
                control={form.control}
                name="invoice_type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex flex-col gap-3 sm:flex-row sm:gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="invoice" id="type-invoice" />
                          <Label
                            htmlFor="type-invoice"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            Invoice
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="proforma" id="type-proforma" />
                          <Label
                            htmlFor="type-proforma"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Clock className="h-4 w-4 text-purple-600" />
                            Proforma Invoice
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    {isProforma && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Proforma invoices are quotations that can be converted to real invoices later.
                        They have a validity period and cannot receive payments directly.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Payment Type */}
        {!isProforma && (
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Payment Type</CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <FormField
                control={form.control}
                name="payment_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How will this invoice be paid? *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value === 'INSURANCE' && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Insurance invoices can be submitted to SHA for reimbursement after finalization.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Patient & Due Date */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">{isProforma ? 'Proforma Details' : 'Invoice Details'}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 px-4 sm:px-6">
            {/* Patient */}
            <FormField
              control={form.control}
              name="patient"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Patient *</FormLabel>
                  <Select
                    value={field.value?.toString() || ''}
                    onValueChange={(value) => {
                      const patientId = parseInt(value);
                      field.onChange(patientId);
                      onPatientChange?.(patientId || null);
                    }}
                    disabled={isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id.toString()}>
                          {patient.name} ({patient.mrn})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Due Date */}
            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isProforma ? 'Quote Date *' : 'Due Date *'}</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Pick a date"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Validity Period (Proforma only) */}
            {isProforma && (
              <FormField
                control={form.control}
                name="valid_until"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-600" />
                      Valid Until *
                    </FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Pick expiry date"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Proforma expires after this date and cannot be converted
                    </p>
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
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => append({ service_id: 0, quantity: 1, unit_price: 0 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="space-y-3 sm:space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-end p-3 sm:p-0 border sm:border-0 rounded-lg sm:rounded-none"
                >
                  {/* Service */}
                  <div className="sm:col-span-5">
                    <FormField
                      control={form.control}
                      name={`items.${index}.service_id`}
                      render={({ field: serviceField }) => (
                        <FormItem>
                          <FormLabel className={index === 0 ? '' : 'sm:hidden'}>Service</FormLabel>
                          <Select
                            value={serviceField.value?.toString() || ''}
                            onValueChange={(value) =>
                              handleServiceChange(index, parseInt(value))
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select service" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {services.map((service) => (
                                <SelectItem
                                  key={service.id}
                                  value={service.id.toString()}
                                >
                                  {service.name} - {formatCurrency(parseFloat(service.unit_price))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Quantity & Unit Price row on mobile */}
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <div className="sm:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: qtyField }) => (
                          <FormItem>
                            <FormLabel className={index === 0 ? '' : 'sm:hidden'}>Qty</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                {...qtyField}
                                onChange={(e) =>
                                  qtyField.onChange(parseInt(e.target.value) || 1)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.unit_price`}
                        render={({ field: priceField }) => (
                          <FormItem>
                            <FormLabel className={index === 0 ? '' : 'sm:hidden'}>Unit Price</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...priceField}
                                onChange={(e) =>
                                  priceField.onChange(parseFloat(e.target.value) || 0)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Remove Button */}
                  <div className="sm:col-span-2 flex justify-end">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/80 gap-1 sm:p-2"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden text-xs">Remove</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between sm:justify-end mt-4 sm:mt-6 pt-3 sm:pt-4 border-t">
              <span className="text-sm sm:text-base text-muted-foreground sm:mr-4">Subtotal:</span>
              <span className="text-lg sm:text-xl font-bold">
                {formatCurrency(subtotal)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
          <ShiftGate>
          <Button
            type="submit"
            disabled={isLoading || (isProforma && !onSubmitProforma)}
            className={`w-full sm:w-auto ${isProforma ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isProforma ? (
              <>
                <Clock className="mr-2 h-4 w-4" />
                {isEditing ? 'Update Proforma' : 'Create Proforma'}
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                {isEditing ? 'Update Invoice' : 'Create Invoice'}
              </>
            )}
          </Button>
          </ShiftGate>
        </div>
      </form>
    </Form>
  );
}

// ============================================================================
// Simple Invoice Form with Encounter Validation (for context-based usage)
// ============================================================================

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { usePatientContext } from '@/lib/context/patient-context';

interface SimpleInvoiceFormProps {
  patientId?: number;
  encounterId?: number;
}

/**
 * Simplified Invoice Form that enforces encounter requirement
 * Uses context when available, falls back to props
 */
export function SimpleInvoiceForm({ patientId, encounterId }: SimpleInvoiceFormProps) {
  // Try to get from context first
  let contextPatientId: number | undefined;
  let contextEncounterId: number | undefined;

  try {
    const patientContext = usePatientContext();
    contextPatientId = patientContext.patient?.id;
  } catch {
    // Not in patient context
  }

  try {
    const encounterContext = useEncounterContext();
    contextEncounterId = encounterContext.encounter?.id;
  } catch {
    // Not in encounter context
  }

  const effectivePatientId = patientId ?? contextPatientId;
  const effectiveEncounterId = encounterId ?? contextEncounterId;
  const hasEncounter = !!effectiveEncounterId;

  return (
    <div data-testid="invoice-form" role="form" className="space-y-4">
      {!hasEncounter && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Active Encounter</AlertTitle>
          <AlertDescription>
            An encounter is required to create an invoice. SHA claims will be rejected without an active encounter.
          </AlertDescription>
        </Alert>
      )}

      {effectiveEncounterId && (
        <input
          type="hidden"
          data-testid="encounter-field"
          aria-label="encounter"
          value={effectiveEncounterId}
          readOnly
        />
      )}

      <div className="text-sm text-muted-foreground">
        Patient ID: {effectivePatientId || 'Not selected'}
      </div>

      {/* Simplified form fields would go here */}
      <Button
        type="submit"
        disabled={!hasEncounter}
        aria-label="Create Invoice"
      >
        Create Invoice
      </Button>
    </div>
  );
}

// Default export for simpler imports
export default SimpleInvoiceForm;
