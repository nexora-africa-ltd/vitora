'use client';

import { useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast as sonnerToast } from 'sonner';
import { Plus, Trash2, FlaskConical, Search, User, AlertTriangle } from 'lucide-react';
import { TestSelector } from './test-selector';
import { LabOrderCreateData, OrderType, LabPriority, TestCatalogListItem } from '@/lib/types/laboratory';
import { useCreateLabOrder, useSubmitLabOrder } from '@/lib/hooks/use-laboratory';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils/format';
import { useAuth } from '@/lib/auth';
import { useOptionalPatientContext } from '@/lib/context/patient-context';
import { useOptionalEncounterContext } from '@/lib/context/encounter-context';
import { HelpPopover } from '@/components/shared/help-popover';

const orderSchema = z.object({
  patient: z.number().positive('Patient is required'),
  encounter: z.number().positive('Encounter is required'),
  order_type: z.enum(['IN_HOUSE', 'EXTERNAL']).default('IN_HOUSE'),
  external_lab: z.string().optional(),
  priority: z.enum(['ROUTINE', 'URGENT', 'STAT']).default('ROUTINE'),
  clinical_notes: z.string().optional(),
  items: z.array(
    z.object({
      test: z.number().min(0, 'Test is required'),
      test_name: z.string().optional(),
      test_code: z.string().min(1, 'Test code is required'),
      loinc_code: z.string().optional(),
      cost: z.number().optional(),
      special_instructions: z.string().optional(),
    })
  ).min(1, 'At least one test is required'),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface LabOrderFormProps {
  /** Patient ID - optional if using PatientContext */
  patientId?: number;
  /** Encounter ID - optional if using EncounterContext */
  encounterId?: number;
  /** Admission ID - for inpatient lab orders */
  admissionId?: number;
  patientName?: string;
  patientMrn?: string;
  patientGender?: string;
  patientDateOfBirth?: string;
  encounterType?: string;
  encounterDate?: string;
  chiefComplaint?: string;
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
  patientId: propPatientId,
  encounterId: propEncounterId,
  admissionId,
  patientName: propPatientName,
  patientMrn: propPatientMrn,
  patientGender: propPatientGender,
  patientDateOfBirth: propPatientDateOfBirth,
  encounterType: propEncounterType,
  encounterDate: propEncounterDate,
  chiefComplaint: propChiefComplaint,
  onSuccess,
  onCancel,
}: LabOrderFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const createOrder = useCreateLabOrder();
  const submitOrder = useSubmitLabOrder();
  const [showTestSelector, setShowTestSelector] = useState(false);

  // Try to get data from context (optional - may not be in context)
  const patientContext = useOptionalPatientContext();
  const encounterContext = useOptionalEncounterContext();

  // Use context data if available, otherwise fall back to props
  const contextPatient = patientContext?.patient;
  const contextEncounter = encounterContext?.encounter;
  const canPlaceOrders = encounterContext?.canPlaceOrders ?? true;

  // Resolved values: context takes precedence over props
  const patientId = contextPatient?.id ?? propPatientId;
  const encounterId = contextEncounter?.id ?? propEncounterId;
  const patientName = contextPatient
    ? `${contextPatient.first_name} ${contextPatient.last_name}`
    : propPatientName;
  const patientMrn = contextPatient?.mrn ?? propPatientMrn;
  const patientGender = contextPatient?.gender ?? propPatientGender;
  const patientDateOfBirth = contextPatient?.date_of_birth ?? propPatientDateOfBirth;
  const encounterType = contextEncounter?.encounter_type ?? propEncounterType;
  const encounterDate = contextEncounter?.encounter_date ?? propEncounterDate;
  const chiefComplaint = contextEncounter?.chief_complaint ?? propChiefComplaint;

  // Validation: both patient and encounter are required
  const hasPatient = !!patientId;
  const hasEncounter = !!encounterId;
  const isValid = hasPatient && hasEncounter && canPlaceOrders;

  // Current date/time for "Requested At"
  const requestedAt = new Date();

  // Get current user's display name
  const requestedByName = user
    ? (user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.username)
    : 'Unknown';

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      patient: patientId || 0,
      encounter: encounterId || 0,
      order_type: 'IN_HOUSE',
      priority: 'ROUTINE',
      clinical_notes: '',
      items: [],
    },
    mode: 'onChange', // Validate on change to catch issues early
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const orderType = form.watch('order_type');
  const items = form.watch('items');
  // Calculate total, ensuring cost is treated as number
  const totalCost = items.reduce((sum, item) => {
    const cost = typeof item.cost === 'string' ? parseFloat(item.cost) : (item.cost || 0);
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);

  const handleAddTest = useCallback((test: TestCatalogListItem) => {
    // Check if test is already added (use fields for accurate current state)
    const currentItems = form.getValues('items');
    const exists = currentItems.some(item => item.test === test.id);
    if (exists) {
      toast({
        title: 'Test already added',
        description: `${test.name} is already in the order.`,
        variant: 'destructive',
      });
      return;
    }

    // Parse cost as number (backend may send as string from DecimalField)
    const cost = typeof test.cost === 'string' ? parseFloat(test.cost) : (test.cost || 0);

    append({
      test: test.id,
      test_name: test.name,
      test_code: test.code,
      cost: isNaN(cost) ? 0 : cost,
      special_instructions: '',
    });

    // Trigger validation for items field to clear any previous errors
    form.trigger('items');

    setShowTestSelector(false);
  }, [form, append, toast]);

  // Handle LOINC test selection from SHA
  const handleAddLOINCTest = useCallback((loinc: { code: string; title: string; component?: string }) => {
    // Check if LOINC code is already added
    const currentItems = form.getValues('items');
    const exists = currentItems.some(item => item.test_code === loinc.code);
    if (exists) {
      toast({
        title: 'Test already added',
        description: `${loinc.title} is already in the order.`,
        variant: 'destructive',
      });
      return;
    }

    append({
      test: 0, // LOINC tests may not have local catalog entry
      test_name: loinc.title,
      test_code: loinc.code,
      loinc_code: loinc.code, // Store LOINC code for SHA claims
      cost: 0, // Cost to be determined
      special_instructions: '',
    });

    // Trigger validation for items field to clear any previous errors
    form.trigger('items');

    setShowTestSelector(false);

    toast({
      title: 'LOINC Test Added',
      description: `${loinc.title} (${loinc.code}) added. Cost will be determined by lab.`,
    });
  }, [form, append, toast]);

  const onSubmit = async (data: OrderFormData) => {
    try {
      const orderData: LabOrderCreateData = {
        patient: data.patient,
        encounter: data.encounter,
        ...(admissionId ? { admission: admissionId } : {}),
        order_type: data.order_type as OrderType,
        external_lab: data.external_lab,
        priority: data.priority as LabPriority,
        clinical_notes: data.clinical_notes,
        items: data.items.map(item => ({
          test_code: item.test_code,
          special_instructions: item.special_instructions,
        })),
      };

      const order = await createOrder.mutateAsync(orderData);

      if (!order) {
        sonnerToast.success('Lab order saved locally — will sync when online.');
        onSuccess?.('');
        return;
      }

      // Auto-submit so it goes straight to ORDERED status
      try {
        await submitOrder.mutateAsync(order.order_number);
      } catch {
        // If submit fails, order is still in DRAFT — user can submit manually
      }

      sonnerToast.success(`Order ${order.order_number} has been submitted`, {
        action: {
          label: 'View Order',
          onClick: () => router.push(`/laboratory/orders/${order.order_number}`),
        },
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

  // Show warning if no encounter context
  if (!hasEncounter) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Encounter Required</AlertTitle>
        <AlertDescription>
          Lab orders must be created within the context of a patient encounter.
          Please select or create an encounter first.
        </AlertDescription>
      </Alert>
    );
  }

  // Show warning if encounter is not active
  if (!canPlaceOrders) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Encounter Not Active</AlertTitle>
        <AlertDescription>
          Lab orders can only be created for active encounters. This encounter has been
          completed or cancelled. Please create a new encounter to place orders.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient & Requestor Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Patient Name */}
              {patientName && (
                <div>
                  <Label className="text-xs text-muted-foreground">Patient Name</Label>
                  <p className="font-medium">{patientName}</p>
                </div>
              )}

              {/* Patient MRN */}
              {patientMrn && (
                <div>
                  <Label className="text-xs text-muted-foreground">MRN</Label>
                  <p className="font-medium font-mono text-sm">{patientMrn}</p>
                </div>
              )}

              {/* Patient Gender & Date of Birth */}
              {(patientGender || patientDateOfBirth) && (
                <div>
                  <Label className="text-xs text-muted-foreground">Gender / Date of Birth</Label>
                  <p className="font-medium text-sm">
                    {patientGender === 'M' ? 'Male' : patientGender === 'F' ? 'Female' : patientGender || '—'}
                    {patientDateOfBirth && ` • ${new Date(patientDateOfBirth).toLocaleDateString()}`}
                  </p>
                </div>
              )}

              {/* Encounter Type */}
              {encounterType && (
                <div>
                  <Label className="text-xs text-muted-foreground">Encounter Type</Label>
                  <p className="font-medium text-sm">{encounterType}</p>
                </div>
              )}

              {/* Encounter Date */}
              {encounterDate && (
                <div>
                  <Label className="text-xs text-muted-foreground">Encounter Date</Label>
                  <p className="font-medium text-sm">{new Date(encounterDate).toLocaleDateString()}</p>
                </div>
              )}

              {/* Requested By */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Requested By
                </Label>
                <p className="font-medium text-sm">{requestedByName}</p>
              </div>

              {/* Requested At */}
              <div>
                <Label className="text-xs text-muted-foreground">Requested At</Label>
                <p className="font-medium text-sm">
                  {requestedAt.toLocaleDateString()} {requestedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            {/* Chief Complaint if provided */}
            {chiefComplaint && (
              <div className="mt-4 pt-4 border-t">
                <Label className="text-xs text-muted-foreground">Chief Complaint</Label>
                <p className="text-sm mt-1">{chiefComplaint}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Order Settings</CardTitle>
              <HelpPopover content="Configure order type and priority." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="order_type"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Order Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        {ORDER_TYPE_OPTIONS.map((option) => (
                          <div key={option.value} className="flex items-start space-x-3">
                            <RadioGroupItem value={option.value} id={`order-type-${option.value}`} className="mt-1" />
                            <Label htmlFor={`order-type-${option.value}`} className="cursor-pointer font-normal">
                              <span className="font-medium">{option.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">- {option.description}</span>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        {PRIORITY_OPTIONS.map((option) => (
                          <div key={option.value} className="flex items-start space-x-3">
                            <RadioGroupItem value={option.value} id={`priority-${option.value}`} className="mt-1" />
                            <Label htmlFor={`priority-${option.value}`} className="cursor-pointer font-normal">
                              <span className="font-medium">{option.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">- {option.description}</span>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
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
                    <div className="flex items-center gap-2">
                      <FormLabel>External Lab Partner</FormLabel>
                      <HelpPopover content="Specify the external laboratory for sample referral." />
                    </div>
                    <FormControl>
                      <Input placeholder="Enter external lab name" {...field} />
                    </FormControl>
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle>Tests</CardTitle>
                <HelpPopover content="Select laboratory tests to include in this order." />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowTestSelector(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Test
              </Button>
            </div>
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
        <div className="flex flex-col gap-3">
          {/* Show form errors */}
          {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
            <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-sm text-destructive">
              <p className="font-medium mb-1">Please fix the following errors:</p>
              <ul className="list-disc list-inside">
                {Object.entries(form.formState.errors).map(([field, error]) => (
                  <li key={field}>
                    {field === 'items'
                      ? (error as { message?: string })?.message || 'At least one test is required'
                      : field === 'patient'
                      ? 'Patient is required'
                      : field === 'encounter'
                      ? 'Encounter is required'
                      : `${field}: ${(error as { message?: string })?.message || 'Invalid'}`
                    }
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={createOrder.isPending}>
              {createOrder.isPending ? 'Creating...' : 'Create Lab Order'}
            </Button>
          </div>
        </div>

        {/* Test Selector Modal */}
        {showTestSelector && (
          <TestSelector
            onSelect={handleAddTest}
            onSelectLOINC={handleAddLOINCTest}
            onClose={() => setShowTestSelector(false)}
            orderType={orderType as OrderType}
            showLOINCTab={true}
          />
        )}
      </form>
    </Form>
  );
}
