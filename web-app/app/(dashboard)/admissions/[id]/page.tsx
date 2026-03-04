'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Bed,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  LogOut,
  MoveRight,
  Stethoscope,
  User,
  Activity,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdmission,
  useAdmissionWardRounds,
  useKardexByAdmission,
  useCreateReviewRequest,
  useAdmissionReviewRequests,
} from '@/lib/hooks/use-inpatient';
import { AdmissionOrdersTab, ICURiskAssessmentPanel } from '@/components/inpatient';
import { TemperatureChart } from '@/components/inpatient/temperature-chart';
import { BloodTransfusionChart } from '@/components/inpatient/blood-transfusion-chart';
import { BPMonitoringChart } from '@/components/inpatient/bp-monitoring-chart';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/use-toast';
import type { ReviewType, ReviewUrgency } from '@/lib/types/inpatient';
import type { AIQuickAction } from '@/lib/types/ai';

const REVIEW_REQUEST_TYPES: { value: Exclude<ReviewType, 'WARD_ROUND'>; label: string }[] = [
  { value: 'URGENT_REVIEW', label: 'Urgent Review' },
  { value: 'CONSULTANT_REVIEW', label: 'Consultant Review' },
  { value: 'TRANSFER_REVIEW', label: 'Transfer Assessment' },
  { value: 'PRE_DISCHARGE', label: 'Pre-Discharge Assessment' },
];

const URGENCY_LEVELS: { value: ReviewUrgency; label: string; description: string }[] = [
  { value: 'STAT', label: 'STAT (Immediate)', description: 'Requires immediate attention' },
  { value: 'URGENT', label: 'Urgent', description: 'Within 2 hours' },
  { value: 'ROUTINE', label: 'Routine', description: 'Within 24 hours' },
];

// =============================================================================
// Inpatient Quick Actions for AI Chat Widget
// =============================================================================

const INPATIENT_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'inpatient-icu-risk',
    label: 'ICU escalation risk',
    query:
      'Based on this admitted patient\'s current vitals, ward round condition status, diagnosis, and length of stay, assess the risk of requiring ICU escalation. Consider SOFA/qSOFA criteria and provide early warning signs to monitor.',
    userMessage: '🏥 Assessing ICU escalation risk...',
  },
  {
    id: 'inpatient-discharge-readiness',
    label: 'Discharge readiness',
    query:
      'Assess whether this inpatient is ready for discharge. Consider their current condition status, latest ward round findings, vitals trends, diagnosis, and length of stay. Identify any criteria that should be met before discharge.',
    userMessage: '🏠 Evaluating discharge readiness...',
  },
  {
    id: 'inpatient-complications',
    label: 'Anticipated complications',
    query:
      'Based on this patient\'s admitting diagnosis, current condition, length of stay, and vital signs, what complications should we anticipate? Include hospital-acquired infection risk, DVT risk, and condition-specific complications.',
    userMessage: '⚠️ Reviewing anticipated complications...',
  },
  {
    id: 'inpatient-care-plan',
    label: 'Suggest care plan',
    query:
      'Suggest a comprehensive inpatient care plan for this patient. Include medication review recommendations, nursing observations frequency, diet considerations, mobilization plan, and investigation priorities based on the current clinical picture.',
    userMessage: '📋 Generating care plan suggestions...',
  },
];

// =============================================================================
// Helper: parse BP string to MAP
// =============================================================================

function parseBPToMAP(bp: string | undefined | null): number | undefined {
  if (!bp) return undefined;
  const match = bp.match(/^(\d+)\/(\d+)$/);
  if (!match) return undefined;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (isNaN(systolic) || isNaN(diastolic)) return undefined;
  return Math.round(diastolic + (systolic - diastolic) / 3);
}

