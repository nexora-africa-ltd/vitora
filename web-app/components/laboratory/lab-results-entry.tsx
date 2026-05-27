'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Save, CheckCircle } from 'lucide-react';
import { LabOrderItem, LabResultCreateData, ResultFlag } from '@/lib/types/laboratory';
import { useAddLabResult, useVerifyLabResult, useLabOrder } from '@/lib/hooks/use-laboratory';
import { laboratoryApi } from '@/lib/api/laboratory';
import { useToast, useLabOrderSocket, type LabResultVerifiedEvent } from '@/lib/hooks';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils/cn';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResultValidationPanel } from './result-validation-panel';
import { EGFRInlineIndicator } from './egfr-inline-indicator';

const resultSchema = z.object({
  numeric_value: z.number().optional(),
  text_value: z.string().optional(),
  option_value: z.string().optional(),
  reference_low: z.number().optional(),
  reference_high: z.number().optional(),
  reference_range_text: z.string().optional(),
  result_flag: z.string().optional(),
  result_unit: z.string().optional(),
  interpretation: z.string().optional(),
  method: z.string().optional(),
  equipment: z.string().optional(),
  is_critical_result: z.boolean().default(false),
});

type ResultFormData = z.infer<typeof resultSchema>;

interface LabResultsEntryProps {
  orderNumber: string;
  items: LabOrderItem[];
  onComplete?: () => void;
  onResultAdded?: () => void;
  /** Patient gender ('M' | 'F' | 'O') for demographic-specific reference ranges */
  patientGender?: string;
  /** Patient age in years for child-specific reference ranges */
  patientAge?: number;
  /** Patient ID for eGFR auto-trigger display */
  patientId?: number;
  /** Encounter ID for eGFR auto-trigger display */
  encounterId?: number;
}

