/**
 * Imaging order form component.
 * Used for creating and editing imaging orders.
 */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/hooks';
import { useCreateImagingOrder, useSubmitImagingOrder } from '@/lib/hooks/use-imaging';
import {
  ImagingProcedure,
  ImagingPriority,
  Laterality,
  PRIORITY_LABELS,
  LATERALITY_LABELS,
  ImagingOrderItemCreateData,
} from '@/lib/types/imaging';
import { ProcedureSelector } from './procedure-selector';
import { ModalityBadge } from './modality-badge';

// Form validation schema
const imagingOrderFormSchema = z.object({
  patient: z.number({ required_error: 'Patient is required' }),
  encounter: z.number({ required_error: 'Encounter is required' }),
  priority: z.enum(['ROUTINE', 'URGENT', 'STAT']),
  clinical_indication: z.string().min(5, 'Clinical indication must be at least 5 characters'),
  relevant_clinical_history: z.string().optional(),
});

type ImagingOrderFormData = z.infer<typeof imagingOrderFormSchema>;

interface OrderItem {
  id: string;
  procedure: ImagingProcedure;
  laterality: Laterality;
  specific_instructions: string;
}

interface ImagingOrderFormProps {
  patientId: number;
  patientName?: string;
  encounterId: number;
  onSuccess?: (orderNumber: string) => void;
  onCancel?: () => void;
}

export function ImagingOrderForm({
  patientId,
  patientName,
  encounterId,
  onSuccess,
  onCancel,
}: ImagingOrderFormProps) {
  const router = useRouter();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<ImagingProcedure | null>(null);
  const [currentLaterality, setCurrentLaterality] = useState<Laterality>('NA');
  const [currentInstructions, setCurrentInstructions] = useState('');

  const createOrder = useCreateImagingOrder();
  const submitOrder = useSubmitImagingOrder();

  const form = useForm<ImagingOrderFormData>({
    resolver: zodResolver(imagingOrderFormSchema),
    defaultValues: {
      patient: patientId,
      encounter: encounterId,
      priority: 'ROUTINE',
      clinical_indication: '',
      relevant_clinical_history: '',
    },
  });

  const addItem = useCallback(() => {
    if (!selectedProcedure) {
      toast({ title: 'Please select a procedure', variant: 'destructive' });
      return;
    }

    // Check for duplicates
    const exists = items.some(
      (item) =>
        item.procedure.id === selectedProcedure.id &&
        item.laterality === currentLaterality
    );

    if (exists) {
      toast({
        title: 'Procedure already added',
        description: 'This procedure with the same laterality is already in the order.',
        variant: 'destructive',
      });
      return;
    }

    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      procedure: selectedProcedure,
      laterality: currentLaterality,
      specific_instructions: currentInstructions,
    };

    setItems([...items, newItem]);
    setSelectedProcedure(null);
    setCurrentLaterality('NA');
    setCurrentInstructions('');
  }, [selectedProcedure, currentLaterality, currentInstructions, items]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const totalCost = items.reduce((sum, item) => sum + item.procedure.cost, 0);

  const onSubmit = async (data: ImagingOrderFormData) => {
    if (items.length === 0) {
      toast({
        title: 'No procedures added',
        description: 'Please add at least one imaging procedure to the order.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const orderItems: ImagingOrderItemCreateData[] = items.map((item) => ({
        procedure_code: item.procedure.code,
        laterality: item.laterality,
        specific_instructions: item.specific_instructions || undefined,
      }));

      const order = await createOrder.mutateAsync({
        patient: data.patient,
        encounter: data.encounter,
        priority: data.priority,
        clinical_indication: data.clinical_indication,
        relevant_clinical_history: data.relevant_clinical_history,
        items: orderItems,
      });

      // Auto-submit the order
      await submitOrder.mutateAsync(order.order_number);

      toast({
        title: 'Imaging order created',
        description: `Order ${order.order_number} has been submitted.`,
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

  const isSubmitting = createOrder.isPending || submitOrder.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Patient Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <p className="font-medium">{patientName || `Patient #${patientId}`}</p>
                <p className="text-sm text-muted-foreground">
                  Encounter #{encounterId}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              name="clinical_indication"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinical Indication *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the clinical reason for this imaging request..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe the symptoms, suspected diagnosis, or clinical question.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="relevant_clinical_history"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relevant Clinical History</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Previous imaging, surgery, relevant conditions..."
                      className="min-h-[60px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Procedures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Imaging Procedures</CardTitle>
            <CardDescription>
              Add the imaging procedures to be performed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Procedure Form */}
            <div className="grid gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Procedure *</label>
                  <ProcedureSelector
                    value={selectedProcedure || undefined}
                    onSelect={setSelectedProcedure}
                    placeholder="Search and select procedure..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Laterality</label>
                  <Select
                    value={currentLaterality}
                    onValueChange={(v) => setCurrentLaterality(v as Laterality)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LATERALITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Specific Instructions</label>
                <Input
                  value={currentInstructions}
                  onChange={(e) => setCurrentInstructions(e.target.value)}
                  placeholder="Optional specific instructions for this procedure..."
                />
              </div>
              <Button type="button" onClick={addItem} className="w-fit">
                <Plus className="h-4 w-4 mr-2" />
                Add Procedure
              </Button>
            </div>

            {/* Selected Procedures List */}
            {items.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <h4 className="font-medium text-sm pt-2">
                  Selected Procedures ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <ModalityBadge modality={item.procedure.modality} />
                        <div>
                          <p className="font-medium">{item.procedure.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{item.procedure.code}</span>
                            {item.laterality !== 'NA' && (
                              <>
                                <span>•</span>
                                <span>{LATERALITY_LABELS[item.laterality]}</span>
                              </>
                            )}
                            {item.specific_instructions && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[200px]">
                                  {item.specific_instructions}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">
                            KES {item.procedure.cost.toLocaleString()}
                          </p>
                          {item.procedure.sha_claimable && (
                            <Badge variant="outline" className="text-xs">
                              SHA
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-medium">Total Cost</span>
                  <span className="text-lg font-bold">
                    KES {totalCost.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground border rounded-lg border-dashed">
                <AlertTriangle className="h-4 w-4" />
                No procedures added yet. Use the form above to add imaging procedures.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || items.length === 0}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create & Submit Order
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default ImagingOrderForm;
