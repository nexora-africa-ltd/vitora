'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Stethoscope, ThermometerSun, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdmission, useCreateWardRound } from '@/lib/hooks/use-inpatient';
import { getAgeGroupFromYears, getVitalPlaceholder } from '@/lib/vitals';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import type { ConditionStatus, MaternityContinuityAction, ReviewType } from '@/lib/types/inpatient';
import type { AIQuickAction } from '@/lib/types/ai';

const CONDITION_STATUSES: { value: ConditionStatus; label: string; description: string }[] = [
  { value: 'STABLE', label: 'Stable', description: 'Patient condition is stable' },
  { value: 'IMPROVING', label: 'Improving', description: 'Patient showing signs of improvement' },
  { value: 'DETERIORATING', label: 'Deteriorating', description: 'Patient condition is worsening' },
  { value: 'CRITICAL', label: 'Critical', description: 'Patient requires immediate attention' },
];

const REVIEW_TYPES: { value: ReviewType; label: string; description: string }[] = [
  { value: 'WARD_ROUND', label: 'Scheduled Ward Round', description: 'Routine daily or scheduled round' },
  { value: 'URGENT_REVIEW', label: 'Urgent Review', description: 'Immediate assessment due to patient condition change' },
  { value: 'CONSULTANT_REVIEW', label: 'Consultant Review', description: 'Specialist evaluation' },
  { value: 'TRANSFER_REVIEW', label: 'Transfer Assessment', description: 'Assessment before or after ward transfer' },
  { value: 'PRE_DISCHARGE', label: 'Pre-Discharge Assessment', description: 'Discharge readiness evaluation' },
];

const MATERNITY_CONTINUITY_ACTIONS: { value: MaternityContinuityAction; label: string }[] = [
  { value: 'NONE', label: 'No postpartum workflow set' },
  { value: 'CONTINUE_POSTPARTUM_OBSERVATION', label: 'Continue Postpartum Observation' },
  { value: 'SCHEDULE_EARLY_PNC', label: 'Prepare Early PNC Scheduling' },
  { value: 'ROUTE_TO_PNC_QUEUE', label: 'Prepare Direct PNC Queue Routing' },
];

/**
 * RequiredLabel - displays a label with a required indicator
 */
function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1">
      {children}
      <span className="text-destructive">*</span>
    </Label>
  );
}

