/**
 * Counselling Session Form
 * Form for recording counselling session details with risk assessment
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  FileText,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import {
  useCounsellingSession,
  useStartCounsellingSession,
  useCompleteCounsellingSession,
  useCancelCounsellingSession,
} from '@/lib/hooks/use-counselling';
import {
  MODALITY_LABELS,
  RISK_LEVEL_CONFIG,
  type SessionModality,
  type RiskLevel,
} from '@/lib/types/counselling';

// =============================================================================
// Types & Validation
// =============================================================================

const sessionOutcomes = ['IMPROVED', 'MAINTAINED', 'DECLINED', 'UNABLE_TO_ASSESS'] as const;
const modalities: SessionModality[] = ['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP'];
const riskLevels: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

const completeSessionSchema = z.object({
  duration_minutes: z.number().min(1, 'Duration is required').default(45),
  modality: z.enum(['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP'] as const, {
    required_error: 'Modality is required',
  }),
  outcome: z.enum(sessionOutcomes, { required_error: 'Outcome is required' }),
  // Session content
  session_focus: z.string().min(1, 'Session focus is required'),
  client_presentation: z.string().optional(),
  interventions_used: z.string().optional(),
  client_response: z.string().optional(),
  progress_notes: z.string().optional(),
  // Risk
  current_risk_level: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const, {
    required_error: 'Risk level is required',
  }),
  safety_plan_reviewed: z.boolean().default(false),
  safety_plan_notes: z.string().optional(),
  // Homework
  homework_assigned: z.string().optional(),
  // Follow-up
  follow_up_required: z.boolean().default(true),
  next_session_date: z.string().optional(),
  next_session_focus: z.string().optional(),
  additional_referrals: z.string().optional(),
  notes: z.string().optional(),
});

type CompleteSessionFormData = z.infer<typeof completeSessionSchema>;

interface CounsellingSessionFormProps {
  sessionId: number;
  referralId?: number;
}

// =============================================================================
// Session Status Badge
// =============================================================================

function SessionStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    NO_SHOW: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  };

  return (
    <Badge className={variants[status] || ''}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CounsellingSessionForm({ sessionId, referralId }: CounsellingSessionFormProps) {
  const router = useRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: session, isLoading, error } = useCounsellingSession(sessionId);
  const startMutation = useStartCounsellingSession();
  const completeMutation = useCompleteCounsellingSession();
  const cancelMutation = useCancelCounsellingSession();

  const form = useForm<CompleteSessionFormData>({
    resolver: zodResolver(completeSessionSchema),
    defaultValues: {
      duration_minutes: 45,
      modality: 'IN_PERSON',
      outcome: undefined,
      session_focus: '',
      client_presentation: '',
      interventions_used: '',
      client_response: '',
      progress_notes: '',
      current_risk_level: 'LOW',
      safety_plan_reviewed: false,
      safety_plan_notes: '',
      homework_assigned: '',
      follow_up_required: true,
      next_session_date: '',
      next_session_focus: '',
      additional_referrals: '',
      notes: '',
    },
  });

  // Pre-populate form when session data loads
  useEffect(() => {
    if (session) {
      form.reset({
        duration_minutes: session.duration_minutes ?? 45,
        modality: (session.modality as SessionModality) || 'IN_PERSON',
        outcome: session.outcome as (typeof sessionOutcomes)[number] | undefined,
        session_focus: session.session_focus || '',
        client_presentation: session.client_presentation || '',
        interventions_used: session.interventions_used || '',
        client_response: session.client_response || '',
        progress_notes: session.progress_notes || '',
        current_risk_level: (session.current_risk_level as RiskLevel) || 'LOW',
        safety_plan_reviewed: session.safety_plan_reviewed || false,
        safety_plan_notes: session.safety_plan_notes || '',
        homework_assigned: session.homework_assigned || '',
        follow_up_required: session.follow_up_required ?? true,
        next_session_date: session.next_session_date || '',
        next_session_focus: session.next_session_focus || '',
        additional_referrals: session.additional_referrals || '',
        notes: session.notes || '',
      });
    }
  }, [session, form]);

  const isScheduled = session?.status === 'SCHEDULED';
  const isInProgress = session?.status === 'IN_PROGRESS';
  const isCompleted = session?.status === 'COMPLETED';

  const handleStartSession = async () => {
    try {
      await startMutation.mutateAsync(sessionId);
      setShowStartDialog(false);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleCompleteSession = async (data: CompleteSessionFormData) => {
    try {
      await completeMutation.mutateAsync({ id: sessionId, data });
      setShowSuccess(true);
      setTimeout(() => {
        const targetReferralId = referralId || session?.referral_id;
        if (targetReferralId) {
          router.push(`/allied-health/counselling/referrals/${targetReferralId}`);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to complete session:', err);
    }
  };

  const handleCancelSession = async () => {
    if (!cancelReason.trim()) {
      setCancelError('Reason is required');
      return;
    }
    try {
      await cancelMutation.mutateAsync({ id: sessionId, reason: cancelReason });
      setShowCancelDialog(false);
      router.back();
    } catch (err) {
      console.error('Failed to cancel session:', err);
    }
  };

  const watchRiskLevel = form.watch('current_risk_level');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load session
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showSuccess && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Session completed successfully!</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {session.session_number}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Counselling Session
              </p>
            </div>
            <SessionStatusBadge status={session.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">{session.referral?.patient?.full_name || 'Patient'}</div>
                <div className="text-sm text-muted-foreground">{session.referral?.patient?.mrn || ''}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {format(parseISO(session.scheduled_date), 'MMMM d, yyyy')}
                </div>
                {session.scheduled_time && (
                  <div className="text-sm text-muted-foreground">{session.scheduled_time}</div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">{session.therapist?.full_name || 'Unassigned'}</div>
                <div className="text-sm text-muted-foreground">Counsellor</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {isCompleted && session.duration_minutes ? `${session.duration_minutes} min` : '—'}
                </div>
                <div className="text-sm text-muted-foreground">Duration</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons for Scheduled */}
      {isScheduled && (
        <div className="flex gap-2">
          <Button onClick={() => setShowStartDialog(true)}>
            <Play className="h-4 w-4 mr-2" />
            Start Session
          </Button>
          <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Session
          </Button>
        </div>
      )}

      {/* Session Form for In Progress / Completed */}
      {(isInProgress || isCompleted) && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleCompleteSession)} className="space-y-6">
            {/* Session Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (minutes) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            disabled={isCompleted}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="modality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modality *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isCompleted}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select modality" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modalities.map((m) => (
                              <SelectItem key={m} value={m}>
                                {MODALITY_LABELS[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="session_focus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Session Focus *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Primary topics and focus areas for this session..."
                          rows={3}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="client_presentation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Presentation</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Client's mood, appearance, and demeanor..."
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Interventions & Response */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Interventions & Response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="interventions_used"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interventions Used</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Therapeutic techniques applied (CBT, MI, psychoeducation...)"
                          rows={3}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="client_response"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Response</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="How the client responded to interventions..."
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="progress_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Progress Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional session notes and observations..."
                          rows={3}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Risk Assessment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5" />
                  Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="current_risk_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Risk Level *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isCompleted}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select risk level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {riskLevels.map((level) => (
                            <SelectItem key={level} value={level}>
                              {RISK_LEVEL_CONFIG[level].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(watchRiskLevel === 'HIGH' || watchRiskLevel === 'CRITICAL') && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Elevated Risk Detected</p>
                      <p>Please review and update the safety plan. Consider escalation protocols.</p>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="safety_plan_reviewed"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Safety plan reviewed with client</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="safety_plan_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Safety Plan Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Updates to safety plan..."
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Homework & Follow-up */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Homework & Follow-up</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="homework_assigned"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Homework Assigned</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Tasks or exercises assigned between sessions..."
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="follow_up_required"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Follow-up session required</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch('follow_up_required') && (
                  <>
                    <FormField
                      control={form.control}
                      name="next_session_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next Session Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} disabled={isCompleted} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="next_session_focus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next Session Focus</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Planned focus for next session..."
                              rows={2}
                              disabled={isCompleted}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="additional_referrals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Referrals</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Any additional referrals needed (psychiatry, social work...)"
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Outcome */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Outcome</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="outcome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Outcome *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isCompleted}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select outcome" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="IMPROVED">Improved</SelectItem>
                          <SelectItem value="MAINTAINED">Maintained</SelectItem>
                          <SelectItem value="DECLINED">Declined</SelectItem>
                          <SelectItem value="UNABLE_TO_ASSESS">Unable to Assess</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Any additional session notes..."
                          rows={2}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Submit */}
            {isInProgress && (
              <div className="flex gap-2">
                <Button type="submit" disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? (
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Complete Session
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Session
                </Button>
              </div>
            )}
          </form>
        </Form>
      )}

      {/* Start Session Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Counselling Session</DialogTitle>
            <DialogDescription>
              Ready to begin the counselling session?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartSession} disabled={startMutation.isPending}>
              {startMutation.isPending && <LoadingSpinner className="h-4 w-4 mr-2" />}
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Session Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cancel-reason">Reason *</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  setCancelError(null);
                }}
                placeholder="Enter cancellation reason..."
                rows={3}
              />
              {cancelError && (
                <p className="text-sm text-destructive mt-1">{cancelError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSession}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <LoadingSpinner className="h-4 w-4 mr-2" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
