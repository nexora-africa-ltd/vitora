'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  Download,
  FileText,
  HeartPulse,
  Loader2,
  MoveRight,
  Siren,
  Sparkles,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { HelpPopover } from '@/components/shared/help-popover';
import { aiApi } from '@/lib/api/ai';
import { getApiErrorMessage } from '@/lib/api/client';
import { theatreApi } from '@/lib/api/theatre';
import { downloadPDF } from '@/lib/export-utils';
import { useToast } from '@/lib/hooks/use-toast';
import type { StoredSurgicalPostOpCarePlanResult } from '@/lib/types/ai';
import type { PACURecord, SurgeryCaseDetail } from '@/lib/types/theatre';
import { useAdvisoryLinks } from '@/components/theatre/use-advisory-links';
import { SuggestionActionChip } from '@/components/theatre/suggestion-action-chip';

const pacuArrivalSchema = z.object({
  arrival_time: z.string().min(1, 'Arrival time is required'),
  arriving_nurse: z.coerce.number().int().positive('Receiving nurse user ID is required'),
  initial_aldrete_score: z.coerce.number().min(0).max(10),
  initial_pain_score: z.coerce.number().min(0).max(10).optional(),
});

const pacuVitalSchema = z.object({
  recorded_at: z.string().min(1, 'Recorded time is required'),
  recorded_by: z.coerce.number().int().positive('Recorder user ID is required'),
  systolic_bp: z.coerce.number().optional(),
  diastolic_bp: z.coerce.number().optional(),
  heart_rate: z.coerce.number().optional(),
  respiratory_rate: z.coerce.number().optional(),
  spo2: z.coerce.number().optional(),
  temperature: z.string().default(''),
  aldrete_score: z.coerce.number().min(0).max(10).optional(),
  pain_score: z.coerce.number().min(0).max(10).optional(),
  sedation_level: z.string().default(''),
  notes: z.string().default(''),
});

const pacuDocumentationSchema = z.object({
  nausea_vomiting: z.boolean().default(false),
  shivering: z.boolean().default(false),
  respiratory_issues: z.boolean().default(false),
  cardiovascular_issues: z.boolean().default(false),
  complications_notes: z.string().default(''),
  medications_given: z.string().default(''),
  handover_given_to: z.string().default(''),
  handover_notes: z.string().default(''),
}).superRefine((values, ctx) => {
  if (
    (values.nausea_vomiting || values.shivering || values.respiratory_issues || values.cardiovascular_issues)
    && !values.complications_notes.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['complications_notes'],
      message: 'Complication details are required when a recovery issue is flagged.',
    });
  }
});

