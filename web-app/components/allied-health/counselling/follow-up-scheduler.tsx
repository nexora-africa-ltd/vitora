/**
 * Follow-up Scheduler
 * 
 * A component for scheduling follow-up counselling sessions.
 * Includes date/time selection, frequency recommendations, and session focus.
 */

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays, addWeeks, startOfDay, parseISO, isAfter } from 'date-fns';
import {
  Calendar,
  Clock,
  Video,
  Phone,
  Users,
  User,
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { HelpPopover } from '@/components/shared/help-popover';
import { MODALITY_LABELS, RISK_LEVEL_CONFIG, type SessionModality, type RiskLevel } from '@/lib/types/counselling';

// =============================================================================
// Types
// =============================================================================

/**
 * Follow-up session data
 */
export interface FollowUpData {
  date: string;
  time?: string;
  modality: SessionModality;
  focus: string;
  duration?: number;
  notes?: string;
}

/**
 * Referral context for scheduling
 */
export interface ReferralContext {
  referralId: number;
  referralNumber: string;
  patientName: string;
  patientMrn: string;
  counsellingTypeName: string;
  recommendedFrequency?: string;
  recommendedSessions?: number;
  completedSessions?: number;
  currentRiskLevel?: RiskLevel;
  preferredModality?: SessionModality;
}

/**
 * Quick schedule options
 */
interface QuickScheduleOption {
  label: string;
  days: number;
  icon: React.ReactNode;
}

const QUICK_SCHEDULE_OPTIONS: QuickScheduleOption[] = [
  { label: 'Tomorrow', days: 1, icon: <Calendar className="h-4 w-4" /> },
  { label: 'In 3 Days', days: 3, icon: <Calendar className="h-4 w-4" /> },
  { label: 'In 1 Week', days: 7, icon: <Calendar className="h-4 w-4" /> },
  { label: 'In 2 Weeks', days: 14, icon: <Calendar className="h-4 w-4" /> },
];

/**
 * Time slot options
 */
const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30',
];

/**
 * Session duration options (minutes)
 */
const DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
];

/**
 * Modality icons
 */
const MODALITY_ICONS: Record<SessionModality, React.ReactNode> = {
  IN_PERSON: <User className="h-4 w-4" />,
  VIDEO: <Video className="h-4 w-4" />,
  PHONE: <Phone className="h-4 w-4" />,
  GROUP: <Users className="h-4 w-4" />,
};

// =============================================================================
// Schema
// =============================================================================

const followUpSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  time: z.string().optional(),
  modality: z.enum(['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP'] as const, {
    required_error: 'Session type is required',
  }),
  focus: z.string().min(1, 'Session focus is required'),
  duration: z.number().optional(),
  notes: z.string().optional(),
});

type FollowUpFormData = z.infer<typeof followUpSchema>;

// =============================================================================
// Inline Scheduler Card
// =============================================================================

