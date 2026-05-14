'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils';
import { surveillanceApi } from '@/lib/api/surveillance';
import { useCounties } from '@/lib/hooks/use-locations';
import { toast } from 'sonner';
import type { OutbreakThreshold } from '@/lib/types/surveillance';

const thresholdFormSchema = z.object({
  disease: z.number({ required_error: 'Disease is required' }),
  county: z.number().nullable().optional(),
  case_threshold: z
    .number({ required_error: 'Case threshold is required' })
    .int()
    .min(1, 'Must be at least 1'),
  period_days: z
    .number({ required_error: 'Period is required' })
    .int()
    .min(1, 'Must be at least 1 day')
    .max(365, 'Cannot exceed 365 days'),
  is_active: z.boolean(),
});

type ThresholdFormValues = z.infer<typeof thresholdFormSchema>;

interface ThresholdFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threshold?: OutbreakThreshold;
}

export function ThresholdFormDialog({
  open,
  onOpenChange,
  threshold,
}: ThresholdFormDialogProps) {
  const isEditMode = !!threshold;
  const queryClient = useQueryClient();
  const [countyOpen, setCountyOpen] = useState(false);

  const { data: diseases, isLoading: diseasesLoading } = useQuery({
    queryKey: ['notifiable-diseases'],
    queryFn: () => surveillanceApi.listDiseases(),
    staleTime: 60000,
  });

  const { data: counties } = useCounties();

  const form = useForm<ThresholdFormValues>({
    resolver: zodResolver(thresholdFormSchema),
    defaultValues: {
      disease: threshold?.disease ?? undefined,
      county: threshold?.county ?? null,
      case_threshold: threshold?.case_threshold ?? 3,
      period_days: threshold?.period_days ?? 7,
      is_active: threshold?.is_active ?? true,
    },
  });

  // Reset form when threshold changes (edit mode) or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        disease: threshold?.disease ?? undefined,
        county: threshold?.county ?? null,
        case_threshold: threshold?.case_threshold ?? 3,
        period_days: threshold?.period_days ?? 7,
        is_active: threshold?.is_active ?? true,
      });
    }
  }, [open, threshold, form]);

  const createMutation = useMutation({
    mutationFn: (data: ThresholdFormValues) =>
      surveillanceApi.createThreshold({
        ...data,
        county: data.county || null,
      }),
    onSuccess: () => {
      toast.success('Threshold created');
      queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds-exceeded'] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Failed to create threshold. A threshold for this disease/county may already exist.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ThresholdFormValues) =>
      surveillanceApi.updateThreshold(threshold!.id, {
        ...data,
        county: data.county || null,
      }),
    onSuccess: () => {
      toast.success('Threshold updated');
      queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['outbreak-thresholds-exceeded'] });
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Failed to update threshold');
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: ThresholdFormValues) {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              {isEditMode ? 'Edit Threshold' : 'Add Outbreak Threshold'}
            </DialogTitle>
            <HelpPopover content="Define when an outbreak alert should be triggered. Set the number of cases within a time period that constitutes an outbreak for a disease." />
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="disease"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Disease</FormLabel>
                  <Select
                    value={field.value?.toString() ?? ''}
                    onValueChange={(val) => field.onChange(Number(val))}
                    disabled={isEditMode || diseasesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select disease" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {diseases?.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>
                          {d.name}
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
              name="county"
              render={({ field }) => {
                const selectedCounty = counties?.find((c) => c.id === field.value);
                return (
                  <FormItem className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <FormLabel>County</FormLabel>
                      <HelpPopover content="Leave as National for a country-wide threshold, or select a specific county." />
                    </div>
                    <Popover open={countyOpen} onOpenChange={setCountyOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'w-full justify-between font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {selectedCounty?.name ?? 'National'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search county..." />
                          <CommandList>
                            <CommandEmpty>No county found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="national"
                                onSelect={() => {
                                  field.onChange(null);
                                  setCountyOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === null ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                National
                              </CommandItem>
                              {counties?.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={c.name}
                                  onSelect={() => {
                                    field.onChange(c.id);
                                    setCountyOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === c.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {c.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="case_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case Threshold</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="period_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Active</FormLabel>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? 'Save Changes' : 'Create Threshold'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
