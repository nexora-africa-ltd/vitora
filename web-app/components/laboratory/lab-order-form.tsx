'use client';

import { useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, FlaskConical, Search } from 'lucide-react';
import { TestSelector } from './test-selector';
import { LabOrderCreateData, OrderType, LabPriority, TestCatalog } from '@/lib/types/laboratory';
import { useCreateLabOrder } from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils/format';

const orderSchema = z.object({
  patient: z.number().positive('Patient is required'),
  encounter: z.number().positive('Encounter is required'),
  order_type: z.enum(['IN_HOUSE', 'EXTERNAL']).default('IN_HOUSE'),
  external_lab: z.string().optional(),
  priority: z.enum(['ROUTINE', 'URGENT', 'STAT']).default('ROUTINE'),
  clinical_notes: z.string().optional(),
  items: z.array(
    z.object({
      test: z.number().positive('Test is required'),
      test_name: z.string().optional(),
      test_code: z.string().optional(),
      cost: z.number().optional(),
      special_instructions: z.string().optional(),
    })
  ).min(1, 'At least one test is required'),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface LabOrderFormProps {
  patientId: number;
  encounterId: number;
  patientName?: string;
  onSuccess?: (orderNumber: string) => void;
  onCancel?: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'ROUTINE', label: 'Routine', description: 'Standard turnaround time' },
  { value: 'URGENT', label: 'Urgent', description: 'Priority processing' },
  { value: 'STAT', label: 'STAT', description: 'Emergency - immediate processing' },
];

const ORDER_TYPE_OPTIONS = [
  { value: 'IN_HOUSE', label: 'In-House', description: 'Processed in facility lab' },
  { value: 'EXTERNAL', label: 'External Lab', description: 'Sent to external partner' },
];

export function LabOrderForm({
  patientId,
  encounterId,
  patientName,
  onSuccess,
  onCancel,
}: LabOrderFormProps) {
  const { toast } = useToast();
  const createOrder = useCreateLabOrder();
  const [showTestSelector, setShowTestSelector] = useState(false);

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      patient: patientId,
      encounter: encounterId,
      order_type: 'IN_HOUSE',
      priority: 'ROUTINE',
      clinical_notes: '',
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const orderType = form.watch('order_type');
  const items = form.watch('items');
  const totalCost = items.reduce((sum, item) => sum + (item.cost || 0), 0);

  const handleAddTest = useCallback((test: TestCatalog) => {
    // Check if test is already added
    const exists = items.some(item => item.test === test.id);
    if (exists) {
      toast({
        title: 'Test already added',
        description: `${test.name} is already in the order.`,
        variant: 'destructive',
      });
      return;
    }

    append({
      test: test.id,
      test_name: test.name,
      test_code: test.code,
      cost: test.cost,
      special_instructions: '',
    });
    setShowTestSelector(false);
  }, [items, append, toast]);

  const onSubmit = async (data: OrderFormData) => {
    try {
      const orderData: LabOrderCreateData = {
        patient: data.patient,
        encounter: data.encounter,
        order_type: data.order_type as OrderType,
        external_lab: data.external_lab,
        priority: data.priority as LabPriority,
        clinical_notes: data.clinical_notes,
        items: data.items.map(item => ({
          test: item.test,
          special_instructions: item.special_instructions,
        })),
      };

      const order = await createOrder.mutateAsync(orderData);

      toast({
        title: 'Lab order created',
        description: `Order ${order.order_number} created successfully.`,
      });

      onSuccess?.(order.order_number);
    } catch (error) {
      toast({
        title: 'Error creating order',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient Info */}
        {patientName && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Patient</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{patientName}</p>
            </CardContent>
          </Card>
        )}

        {/* Order Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Order Settings</CardTitle>
            <CardDescription>Configure order type and priority</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="order_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ORDER_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div>
                              <span>{option.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                - {option.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div>
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {orderType === 'EXTERNAL' && (
              <FormField
                control={form.control}
                name="external_lab"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External Lab Partner</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter external lab name" {...field} />
                    </FormControl>
                    <FormDescription>
                      Specify the external laboratory for sample referral
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="clinical_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinical Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add clinical context, diagnosis, or special instructions..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Tests Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Tests</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowTestSelector(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Test
              </Button>
            </CardTitle>
            <CardDescription>
              Select laboratory tests to include in this order
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No tests added yet</p>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setShowTestSelector(true)}
                >
                  Click to add tests
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.test_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {field.test_code}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Cost: {formatCurrency(field.cost || 0)}
                      </p>
                      <Input
                        placeholder="Special instructions (optional)"
                        className="mt-2 text-sm"
                        {...form.register(`items.${index}.special_instructions`)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}

                <Separator className="my-4" />

                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">Total ({fields.length} tests)</span>
                  <span className="font-bold text-lg">{formatCurrency(totalCost)}</span>
                </div>
              </div>
            )}

            {form.formState.errors.items && (
              <p className="text-sm text-red-500 mt-2">
                {form.formState.errors.items.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? 'Creating...' : 'Create Lab Order'}
          </Button>
        </div>

        {/* Test Selector Modal */}
        {showTestSelector && (
          <TestSelector
            onSelect={handleAddTest}
            onClose={() => setShowTestSelector(false)}
            orderType={orderType as OrderType}
          />
        )}
      </form>
    </Form>
  );
}
