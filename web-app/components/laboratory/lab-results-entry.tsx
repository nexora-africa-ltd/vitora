'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Save, CheckCircle } from 'lucide-react';
import { LabOrderItem, LabResultCreateData, ResultFlag } from '@/lib/types/laboratory';
import { useAddLabResult, useVerifyLabResult } from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { cn } from '@/lib/utils/cn';

const resultSchema = z.object({
  numeric_value: z.number().optional(),
  text_value: z.string().optional(),
  option_value: z.string().optional(),
  reference_low: z.number().optional(),
  reference_high: z.number().optional(),
  reference_range_text: z.string().optional(),
  result_flag: z.string().optional(),
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
}

const RESULT_FLAGS: { value: ResultFlag; label: string; color: string }[] = [
  { value: 'NORMAL', label: 'Normal', color: 'bg-green-100 text-green-700' },
  { value: 'LOW', label: 'Low', color: 'bg-blue-100 text-blue-700' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'CRITICAL_LOW', label: 'Critical Low', color: 'bg-red-100 text-red-700' },
  { value: 'CRITICAL_HIGH', label: 'Critical High', color: 'bg-red-100 text-red-700' },
  { value: 'ABNORMAL', label: 'Abnormal', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'POSITIVE', label: 'Positive', color: 'bg-purple-100 text-purple-700' },
  { value: 'NEGATIVE', label: 'Negative', color: 'bg-gray-100 text-gray-700' },
];

export function LabResultsEntry({ orderNumber, items, onComplete }: LabResultsEntryProps) {
  const { toast } = useToast();
  const [activeItemId, setActiveItemId] = useState<number | null>(
    items.find(item => !item.has_result)?.id || items[0]?.id || null
  );
  
  const addResult = useAddLabResult();
  const verifyResult = useVerifyLabResult();

  const activeItem = items.find(item => item.id === activeItemId);
  const pendingItems = items.filter(item => !item.has_result);
  const completedItems = items.filter(item => item.has_result);

  const form = useForm<ResultFormData>({
    resolver: zodResolver(resultSchema),
    defaultValues: {
      numeric_value: undefined,
      text_value: '',
      option_value: '',
      reference_range_text: '',
      result_flag: '',
      interpretation: '',
      method: '',
      equipment: '',
      is_critical_result: false,
    },
  });

  const resultFlag = form.watch('result_flag');

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

      // Move to next pending item
      const nextPendingItem = items.find(
        item => item.id !== activeItem.id && !item.has_result
      );
      
      if (nextPendingItem) {
        setActiveItemId(nextPendingItem.id);
        form.reset();
      } else {
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
          <CardTitle className="text-base">Tests</CardTitle>
          <CardDescription>
            {pendingItems.length} pending, {completedItems.length} complete
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'p-3 rounded-lg cursor-pointer transition-colors border',
                activeItemId === item.id && 'border-primary bg-primary/5',
                item.has_result && 'bg-green-50',
                item.result?.is_critical_result && 'bg-red-50 border-red-200',
                !item.has_result && activeItemId !== item.id && 'hover:bg-muted/50'
              )}
              onClick={() => !item.has_result && setActiveItemId(item.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.test_name}</p>
                  <p className="text-xs text-muted-foreground">{item.test_code}</p>
                </div>
                {item.has_result ? (
                  <div className="flex items-center gap-1">
                    {item.result?.is_critical_result && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                ) : (
                  <Badge variant="outline" className="text-xs">Pending</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Result Entry Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            {activeItem ? activeItem.test_name : 'Select a Test'}
          </CardTitle>
          {activeItem && (
            <CardDescription>
              Enter the result for {activeItem.test_code}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {activeItem && !activeItem.has_result ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Result Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        defaultValue={field.value}
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

                {/* Interpretation */}
                <FormField
                  control={form.control}
                  name="interpretation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interpretation (Optional)</FormLabel>
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

                {/* Method & Equipment */}
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
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-700">Result Recorded</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Value</p>
                    <p className="font-medium">
                      {activeItem.result?.numeric_value ?? 
                       activeItem.result?.text_value ?? 
                       activeItem.result?.option_value ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Flag</p>
                    <Badge>{activeItem.result?.result_flag || 'N/A'}</Badge>
                  </div>
                </div>
              </div>

              {activeItem.result?.verification_status !== 'VERIFIED' && (
                <Button
                  variant="outline"
                  onClick={() => activeItem.result && handleVerify(activeItem.result.id)}
                  disabled={verifyResult.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Verify Result
                </Button>
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