const pacuDischargeSchema = z.object({
  discharge_aldrete_score: z.coerce.number().min(0).max(10),
  discharge_destination: z.enum(['WARD', 'ICU', 'DAY_CASE_DISCHARGE', 'EXTENDED_OBSERVATION']),
  discharge_notes: z.string().default(''),
});

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function PostOpWorkspace({ surgeryCase, onCaseRefresh }: { surgeryCase: SurgeryCaseDetail; onCaseRefresh?: () => Promise<void> | void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pacuRecord, setPacuRecord] = useState<PACURecord | null>(null);
  const [storedPostOpPlans, setStoredPostOpPlans] = useState<StoredSurgicalPostOpCarePlanResult[]>([]);
  const [postOpOpenSections, setPostOpOpenSections] = useState<string[]>([]);
  const [generatingCarePlan, setGeneratingCarePlan] = useState(false);
  const [freshInsight, setFreshInsight] = useState(false);
  const [estimatedBloodLossMl, setEstimatedBloodLossMl] = useState<number | ''>('');
  const [lowestHeartRate, setLowestHeartRate] = useState<number | ''>('');
  const [lowestMap, setLowestMap] = useState<number | ''>('');
  const [capriniScore, setCapriniScore] = useState<number | ''>('');
  const [postOpFindings, setPostOpFindings] = useState('');

  const arrivalForm = useForm<z.infer<typeof pacuArrivalSchema>>({
    resolver: zodResolver(pacuArrivalSchema),
    defaultValues: {
      arrival_time: toDateTimeLocalValue(new Date().toISOString()),
      arriving_nurse: surgeryCase.requesting_doctor,
      initial_aldrete_score: 8,
      initial_pain_score: 0,
    },
  });
  const vitalForm = useForm<z.infer<typeof pacuVitalSchema>>({
    resolver: zodResolver(pacuVitalSchema),
    defaultValues: {
      recorded_at: toDateTimeLocalValue(new Date().toISOString()),
      recorded_by: surgeryCase.requesting_doctor,
      systolic_bp: undefined,
      diastolic_bp: undefined,
      heart_rate: undefined,
      respiratory_rate: undefined,
      spo2: undefined,
      temperature: '',
      aldrete_score: 8,
      pain_score: 0,
      sedation_level: '',
      notes: '',
    },
  });
  const documentationForm = useForm<z.infer<typeof pacuDocumentationSchema>>({
    resolver: zodResolver(pacuDocumentationSchema),
    defaultValues: {
      nausea_vomiting: false,
      shivering: false,
      respiratory_issues: false,
      cardiovascular_issues: false,
      complications_notes: '',
      medications_given: '',
      handover_given_to: '',
      handover_notes: '',
    },
  });
  const dischargeForm = useForm<z.infer<typeof pacuDischargeSchema>>({
    resolver: zodResolver(pacuDischargeSchema),
    defaultValues: {
      discharge_aldrete_score: 9,
      discharge_destination: 'WARD',
      discharge_notes: '',
    },
  });

  const loadRecord = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); else setRefreshing(true);
    try {
      const [record, postOpPlans] = await Promise.all([
        theatreApi.getPACURecord(surgeryCase.case_number).catch(() => null),
        aiApi.getStoredSurgicalPostOpCarePlans({ surgery_case_id: surgeryCase.id }).catch(() => []),
      ]);
      setPacuRecord(record);
      setStoredPostOpPlans(postOpPlans);
      if (record) {
        arrivalForm.reset({
          arrival_time: toDateTimeLocalValue(record.arrival_time),
          arriving_nurse: record.arriving_nurse ?? surgeryCase.requesting_doctor,
          initial_aldrete_score: record.initial_aldrete_score ?? 8,
          initial_pain_score: record.initial_pain_score ?? 0,
        });
        dischargeForm.reset({
          discharge_aldrete_score: record.discharge_aldrete_score ?? 9,
          discharge_destination: (record.discharge_destination || 'WARD') as 'WARD' | 'ICU' | 'DAY_CASE_DISCHARGE' | 'EXTENDED_OBSERVATION',
          discharge_notes: record.discharge_notes ?? '',
        });
        documentationForm.reset({
          nausea_vomiting: record.nausea_vomiting,
          shivering: record.shivering,
          respiratory_issues: record.respiratory_issues,
          cardiovascular_issues: record.cardiovascular_issues,
          complications_notes: record.complications_notes ?? '',
          medications_given: record.medications_given ?? '',
          handover_given_to: record.handover_given_to ?? '',
          handover_notes: record.handover_notes ?? '',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [arrivalForm, dischargeForm, documentationForm, surgeryCase.case_number, surgeryCase.requesting_doctor]);

  useEffect(() => {
    void loadRecord(true);
  }, [loadRecord]);

  const refreshAll = useCallback(async () => {
    await loadRecord(false);
    await onCaseRefresh?.();
  }, [loadRecord, onCaseRefresh]);

  const mappedProcedureKey = surgeryCase.primary_procedure_tibabot_key || surgeryCase.ai_surgical_summary.post_op.procedure_key || '';
  const latestStoredPostOp = storedPostOpPlans[0] ?? null;
  const latestStoredPostOpData = latestStoredPostOp?.result_data as Record<string, unknown> | undefined;
  const latestSurgicalApgar = latestStoredPostOpData?.surgical_apgar as Record<string, unknown> | undefined;

  // Advisory links for post-op care plan
  const postOpResultId = latestStoredPostOp?.id;
  const { getLink, actionLink, hasOrders: postOpHasOrders } = useAdvisoryLinks(
    postOpResultId,
    'post_op_care_plan',
  );

  const latestSurgicalApgarScore =
    typeof latestSurgicalApgar?.score === 'number' ? latestSurgicalApgar.score : null;
  const latestSurgicalApgarRiskLevel =
    typeof latestSurgicalApgar?.risk_level === 'string' ? latestSurgicalApgar.risk_level : '';

  const chartData = useMemo(
    () => (pacuRecord?.vital_readings || []).map((vital) => ({
      time: new Date(vital.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      heartRate: vital.heart_rate ?? null,
      spo2: vital.spo2 ?? null,
      aldrete: vital.aldrete_score ?? null,
      pain: vital.pain_score ?? null,
    })),
    [pacuRecord]
  );

  const createArrival = async (values: z.infer<typeof pacuArrivalSchema>) => {
    try {
      await theatreApi.createPACURecord(surgeryCase.case_number, {
        arrival_time: toIsoOrUndefined(values.arrival_time),
        arriving_nurse: values.arriving_nurse,
        initial_aldrete_score: values.initial_aldrete_score,
        initial_pain_score: values.initial_pain_score,
      });
      toast({ title: 'PACU arrival recorded', description: 'Recovery monitoring can now continue in this workspace.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to create PACU record', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const addVital = async (values: z.infer<typeof pacuVitalSchema>) => {
    try {
      await theatreApi.addPACUVital(surgeryCase.case_number, {
        ...values,
        recorded_at: toIsoOrUndefined(values.recorded_at),
        temperature: values.temperature || undefined,
      });
      toast({ title: 'PACU vital saved', description: 'The recovery monitoring trend has been updated.' });
      vitalForm.reset({ ...values, notes: '' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save PACU vital', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveDocumentation = async (values: z.infer<typeof pacuDocumentationSchema>) => {
    try {
      await theatreApi.updatePACURecord(surgeryCase.case_number, values);
      toast({ title: 'PACU documentation saved', description: 'Recovery issues, medications, and handover notes were updated.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save PACU documentation', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const downloadSummary = async () => {
    try {
      const blob = await theatreApi.downloadPACUPdf(surgeryCase.case_number);
      downloadPDF(blob, `pacu-summary-${surgeryCase.case_number}`);
    } catch (error) {
      toast({ title: 'Unable to download PACU summary', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const dischargePatient = async (values: z.infer<typeof pacuDischargeSchema>) => {
    try {
      const documentationValues = documentationForm.getValues();
      const documentationResult = pacuDocumentationSchema.safeParse(documentationValues);
      if (!documentationResult.success) {
        const issue = documentationResult.error.issues[0];
        if (issue?.path[0]) {
          documentationForm.setError(issue.path[0] as keyof z.infer<typeof pacuDocumentationSchema>, {
            message: issue.message,
          });
        }
        toast({ title: 'PACU documentation incomplete', description: 'Resolve documentation issues before discharge.', variant: 'destructive' });
        return;
      }
      await theatreApi.updatePACURecord(surgeryCase.case_number, documentationResult.data);
      await theatreApi.dischargePACU(surgeryCase.case_number, {
        discharge_aldrete_score: values.discharge_aldrete_score,
        discharge_destination: values.discharge_destination,
        discharge_notes: values.discharge_notes,
        handover_given_to: documentationResult.data.handover_given_to,
        handover_notes: documentationResult.data.handover_notes,
      });
      toast({ title: 'PACU discharge completed', description: 'Recovery discharge details were recorded.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to complete PACU discharge', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const generatePostOpCarePlan = async () => {
    if (!mappedProcedureKey) {
      toast({
        title: 'AI care plan unavailable',
        description: 'This procedure does not have an AI mapping configured.',
      });
      return;
    }

    try {
      setGeneratingCarePlan(true);
      await aiApi.generateSurgicalPostOpCarePlan({
        surgery_case_id: surgeryCase.id,
        procedure_key: mappedProcedureKey,
        estimated_blood_loss_ml: estimatedBloodLossMl === '' ? undefined : Number(estimatedBloodLossMl),
        lowest_heart_rate: lowestHeartRate === '' ? undefined : Number(lowestHeartRate),
        lowest_map: lowestMap === '' ? undefined : Number(lowestMap),
        findings: postOpFindings || undefined,
        caprini_score: capriniScore === '' ? undefined : Number(capriniScore),
      });
      toast({ title: 'Surgical AI advisory complete', description: 'Post-op care plan and recovery guidance are now available below.' });
      await refreshAll();
      setFreshInsight(true);
      setTimeout(() => setFreshInsight(false), 4000);
    } catch (error) {
      toast({ title: 'Unable to generate care plan', description: getApiErrorMessage(error), variant: 'destructive' });
    } finally {
      setGeneratingCarePlan(false);
    }
  };

  if (loading) {
    return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Post-Operative & PACU Workflow
            <HelpPopover content="Manage post-operative care: document PACU arrival, monitor recovery vitals (Aldrete score, pain, sedation), handle complications, and complete discharge from recovery." />
          </h2>
        </div>
        <div className="flex gap-2">
          {pacuRecord ? (
            <Button variant="outline" size="sm" onClick={() => void downloadSummary()}>
              <Download className="mr-2 h-4 w-4" />
              PACU PDF
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}</Button>
        </div>
      </div>

      <Card className={`relative overflow-hidden transition-all duration-700 ${
        freshInsight
          ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
          : latestStoredPostOp
            ? 'border-emerald-500/40'
            : ''
      }`}
        style={freshInsight ? {
          animation: 'border-glow 1.5s ease-in-out infinite',
        } : undefined}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
          aria-hidden="true"
        />
        <CardHeader className="relative pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Surgical AI Post-Op Advisory
            <HelpPopover content="AI-powered post-operative care recommendations. Evaluates recovery risks and suggests monitoring protocols specific to the procedure performed." />
            {latestStoredPostOp ? <Sparkles className="h-4 w-4 text-teal-400" /> : null}
            <Badge variant={surgeryCase.ai_surgical_summary.post_op.has_result ? 'success' : 'outline'} size="sm" className="ml-auto w-fit">
              {surgeryCase.ai_surgical_summary.post_op.has_result ? 'Result available' : 'Not run'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {!mappedProcedureKey ? (
            <p className="text-sm text-muted-foreground">AI assessment is not available for this procedure.</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-1">
              <Label>AI procedure key</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">{mappedProcedureKey || 'Not mapped'}</div>
            </div>
            <div>
              <Label>Blood loss (mL)</Label>
              <Input type="number" min={0} value={estimatedBloodLossMl} onChange={(event) => setEstimatedBloodLossMl(event.target.value ? Number(event.target.value) : '')} />
            </div>
            <div>
              <Label>Lowest HR</Label>
              <Input type="number" min={0} value={lowestHeartRate} onChange={(event) => setLowestHeartRate(event.target.value ? Number(event.target.value) : '')} />
            </div>
            <div>
              <Label>Lowest MAP</Label>
              <Input type="number" min={0} value={lowestMap} onChange={(event) => setLowestMap(event.target.value ? Number(event.target.value) : '')} />
            </div>
            <div>
              <Label>Caprini score</Label>
              <Input type="number" min={0} value={capriniScore} onChange={(event) => setCapriniScore(event.target.value ? Number(event.target.value) : '')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Operative findings for the care plan prompt</Label>
            <Textarea rows={3} value={postOpFindings} onChange={(event) => setPostOpFindings(event.target.value)} placeholder="Key findings, drains, stoma, or intra-op concerns" />
          </div>

          <Button type="button" onClick={() => void generatePostOpCarePlan()} disabled={generatingCarePlan || !mappedProcedureKey || postOpHasOrders}>
            {generatingCarePlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
            {latestStoredPostOp ? 'Ask again' : 'Ask TibaBot®'}
          </Button>

          {latestStoredPostOp ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Surgical Apgar</p>
                  <p className="mt-1 font-medium">{latestStoredPostOp.surgical_apgar_score ?? latestSurgicalApgarScore ?? 'Unavailable'}</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Risk level</p>
                  <p className="mt-1 font-medium">{latestStoredPostOp.risk_level || latestSurgicalApgarRiskLevel || 'Unavailable'}</p>
                </div>
                <div className="rounded-lg border p-3 text-sm xl:col-span-2">
                  <p className="text-muted-foreground">Monitoring</p>
                  <p className="mt-1 font-medium">{String(latestStoredPostOpData?.monitoring || 'No monitoring guidance recorded')}</p>
                </div>
              </div>

              {(() => {
                const ALL_POST_OP_SECTIONS = [
                  'medications', 'activity', 'nutrition', 'wound-care',
                  'complications', 'discharge', 'follow-up',
                ];
                const allExpanded = postOpOpenSections.length === ALL_POST_OP_SECTIONS.length;
                const followUp = latestStoredPostOpData?.follow_up as Record<string, unknown> | undefined;
                return (
                  <>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        onClick={() => setPostOpOpenSections(allExpanded ? [] : ALL_POST_OP_SECTIONS)}
                      >
                        {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
                        {allExpanded ? 'Collapse all' : 'Expand all'}
                      </Button>
                    </div>
                    <Accordion type="multiple" className="w-full" value={postOpOpenSections} onValueChange={setPostOpOpenSections}>
                      {/* Medications */}
                      <AccordionItem value="medications">
                        <AccordionTrigger className="text-sm font-medium">
                          <span className="flex items-center gap-2">
                            Medications
                            {Array.isArray(latestStoredPostOpData?.medications) && (latestStoredPostOpData.medications as string[]).length > 0 ? (
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                {(latestStoredPostOpData.medications as string[]).length}
                              </Badge>
                            ) : null}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          {Array.isArray(latestStoredPostOpData?.medications) && (latestStoredPostOpData.medications as string[]).length > 0 ? (
                            <ul className="ml-4 list-disc space-y-1 text-sm">
                              {(latestStoredPostOpData.medications as string[]).map((med, i) => (
                                <li key={i} className="flex items-center gap-1">
                                  <span className="flex-1">{med}</span>
                                  <SuggestionActionChip
                                    link={getLink('medications', i)}
                                    onAction={actionLink}
                                    orderable
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">No medication guidance recorded</p>
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Activity */}
                      {latestStoredPostOpData?.activity ? (
                        <AccordionItem value="activity">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Activity
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">1</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm">{String(latestStoredPostOpData.activity)}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}

                      {/* Nutrition */}
                      {latestStoredPostOpData?.nutrition ? (
                        <AccordionItem value="nutrition">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Nutrition
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">1</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm">{String(latestStoredPostOpData.nutrition)}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}

                      {/* Wound Care */}
                      {latestStoredPostOpData?.wound_care ? (
                        <AccordionItem value="wound-care">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Wound Care
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">1</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm">{String(latestStoredPostOpData.wound_care)}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}

                      {/* Complications to Watch */}
                      {Array.isArray(latestStoredPostOpData?.complications_to_watch) && (latestStoredPostOpData.complications_to_watch as Record<string, unknown>[]).length > 0 ? (
                        <AccordionItem value="complications">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Complications to Watch
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                {(latestStoredPostOpData.complications_to_watch as unknown[]).length}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 text-sm">
                              {(latestStoredPostOpData.complications_to_watch as Record<string, unknown>[]).map((comp, i) => (
                                <div key={i} className="rounded-md border p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium">{comp.complication as string}</p>
                                    <span className="flex items-center gap-1.5">
                                      <SuggestionActionChip
                                        link={getLink('complications_to_watch', i)}
                                        onAction={actionLink}
                                      />
                                      {comp.incidence ? <Badge variant="secondary" className="shrink-0 text-xs">{comp.incidence as string}</Badge> : null}
                                    </span>
                                  </div>
                                  {comp.signs ? <p className="mt-1 text-muted-foreground"><span className="font-medium">Signs:</span> {comp.signs as string}</p> : null}
                                  {comp.action ? <p className="mt-0.5 text-muted-foreground"><span className="font-medium">Action:</span> {comp.action as string}</p> : null}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}

                      {/* Discharge Criteria */}
                      {Array.isArray(latestStoredPostOpData?.discharge_criteria) && (latestStoredPostOpData.discharge_criteria as string[]).length > 0 ? (
                        <AccordionItem value="discharge">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Discharge Criteria
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                {(latestStoredPostOpData.discharge_criteria as string[]).length}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="ml-4 list-disc space-y-1 text-sm">
                              {(latestStoredPostOpData.discharge_criteria as string[]).map((item, i) => (
                                <li key={i} className="flex items-center gap-1">
                                  <span className="flex-1">{item}</span>
                                  <SuggestionActionChip
                                    link={getLink('discharge_criteria', i)}
                                    onAction={actionLink}
                                  />
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}

                      {/* Follow-up */}
                      {followUp ? (
                        <AccordionItem value="follow-up">
                          <AccordionTrigger className="text-sm font-medium">
                            <span className="flex items-center gap-2">
                              Follow-up
                              <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                {(followUp.appointment ? 1 : 0) + (followUp.investigations ? 1 : 0) + (Array.isArray(followUp.red_flags) ? (followUp.red_flags as unknown[]).length : 0)}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 text-sm">
                              {followUp.appointment ? (
                                <div>
                                  <p className="font-medium text-muted-foreground">Appointment</p>
                                  <p>{followUp.appointment as string}</p>
                                </div>
                              ) : null}
                              {followUp.investigations ? (
                                <div>
                                  <p className="font-medium text-muted-foreground">Investigations</p>
                                  <p>{followUp.investigations as string}</p>
                                </div>
                              ) : null}
                              {Array.isArray(followUp.red_flags) && (followUp.red_flags as string[]).length > 0 ? (
                                <div>
                                  <p className="font-medium text-destructive">Red Flags — Advise patient</p>
                                  <ul className="ml-4 mt-1 list-disc space-y-1">
                                    {(followUp.red_flags as string[]).map((item, i) => (
                                      <li key={i} className="flex items-center gap-1">
                                        <span className="flex-1">{item}</span>
                                        <SuggestionActionChip
                                          link={getLink('follow_up.red_flags', i)}
                                          onAction={actionLink}
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ) : null}
                    </Accordion>
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No advisory post-operative care plan has been generated for this case yet.</p>
          )}
        </CardContent>
      </Card>

      {!pacuRecord ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MoveRight className="h-4 w-4" />PACU Arrival<HelpPopover content="Document patient arrival in the Post-Anesthesia Care Unit. Records arrival time, receiving nurse, initial Aldrete score, and handover details from the anesthesia team." /></CardTitle></CardHeader>
          <CardContent>
            {surgeryCase.status !== 'IN_PACU' ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Case not yet in PACU</AlertTitle>
                <AlertDescription>Transition the case to PACU from the case workflow before creating the recovery record.</AlertDescription>
              </Alert>
            ) : null}
            <Form {...arrivalForm}>
              <form className="space-y-4" onSubmit={arrivalForm.handleSubmit(createArrival)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={arrivalForm.control} name="arrival_time" render={({ field }) => <FormItem><FormLabel>Arrival time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="arriving_nurse" render={({ field }) => <FormItem><FormLabel>Receiving nurse user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="initial_aldrete_score" render={({ field }) => <FormItem><FormLabel>Initial Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={arrivalForm.control} name="initial_pain_score" render={({ field }) => <FormItem><FormLabel>Initial pain score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <Button type="submit">Create PACU record</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardHeader className="relative pb-3"><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" />Recovery Status<HelpPopover content="At-a-glance recovery metrics: Aldrete scores, vital count, complication flags, and discharge readiness." /></CardTitle></CardHeader>
              <CardContent className="relative space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Arrival documented</span><Badge variant="success" size="sm" className="w-fit">{new Date(pacuRecord.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Initial Aldrete</span><Badge variant={(pacuRecord.initial_aldrete_score ?? 0) >= 8 ? 'success' : 'warning'} size="sm" className="w-fit">{pacuRecord.initial_aldrete_score ?? 'N/A'}/10</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Latest Aldrete</span><Badge variant={(pacuRecord.latest_aldrete_score ?? 0) >= 9 ? 'success' : 'warning'} size="sm" className="w-fit">{pacuRecord.latest_aldrete_score ?? 'N/A'}/10</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Vitals recorded</span><Badge variant={pacuRecord.vital_readings.length > 0 ? 'info' : 'outline'} size="sm" className="w-fit">{pacuRecord.vital_readings.length}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Complication flags</span><Badge variant={pacuRecord.active_complication_count > 0 ? 'warning' : 'success'} size="sm" className="w-fit">{pacuRecord.active_complication_count}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Discharge</span><Badge variant={pacuRecord.discharge_time ? 'success' : pacuRecord.ready_for_discharge ? 'info' : 'warning'} size="sm" className="w-fit">{pacuRecord.discharge_time ? 'Completed' : pacuRecord.ready_for_discharge ? 'Ready' : 'Pending'}</Badge></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Siren className="h-4 w-4" />PACU Monitoring Trend<HelpPopover content="Time-series chart of recovery vitals: heart rate, SpO2, Aldrete score, and pain score. Helps identify deterioration early." /></CardTitle></CardHeader>
              <CardContent>
                {pacuRecord.vital_readings.length === 0 ? (
                  <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>No PACU vitals yet</AlertTitle><AlertDescription>Add the first recovery observation below.</AlertDescription></Alert>
                ) : (
                  <div className="h-64 rounded-lg border p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={false} name="HR" />
                        <Line type="monotone" dataKey="spo2" stroke="#0ea5e9" strokeWidth={2} dot={false} name="SpO2" />
                        <Line type="monotone" dataKey="aldrete" stroke="#14b8a6" strokeWidth={2} dot={false} name="Aldrete" />
                        <Line type="monotone" dataKey="pain" stroke="#f59e0b" strokeWidth={2} dot={false} name="Pain" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {pacuRecord.discharge_time ? null : pacuRecord.discharge_blockers.length > 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Discharge requirements still pending</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {pacuRecord.discharge_blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Ready for PACU discharge</AlertTitle>
              <AlertDescription>The current recovery observations satisfy the discharge checklist. Complete the discharge form when transfer is confirmed.</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" />Add PACU Vital<HelpPopover content="Record a new recovery observation: heart rate, SpO2, blood pressure, Aldrete score (0-10), pain score, sedation level, and temperature." /></CardTitle></CardHeader>
              <CardContent>
                <Form {...vitalForm}>
                  <form className="space-y-4" onSubmit={vitalForm.handleSubmit(addVital)}>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <FormField control={vitalForm.control} name="recorded_at" render={({ field }) => <FormItem><FormLabel>Recorded at</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="recorded_by" render={({ field }) => <FormItem><FormLabel>Recorded by user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="heart_rate" render={({ field }) => <FormItem><FormLabel>HR</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="spo2" render={({ field }) => <FormItem><FormLabel>SpO2</FormLabel><FormControl><Input type="number" step="0.1" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="systolic_bp" render={({ field }) => <FormItem><FormLabel>Systolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="diastolic_bp" render={({ field }) => <FormItem><FormLabel>Diastolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="aldrete_score" render={({ field }) => <FormItem><FormLabel>Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="pain_score" render={({ field }) => <FormItem><FormLabel>Pain score</FormLabel><FormControl><Input type="number" min={0} max={10} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={vitalForm.control} name="sedation_level" render={({ field }) => <FormItem><FormLabel>Sedation level</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={vitalForm.control} name="temperature" render={({ field }) => <FormItem><FormLabel>Temperature</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    </div>
                    <FormField control={vitalForm.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <Button type="submit">Add PACU vital</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Recovery Documentation & Handover<HelpPopover content="Document post-operative complications (nausea, shivering, respiratory/cardiovascular issues), medications given in PACU, and the nursing handover for ward transfer." /></CardTitle></CardHeader>
              <CardContent>
                <Form {...documentationForm}>
                  <form className="space-y-4" onSubmit={documentationForm.handleSubmit(saveDocumentation)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['nausea_vomiting', 'Nausea / vomiting'],
                        ['shivering', 'Shivering'],
                        ['respiratory_issues', 'Respiratory issues'],
                        ['cardiovascular_issues', 'Cardiovascular issues'],
                      ].map(([name, label]) => (
                        <FormField key={name} control={documentationForm.control} name={name as keyof z.infer<typeof pacuDocumentationSchema>} render={({ field }) => <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3"><FormControl><Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">{label}</FormLabel></FormItem>} />
                      ))}
                    </div>
                    <FormField control={documentationForm.control} name="complications_notes" render={({ field }) => <FormItem><FormLabel>Complication notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={documentationForm.control} name="medications_given" render={({ field }) => <FormItem><FormLabel>Medications given in PACU</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={documentationForm.control} name="handover_given_to" render={({ field }) => <FormItem><FormLabel>Handover recipient</FormLabel><FormControl><Input {...field} placeholder="Ward nurse, ICU nurse, or caregiver" /></FormControl><FormMessage /></FormItem>} />
                      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Handover status</p>
                        <p className="mt-1">{pacuRecord.handover_completed_at ? `Completed ${new Date(pacuRecord.handover_completed_at).toLocaleString()}` : 'Not yet documented'}</p>
                      </div>
                    </div>
                    <FormField control={documentationForm.control} name="handover_notes" render={({ field }) => <FormItem><FormLabel>Handover notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <Button type="submit" variant="outline">Save PACU documentation</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MoveRight className="h-4 w-4" />Discharge Workflow<HelpPopover content="Complete PACU discharge: record final Aldrete score, select discharge destination (ward, ICU, day case), and add discharge notes. Blocked until discharge criteria are met." /></CardTitle></CardHeader>
            <CardContent>
              {pacuRecord.discharge_time ? (
                <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Discharge already completed</AlertTitle><AlertDescription>{pacuRecord.discharge_destination ? `Destination: ${pacuRecord.discharge_destination.replace(/_/g, ' ')}` : 'Recovery discharge has already been documented.'}</AlertDescription></Alert>
              ) : (
                <Form {...dischargeForm}>
                  <form className="space-y-4" onSubmit={dischargeForm.handleSubmit(dischargePatient)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={dischargeForm.control} name="discharge_aldrete_score" render={({ field }) => <FormItem><FormLabel>Discharge Aldrete score</FormLabel><FormControl><Input type="number" min={0} max={10} {...field} /></FormControl><FormMessage /></FormItem>} />
                      <FormField control={dischargeForm.control} name="discharge_destination" render={({ field }) => <FormItem><FormLabel>Destination</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="WARD">Ward</SelectItem><SelectItem value="ICU">ICU</SelectItem><SelectItem value="DAY_CASE_DISCHARGE">Day Case Discharge</SelectItem><SelectItem value="EXTENDED_OBSERVATION">Extended Observation</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
                    </div>
                    <FormField control={dischargeForm.control} name="discharge_notes" render={({ field }) => <FormItem><FormLabel>Discharge notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <Button type="submit">Complete PACU discharge</Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
          {pacuRecord.discharge_time && pacuRecord.handover_given_to ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Handover completed to <span className="font-medium text-foreground">{pacuRecord.handover_given_to}</span> with destination <span className="font-medium text-foreground">{pacuRecord.discharge_destination.replace(/_/g, ' ')}</span>.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
