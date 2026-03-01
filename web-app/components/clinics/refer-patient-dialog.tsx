/**
 * Refer Patient Dialog Component
 *
 * Dialog for referring a patient from one clinic to another.
 */
'use client';

import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useClinics, useReferVisit } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisit, ClinicVisitPriority } from '@/lib/types/clinic';
import { CLINIC_PRIORITY_CONFIG } from '@/lib/types/clinic';

const formSchema = z.object({
  target_clinic_id: z.number({ required_error: 'Please select a clinic' }),
  reason: z.string().min(5, 'Please provide a reason for the referral'),
  priority: z.enum([
    'EMERGENCY', 'URGENT', 'PRIORITY', 'STANDARD', 'NON_URGENT',
    'RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE',
  ]).optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ReferPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: ClinicVisit;
  onSuccess: () => void;
}

export function ReferPatientDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
}: ReferPatientDialogProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: '',
      priority: visit.priority,
      notes: '',
    },
  });

  // Fetch available clinics
  const { data: clinicsData, isLoading: loadingClinics } = useClinics({ status: 'ACTIVE' });
  const clinics = clinicsData?.results ?? [];

  const { mutateAsync: referVisit, isPending: referring } = useReferVisit();

  const handleSubmit = useCallback(
    async (data: FormData) => {
      try {
        await referVisit({
          visitId: visit.id,
          data: {
            target_clinic_id: data.target_clinic_id,
            reason: data.reason,
            priority: data.priority,
            notes: data.notes,
          },
        });
        toast({
          title: 'Patient Referred',
          description: `${visit.patient.full_name} has been referred to another clinic.`,
        });
        form.reset();
        onSuccess();
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.response?.data?.detail || 'Failed to refer patient.',
          variant: 'destructive',
        });
      }
    },
    [referVisit, visit, form, onSuccess]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Refer Patient
            </DialogTitle>
            <HelpPopover content={`Refer ${visit.patient.full_name} to another clinic for continuing care.`} />
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Target Clinic */}
            <FormField
              control={form.control}
              name="target_clinic_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Refer To Clinic</FormLabel>
                  {loadingClinics ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select clinic" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clinics.map((clinic) => (
                          <SelectItem key={clinic.id} value={clinic.id.toString()}>
                            {clinic.name} ({clinic.clinic_type_display})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority at Receiving Clinic</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(CLINIC_PRIORITY_CONFIG).map((config) => (
                        <SelectItem key={config.priority} value={config.priority}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Referral</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why is this patient being referred?"
                      className="resize-none"
                      rows={3}
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
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional information for the receiving clinic..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={referring}>
                {referring ? 'Referring...' : 'Refer Patient'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
