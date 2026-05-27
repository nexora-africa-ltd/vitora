/**
 * Allergy Form Dialog Component
 *
 * Form for creating or editing patient allergies with substance autocomplete.
 */

'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Search } from 'lucide-react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useAllergy,
  useAllergyLookup,
  useCreateAllergy,
  useUpdateAllergy,
} from '@/lib/hooks/use-allergies';
import {
  SUBSTANCE_TYPE_OPTIONS,
  REACTION_TYPE_OPTIONS,
  SEVERITY_OPTIONS,
  CRITICALITY_OPTIONS,
  VERIFICATION_STATUS_OPTIONS,
  ALLERGY_STATUS_OPTIONS,
} from '@/lib/types/allergy';
import type { SubstanceType, AllergyLookupResult } from '@/lib/types/allergy';

// Form validation schema
const allergyFormSchema = z.object({
  substance: z.string().min(1, 'Substance is required'),
  substance_code: z.string().optional(),
  substance_code_system: z.string().optional(),
  substance_type: z.enum(['medication', 'food', 'environmental', 'biological', 'other']),
  drug: z.number().nullable().optional(),
  reaction_type: z
    .enum([
      'anaphylaxis',
      'angioedema',
      'bronchospasm',
      'cardiac_arrhythmia',
      'diarrhea',
      'dyspnea',
      'hives',
      'hypotension',
      'itching',
      'nausea',
      'rash',
      'swelling',
      'vomiting',
      'other',
    ])
    .default('other'),
  reaction_description: z.string().optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life_threatening']).default('moderate'),
  criticality: z.enum(['low', 'high', 'unable_to_assess']).default('unable_to_assess'),
  onset_date: z.string().optional(),
  last_occurrence: z.string().optional(),
  verification_status: z
    .enum(['unconfirmed', 'presumed', 'confirmed', 'refuted', 'entered_in_error'])
    .default('unconfirmed'),
  status: z.enum(['active', 'inactive', 'resolved']).optional(),
  notes: z.string().optional(),
});

type AllergyFormValues = z.infer<typeof allergyFormSchema>;

interface AllergyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  allergyId?: number;
}

