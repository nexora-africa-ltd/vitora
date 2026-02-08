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
import { format, addDays } from 'date-fns';
import type { Invoice, InvoiceCreateData, Service, ProformaCreateData } from '@/lib/types/billing';
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

const invoiceFormSchema = z.object({
  patient: z.number().min(1, 'Patient is required'),
  encounter: z.number().optional(),
  due_date: z.date({ required_error: 'Due date is required' }),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1, 'At least one item is required'),
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
      };
      onSubmit(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Invoice Type Toggle */}
        {showTypeToggle && !isEditing && (
          <Card>
            <CardHeader>
              <CardTitle>Document Type</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="invoice_type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-4"
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

        {/* Patient & Due Date */}
        <Card>
          <CardHeader>
            <CardTitle>{isProforma ? 'Proforma Details' : 'Invoice Details'}</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
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
                <FormItem className="md:col-span-2">
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ service_id: 0, quantity: 1, unit_price: 0 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-12 gap-2 items-end"
                >
                  {/* Service */}
                  <div className="col-span-5">
                    <FormField
                      control={form.control}
                      name={`items.${index}.service_id`}
                      render={({ field: serviceField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Service</FormLabel>}
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

                  {/* Quantity */}
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field: qtyField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Qty</FormLabel>}
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

                  {/* Unit Price */}
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.unit_price`}
                      render={({ field: priceField }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Unit Price</FormLabel>}
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

                  {/* Remove Button */}
                  <div className="col-span-2 flex justify-end">
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-end mt-6 pt-4 border-t">
              <div className="text-right">
                <span className="text-muted-foreground mr-4">Subtotal:</span>
                <span className="text-xl font-bold">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || (isProforma && !onSubmitProforma)}
            className={isProforma ? 'bg-purple-600 hover:bg-purple-700' : ''}
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
