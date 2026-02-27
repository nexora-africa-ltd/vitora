/**
 * Physiotherapy Session Form
 * Form for recording physiotherapy session details
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
  usePhysioSession,
  useStartPhysioSession,
  useCompletePhysioSession,
  useCancelPhysioSession,
} from '@/lib/hooks/use-physiotherapy';

// =============================================================================
// Types & Validation
// =============================================================================

const sessionOutcomes = ['IMPROVED', 'MAINTAINED', 'DECLINED', 'UNABLE_TO_ASSESS'] as const;

const completeSessionSchema = z.object({
  progress_notes: z.string().min(1, 'Progress notes is required'),
  interventions: z.string().min(1, 'Interventions provided is required'),
  patient_response: z.string().optional(),
  home_exercise_instructions: z.string().optional(),
  follow_up_recommendations: z.string().optional(),
  pre_pain_score: z.number().min(0).max(10).optional(),
  post_pain_score: z.number().min(0).max(10).optional(),
  outcome: z.enum(sessionOutcomes, { required_error: 'Outcome is required' }),
  duration_minutes: z.number().min(1).default(45),
});

type CompleteSessionFormData = z.infer<typeof completeSessionSchema>;

interface PhysioSessionFormProps {
  sessionId: number;
  orderId?: number;
}

// =============================================================================
// Status Badge Component
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

export function PhysioSessionForm({ sessionId, orderId }: PhysioSessionFormProps) {
  const router = useRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [initialPainLevel, setInitialPainLevel] = useState(5);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: session, isLoading, error } = usePhysioSession(sessionId);
  const startMutation = useStartPhysioSession();
  const completeMutation = useCompletePhysioSession();
  const cancelMutation = useCancelPhysioSession();

  const form = useForm<CompleteSessionFormData>({
    resolver: zodResolver(completeSessionSchema),
    defaultValues: {
      progress_notes: '',
      interventions: '',
      patient_response: '',
      home_exercise_instructions: '',
      follow_up_recommendations: '',
      pre_pain_score: 0,
      post_pain_score: 0,
      outcome: undefined,
      duration_minutes: 45,
    },
  });

  // Pre-populate form when session data loads
  useEffect(() => {
    if (session) {
      form.reset({
        progress_notes: session.progress_notes || '',
        interventions: session.interventions || '',
        patient_response: session.patient_response || '',
        home_exercise_instructions: session.home_exercise_instructions || '',
        follow_up_recommendations: session.follow_up_recommendations || '',
        pre_pain_score: session.pre_pain_score ?? 0,
        post_pain_score: session.post_pain_score ?? 0,
        outcome: session.outcome as typeof sessionOutcomes[number] | undefined,
        duration_minutes: session.duration_minutes ?? 45,
      });
    }
  }, [session, form]);

  const isScheduled = session?.status === 'SCHEDULED';
  const isInProgress = session?.status === 'IN_PROGRESS';
  const isCompleted = session?.status === 'COMPLETED';
  const isCancelled = session?.status === 'CANCELLED';
  const isEditable = isInProgress;

  // Calculate elapsed time for in-progress sessions
  const getElapsedTime = () => {
    if (!session?.actual_date) return null;
    const startDate = parseISO(session.actual_date);
    const now = new Date();
    const minutes = differenceInMinutes(now, startDate);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

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
      await completeMutation.mutateAsync({
        id: sessionId,
        data,
      });
      setShowSuccess(true);
      // Navigate after short delay
      setTimeout(() => {
        if (orderId) {
          router.push(`/allied-health/physiotherapy/orders/${orderId}`);
        } else if (session?.order) {
          router.push(`/allied-health/physiotherapy/orders/${session.order}`);
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
      await cancelMutation.mutateAsync({
        id: sessionId,
        reason: cancelReason,
      });
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
              <CardDescription>
                Physiotherapy Session
              </CardDescription>
            </div>
            <SessionStatusBadge status={session.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Patient */}
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">Patient</div>
                <div className="text-sm text-muted-foreground">Order #{session.order}</div>
              </div>
            </div>

            {/* Date */}
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {format(parseISO(session.scheduled_date), 'MMMM d, yyyy')}
                </div>
                {session.actual_date && (
                  <div className="text-sm text-muted-foreground">
                    Started: {format(parseISO(session.actual_date), 'h:mm a')}
                  </div>
                )}
              </div>
            </div>

            {/* Therapist */}
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <div className="font-medium">{session.therapist_name || 'Unassigned'}</div>
                <div className="text-sm text-muted-foreground">Therapist</div>
              </div>
            </div>

            {/* Duration/Elapsed */}
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                {isCompleted && session.duration_minutes ? (
                  <>
                    <div className="font-medium">{session.duration_minutes} minutes</div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                  </>
                ) : isInProgress ? (
                  <>
                    <div className="font-medium">{getElapsedTime()}</div>
                    <div className="text-sm text-muted-foreground">Elapsed</div>
                  </>
                ) : (
                  <>
                    <div className="font-medium">—</div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                  </>
                )}
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

      {/* Session Form for In Progress */}
      {(isInProgress || isCompleted) && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleCompleteSession)} className="space-y-6">
            {/* Pain Levels */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pain Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-between text-xs text-muted-foreground mb-2">
                  <span>0</span>
                  <span>10</span>
                </div>
                
                <FormField
                  control={form.control}
                  name="pre_pain_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pain Level Before</FormLabel>
                      <FormControl>
                        <Slider
                          aria-label="Pain level before"
                          min={0}
                          max={10}
                          step={1}
                          value={[field.value || 0]}
                          onValueChange={([val]) => field.onChange(val)}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <div className="text-center text-sm font-medium">{field.value}</div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="post_pain_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pain Level After</FormLabel>
                      <FormControl>
                        <Slider
                          aria-label="Pain level after"
                          min={0}
                          max={10}
                          step={1}
                          value={[field.value || 0]}
                          onValueChange={([val]) => field.onChange(val)}
                          disabled={isCompleted}
                        />
                      </FormControl>
                      <div className="text-center text-sm font-medium">{field.value}</div>
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
                  name="progress_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Progress Notes *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Document patient progress..."
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
                  name="interventions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Treatment Provided</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe treatments administered..."
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
                  name="patient_response"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient Response</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="How did the patient respond to treatment..."
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
                  name="home_exercise_instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Exercises</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Exercises prescribed for home..."
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
                  name="follow_up_recommendations"
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
              </CardContent>
            </Card>

            {/* Outcome */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Outcome</CardTitle>
              </CardHeader>
              <CardContent>
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

                {isCompleted && session.is_billed && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Billed
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit Buttons */}
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
            <DialogTitle>Start Session</DialogTitle>
            <DialogDescription>
              Record initial pain level before starting the session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="initial-pain">Initial Pain Level</Label>
              <Slider
                id="initial-pain"
                aria-label="Initial pain level"
                min={0}
                max={10}
                step={1}
                value={[initialPainLevel]}
                onValueChange={([val]) => setInitialPainLevel(val ?? 5)}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0 (No pain)</span>
                <span className="font-medium">{initialPainLevel}</span>
                <span>10 (Severe)</span>
              </div>
            </div>
          </div>
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