export default function NewWardRoundPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  // Get review request ID and type from URL (when fulfilling a review request)
  const reviewRequestId = searchParams.get('review_request');
  const initialReviewType = searchParams.get('review_type') as ReviewType | null;

  const { data: admission, isLoading } = useAdmission(admissionId);
  const createWardRound = useCreateWardRound();
  const ageGroup = useMemo(() => (admission?.patient_age != null ? getAgeGroupFromYears(admission.patient_age) : null), [admission?.patient_age]);

  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('STABLE');
  const [reviewType, setReviewType] = useState<ReviewType>(
    (initialReviewType && ['WARD_ROUND', 'URGENT_REVIEW', 'CONSULTANT_REVIEW', 'TRANSFER_REVIEW', 'PRE_DISCHARGE'].includes(initialReviewType))
      ? initialReviewType
      : 'WARD_ROUND'
  );

  // SOAP Notes
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [maternityContinuityAction, setMaternityContinuityAction] = useState<MaternityContinuityAction>('NONE');
  const [maternityContinuityNotes, setMaternityContinuityNotes] = useState('');

  // Vitals
  const [temperature, setTemperature] = useState('');
  const [pulse, setPulse] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [spo2, setSpo2] = useState('');

  // Track if form was submitted (to show validation errors)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // =========================================================================
  // AI Chat Widget — ward-round-aware context wiring
  // =========================================================================

  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;

  // Ward round quick actions — context-aware during charting
  const WARD_ROUND_QUICK_ACTIONS: AIQuickAction[] = useMemo(() => [
    {
      id: 'ward-round-assessment',
      label: 'Assessment guidance',
      query:
        'Based on this patient\'s current vitals, condition status, admission diagnosis, and SOAP notes so far, help me formulate a clinical assessment. What key findings should I document?',
      userMessage: '📝 Requesting assessment guidance...',
    },
    {
      id: 'ward-round-plan',
      label: 'Suggest treatment plan',
      query:
        'Based on the current clinical picture (vitals, condition status, diagnosis, length of stay), suggest a treatment plan for today\'s ward round. Include medication adjustments, investigations, and disposition considerations.',
      userMessage: '💊 Generating treatment plan suggestions...',
    },
    {
      id: 'ward-round-deterioration',
      label: 'Deterioration signs',
      query:
        'For this patient\'s current diagnosis and condition, what signs of deterioration should I specifically look for and document? Include early warning score triggers and escalation thresholds.',
      userMessage: '⚠️ Reviewing deterioration warning signs...',
    },
    {
      id: 'ward-round-icu-risk',
      label: 'ICU escalation risk',
      query:
        'Based on the latest vitals and clinical observations, assess the risk of this patient requiring ICU escalation. Consider SOFA/qSOFA criteria, modified early warning scores, and the admitting diagnosis.',
      userMessage: '🏥 Assessing ICU escalation risk...',
    },
  ], []);

  // Helper: parse BP string to MAP
  function parseBPToMAP(bp: string | undefined | null): number | undefined {
    if (!bp) return undefined;
    const match = bp.match(/^(\d+)\/(\d+)$/);
    if (!match) return undefined;
    const sys = Number(match[1]);
    const dia = Number(match[2]);
    if (isNaN(sys) || isNaN(dia)) return undefined;
    return Math.round(dia + (sys - dia) / 3);
  }

  // Wire in-progress ward round data into AI context so TibaBot sees
  // the latest values even before submission — same pattern as triage assess.
  useEffect(() => {
    if (!setEncounterAwareContext) return;

    if (admission) {
      const daysLOS = Math.ceil(
        (Date.now() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // In-progress vitals from form state (typed but not yet submitted)
      const inProgressSpo2 = spo2 ? parseFloat(spo2) : undefined;
      const inProgressPulse = pulse ? parseInt(pulse) : undefined;
      const inProgressTemp = temperature ? parseFloat(temperature) : undefined;
      const inProgressRR = respiratoryRate ? parseInt(respiratoryRate) : undefined;
      const inProgressMAP = parseBPToMAP(bloodPressure);

      // Chief complaint = SOAP subjective (in-progress) or admission diagnosis
      const chiefComplaint =
        subjective.trim()
        || admission.admitting_diagnosis_text
        || admission.admitting_diagnosis
        || undefined;

      setEncounterAwareContext(
        {
          patient_age: admission.patient_age ?? 0,
          patient_sex: admission.patient_gender ?? 'O',
        },
        {
          chief_complaint: chiefComplaint,
          vitals: {
            spo2: inProgressSpo2,
            pulse: inProgressPulse,
            temperature: inProgressTemp,
            rr: inProgressRR,
            map: inProgressMAP,
          },
          // Inpatient context
          admission_diagnosis:
            admission.admitting_diagnosis_text
            || admission.admitting_diagnosis
            || undefined,
          ward_name: admission.ward_name ?? undefined,
          bed_number: admission.bed_number ?? undefined,
          admission_status: admission.admission_status ?? undefined,
          length_of_stay_days: daysLOS,
          condition_status: conditionStatus,
        }
      );
    }

    return () => {
      setEncounterAwareContext(null, null);
    };
  // Include form fields so context updates as the clinician types —
  // TibaBot sees the latest in-progress data just like triage assess.
  }, [
    admission, setEncounterAwareContext,
    spo2, pulse, temperature, respiratoryRate, bloodPressure,
    subjective, conditionStatus,
  ]);

  // Register ward-round-specific quick actions
  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(WARD_ROUND_QUICK_ACTIONS);
    return () => {
      setQuickActions([]);
    };
  }, [setQuickActions, WARD_ROUND_QUICK_ACTIONS]);

  const hasSubjective = subjective.trim().length > 0;
  const hasObjective = objective.trim().length > 0;
  const hasAssessment = assessment.trim().length > 0;
  const hasPlan = plan.trim().length > 0;
  const hasSOAPNotes = hasSubjective && hasObjective && hasAssessment && hasPlan;

  // Compute validation errors
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!hasSOAPNotes) {
      errors.push('All SOAP fields (Subjective, Objective, Assessment, Plan) are required');
    }
    if (!user?.id) {
      errors.push('User not authenticated');
    }
    return errors;
  }, [hasSOAPNotes, user?.id]);

  const isFormValid = validationErrors.length === 0;

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);

    if (!isFormValid || !user?.id) {
      toast({
        title: 'Validation Error',
        description: validationErrors.join('. '),
        variant: 'destructive',
      });
      return;
    }

    const now = new Date();
    const roundDate = now.toISOString().split('T')[0] || '';
    const roundTime = now.toTimeString().slice(0, 5);

    try {
      await createWardRound.mutateAsync({
        admission: admissionId,
        round_date: roundDate,
        round_time: roundTime,
        conducted_by: user.id,
        review_type: reviewType,
        review_request: reviewRequestId ? parseInt(reviewRequestId) : undefined,
        condition_status: conditionStatus,
        subjective: subjective.trim(),
        objective: objective.trim(),
        assessment: assessment.trim(),
        plan: plan.trim(),
        maternity_continuity_action: admission?.mch_registration ? maternityContinuityAction : undefined,
        maternity_continuity_notes: admission?.mch_registration ? maternityContinuityNotes.trim() || undefined : undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        pulse: pulse ? parseInt(pulse) : undefined,
        blood_pressure: bloodPressure || undefined,
        respiratory_rate: respiratoryRate ? parseInt(respiratoryRate) : undefined,
        spo2: spo2 ? parseFloat(spo2) : undefined,
      });
      toast({
        title: 'Success',
        description: 'Ward round saved successfully',
      });
      router.push(`/admissions/${admissionId}/ward-round`);
    } catch (error: unknown) {
      // Try to extract backend validation errors
      let errorMessage = 'Failed to save ward round';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: Record<string, unknown> } };
        if (axiosError.response?.data) {
          const data = axiosError.response.data;
          const fieldErrors = Object.entries(data)
            .filter(([key]) => key !== 'detail')
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ');
          if (fieldErrors) {
            errorMessage = fieldErrors;
          } else if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          }
        }
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <WardRoundFormSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot record a ward round without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Ward Round"
        helpContent={`Document ward round for ${admission.patient_name}. Record vitals, clinical notes in SOAP format, and update patient condition status.`}
      />

      {/* Review Request Context */}
      {reviewRequestId && (
        <Alert className="border-warning/50 bg-warning/5">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription>
            <strong>Fulfilling Review Request:</strong> This ward round is being recorded in response to a{' '}
            <span className="font-medium">{initialReviewType?.replace('_', ' ').toLowerCase()}</span> request.
            The review will be marked as completed once saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Patient Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-accent-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Days Admitted</p>
              <p className="font-medium">
                {Math.ceil(
                  (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
                )} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Type */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Review Type</CardTitle>
            <span className="text-destructive">*</span>
            <HelpPopover content="Select the type of review being conducted. WARD_ROUND is for scheduled daily rounds. Use URGENT_REVIEW when patient condition has changed and needs immediate assessment." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full md:w-[300px]">
            <Select value={reviewType} onValueChange={(v) => setReviewType(v as ReviewType)}>
              <SelectTrigger id="review-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value} title={type.description}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {admission.mch_registration && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Postpartum Continuity</CardTitle>
              <HelpPopover content="Capture the next maternity workflow step while the mother is still admitted so ward rounds and discharge stay aligned." />
            </div>
            <CardDescription>
              This admission is linked to {admission.mch_registration_number || `MCH #${admission.mch_registration}`}. Record the intended early PNC workflow here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="maternity-continuity-action">Postpartum Workflow</Label>
              <Select value={maternityContinuityAction} onValueChange={(value) => setMaternityContinuityAction(value as MaternityContinuityAction)}>
                <SelectTrigger id="maternity-continuity-action" className="w-full md:w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERNITY_CONTINUITY_ACTIONS.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maternity-continuity-notes">Postpartum Workflow Notes</Label>
              <Textarea
                id="maternity-continuity-notes"
                value={maternityContinuityNotes}
                onChange={(e) => setMaternityContinuityNotes(e.target.value)}
                placeholder="Document what still needs to happen before postpartum transition, for example discharge teaching, breastfeeding review, or who should escort the mother to PNC."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vitals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ThermometerSun className="h-5 w-5" />
            <CardTitle className="text-lg">Vital Signs</CardTitle>
          </div>
          <CardDescription>
            Record current vital signs (optional but recommended)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature (°C)</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder={getVitalPlaceholder('temperature', ageGroup)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse">Pulse (BPM)</Label>
              <Input
                id="pulse"
                type="number"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                placeholder={getVitalPlaceholder('pulse', ageGroup)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blood-pressure">Blood Pressure</Label>
              <Input
                id="blood-pressure"
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
                placeholder="120/80"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="respiratory-rate">Respiratory Rate</Label>
              <Input
                id="respiratory-rate"
                type="number"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                placeholder={getVitalPlaceholder('respiratory_rate', ageGroup)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spo2">SpO2 (%)</Label>
              <Input
                id="spo2"
                type="number"
                step="0.1"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                placeholder={getVitalPlaceholder('spo2', ageGroup)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle className="text-lg">Patient Condition</CardTitle>
            <span className="text-destructive">*</span>
          </div>
          <CardDescription>
            Set the overall patient condition for this review. All SOAP fields below must also be completed before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <RequiredLabel htmlFor="condition-status">Patient Condition</RequiredLabel>
            <Select value={conditionStatus} onValueChange={(v) => setConditionStatus(v as ConditionStatus)}>
              <SelectTrigger id="condition-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value} title={status.description}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* SOAP Format (Detailed) */}
      <Card className={hasAttemptedSubmit && !hasSOAPNotes ? 'border-destructive' : ''}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle className="text-lg">SOAP Documentation</CardTitle>
            <span className="text-destructive">*</span>
          </div>
          <CardDescription>
            Structured clinical documentation following SHA/FHIR compliance standards.
            <strong> All four SOAP fields are mandatory.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subjective */}
          <div className="space-y-2">
            <RequiredLabel htmlFor="subjective">Subjective (S)</RequiredLabel>
            <Textarea
              id="subjective"
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Patient's symptoms, complaints, and history..."
              rows={3}
              className={hasAttemptedSubmit && !hasSubjective ? 'border-destructive' : ''}
            />
            {hasAttemptedSubmit && !hasSubjective && <p className="text-sm text-destructive">Subjective is required.</p>}
          </div>

          {/* Objective */}
          <div className="space-y-2">
            <RequiredLabel htmlFor="objective">Objective (O)</RequiredLabel>
            <Textarea
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Physical examination findings, vital signs, lab results..."
              rows={3}
              className={hasAttemptedSubmit && !hasObjective ? 'border-destructive' : ''}
            />
            {hasAttemptedSubmit && !hasObjective && <p className="text-sm text-destructive">Objective is required.</p>}
          </div>

          {/* Assessment */}
          <div className="space-y-2">
            <RequiredLabel htmlFor="assessment">Assessment (A)</RequiredLabel>
            <Textarea
              id="assessment"
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Clinical assessment and diagnosis..."
              rows={3}
              className={hasAttemptedSubmit && !hasAssessment ? 'border-destructive' : ''}
            />
            {hasAttemptedSubmit && !hasAssessment && <p className="text-sm text-destructive">Assessment is required.</p>}
          </div>

          {/* Plan */}
          <div className="space-y-2">
            <RequiredLabel htmlFor="plan">Plan (P)</RequiredLabel>
            <Textarea
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Treatment plan, orders, and follow-up actions..."
              rows={4}
              className={hasAttemptedSubmit && !hasPlan ? 'border-destructive' : ''}
            />
            {hasAttemptedSubmit && !hasPlan && <p className="text-sm text-destructive">Plan is required.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Validation Summary */}
      {hasAttemptedSubmit && validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Please fix the following errors:</strong>
            <ul className="list-disc list-inside mt-2">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createWardRound.isPending || !isFormValid}
        >
          <Stethoscope className="h-4 w-4 mr-2" />
          {createWardRound.isPending ? 'Saving...' : 'Save Ward Round'}
        </Button>
      </div>
    </div>
  );
}

function WardRoundFormSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}