interface FollowUpSchedulerCardProps {
  /** Referral context */
  context: ReferralContext;
  /** Whether follow-up is required */
  required?: boolean;
  /** Default modality */
  defaultModality?: SessionModality;
  /** Callback when follow-up is scheduled */
  onSchedule: (data: FollowUpData) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * FollowUpSchedulerCard - Inline card for scheduling follow-ups
 */
export function FollowUpSchedulerCard({
  context,
  required = false,
  defaultModality = 'IN_PERSON',
  onSchedule,
  isLoading = false,
  className,
}: FollowUpSchedulerCardProps) {
  const [isScheduling, setIsScheduling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FollowUpFormData>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      date: '',
      time: '',
      modality: context.preferredModality || defaultModality,
      focus: '',
      duration: 45,
      notes: '',
    },
  });

  const riskConfig = context.currentRiskLevel
    ? RISK_LEVEL_CONFIG[context.currentRiskLevel]
    : null;

  const handleQuickSchedule = (days: number) => {
    const date = format(addDays(new Date(), days), 'yyyy-MM-dd');
    form.setValue('date', date);
  };

  const handleSubmit = async (data: FollowUpFormData) => {
    setError(null);
    setIsScheduling(true);
    try {
      await onSchedule({
        date: data.date,
        time: data.time,
        modality: data.modality,
        focus: data.focus,
        duration: data.duration,
        notes: data.notes,
      });
      form.reset();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to schedule follow-up';
      setError(errorMessage);
    } finally {
      setIsScheduling(false);
    }
  };

  const sessionsRemaining = context.recommendedSessions && context.completedSessions
    ? context.recommendedSessions - context.completedSessions
    : null;

  return (
    <Card className={cn(required && 'border-orange-300 bg-orange-50/50', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Schedule Follow-up
            {required && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                Required
              </Badge>
            )}
          </CardTitle>
          {riskConfig && context.currentRiskLevel && context.currentRiskLevel !== 'LOW' && (
            <Badge className={riskConfig.className}>
              {riskConfig.label}
            </Badge>
          )}
        </div>
        {sessionsRemaining !== null && sessionsRemaining > 0 && (
          <p className="text-sm text-muted-foreground">
            {sessionsRemaining} of {context.recommendedSessions} sessions remaining
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Quick Schedule Buttons */}
            <div className="space-y-2">
              <Label className="text-sm">Quick Schedule</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_SCHEDULE_OPTIONS.map((option) => (
                  <Button
                    key={option.days}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickSchedule(option.days)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        min={format(new Date(), 'yyyy-MM-dd')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Modality and Duration */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="modality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(MODALITY_LABELS) as SessionModality[]).map((modality) => (
                          <SelectItem key={modality} value={modality}>
                            <div className="flex items-center gap-2">
                              {MODALITY_ICONS[modality]}
                              {MODALITY_LABELS[modality]}
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
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DURATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value.toString()}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Session Focus */}
            <FormField
              control={form.control}
              name="focus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Focus *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What will be the focus of the next session?"
                      rows={2}
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
                      {...field}
                      placeholder="Any special considerations or reminders..."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={isScheduling || isLoading}
            >
              {isScheduling || isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Follow-up
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Dialog Scheduler
// =============================================================================

interface FollowUpSchedulerDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Referral context */
  context: ReferralContext;
  /** Callback when follow-up is scheduled */
  onSchedule: (data: FollowUpData) => Promise<void>;
  /** Loading state from parent */
  isLoading?: boolean;
  /** Error from parent */
  error?: string | null;
}

/**
 * FollowUpSchedulerDialog - Modal dialog for scheduling follow-ups
 */
export function FollowUpSchedulerDialog({
  open,
  onOpenChange,
  context,
  onSchedule,
  isLoading = false,
  error: externalError = null,
}: FollowUpSchedulerDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FollowUpFormData>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      date: '',
      time: '',
      modality: context.preferredModality || 'IN_PERSON',
      focus: '',
      duration: 45,
      notes: '',
    },
  });

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      form.reset({
        date: '',
        time: '',
        modality: context.preferredModality || 'IN_PERSON',
        focus: '',
        duration: 45,
        notes: '',
      });
      setError(null);
    }
  }, [open, form, context.preferredModality]);

  const handleQuickSchedule = (days: number) => {
    const date = format(addDays(new Date(), days), 'yyyy-MM-dd');
    form.setValue('date', date);
  };

  const handleSubmit = async (data: FollowUpFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSchedule({
        date: data.date,
        time: data.time,
        modality: data.modality,
        focus: data.focus,
        duration: data.duration,
        notes: data.notes,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to schedule follow-up';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = externalError || error;
  const riskConfig = context.currentRiskLevel
    ? RISK_LEVEL_CONFIG[context.currentRiskLevel]
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule Follow-up Session
          </DialogTitle>
          <DialogDescription>
            Schedule the next counselling session for {context.patientName}
          </DialogDescription>
        </DialogHeader>

        {/* Context Summary */}
        <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{context.referralNumber}</span>
            {riskConfig && context.currentRiskLevel && (
              <Badge className={riskConfig.className}>{riskConfig.label}</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {context.counsellingTypeName}
          </div>
          {context.recommendedFrequency && (
            <div className="text-xs text-muted-foreground">
              Recommended: {context.recommendedFrequency}
            </div>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Quick Schedule */}
            <div className="space-y-2">
              <Label className="text-sm">Quick Schedule</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_SCHEDULE_OPTIONS.map((option) => (
                  <Button
                    key={option.days}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickSchedule(option.days)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        min={format(new Date(), 'yyyy-MM-dd')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Modality */}
            <FormField
              control={form.control}
              name="modality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Type *</FormLabel>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(MODALITY_LABELS) as SessionModality[]).map((modality) => (
                      <Button
                        key={modality}
                        type="button"
                        variant={field.value === modality ? 'default' : 'outline'}
                        size="sm"
                        className="flex flex-col h-auto py-2"
                        onClick={() => field.onChange(modality)}
                      >
                        {MODALITY_ICONS[modality]}
                        <span className="text-xs mt-1">{MODALITY_LABELS[modality]}</span>
                      </Button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Focus */}
            <FormField
              control={form.control}
              name="focus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Focus *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What will be discussed in the next session?"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error */}
            {displayError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{displayError}</AlertDescription>
              </Alert>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(handleSubmit)}
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Schedule
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { FollowUpSchedulerCardProps, FollowUpSchedulerDialogProps };
