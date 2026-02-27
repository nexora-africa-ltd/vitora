/**
 * Occupational Therapy Session Form
 * Form for recording OT session details with FIM scoring
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
import { Play, CheckCircle, XCircle, Clock, User, Calendar, FileText } from 'lucide-react';
import {
  useOTSession,
  useStartOTSession,
  useCompleteOTSession,
  useCancelOTSession,
} from '@/lib/hooks/use-occupational-therapy';
import { FIM_LEVEL_LABELS, type FIMLevel } from '@/lib/types/occupational-therapy';

// =============================================================================
// Types & Validation
// =============================================================================

const sessionOutcomes = ['IMPROVED', 'MAINTAINED', 'DECLINED', 'UNABLE_TO_ASSESS'] as const;
const fimLevels = [1, 2, 3, 4, 5, 6, 7] as const;

const completeSessionSchema = z.object({
  notes: z.string().min(1, 'Progress notes are required'),
  duration_minutes: z.number().min(1, 'Duration is required').default(45),
  outcome: z.enum(sessionOutcomes, { required_error: 'Outcome is required' }),
  // Activities
  adl_activities: z.string().optional(),
  cognitive_activities: z.string().optional(),
  sensory_activities: z.string().optional(),
  motor_activities: z.string().optional(),
  // FIM Scores
  current_adl_score: z.number().min(1).max(7).optional(),
  current_iadl_score: z.number().min(1).max(7).optional(),
  current_cognitive_score: z.number().min(1).max(7).optional(),
  // Progress
  patient_participation: z.string().optional(),
  barriers_encountered: z.string().optional(),
  adaptations_made: z.string().optional(),
  home_program: z.string().optional(),
  caregiver_training: z.string().optional(),
  equipment_recommendations: z.string().optional(),
  follow_up_notes: z.string().optional(),
  next_session_date: z.string().optional(),
});

type CompleteSessionFormData = z.infer<typeof completeSessionSchema>;

interface OTSessionFormProps {
  sessionId: number;
  orderId?: number;
}

// =============================================================================
// FIM Score Selector
// =============================================================================

function FIMScoreSelector({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onChange: (val: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value?.toString()}
        onValueChange={(v) => onChange(parseInt(v))}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select FIM level" />
        </SelectTrigger>
        <SelectContent>
          {fimLevels.map((level) => (
            <SelectItem key={level} value={level.toString()}>
              <span className="font-medium">{level}</span>
              <span className="text-muted-foreground ml-2">
                — {FIM_LEVEL_LABELS[level as FIMLevel].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <p className="text-xs text-muted-foreground">
          {FIM_LEVEL_LABELS[value as FIMLevel]?.description}
        </p>
      )}
    </div>
  );
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

export function OTSessionForm({ sessionId, orderId }: OTSessionFormProps) {
  const router = useRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: session, isLoading, error } = useOTSession(sessionId);
  const startMutation = useStartOTSession();
  const completeMutation = useCompleteOTSession();
  const cancelMutation = useCancelOTSession();

  const form = useForm<CompleteSessionFormData>({
    resolver: zodResolver(completeSessionSchema),
    defaultValues: {
      notes: '',
      duration_minutes: 45,
      outcome: undefined,
      adl_activities: '',
      cognitive_activities: '',
      sensory_activities: '',
      motor_activities: '',
      current_adl_score: undefined,
      current_iadl_score: undefined,
      current_cognitive_score: undefined,
      patient_participation: '',
      barriers_encountered: '',
      adaptations_made: '',
      home_program: '',
      caregiver_training: '',
      equipment_recommendations: '',
      follow_up_notes: '',
      next_session_date: '',
    },
  });

  // Pre-populate form when session data loads
  useEffect(() => {
    if (session) {
      form.reset({
        notes: session.notes || '',
        duration_minutes: session.duration_minutes ?? 45,
        outcome: session.outcome as (typeof sessionOutcomes)[number] | undefined,
        adl_activities: session.adl_activities || '',
        cognitive_activities: session.cognitive_activities || '',
        sensory_activities: session.sensory_activities || '',
        motor_activities: session.motor_activities || '',
        current_adl_score: session.current_adl_score ?? undefined,
        current_iadl_score: session.current_iadl_score ?? undefined,
        current_cognitive_score: session.current_cognitive_score ?? undefined,
        patient_participation: session.patient_participation || '',
        barriers_encountered: session.barriers_encountered || '',
        adaptations_made: session.adaptations_made || '',
        home_program: session.home_program || '',
        caregiver_training: session.caregiver_training || '',
        equipment_recommendations: session.equipment_recommendations || '',
        follow_up_notes: session.follow_up_notes || '',
        next_session_date: session.next_session_date || '',
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
        const targetOrderId = orderId || session?.order_id;
        if (targetOrderId) {
          router.push(`/allied-health/occupational-therapy/orders/${targetOrderId}`);
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
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Invoice item created for billing.
            </p>
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
                Occupational Therapy Session
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
                <div className="font-medium">{session.order?.patient?.full_name || 'Patient'}</div>
                <div className="text-sm text-muted-foreground">{session.order?.patient?.mrn || ''}</div>
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
                <div className="text-sm text-muted-foreground">Therapist</div>
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
            {/* Activities Performed */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activities Performed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="adl_activities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ADL Activities</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Activities of daily living practiced (dressing, feeding, toileting...)"
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
                  name="cognitive_activities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cognitive Activities</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Cognitive exercises and activities..."
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
                  name="sensory_activities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sensory Activities</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Sensory integration activities..."
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
                  name="motor_activities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motor Activities</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Fine/gross motor skill activities..."
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

            {/* FIM Assessment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Functional Assessment (FIM)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="current_adl_score"
                  render={({ field }) => (
                    <FormItem>
                      <FIMScoreSelector
                        label="ADL Score"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isCompleted}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_iadl_score"
                  render={({ field }) => (
                    <FormItem>
                      <FIMScoreSelector
                        label="IADL Score"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isCompleted}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_cognitive_score"
                  render={({ field }) => (
                    <FormItem>
                      <FIMScoreSelector
                        label="Cognitive Score"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isCompleted}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Progress Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Progress Notes *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Document patient progress and observations..."
                          rows={4}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="patient_participation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient Participation</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Level of patient engagement and cooperation..."
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
                  name="barriers_encountered"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barriers Encountered</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Any barriers to progress..."
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
                  name="adaptations_made"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adaptations Made</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Modifications or adaptations during session..."
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

            {/* Home Program & Caregiver */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Follow-up & Home Program</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="home_program"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Program</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Exercises and activities for the patient to do at home..."
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
                  name="caregiver_training"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caregiver Training</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Training provided to caregivers..."
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
                  name="equipment_recommendations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Recommendations</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Assistive devices or equipment recommended..."
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
                  name="follow_up_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Session Plan</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Plan for the next session..."
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
            <DialogTitle>Start OT Session</DialogTitle>
            <DialogDescription>
              Ready to begin the occupational therapy session?
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