export function AllergyFormDialog({
  open,
  onOpenChange,
  patientId,
  allergyId,
}: AllergyFormDialogProps) {
  const isEditMode = !!allergyId;

  // State for substance autocomplete
  const [substanceQuery, setSubstanceQuery] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedSubstanceType, setSelectedSubstanceType] = useState<SubstanceType>('medication');

  // Fetch existing allergy for edit mode
  const { data: existingAllergy, isLoading: isLoadingAllergy } = useAllergy(
    patientId,
    allergyId ?? 0
  );

  // Substance lookup
  const { data: lookupResults, isLoading: isLookupLoading } = useAllergyLookup(
    substanceQuery,
    selectedSubstanceType
  );

  // Mutations
  const createAllergy = useCreateAllergy(patientId);
  const updateAllergy = useUpdateAllergy(patientId);

  const form = useForm<AllergyFormValues>({
    resolver: zodResolver(allergyFormSchema),
    defaultValues: {
      substance: '',
      substance_code: '',
      substance_code_system: '',
      substance_type: 'medication',
      drug: null,
      reaction_type: 'other',
      reaction_description: '',
      severity: 'moderate',
      criticality: 'unable_to_assess',
      onset_date: '',
      last_occurrence: '',
      verification_status: 'unconfirmed',
      notes: '',
    },
  });

  // Populate form for edit mode
  useEffect(() => {
    if (existingAllergy && isEditMode) {
      form.reset({
        substance: existingAllergy.substance,
        substance_code: existingAllergy.substance_code ?? '',
        substance_code_system: existingAllergy.substance_code_system ?? '',
        substance_type: existingAllergy.substance_type,
        drug: existingAllergy.drug,
        reaction_type: existingAllergy.reaction_type,
        reaction_description: existingAllergy.reaction_description ?? '',
        severity: existingAllergy.severity,
        criticality: existingAllergy.criticality,
        onset_date: existingAllergy.onset_date ?? '',
        last_occurrence: existingAllergy.last_occurrence ?? '',
        verification_status: existingAllergy.verification_status,
        status: existingAllergy.status,
        notes: existingAllergy.notes ?? '',
      });
      setSelectedSubstanceType(existingAllergy.substance_type);
    }
  }, [existingAllergy, isEditMode, form]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setSubstanceQuery('');
      setSelectedSubstanceType('medication');
    }
  }, [open, form]);

  // Handle substance selection from lookup
  const handleSubstanceSelect = (result: AllergyLookupResult) => {
    form.setValue('substance', result.substance);
    form.setValue('substance_code', result.code);
    form.setValue('substance_code_system', result.code_system);
    if (result.drug_id) {
      form.setValue('drug', result.drug_id);
    }
    setIsPopoverOpen(false);
    setSubstanceQuery('');
  };

  const onSubmit = async (data: AllergyFormValues) => {
    const payload = {
      ...data,
      // Convert null to undefined for optional fields
      drug: data.drug ?? undefined,
      onset_date: data.onset_date || undefined,
      last_occurrence: data.last_occurrence || undefined,
      reaction_description: data.reaction_description || undefined,
      notes: data.notes || undefined,
    };

    if (isEditMode && allergyId) {
      updateAllergy.mutate(
        { allergyId, data: payload },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        }
      );
    } else {
      createAllergy.mutate(payload, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
    }
  };

  const isPending = createAllergy.isPending || updateAllergy.isPending;

  if (isEditMode && isLoadingAllergy) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEditMode ? 'Edit Allergy' : 'Add Allergy'}</DialogTitle>
            <HelpPopover content="Record allergy information including the allergen, reaction type, and severity. This information will be used for drug-allergy interaction warnings." />
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Substance Type */}
            <FormField
              control={form.control}
              name="substance_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Substance Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedSubstanceType(value as SubstanceType);
                      // Clear substance when type changes
                      form.setValue('substance', '');
                      form.setValue('drug', null);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SUBSTANCE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Substance (with autocomplete) */}
            <FormField
              control={form.control}
              name="substance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Substance / Allergen</FormLabel>
                  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            placeholder="Type to search or enter allergen..."
                            onChange={(e) => {
                              field.onChange(e);
                              setSubstanceQuery(e.target.value);
                              if (e.target.value.length >= 2) {
                                setIsPopoverOpen(true);
                              }
                            }}
                            onFocus={() => {
                              if (substanceQuery.length >= 2) {
                                setIsPopoverOpen(true);
                              }
                            }}
                          />
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search substances..."
                          value={substanceQuery}
                          onValueChange={setSubstanceQuery}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {isLookupLoading ? 'Searching...' : 'No results found.'}
                          </CommandEmpty>
                          <CommandGroup>
                            {lookupResults?.map((result, index) => (
                              <CommandItem
                                key={`${result.substance}-${index}`}
                                value={result.substance}
                                onSelect={() => handleSubstanceSelect(result)}
                              >
                                <div className="flex flex-col">
                                  <span>{result.display}</span>
                                  {result.code && (
                                    <span className="text-xs text-muted-foreground">
                                      Code: {result.code}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Search for medications or enter the allergen name manually.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reaction Type & Severity (side by side on larger screens) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reaction_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reaction Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select reaction" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REACTION_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SEVERITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Criticality & Verification Status */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="criticality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Criticality</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select criticality" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CRITICALITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                name="verification_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VERIFICATION_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status (only in edit mode) */}
            {isEditMode && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALLERGY_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="onset_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Onset Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} max={new Date().toISOString().split('T')[0]} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_occurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Occurrence</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} max={new Date().toISOString().split('T')[0]} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Reaction Description */}
            <FormField
              control={form.control}
              name="reaction_description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reaction Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the allergic reaction..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional clinical notes..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditMode ? 'Update Allergy' : 'Add Allergy'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
