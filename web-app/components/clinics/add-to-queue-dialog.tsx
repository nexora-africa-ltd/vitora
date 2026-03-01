/**
 * Add to Queue Dialog Component
 *
 * Dialog for adding a patient to the clinic queue.
 * Includes patient search and priority selection.
 */
'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, UserPlus, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddToQueue } from '@/lib/hooks/use-clinics';
import { usePatients } from '@/lib/hooks/use-patients';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicVisitPriority, ClinicVisitType, ClinicVisitSource } from '@/lib/types/clinic';
import { CLINIC_PRIORITY_CONFIG } from '@/lib/types/clinic';
import { useDebounce } from '@/lib/hooks/use-debounce';

const formSchema = z.object({
  patient_id: z.number({ required_error: 'Please select a patient' }),
  priority: z.enum(['EMERGENCY', 'URGENT', 'PRIORITY', 'STANDARD', 'NON_URGENT']),
  visit_type: z.enum(['NEW', 'RETURN', 'FOLLOW_UP', 'REFERRAL', 'SCHEDULED', 'EMERGENCY']),
  source: z.enum(['TRIAGE', 'DIRECT', 'REFERRAL', 'APPOINTMENT', 'INPATIENT']),
  chief_complaint: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddToQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: number;
  onSuccess: () => void;
}

export function AddToQueueDialog({
  open,
  onOpenChange,
  clinicId,
  onSuccess,
}: AddToQueueDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority: 'STANDARD',
      visit_type: 'NEW',
      source: 'DIRECT',
      chief_complaint: '',
      notes: '',
    },
  });

  // Search patients - only fetch when search is long enough
  const searchParams = debouncedSearch.length >= 2 ? { search: debouncedSearch } : {};
  const { data: patientsData, isLoading: searchingPatients } = usePatients(searchParams);

  const patients = debouncedSearch.length >= 2 ? (patientsData?.results ?? []) : [];
  const selectedPatientId = form.watch('patient_id');

  const { mutateAsync: addToQueue, isPending: adding } = useAddToQueue();

  const handleSubmit = useCallback(
    async (data: FormData) => {
      try {
        await addToQueue({
          clinicId,
          data: {
            patient_id: data.patient_id,
            priority: data.priority,
            visit_type: data.visit_type,
            source: data.source,
            chief_complaint: data.chief_complaint,
            notes: data.notes,
          },
        });
        toast({
          title: 'Patient Added to Queue',
          description: 'The patient has been added to the clinic queue.',
        });
        form.reset();
        setSearchQuery('');
        onSuccess();
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.response?.data?.detail || 'Failed to add patient to queue.',
          variant: 'destructive',
        });
      }
    },
    [addToQueue, clinicId, form, onSuccess]
  );

  const handleSelectPatient = (patientId: number) => {
    form.setValue('patient_id', patientId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Patient to Queue
            </DialogTitle>
            <HelpPopover content="Search for a patient by name, MRN, or phone number, then add them to the clinic queue with a priority level." />
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Patient Search */}
            <div className="space-y-2">
              <Label>Search Patient</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, MRN, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Search Results */}
              {debouncedSearch.length >= 2 && (
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {searchingPatients ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-16" />
                    </div>
                  ) : patients.length === 0 ? (
                    <Card>
                      <CardContent className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        No patients found
                      </CardContent>
                    </Card>
                  ) : (
                    patients.slice(0, 5).map((patient) => (
                      <Card
                        key={patient.id}
                        className={`cursor-pointer transition-all hover:border-primary ${
                          selectedPatientId === patient.id
                            ? 'border-primary bg-primary/5'
                            : ''
                        }`}
                        onClick={() => handleSelectPatient(patient.id)}
                      >
                        <CardContent className="flex items-center justify-between py-3">
                          <div>
                            <p className="font-medium">
                              {patient.first_name} {patient.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {patient.mrn} • {patient.age ? `${patient.age}y` : ''} {patient.gender}
                            </p>
                          </div>
                          {selectedPatientId === patient.id && (
                            <Badge variant="default">Selected</Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}

              {form.formState.errors.patient_id && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {form.formState.errors.patient_id.message}
                </p>
              )}
            </div>

            {/* Priority Selection */}
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
                      {Object.values(CLINIC_PRIORITY_CONFIG).map((config) => (
                        <SelectItem key={config.priority} value={config.priority}>
                          <div className="flex items-center gap-2">
                            <span>{config.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Visit Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="visit_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NEW">New Patient</SelectItem>
                        <SelectItem value="RETURN">Return Visit</SelectItem>
                        <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
                        <SelectItem value="REFERRAL">Referral</SelectItem>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="TRIAGE">From Triage</SelectItem>
                        <SelectItem value="DIRECT">Direct to Clinic</SelectItem>
                        <SelectItem value="REFERRAL">Referral</SelectItem>
                        <SelectItem value="APPOINTMENT">Appointment</SelectItem>
                        <SelectItem value="INPATIENT">From Inpatient</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Chief Complaint */}
            <FormField
              control={form.control}
              name="chief_complaint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chief Complaint</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the patient's main concern..."
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
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes..."
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
              <Button type="submit" disabled={adding || !selectedPatientId}>
                {adding ? 'Adding...' : 'Add to Queue'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