export default function AdmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading, error } = useAdmission(admissionId);
  const { data: wardRounds, isLoading: wardRoundsLoading } = useAdmissionWardRounds(admissionId);
  const { data: kardex, isLoading: kardexLoading } = useKardexByAdmission(admissionId);
  const { data: reviewRequests, isLoading: reviewRequestsLoading } = useAdmissionReviewRequests(admissionId);
  const createReviewRequest = useCreateReviewRequest();

  // =========================================================================
  // AI Chat Widget — encounter-aware context wiring
  // =========================================================================

  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;

  // Derive the latest ward round (most recent by date) for vitals + condition
  const latestWardRound = useMemo(() => {
    const rounds = wardRounds?.results;
    if (!rounds || rounds.length === 0) return null;
    return [...rounds].sort(
      (a, b) => new Date(b.round_date).getTime() - new Date(a.round_date).getTime()
    )[0] ?? null;
  }, [wardRounds]);

  // Wire admission + patient data into the AI chat context so TibaBot
  // can provide inpatient-aware clinical assistance.
  useEffect(() => {
    if (!setEncounterAwareContext) return;

    if (admission) {
      const daysLOS = Math.ceil(
        (Date.now() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Extract latest vitals from most recent ward round
      const vitalSource = latestWardRound?.vital_signs ?? latestWardRound;
      const bp = vitalSource?.blood_pressure;

      setEncounterAwareContext(
        // Patient context — no PII
        {
          patient_age: admission.patient_age ?? 0,
          patient_sex: admission.patient_gender ?? 'O',
        },
        // Encounter context — enriched with inpatient fields
        {
          chief_complaint:
            admission.admitting_diagnosis_text
            || admission.admitting_diagnosis
            || undefined,
          vitals: vitalSource
            ? {
                spo2: vitalSource.spo2 != null ? Number(vitalSource.spo2) : undefined,
                pulse: vitalSource.pulse ?? undefined,
                temperature: vitalSource.temperature != null
                  ? Number(vitalSource.temperature)
                  : undefined,
                rr: vitalSource.respiratory_rate ?? undefined,
                map: parseBPToMAP(typeof bp === 'string' ? bp : undefined),
              }
            : undefined,
          // Inpatient-specific context
          admission_diagnosis:
            admission.admitting_diagnosis_text
            || admission.admitting_diagnosis
            || undefined,
          ward_name: admission.ward_name ?? undefined,
          bed_number: admission.bed_number ?? undefined,
          admission_status: admission.admission_status ?? undefined,
          length_of_stay_days: daysLOS,
          condition_status: latestWardRound?.condition_status ?? undefined,
          diet: admission.diet ?? undefined,
          special_instructions: admission.special_instructions ?? undefined,
        }
      );
    }

    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [admission, latestWardRound, setEncounterAwareContext]);

  // Register inpatient-specific quick actions
  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(INPATIENT_QUICK_ACTIONS);
    return () => {
      setQuickActions([]);
    };
  }, [setQuickActions]);

  // Filter pending review requests
  const pendingReviews = reviewRequests?.results?.filter(
    (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS'
  ) || [];

  // Review request dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewType, setReviewType] = useState<Exclude<ReviewType, 'WARD_ROUND'>>('URGENT_REVIEW');
  const [reviewUrgency, setReviewUrgency] = useState<ReviewUrgency>('URGENT');
  const [reviewReason, setReviewReason] = useState('');
  const [consultantSpecialty, setConsultantSpecialty] = useState('');
  const [clinicalContext, setClinicalContext] = useState('');

  const handleRequestReview = async () => {
    if (!reviewReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a reason for the review request',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createReviewRequest.mutateAsync({
        admission: admissionId,
        review_type: reviewType,
        urgency: reviewUrgency,
        reason: reviewReason.trim(),
        consultant_specialty: reviewType === 'CONSULTANT_REVIEW' ? consultantSpecialty : undefined,
        clinical_context: clinicalContext || undefined,
      });
      toast({
        title: 'Review Requested',
        description: `${reviewType === 'URGENT_REVIEW' ? 'Urgent' : reviewType.replace('_', ' ')} review has been requested`,
      });
      setReviewDialogOpen(false);
      // Reset form
      setReviewReason('');
      setConsultantSpecialty('');
      setClinicalContext('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to request review',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <AdmissionDetailSkeleton />;
  }

  if (error || !admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          The admission record you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  const daysAdmitted = Math.ceil(
    (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-lg sm:text-xl font-bold truncate">
            {admission.admission_number}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            Patient: <span className="font-medium">{admission.patient_name}</span>
          </p>
        </div>
        <Badge
          variant={getStatusVariant(admission.admission_status)}
          className="shrink-0 w-fit self-start sm:self-auto"
        >
          {admission.admission_status_display || admission.admission_status}
        </Badge>
      </div>

      {/* Actions */}
      {admission.admission_status === 'ACTIVE' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" asChild>
            <Link href={`/admissions/${admission.id}/ward-round/new`}>
              <Stethoscope className="h-4 w-4 mr-2" />
              Ward Round
            </Link>
          </Button>

          {/* Request Review Dialog */}
          <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <span className="sm:hidden">Review</span>
                <span className="hidden sm:inline">Request Review</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Request Patient Review</DialogTitle>
                <DialogDescription>
                  Submit a review request for this patient. Urgent and STAT requests will be prioritized.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="review-type">Review Type</Label>
                  <Select value={reviewType} onValueChange={(v) => setReviewType(v as Exclude<ReviewType, 'WARD_ROUND'>)}>
                    <SelectTrigger id="review-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEW_REQUEST_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="urgency">Urgency</Label>
                  <Select value={reviewUrgency} onValueChange={(v) => setReviewUrgency(v as ReviewUrgency)}>
                    <SelectTrigger id="urgency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URGENCY_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value} title={level.description}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {reviewType === 'CONSULTANT_REVIEW' && (
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Consultant Specialty</Label>
                    <Select value={consultantSpecialty} onValueChange={setConsultantSpecialty}>
                      <SelectTrigger id="specialty">
                        <SelectValue placeholder="Select specialty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cardiology">Cardiology</SelectItem>
                        <SelectItem value="Neurology">Neurology</SelectItem>
                        <SelectItem value="Surgery">Surgery</SelectItem>
                        <SelectItem value="Internal Medicine">Internal Medicine</SelectItem>
                        <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                        <SelectItem value="Oncology">Oncology</SelectItem>
                        <SelectItem value="Orthopedics">Orthopedics</SelectItem>
                        <SelectItem value="Pulmonology">Pulmonology</SelectItem>
                        <SelectItem value="Nephrology">Nephrology</SelectItem>
                        <SelectItem value="Psychiatry">Psychiatry</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Review *</Label>
                  <Textarea
                    id="reason"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    placeholder="Describe why this patient needs a review..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context">Clinical Context (Optional)</Label>
                  <Textarea
                    id="context"
                    value={clinicalContext}
                    onChange={(e) => setClinicalContext(e.target.value)}
                    placeholder="Latest vitals, recent changes, relevant history..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRequestReview}
                  disabled={createReviewRequest.isPending || !reviewReason.trim()}
                >
                  {createReviewRequest.isPending ? 'Submitting...' : 'Submit Request'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" asChild>
            <Link href={`/admissions/${admission.id}/transfer`}>
              <MoveRight className="h-4 w-4 mr-2" />
              Transfer
            </Link>
          </Button>
          <Button variant="default" asChild>
            <Link href={`/admissions/${admission.id}/discharge`}>
              <LogOut className="h-4 w-4 mr-2" />
              Discharge
            </Link>
          </Button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900 shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Ward</p>
                <p className="font-semibold text-sm sm:text-base truncate">{admission.ward_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-green-100 dark:bg-green-900 shrink-0">
                <Bed className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Bed</p>
                <p className="font-semibold text-sm sm:text-base truncate">{admission.bed_number}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-purple-100 dark:bg-purple-900 shrink-0">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Admitted</p>
                <p className="font-semibold text-sm sm:text-base truncate">{formatDate(admission.admission_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:pt-6 sm:p-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-orange-100 dark:bg-orange-900 shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-accent-foreground">Days</p>
                <p className="font-semibold text-sm sm:text-base">{daysAdmitted} day{daysAdmitted !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Info</span>
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="ward-rounds" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Rounds</span>
            <span className="hidden sm:inline">Ward Rounds</span>
          </TabsTrigger>
          <TabsTrigger value="charts" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Charts</span>
            <span className="hidden sm:inline">Obs Charts</span>
          </TabsTrigger>
          <TabsTrigger value="kardex" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Kardex</span>
            <span className="hidden sm:inline">Nursing Kardex</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">Orders</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Pending Review Requests Alert */}
          {pendingReviews.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <CardTitle className="text-lg">Pending Review Requests</CardTitle>
                  <Badge variant="warning" className="ml-auto">
                    {pendingReviews.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingReviews.map((review) => (
                    <div
                      key={review.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-background border"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={review.urgency === 'STAT' ? 'destructive' : review.urgency === 'URGENT' ? 'warning' : 'secondary'}
                          >
                            {review.urgency_display || review.urgency}
                          </Badge>
                          <span className="font-medium">
                            {review.review_type_display || review.review_type.replace('_', ' ')}
                          </span>
                          {review.status === 'IN_PROGRESS' && (
                            <Badge variant="info" className="text-xs">In Progress</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{review.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          Requested by {review.requested_by_username} • {formatDateTime(review.requested_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link href={`/admissions/${admission.id}/ward-round/new?review_request=${review.id}&review_type=${review.review_type}`}>
                          Conduct Review
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Admission Details */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Admission Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  icon={User}
                  label="Patient"
                  value={admission.patient_name}
                  link={`/patients/${admission.patient}`}
                />
                <InfoRow
                  icon={FileText}
                  label="Admitting Diagnosis"
                  value={admission.admitting_diagnosis_text || admission.admitting_diagnosis}
                />
                <InfoRow
                  icon={User}
                  label="Admitted By"
                  value={admission.admitting_officer_username || '—'}
                />
                <InfoRow
                  icon={Calendar}
                  label="Admission Date"
                  value={formatDateTime(admission.admission_date)}
                />
                <InfoRow
                  icon={Activity}
                  label="Payer Type"
                  value={admission.payer_type_display || admission.payer_type}
                />
              </CardContent>
            </Card>

            {/* Clinical Notes */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-accent-foreground whitespace-pre-wrap break-words">
                  {admission.clinical_notes || 'No clinical notes recorded.'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Diet & Special Instructions */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Diet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm break-words">
                  {admission.diet || 'Regular diet (no restrictions specified)'}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Special Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-accent-foreground break-words">
                  {admission.special_instructions || 'No special instructions.'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* AI ICU Risk Assessment (Phase 4) */}
          {admission.admission_status === 'ACTIVE' && (
            <ICURiskAssessmentPanel
              patientAge={admission.patient_age ?? 0}
              patientGender={admission.patient_gender ?? 'O'}
              admissionDiagnosis={
                admission.admitting_diagnosis_text || admission.admitting_diagnosis
              }
              lengthOfStayDays={daysAdmitted}
            />
          )}
        </TabsContent>

        {/* Ward Rounds Tab */}
        <TabsContent value="ward-rounds" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Ward Round History</h3>
            {admission.admission_status === 'ACTIVE' && (
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/admissions/${admission.id}/ward-round/new`}>
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">New Round</span>
                  <span className="hidden sm:inline">New Ward Round</span>
                </Link>
              </Button>
            )}
          </div>

          {wardRoundsLoading ? (
            <WardRoundsSkeleton />
          ) : (wardRounds?.results?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Stethoscope className="h-12 w-12 mx-auto text-accent-foreground mb-4" />
                <p className="text-accent-foreground">No ward rounds recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {wardRounds?.results?.map((round) => (
                <Link key={round.id} href={`/admissions/${admission.id}/ward-round/${round.id}`}>
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {formatDateTime(round.round_date)}
                        </CardTitle>
                        <Badge variant="outline">{round.condition_status_display || round.condition_status}</Badge>
                      </div>
                      <CardDescription>
                        Conducted by {round.conducted_by_username}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">Clinical Notes</p>
                        <p className="text-sm text-accent-foreground line-clamp-2">{round.clinical_notes}</p>
                      </div>
                      {round.plan && (
                        <div>
                          <p className="text-sm font-medium">Plan</p>
                          <p className="text-sm text-accent-foreground line-clamp-2">{round.plan}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Nursing Kardex Tab */}
        <TabsContent value="kardex" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Nursing Kardex</h3>
            {kardex && admission.admission_status === 'ACTIVE' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                  <Link href={`/admissions/${admission.id}/kardex?action=shift-note`}>
                    <Plus className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Add Shift Note</span>
                    <span className="sm:hidden">Shift Note</span>
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <Link href={`/admissions/${admission.id}/kardex`}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    <span className="sm:hidden">View Kardex</span>
                    <span className="hidden sm:inline">View Full Kardex</span>
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {kardexLoading ? (
            <KardexSkeleton />
          ) : !kardex ? (
            <Card>
              <CardContent className="py-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-accent-foreground mb-4" />
                <p className="text-accent-foreground">No nursing kardex found.</p>
                <p className="text-sm text-accent-foreground mt-1">
                  A kardex is automatically created when a patient is admitted.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Link href={`/admissions/${admission.id}/kardex`}>
              <div className="grid gap-4 md:grid-cols-2 cursor-pointer">
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-lg">Care Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Mobility Status</p>
                      <p className="text-sm text-accent-foreground">{kardex.mobility_status || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Diet</p>
                      <p className="text-sm text-accent-foreground">{kardex.diet || 'Regular'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Allergies</p>
                      <p className="text-sm text-accent-foreground">{kardex.allergies || 'None known'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Fall Risk</p>
                      <Badge variant={kardex.fall_risk ? 'destructive' : 'secondary'}>
                        {kardex.fall_risk ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:bg-muted/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-lg">Latest Shift Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {kardex.shift_notes && kardex.shift_notes.length > 0 ? (
                      <div className="space-y-2">
                        {kardex.shift_notes.slice(0, 2).map((note) => (
                          <p key={note.id} className="text-sm text-accent-foreground line-clamp-2">
                            <span className="font-medium">{note.nurse_username}:</span> {note.content || note.notes}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-accent-foreground">No shift notes recorded.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </Link>
          )}
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <AdmissionOrdersTab
            admissionId={admission.id}
            patientId={admission.patient}
            encounterId={admission.ipd_encounter}
            isActive={admission.admission_status === 'ACTIVE'}
          />
        </TabsContent>

        {/* Observation Charts Tab */}
        <TabsContent value="charts" className="space-y-6">
          <TemperatureChart
            admissionId={admission.id}
            isActive={admission.admission_status === 'ACTIVE'}
          />
          <Separator />
          <BPMonitoringChart
            admissionId={admission.id}
            isActive={admission.admission_status === 'ACTIVE'}
          />
          <Separator />
          <BloodTransfusionChart
            admissionId={admission.id}
            isActive={admission.admission_status === 'ACTIVE'}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper Components
function InfoRow({
  icon: Icon,
  label,
  value,
  link
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  link?: string;
}) {
  const content = (
    <div className="flex items-start gap-3 min-w-0">
      <Icon className="h-4 w-4 mt-0.5 text-accent-foreground shrink-0" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm text-accent-foreground">{label}</p>
        <p className={`text-sm font-medium break-words ${link ? 'text-primary hover:underline' : ''}`}>
          {value || '—'}
        </p>
      </div>
    </div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }
  return content;
}

function AdmissionDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function WardRoundsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(2)].map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}

function KardexSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}

/**
 * Get badge variant based on admission status
 */
function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DISCHARGED':
      return 'secondary';
    case 'TRANSFERRED_OUT':
      return 'warning';
    case 'DECEASED':
    case 'ABSCONDED':
      return 'destructive';
    default:
      return 'secondary';
  }
}