const RESULT_FLAGS: { value: ResultFlag; label: string; color: string }[] = [
  { value: 'NORMAL', label: 'Normal', color: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' },
  { value: 'LOW', label: 'Low', color: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400' },
  { value: 'CRITICAL_LOW', label: 'Critical Low', color: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' },
  { value: 'CRITICAL_HIGH', label: 'Critical High', color: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' },
  { value: 'ABNORMAL', label: 'Abnormal', color: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400' },
  { value: 'POSITIVE', label: 'Positive', color: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400' },
  { value: 'NEGATIVE', label: 'Negative', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
];

// Common lab result units used in Kenya


export function LabResultsEntry({ orderNumber, items, onComplete, onResultAdded, patientGender, patientAge, patientId, encounterId }: LabResultsEntryProps) {
  const { toast } = useToast();
  const { canPerformAction } = usePermissions();
  const canInterpret = canPerformAction('laboratory.interpret_results');
  const canVerify = canPerformAction('laboratory.verify_results');

  // A panel is only a "true header" if it actually has children in the response.
  // Legacy orders (created before panel explosion) have is_panel=true but no children —
  // treat those as regular resultable items.
  const hasChildren = (item: LabOrderItem) =>
    items.some(child => child.panel_parent === item.id);
  const isEffectivePanel = (item: LabOrderItem) => item.is_panel && hasChildren(item);

  const [activeItemId, setActiveItemId] = useState<number | null>(
    items.find(item => !item.has_result && !isEffectivePanel(item))?.id || items.find(item => !isEffectivePanel(item))?.id || null
  );

  // Get order details for the WebSocket connection
  const { data: orderData } = useLabOrder(orderNumber);

  // Real-time WebSocket for multi-user awareness
  // This will notify if another user is also entering results for this order
  // Pass orderNumber and encounterId for proper cache invalidation
  const { isConnected: isWsConnected } = useLabOrderSocket(
    orderData?.id ?? null,
    {
      orderNumber,
      encounterId: orderData?.encounter ?? undefined,
      onMessage: (message) => {
        if (message.event === 'result_entered') {
          // Another user entered a result - show notification
          toast({
            title: 'Result Updated',
            description: 'Another user has entered a result for this order.',
          });
          // The React Query cache will be automatically invalidated by the hook
        } else if (message.event === 'result_verified') {
          const data = message.data as LabResultVerifiedEvent;
          toast({
            title: 'Result Verified',
            description: `${data.test_name} has been verified by ${data.verified_by}.`,
          });
        }
      },
    }
  );

  const addResult = useAddLabResult();
  const verifyResult = useVerifyLabResult();

  const activeItem = items.find(item => item.id === activeItemId);
  // For counting: only non-panel-parent items (children + standalone) need results
  const resultableItems = items.filter(item => !isEffectivePanel(item));
  const pendingItems = resultableItems.filter(item => !item.has_result);
  const completedItems = resultableItems.filter(item => item.has_result);

  // Fetch test catalog detail for active item to get reference ranges and units
  const activeTestCode = activeItem?.test_code;
  const catalogQuery = useQuery({
    queryKey: ['laboratoryTest', activeTestCode],
    queryFn: () => laboratoryApi.getTest(activeTestCode!),
    enabled: !!activeTestCode,
    staleTime: 5 * 60 * 1000, // Cache catalog data for 5 minutes
  });
  const catalogTest = catalogQuery.data;

  // Determine the appropriate reference range based on patient demographics
  // Uses item data (immediately available) with catalog as fallback
  const getPatientReferenceRange = useCallback(() => {
    // Primary source: item data from order response (always available)
    const rangeMale = activeItem?.normal_range_male || catalogTest?.normal_range_male || '';
    const rangeFemale = activeItem?.normal_range_female || catalogTest?.normal_range_female || '';
    const rangeChild = activeItem?.normal_range_child || catalogTest?.normal_range_child || '';

    // Child takes precedence if age < 18
    if (patientAge !== undefined && patientAge < 18 && rangeChild) {
      return rangeChild;
    }
    if (patientGender === 'M' && rangeMale) return rangeMale;
    if (patientGender === 'F' && rangeFemale) return rangeFemale;
    // Fallback
    return rangeMale || rangeFemale || '';
  }, [activeItem, catalogTest, patientGender, patientAge]);

  // Parse a range string like "4.5-5.5" into [low, high]
  const parseRange = useCallback((range: string): [number, number] | null => {
    if (!range || !range.includes('-')) return null;
    const parts = range.split('-');
    if (parts.length !== 2) return null;
    const lowStr = parts[0];
    const highStr = parts[1];
    if (!lowStr || !highStr) return null;
    const low = parseFloat(lowStr.trim());
    const high = parseFloat(highStr.trim());
    if (isNaN(low) || isNaN(high)) return null;
    return [low, high];
  }, []);

  // Auto-compute result flag from numeric value and reference range
  const autoComputeFlag = useCallback((value: number | undefined, rangeText: string): ResultFlag | '' => {
    if (value === undefined || value === null || !rangeText) return '';
    const parsed = parseRange(rangeText);
    if (!parsed) return '';
    const [low, high] = parsed;
    const criticalLow = low - (high - low) * 0.2;
    const criticalHigh = high + (high - low) * 0.2;
    if (value < criticalLow) return 'CRITICAL_LOW';
    if (value > criticalHigh) return 'CRITICAL_HIGH';
    if (value < low) return 'LOW';
    if (value > high) return 'HIGH';
    return 'NORMAL';
  }, [parseRange]);

  // Update activeItemId when items change (e.g., after a result is added)
  useEffect(() => {
    // If current active item now has a result, move to next pending
    const currentItem = items.find(item => item.id === activeItemId);
    if (currentItem?.has_result) {
      const nextPending = items.find(item => !item.has_result && !item.is_panel);
      if (nextPending) {
        setActiveItemId(nextPending.id);
      }
    }
  }, [items, activeItemId]);

  const form = useForm<ResultFormData>({
    resolver: zodResolver(resultSchema),
    defaultValues: {
      numeric_value: undefined,
      text_value: '',
      option_value: '',
      reference_range_text: '',
      result_flag: '',
      result_unit: '',
      interpretation: '',
      method: '',
      equipment: '',
      is_critical_result: false,
    },
  });

  // Auto-populate form from item data (immediate) or catalog (async fallback)
  useEffect(() => {
    if (!activeItem || activeItem.has_result) return;
    // Reset form first to clear stale values from previous item
    form.reset({
      numeric_value: undefined,
      text_value: '',
      option_value: '',
      reference_range_text: '',
      result_flag: '',
      result_unit: '',
      interpretation: '',
      method: '',
      equipment: '',
      is_critical_result: false,
    });
    // Use item's result_unit directly (available from order response)
    const unit = activeItem.result_unit || catalogTest?.result_unit || '';
    const refRange = getPatientReferenceRange();
    const parsed = parseRange(refRange);
    form.setValue('result_unit', unit);
    form.setValue('reference_range_text', refRange);
    if (parsed) {
      form.setValue('reference_low', parsed[0]);
      form.setValue('reference_high', parsed[1]);
    }
  }, [activeItem, catalogTest, getPatientReferenceRange, parseRange, form]);

  const resultFlag = form.watch('result_flag');
  const numericValue = form.watch('numeric_value');
  const referenceRangeText = form.watch('reference_range_text');

  // Auto-compute flag when numeric value changes
  const effectiveResultType = activeItem?.result_type || catalogTest?.result_type;
  useEffect(() => {
    if (effectiveResultType !== 'NUMERIC') return;
    if (numericValue === undefined || numericValue === null) return;
    const computed = autoComputeFlag(numericValue, referenceRangeText || '');
    if (computed) {
      form.setValue('result_flag', computed);
      if (computed.includes('CRITICAL')) {
        form.setValue('is_critical_result', true);
      } else {
        form.setValue('is_critical_result', false);
      }
    }
  }, [numericValue, referenceRangeText, effectiveResultType, autoComputeFlag, form]);

  // Auto-set critical flag for critical values
  const handleFlagChange = (flag: string) => {
    form.setValue('result_flag', flag);
    if (flag.includes('CRITICAL')) {
      form.setValue('is_critical_result', true);
    }
  };

  const onSubmit = async (data: ResultFormData) => {
    if (!activeItem) return;

    try {
      const resultData: LabResultCreateData = {
        order_item: activeItem.id,
        numeric_value: data.numeric_value,
        text_value: data.text_value,
        option_value: data.option_value,
        result_unit: data.result_unit,
        reference_low: data.reference_low,
        reference_high: data.reference_high,
        reference_range_text: data.reference_range_text,
        result_flag: data.result_flag as ResultFlag,
        interpretation: data.interpretation,
        method: data.method,
        equipment: data.equipment,
      };

      await addResult.mutateAsync({ orderNumber, data: resultData });

      toast({
        title: 'Result saved',
        description: `Result for ${activeItem.test_name} has been recorded.`,
      });

      // Notify parent to refetch data
      await onResultAdded?.();

      // Reset form for next item
      form.reset();

      // Check if there are more pending items (using updated items from parent)
      const currentPendingCount = items.filter(item => !item.has_result && !item.is_panel && item.id !== activeItem.id).length;

      if (currentPendingCount === 0) {
        toast({
          title: 'All results entered',
          description: 'All test results have been recorded.',
        });
        onComplete?.();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save result',
        variant: 'destructive',
      });
    }
  };

  const handleVerify = async (resultId: number) => {
    try {
      await verifyResult.mutateAsync(resultId);
      toast({
        title: 'Result verified',
        description: 'The result has been verified.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to verify result',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Test List Sidebar */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Tests</CardTitle>
            <HelpPopover content="Select a test from the list to enter or verify results." />
          </div>
          <p className="text-sm text-muted-foreground">
            {pendingItems.length} pending, {completedItems.length} complete
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.filter(item => !item.panel_parent).map((item) => (
            <div key={item.id}>
              {/* Panel header or standalone item */}
              <div
                className={cn(
                  'p-3 rounded-lg transition-colors border',
                  !isEffectivePanel(item) && 'cursor-pointer',
                  activeItemId === item.id && !isEffectivePanel(item) && 'border-primary bg-primary/5',
                  !isEffectivePanel(item) && item.has_result && 'bg-green-50 dark:bg-green-950/30',
                  !isEffectivePanel(item) && item.result?.is_critical_result && 'bg-red-50 dark:bg-red-950/30 border-red-200',
                  !isEffectivePanel(item) && activeItemId !== item.id && 'hover:bg-muted/50',
                  isEffectivePanel(item) && 'bg-muted/30 border-muted cursor-default',
                )}
                onClick={() => !isEffectivePanel(item) && setActiveItemId(item.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn('font-medium text-sm text-foreground', isEffectivePanel(item) && 'font-semibold')}>{item.test_name}</p>
                    <p className="text-xs text-muted-foreground">{item.test_code}{isEffectivePanel(item) ? ' (Panel)' : ''}</p>
                  </div>
                  {!isEffectivePanel(item) && (
                    item.has_result ? (
                      <div className="flex items-center gap-1">
                        {item.result?.is_critical_result && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pending</Badge>
                    )
                  )}
                </div>
              </div>
              {/* Panel children (indented) */}
              {isEffectivePanel(item) && (
                <div className="ml-4 mt-1 space-y-1">
                  {items.filter(child => child.panel_parent === item.id).map((child) => (
                    <div
                      key={child.id}
                      className={cn(
                        'p-2 rounded-md cursor-pointer transition-colors border text-sm',
                        activeItemId === child.id && 'border-primary bg-primary/5',
                        child.has_result && 'bg-green-50 dark:bg-green-950/30',
                        child.result?.is_critical_result && 'bg-red-50 dark:bg-red-950/30 border-red-200',
                        activeItemId !== child.id && 'hover:bg-muted/50'
                      )}
                      onClick={() => setActiveItemId(child.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{child.test_name}</p>
                          <p className="text-xs text-muted-foreground">{child.test_code}</p>
                        </div>
                        {child.has_result ? (
                          <div className="flex items-center gap-1">
                            {child.result?.is_critical_result && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            )}
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Pending</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Result Entry Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{activeItem ? activeItem.test_name : 'Select a Test'}</CardTitle>
            {activeItem ? (
              <HelpPopover content={`Enter the result for ${activeItem.test_code}.`} />
            ) : null}
          </div>
          {activeItem ? (
            <p className="text-sm text-muted-foreground">{activeItem.test_code}</p>
          ) : null}
        </CardHeader>
        <CardContent>
          {activeItem && !activeItem.has_result ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Result Value */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="numeric_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numeric Value</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Enter value"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(
                              e.target.value ? parseFloat(e.target.value) : undefined
                            )}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="result_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., g/dL"
                            {...field}
                            readOnly={!!field.value}
                            className={field.value ? 'bg-muted/50' : ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reference_range_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Range</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 4.0-11.0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Text Value */}
                <FormField
                  control={form.control}
                  name="text_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Text Value (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter text result or additional details"
                          className="min-h-[60px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Result Flag */}
                <FormField
                  control={form.control}
                  name="result_flag"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Result Flag</FormLabel>
                      <Select
                        onValueChange={handleFlagChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select flag" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RESULT_FLAGS.map((flag) => (
                            <SelectItem key={flag.value} value={flag.value}>
                              <div className="flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full', flag.color)} />
                                {flag.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Catalog Reference Info (auto-populated) */}
                {catalogTest && !activeItem.has_result && (
                  <div className="p-3 bg-muted/50 border rounded-lg text-sm">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-muted-foreground">
                        Type: <span className="font-medium text-foreground">{catalogTest.result_type}</span>
                      </span>
                      {catalogTest.result_unit && (
                        <span className="text-muted-foreground">
                          Unit: <span className="font-medium text-foreground">{catalogTest.result_unit}</span>
                        </span>
                      )}
                      {referenceRangeText && (
                        <span className="text-muted-foreground">
                          Reference: <span className="font-medium text-foreground">{referenceRangeText} {catalogTest.result_unit || ''}</span>
                        </span>
                      )}
                      {catalogTest.requires_fasting && (
                        <Badge variant="outline" className="text-xs">Fasting Required</Badge>
                      )}
                      {catalogTest.special_instructions && (
                        <span className="text-muted-foreground text-xs">
                          Note: {catalogTest.special_instructions}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Critical Alert */}
                {resultFlag?.includes('CRITICAL') && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-medium text-destructive">Critical Value Alert</p>
                      <p className="text-sm text-destructive/80">
                        This result will trigger an immediate notification to the ordering clinician.
                      </p>
                    </div>
                  </div>
                )}

                {/* Interpretation — only for pathologists / clinical sign-off roles */}
                {(canInterpret || catalogTest?.requires_clinical_signoff) && (
                  <FormField
                    control={form.control}
                    name="interpretation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interpretation (Pathologist)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Pathologist notes or interpretation..."
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Method & Equipment — only for lab scientists and pathologists */}
                {(canVerify || canInterpret) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Testing method" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="equipment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipment (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Analyzer used" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button type="submit" disabled={addResult.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {addResult.isPending ? 'Saving...' : 'Save Result'}
                  </Button>
                </div>
              </form>
            </Form>
          ) : activeItem?.has_result ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-700 dark:text-green-300">Result Recorded</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Value</p>
                    <p className="font-semibold text-foreground">
                      {activeItem.result?.numeric_value ??
                       activeItem.result?.text_value ??
                       activeItem.result?.option_value ?? '-'}
                      {activeItem.result?.result_unit && (
                        <span className="text-muted-foreground ml-1">{activeItem.result.result_unit}</span>
                      )}
                    </p>
                  </div>
                  {activeItem.result?.reference_range_text && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Reference</p>
                      <p className="font-medium text-foreground">{activeItem.result.reference_range_text}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Flag</p>
                    <Badge
                      variant={
                        activeItem.result?.result_flag?.includes('CRITICAL') ? 'destructive' :
                        ['LOW', 'HIGH', 'ABNORMAL'].includes(activeItem.result?.result_flag || '') ? 'secondary' :
                        'outline'
                      }
                    >
                      {activeItem.result?.result_flag || 'NORMAL'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Status</p>
                    <Badge variant={activeItem.result?.verification_status === 'VERIFIED' ? 'default' : 'outline'}>
                      {activeItem.result?.verification_status || 'UNVERIFIED'}
                    </Badge>
                  </div>
                </div>
                {activeItem.result?.interpretation && (
                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                    <p className="text-muted-foreground text-xs mb-1">Interpretation</p>
                    <p className="text-sm text-foreground">{activeItem.result.interpretation}</p>
                  </div>
                )}
              </div>

              {/* Two-Stage Validation Panel */}
              {activeItem.result && (
                <ResultValidationPanel
                  resultId={activeItem.result.id}
                  verificationStatus={activeItem.result.verification_status}
                  onValidationAdded={onResultAdded}
                />
              )}

              {/* eGFR Inline Indicator — auto-shows when creatinine result is filed */}
              {activeItem.result?.numeric_value != null &&
                (activeItem.test_code === 'CREA' || activeItem.test_name?.toLowerCase().includes('creatinine')) && (
                <EGFRInlineIndicator
                  patientId={patientId}
                  encounterId={encounterId}
                />
              )}

              {/* Legacy verify button - shown only if two-stage is disabled or already verified */}
              {activeItem.result?.verification_status !== 'VERIFIED' && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Or use quick verification (bypasses two-stage review)
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => activeItem.result && handleVerify(activeItem.result.id)}
                    disabled={verifyResult.isPending}
                    className="w-full sm:w-auto"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {verifyResult.isPending ? 'Verifying...' : 'Quick Verify'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Select a test from the list to enter results
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
