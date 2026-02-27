/**
 * Social Work Case Note Form
 * Form for creating and editing case notes on a social work case
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  FormDescription,
} from '@/components/ui/form';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  FileText,
  AlertCircle,
  Check,
  CalendarIcon,
} from 'lucide-react';
import {
  useCreateCaseNote,
  useUpdateCaseNote,
} from '@/lib/hooks/use-social-work';
import type { CaseNote, ContactMethod } from '@/lib/types/social-work';
import { useToast } from '@/lib/hooks/use-toast';

// =============================================================================
// Types & Validation
// =============================================================================

const NOTE_TYPES = [
  { value: 'CONTACT', label: 'Client Contact' },
  { value: 'ASSESSMENT', label: 'Assessment Note' },
  { value: 'INTERVENTION', label: 'Intervention Note' },
  { value: 'PROGRESS', label: 'Progress Note' },
  { value: 'CONSULTATION', label: 'Consultation Note' },
  { value: 'COLLATERAL', label: 'Collateral Contact' },
  { value: 'SUPERVISION', label: 'Supervision Note' },
  { value: 'DISCHARGE', label: 'Discharge Note' },
  { value: 'CLOSURE', label: 'Case Closure Note' },
] as const;

const CONTACT_METHODS = [
  { value: 'IN_PERSON', label: 'In Person' },
  { value: 'PHONE', label: 'Phone Call' },
  { value: 'VIDEO_CALL', label: 'Video Call' },
  { value: 'HOME_VISIT', label: 'Home Visit' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHER', label: 'Other' },
] as const;

const caseNoteSchema = z.object({
  note_type: z.string().min(1, 'Note type is required'),
  contact_date: z.string().min(1, 'Contact date is required'),
  contact_method: z.enum(['PHONE', 'IN_PERSON', 'HOME_VISIT', 'VIDEO_CALL', 'EMAIL', 'OTHER'], {
    required_error: 'Contact method is required',
  }),
  contact_with: z.string().min(1, 'Contact person is required'),
  duration_minutes: z.coerce.number().min(1).max(480).optional().or(z.literal('')),
  subject: z.string().min(1, 'Subject is required'),
  note_content: z.string().min(10, 'Note content must be at least 10 characters'),
  participant_names: z.string().optional(),
  actions_taken: z.string().optional(),
  follow_up_required: z.boolean().default(false),
  follow_up_actions: z.string().optional(),
  follow_up_date: z.string().optional(),
  is_confidential: z.boolean().default(false),
});

type CaseNoteFormData = z.infer<typeof caseNoteSchema>;

interface CaseNoteFormProps {
  /** The social work case ID this note belongs to */
  caseId: number;
  /** Case number for display */
  caseNumber?: string;
  /** Existing note for edit mode */
  existingNote?: CaseNote;
  /** Callback on successful submission */
  onSuccess?: () => void;
  /** Callback to cancel/close the form */
  onCancel?: () => void;
}

export function CaseNoteForm({
  caseId,
  caseNumber,
  existingNote,
  onSuccess,
  onCancel,
}: CaseNoteFormProps) {
  const { toast } = useToast();
  const isEditMode = !!existingNote;

  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreateCaseNote();
  const updateMutation = useUpdateCaseNote();

  const form = useForm<CaseNoteFormData>({
    resolver: zodResolver(caseNoteSchema),
    defaultValues: {
      note_type: existingNote?.contact_method ? 'CONTACT' : '',
      contact_date: existingNote?.contact_date || format(new Date(), 'yyyy-MM-dd'),
      contact_method: (existingNote?.contact_method as ContactMethod) || 'IN_PERSON',
      contact_with: existingNote?.contact_with || '',
      duration_minutes: undefined,
      subject: '',
      note_content: existingNote?.note_content || '',
      participant_names: '',
      actions_taken: existingNote?.actions_taken || '',
      follow_up_required: existingNote?.follow_up_required || false,
      follow_up_actions: '',
      follow_up_date: existingNote?.follow_up_date || '',
      is_confidential: false,
    },
  });

  const watchFollowUp = form.watch('follow_up_required');

  const handleSubmit = async (data: CaseNoteFormData) => {
    setSubmitError(null);

    try {
      const payload = {
        case_id: caseId,
        contact_date: data.contact_date,
        contact_method: data.contact_method as ContactMethod,
        contact_with: data.contact_with,
        note_content: data.note_content,
        actions_taken: data.actions_taken,
        follow_up_required: data.follow_up_required,
        follow_up_date: data.follow_up_required ? data.follow_up_date : undefined,
        follow_up_notes: data.follow_up_actions,
      };

      if (isEditMode && existingNote) {
        await updateMutation.mutateAsync({
          id: existingNote.id,
          data: payload,
        });
        toast({ title: 'Case note updated' });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: 'Case note added' });
      }

      onSuccess?.();
    } catch (err) {
      console.error('Failed to save case note:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to save case note');
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="py-3 sm:py-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
          {isEditMode ? 'Edit Case Note' : 'Add Case Note'}
          {caseNumber && (
            <span className="text-sm font-normal text-muted-foreground">
              — {caseNumber}
            </span>
          )}
          <HelpPopover content="Record a contact, assessment, progress update, or other note for this social work case." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submitError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-6">
            {/* Note Type & Contact Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="note_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select note type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NOTE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                name="contact_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Date *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="date" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Method *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTACT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
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
                name="contact_with"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact With *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Client, Family member" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={480}
                        placeholder="e.g. 45"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="participant_names"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Participants</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Names of other participants (if any)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Subject */}
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject *</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief subject or title for this note" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Note Content */}
            <FormField
              control={form.control}
              name="note_content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Content *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Record the details of the contact, observations, client&apos;s response, and any relevant information..."
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions Taken */}
            <FormField
              control={form.control}
              name="actions_taken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actions Taken</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe any actions taken during or as a result of this contact..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Follow-up Section */}
            <div className="space-y-4 rounded-lg border p-4">
              <FormField
                control={form.control}
                name="follow_up_required"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div>
                      <FormLabel>Follow-up Required</FormLabel>
                      <FormDescription>
                        Toggle if this contact requires further follow-up
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {watchFollowUp && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="follow_up_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Follow-up Date</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input type="date" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="follow_up_actions"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Follow-up Actions</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe required follow-up actions..."
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Confidentiality Toggle */}
            <FormField
              control={form.control}
              name="is_confidential"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <FormLabel>Confidential Note</FormLabel>
                    <FormDescription>
                      Restrict visibility to the case team only
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {isEditMode ? 'Update Note' : 'Save Note'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
