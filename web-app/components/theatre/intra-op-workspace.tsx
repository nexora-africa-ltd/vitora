'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  Package,
  Play,
  Plus,
  ShieldCheck,
  Syringe,
  Trash2,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { aiApi } from '@/lib/api/ai';
import { getApiErrorMessage } from '@/lib/api/client';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { theatreApi } from '@/lib/api/theatre';
import { downloadPDF } from '@/lib/export-utils';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useToast } from '@/lib/hooks/use-toast';
import type { StoredSurgicalChecklistSessionResult } from '@/lib/types/ai';
import { formatCurrency } from '@/lib/utils/format';
import type { Drug } from '@/lib/types/pharmacy';
import type {
  AnesthesiaRecord,
  IntraOpVital,
  OperativeNote,
  SurgeryCaseDetail,
  TheatreConsumable,
  WHOChecklist,
} from '@/lib/types/theatre';

const timeOutSchema = z.object({
  team_members_introduced: z.boolean().default(false),
  patient_name_confirmed: z.boolean().default(false),
  procedure_confirmed: z.boolean().default(false),
  site_confirmed: z.boolean().default(false),
  surgeon_critical_steps_discussed: z.boolean().default(false),
  anesthesia_concerns_discussed: z.boolean().default(false),
  nursing_concerns_discussed: z.boolean().default(false),
  prophylactic_antibiotics_given: z.boolean().default(false),
  antibiotics_timing_within_60_min: z.boolean().default(false),
  antibiotics_not_applicable: z.boolean().default(false),
  essential_imaging_displayed: z.boolean().default(false),
  imaging_not_applicable: z.boolean().default(false),
});

const signOutSchema = z.object({
  procedure_name_recorded: z.boolean().default(false),
  instrument_count_correct: z.boolean().default(false),
  sponge_count_correct: z.boolean().default(false),
  needle_count_correct: z.boolean().default(false),
  specimens_labeled: z.boolean().default(false),
  specimen_count: z.coerce.number().min(0).default(0),
  equipment_problems_noted: z.boolean().default(false),
  equipment_problems_description: z.string().default(''),
  key_recovery_concerns: z.string().default(''),
});

const anesthesiaIntraOpSchema = z.object({
  induction_time: z.string().default(''),
  intubation_time: z.string().default(''),
  extubation_time: z.string().default(''),
  airway_device: z.string().default(''),
  tube_size: z.string().default(''),
  intubation_attempts: z.coerce.number().min(0).default(0),
  intubation_difficulty: z.string().default(''),
  anesthesia_technique: z.string().default(''),
  induction_agents: z.string().default(''),
  maintenance_agents: z.string().default(''),
  muscle_relaxants: z.string().default(''),
  reversal_agents: z.string().default(''),
  crystalloid_volume: z.coerce.number().min(0).default(0),
  colloid_volume: z.coerce.number().min(0).default(0),
  blood_products: z.string().default(''),
  estimated_blood_loss: z.coerce.number().min(0).default(0),
  urine_output: z.coerce.number().min(0).default(0),
  intraop_complications: z.string().default(''),
  pacu_handover_notes: z.string().default(''),
  pain_management_plan: z.string().default(''),
  post_op_nausea_plan: z.string().default(''),
  other_post_op_orders: z.string().default(''),
});

const intraOpVitalSchema = z.object({
  recorded_at: z.string().min(1, 'Recording time is required'),
  recorded_by: z.coerce.number().int().positive('Recorder user ID is required'),
  systolic_bp: z.coerce.number().nullable().optional(),
  diastolic_bp: z.coerce.number().nullable().optional(),
  heart_rate: z.coerce.number().nullable().optional(),
  respiratory_rate: z.coerce.number().nullable().optional(),
  spo2: z.coerce.number().nullable().optional(),
  etco2: z.coerce.number().nullable().optional(),
  fio2: z.coerce.number().nullable().optional(),
  tidal_volume: z.coerce.number().nullable().optional(),
  peak_pressure: z.coerce.number().nullable().optional(),
  temperature: z.string().default(''),
  notes: z.string().default(''),
});

const operativeNoteSchema = z.object({
  dictated_by: z.coerce.number().int().positive('Dictating clinician ID is required'),
  incision_time: z.string().default(''),
  closure_time: z.string().default(''),
  pre_operative_diagnosis: z.string().min(1, 'Pre-operative diagnosis is required'),
  post_operative_diagnosis: z.string().min(1, 'Post-operative diagnosis is required'),
  procedure_performed: z.string().min(1, 'Procedure performed is required'),
  findings: z.string().min(1, 'Findings are required'),
  technique_description: z.string().min(1, 'Technique description is required'),
  implants_used: z.string().default(''),
  drains_placed: z.string().default(''),
  sutures_used: z.string().default(''),
  estimated_blood_loss: z.coerce.number().min(0).default(0),
  specimens_sent: z.string().default(''),
  frozen_section: z.boolean().default(false),
  frozen_section_result: z.string().default(''),
  intraoperative_complications: z.string().default(''),
  post_operative_plan: z.string().default(''),
});

const consumableSchema = z.object({
  item: z.coerce.number().int().positive('Consumable item is required'),
  quantity_used: z.coerce.number().int().positive('Quantity is required'),
  unit_cost: z.coerce.number().min(0).default(0),
  lot_number: z.string().default(''),
  expiry_date: z.string().default(''),
  is_implant: z.boolean().default(false),
  implant_serial_number: z.string().default(''),
});

type TimeOutValues = z.infer<typeof timeOutSchema>;
type SignOutValues = z.infer<typeof signOutSchema>;
type AnesthesiaIntraOpValues = z.infer<typeof anesthesiaIntraOpSchema>;
type IntraOpVitalValues = z.infer<typeof intraOpVitalSchema>;
type OperativeNoteValues = z.infer<typeof operativeNoteSchema>;
type ConsumableValues = z.infer<typeof consumableSchema>;

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

export function IntraOpWorkspace({
  surgeryCase,
  onCaseRefresh,
}: {
  surgeryCase: SurgeryCaseDetail;
  onCaseRefresh?: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checklist, setChecklist] = useState<WHOChecklist | null>(null);
  const [anesthesiaRecord, setAnesthesiaRecord] = useState<AnesthesiaRecord | null>(null);
  const [vitals, setVitals] = useState<IntraOpVital[]>([]);
  const [operativeNote, setOperativeNote] = useState<OperativeNote | null>(null);
  const [consumables, setConsumables] = useState<TheatreConsumable[]>([]);
  const [storedChecklistSessions, setStoredChecklistSessions] = useState<StoredSurgicalChecklistSessionResult[]>([]);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [liveChecklistStatus, setLiveChecklistStatus] = useState<Record<string, unknown> | null>(null);
  const [drugSearch, setDrugSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [removingConsumableId, setRemovingConsumableId] = useState<number | null>(null);
  const debouncedDrugSearch = useDebounce(drugSearch, 300);

  const { data: drugResults = [], isLoading: drugsLoading } = useQuery({
    queryKey: ['theatre-consumable-drugs', debouncedDrugSearch],
    queryFn: async () => {
      if (!debouncedDrugSearch || debouncedDrugSearch.length < 2) {
        return [] as Drug[];
      }
      return pharmacyApi.searchDrugs(debouncedDrugSearch);
    },
    enabled: debouncedDrugSearch.length >= 2,
    staleTime: 30000,
  });

  const timeOutForm = useForm<TimeOutValues>({ resolver: zodResolver(timeOutSchema), defaultValues: timeOutSchema.parse({}) });
  const signOutForm = useForm<SignOutValues>({ resolver: zodResolver(signOutSchema), defaultValues: signOutSchema.parse({}) });
  const anesthesiaForm = useForm<AnesthesiaIntraOpValues>({ resolver: zodResolver(anesthesiaIntraOpSchema), defaultValues: anesthesiaIntraOpSchema.parse({}) });
  const vitalForm = useForm<IntraOpVitalValues>({
    resolver: zodResolver(intraOpVitalSchema),
    defaultValues: {
      recorded_at: toDateTimeLocalValue(new Date().toISOString()),
      recorded_by: surgeryCase.requesting_doctor,
      systolic_bp: undefined,
      diastolic_bp: undefined,
      heart_rate: undefined,
      respiratory_rate: undefined,
      spo2: undefined,
      etco2: undefined,
      fio2: undefined,
      tidal_volume: undefined,
      peak_pressure: undefined,
      temperature: '',
      notes: '',
    },
  });
  const noteForm = useForm<OperativeNoteValues>({
    resolver: zodResolver(operativeNoteSchema),
    defaultValues: {
      dictated_by: surgeryCase.requesting_doctor,
      incision_time: '',
      closure_time: '',
      pre_operative_diagnosis: surgeryCase.diagnosis || '',
      post_operative_diagnosis: surgeryCase.diagnosis || '',
      procedure_performed: surgeryCase.primary_procedure_name,
      findings: '',
      technique_description: '',
      implants_used: '',
      drains_placed: '',
      sutures_used: '',
      estimated_blood_loss: 0,
      specimens_sent: '',
      frozen_section: false,
      frozen_section_result: '',
      intraoperative_complications: '',
      post_operative_plan: '',
    },
  });
  const consumableForm = useForm<ConsumableValues>({ resolver: zodResolver(consumableSchema), defaultValues: { item: 0, quantity_used: 1, unit_cost: 0, lot_number: '', expiry_date: '', is_implant: false, implant_serial_number: '' } });

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); else setRefreshing(true);
    try {
      const [who, anesthesia, intraOpVitals, note, caseConsumables, checklistSessions] = await Promise.all([
        theatreApi.getWHOChecklist(surgeryCase.case_number).catch(() => null),
        theatreApi.getAnesthesiaRecord(surgeryCase.case_number).catch(() => null),
        theatreApi.listIntraOpVitals(surgeryCase.case_number).catch(() => []),
        theatreApi.getOperativeNote(surgeryCase.case_number).catch(() => null),
        theatreApi.listConsumables(surgeryCase.case_number).catch(() => []),
        aiApi.getStoredSurgicalChecklistSessions({ surgery_case_id: surgeryCase.id }).catch(() => []),
      ]);

      setChecklist(who);
      setAnesthesiaRecord(anesthesia);
      setVitals(intraOpVitals);
      setOperativeNote(note);
      setConsumables(caseConsumables);
      setStoredChecklistSessions(checklistSessions);

      timeOutForm.reset({
        team_members_introduced: who?.team_members_introduced ?? false,
        patient_name_confirmed: who?.patient_name_confirmed ?? false,
        procedure_confirmed: who?.procedure_confirmed ?? false,
        site_confirmed: who?.site_confirmed ?? false,
        surgeon_critical_steps_discussed: who?.surgeon_critical_steps_discussed ?? false,
        anesthesia_concerns_discussed: who?.anesthesia_concerns_discussed ?? false,
        nursing_concerns_discussed: who?.nursing_concerns_discussed ?? false,
        prophylactic_antibiotics_given: who?.prophylactic_antibiotics_given ?? false,
        antibiotics_timing_within_60_min: who?.antibiotics_timing_within_60_min ?? false,
        antibiotics_not_applicable: who?.antibiotics_not_applicable ?? false,
        essential_imaging_displayed: who?.essential_imaging_displayed ?? false,
        imaging_not_applicable: who?.imaging_not_applicable ?? false,
      });

      signOutForm.reset({
        procedure_name_recorded: who?.procedure_name_recorded ?? false,
        instrument_count_correct: who?.instrument_count_correct ?? false,
        sponge_count_correct: who?.sponge_count_correct ?? false,
        needle_count_correct: who?.needle_count_correct ?? false,
        specimens_labeled: who?.specimens_labeled ?? false,
        specimen_count: who?.specimen_count ?? 0,
        equipment_problems_noted: who?.equipment_problems_noted ?? false,
        equipment_problems_description: who?.equipment_problems_description ?? '',
        key_recovery_concerns: who?.key_recovery_concerns ?? '',
      });

      anesthesiaForm.reset({
        induction_time: toDateTimeLocalValue(anesthesia?.induction_time),
        intubation_time: toDateTimeLocalValue(anesthesia?.intubation_time),
        extubation_time: toDateTimeLocalValue(anesthesia?.extubation_time),
        airway_device: anesthesia?.airway_device ?? '',
        tube_size: anesthesia?.tube_size ?? '',
        intubation_attempts: anesthesia?.intubation_attempts ?? 0,
        intubation_difficulty: anesthesia?.intubation_difficulty ?? '',
        anesthesia_technique: anesthesia?.anesthesia_technique ?? '',
        induction_agents: anesthesia?.induction_agents ?? '',
        maintenance_agents: anesthesia?.maintenance_agents ?? '',
        muscle_relaxants: anesthesia?.muscle_relaxants ?? '',
        reversal_agents: anesthesia?.reversal_agents ?? '',
        crystalloid_volume: anesthesia?.crystalloid_volume ?? 0,
        colloid_volume: anesthesia?.colloid_volume ?? 0,
        blood_products: anesthesia?.blood_products ?? '',
        estimated_blood_loss: anesthesia?.estimated_blood_loss ?? 0,
        urine_output: anesthesia?.urine_output ?? 0,
        intraop_complications: anesthesia?.intraop_complications ?? '',
        pacu_handover_notes: anesthesia?.pacu_handover_notes ?? '',
        pain_management_plan: anesthesia?.pain_management_plan ?? '',
        post_op_nausea_plan: anesthesia?.post_op_nausea_plan ?? '',
        other_post_op_orders: anesthesia?.other_post_op_orders ?? '',
      });

      noteForm.reset({
        dictated_by: note?.dictated_by ?? surgeryCase.requesting_doctor,
        incision_time: toDateTimeLocalValue(note?.incision_time),
        closure_time: toDateTimeLocalValue(note?.closure_time),
        pre_operative_diagnosis: note?.pre_operative_diagnosis ?? surgeryCase.diagnosis,
        post_operative_diagnosis: note?.post_operative_diagnosis ?? surgeryCase.diagnosis,
        procedure_performed: note?.procedure_performed ?? surgeryCase.primary_procedure_name,
        findings: note?.findings ?? '',
        technique_description: note?.technique_description ?? '',
        implants_used: note?.implants_used ?? '',
        drains_placed: note?.drains_placed ?? '',
        sutures_used: note?.sutures_used ?? '',
        estimated_blood_loss: note?.estimated_blood_loss ?? 0,
        specimens_sent: note?.specimens_sent ?? '',
        frozen_section: note?.frozen_section ?? false,
        frozen_section_result: note?.frozen_section_result ?? '',
        intraoperative_complications: note?.intraoperative_complications ?? '',
        post_operative_plan: note?.post_operative_plan ?? '',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [anesthesiaForm, noteForm, signOutForm, surgeryCase, timeOutForm]);

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  const refreshAll = useCallback(async () => {
    await loadWorkspace(false);
    await onCaseRefresh?.();
  }, [loadWorkspace, onCaseRefresh]);

  const mappedProcedureKey = surgeryCase.primary_procedure_tibabot_key || '';
  const latestStoredChecklist = storedChecklistSessions[0] ?? null;
  const latestStoredChecklistData = latestStoredChecklist?.result_data as Record<string, unknown> | undefined;
  const storedSession = latestStoredChecklistData?.session as Record<string, unknown> | undefined;
  const storedProgress = latestStoredChecklistData?.progress as Record<string, unknown> | undefined;
  const liveSession = (liveChecklistStatus?.session as Record<string, unknown> | undefined) ?? storedSession;
  const liveProgress = (liveChecklistStatus?.progress as Record<string, unknown> | undefined) ?? storedProgress;
  const checklistItems = Array.isArray(liveSession?.items) ? (liveSession.items as string[]) : [];
  const currentChecklistSessionId = latestStoredChecklist?.tibabot_session_id || surgeryCase.ai_surgical_summary.checklist.tibabot_session_id;
  const checklistPercentComplete =
    typeof liveProgress?.percent_complete === 'number'
      ? liveProgress.percent_complete
      : latestStoredChecklist?.percent_complete ?? surgeryCase.ai_surgical_summary.checklist.percent_complete ?? 0;

  const chartData = useMemo(
    () => vitals.map((vital) => ({
      time: new Date(vital.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      heartRate: vital.heart_rate ?? null,
      spo2: vital.spo2 ?? null,
      etco2: vital.etco2 ?? null,
    })),
    [vitals]
  );

  const saveTimeOut = async (values: TimeOutValues) => {
    try {
      await theatreApi.completeTimeOut(surgeryCase.case_number, values);
      toast({ title: 'WHO Time-Out saved', description: 'The intra-operative safety pause has been recorded.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save Time-Out', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveSignOut = async (values: SignOutValues) => {
    try {
      await theatreApi.completeSignOut(surgeryCase.case_number, values);
      toast({ title: 'WHO Sign-Out saved', description: 'Counts and recovery concerns have been recorded.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save Sign-Out', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveAnesthesia = async (values: AnesthesiaIntraOpValues) => {
    try {
      await theatreApi.updateAnesthesiaRecord(surgeryCase.case_number, {
        induction_time: toIsoOrUndefined(values.induction_time),
        intubation_time: toIsoOrUndefined(values.intubation_time),
        extubation_time: toIsoOrUndefined(values.extubation_time),
        airway_device: values.airway_device,
        tube_size: values.tube_size,
        intubation_attempts: values.intubation_attempts,
        intubation_difficulty: values.intubation_difficulty,
        anesthesia_technique: values.anesthesia_technique,
        induction_agents: values.induction_agents,
        maintenance_agents: values.maintenance_agents,
        muscle_relaxants: values.muscle_relaxants,
        reversal_agents: values.reversal_agents,
        crystalloid_volume: values.crystalloid_volume,
        colloid_volume: values.colloid_volume,
        blood_products: values.blood_products,
        estimated_blood_loss: values.estimated_blood_loss,
        urine_output: values.urine_output,
        intraop_complications: values.intraop_complications,
        pacu_handover_notes: values.pacu_handover_notes,
        pain_management_plan: values.pain_management_plan,
        post_op_nausea_plan: values.post_op_nausea_plan,
        other_post_op_orders: values.other_post_op_orders,
      });
      toast({ title: 'Anesthesia record updated', description: 'Intra-operative anesthesia details were saved.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to update anesthesia record', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveVital = async (values: IntraOpVitalValues) => {
    try {
      await theatreApi.addIntraOpVital(surgeryCase.case_number, {
        ...values,
        recorded_at: toIsoOrUndefined(values.recorded_at),
        temperature: values.temperature || undefined,
      });
      toast({ title: 'Intra-op vital saved', description: 'The anesthesia trend chart has been updated.' });
      vitalForm.reset({ ...values, notes: '' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save vital', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveOperativeNote = async (values: OperativeNoteValues) => {
    const payload = {
      ...values,
      incision_time: toIsoOrUndefined(values.incision_time),
      closure_time: toIsoOrUndefined(values.closure_time),
    };
    try {
      if (operativeNote) {
        await theatreApi.updateOperativeNote(surgeryCase.case_number, payload);
      } else {
        await theatreApi.createOperativeNote(surgeryCase.case_number, payload);
      }
      toast({ title: 'Operative note saved', description: 'Operative documentation has been updated.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to save operative note', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const signNote = async () => {
    try {
      await theatreApi.signOperativeNote(surgeryCase.case_number);
      toast({ title: 'Operative note signed', description: 'The operative note now has a digital signature.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to sign note', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const downloadNotePdf = async () => {
    try {
      const blob = await theatreApi.downloadOperativeNotePdf(surgeryCase.case_number);
      downloadPDF(blob, `operative-note-${surgeryCase.case_number}`);
    } catch (error) {
      toast({ title: 'Unable to download operative note PDF', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveConsumable = async (values: ConsumableValues) => {
    try {
      await theatreApi.addConsumable(surgeryCase.case_number, values);
      toast({ title: 'Consumable added', description: 'The intra-operative item log has been updated.' });
      consumableForm.reset({ item: undefined as never, quantity_used: 1, unit_cost: 0, lot_number: '', expiry_date: '', is_implant: false, implant_serial_number: '' });
      setDrugSearch('');
      setSelectedDrug(null);
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to add consumable', description: getApiErrorMessage(error), variant: 'destructive' });
    }
  };

  const removeConsumable = async (consumableId: number) => {
    try {
      setRemovingConsumableId(consumableId);
      await theatreApi.removeConsumable(surgeryCase.case_number, consumableId);
      toast({ title: 'Consumable removed', description: 'The intra-operative item log has been updated.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to remove consumable', description: getApiErrorMessage(error), variant: 'destructive' });
    } finally {
      setRemovingConsumableId(null);
    }
  };

  const startSurgicalChecklist = async () => {
    if (!mappedProcedureKey) {
      toast({
        title: 'AI checklist unavailable',
        description: 'This procedure does not have an AI mapping configured.',
      });
      return;
    }

    try {
      setChecklistBusy(true);
      const response = await aiApi.startSurgicalChecklist({
        surgery_case_id: surgeryCase.id,
        procedure_key: mappedProcedureKey,
        patient_id: String(surgeryCase.patient),
      });
      setLiveChecklistStatus(response as unknown as Record<string, unknown>);
      setCheckedItems([]);
      toast({ title: 'Surgical checklist session started', description: 'The advisory checklist session is now active.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to start surgical checklist', description: getApiErrorMessage(error), variant: 'destructive' });
    } finally {
      setChecklistBusy(false);
    }
  };

  const advanceSurgicalChecklist = async () => {
    if (!currentChecklistSessionId) {
      return;
    }

    try {
      setChecklistBusy(true);
      const response = await aiApi.advanceSurgicalChecklist(currentChecklistSessionId, {
        checked_items: checkedItems,
      });
      setLiveChecklistStatus(response as unknown as Record<string, unknown>);
      setCheckedItems([]);
      toast({ title: 'Checklist advanced', description: 'The surgical checklist session moved to the next advisory phase.' });
      await refreshAll();
    } catch (error) {
      toast({ title: 'Unable to advance checklist', description: getApiErrorMessage(error), variant: 'destructive' });
    } finally {
      setChecklistBusy(false);
    }
  };

  const refreshSurgicalChecklistStatus = async () => {
    if (!currentChecklistSessionId) {
      return;
    }

    try {
      setChecklistBusy(true);
      const response = await aiApi.getSurgicalChecklistStatus(currentChecklistSessionId);
      setLiveChecklistStatus(response as unknown as Record<string, unknown>);
      toast({ title: 'Checklist status refreshed', description: 'The latest TibaBot checklist progress has been loaded.' });
    } catch (error) {
      toast({ title: 'Unable to refresh checklist status', description: getApiErrorMessage(error), variant: 'destructive' });
    } finally {
      setChecklistBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Intra-Operative Workflow</h2>
          <p className="text-sm text-muted-foreground">Manage WHO pauses, anesthesia trends, operative notes, and consumables from one workspace.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          <CardHeader className="relative pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Intra-Op Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">WHO Time-Out</p>
                <p className="text-xs text-muted-foreground">Pause before incision.</p>
              </div>
              <Badge variant={checklist?.time_out_complete ? 'success' : 'warning'} size="sm" className="w-fit">
                {checklist?.time_out_complete ? 'Complete' : 'Pending'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Operative note</p>
                <p className="text-xs text-muted-foreground">Procedure findings and signature.</p>
              </div>
              <Badge variant={operativeNote ? 'success' : 'warning'} size="sm" className="w-fit">
                {operativeNote?.signed_at ? 'Signed' : operativeNote ? 'Drafted' : 'Missing'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Consumables logged</p>
                <p className="text-xs text-muted-foreground">Implants, drugs, and intra-op supplies.</p>
              </div>
              <Badge variant={consumables.length > 0 ? 'info' : 'outline'} size="sm" className="w-fit">
                {consumables.length}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">WHO Sign-Out</p>
                <p className="text-xs text-muted-foreground">Counts and recovery concerns.</p>
              </div>
              <Badge variant={checklist?.sign_out_complete ? 'success' : 'warning'} size="sm" className="w-fit">
                {checklist?.sign_out_complete ? 'Complete' : 'Pending'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Syringe className="h-4 w-4" />
              Anesthesia Vitals Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vitals.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No vitals yet</AlertTitle>
                <AlertDescription>Add the first intra-operative vital to start the graph.</AlertDescription>
              </Alert>
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
                    <Line type="monotone" dataKey="etco2" stroke="#14b8a6" strokeWidth={2} dot={false} name="EtCO2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <Form {...vitalForm}>
              <form className="space-y-4" onSubmit={vitalForm.handleSubmit(saveVital)}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <FormField control={vitalForm.control} name="recorded_at" render={({ field }) => <FormItem><FormLabel>Recorded at</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="recorded_by" render={({ field }) => <FormItem><FormLabel>Recorded by user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="heart_rate" render={({ field }) => <FormItem><FormLabel>HR</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="spo2" render={({ field }) => <FormItem><FormLabel>SpO2</FormLabel><FormControl><Input type="number" step="0.1" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="systolic_bp" render={({ field }) => <FormItem><FormLabel>Systolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="diastolic_bp" render={({ field }) => <FormItem><FormLabel>Diastolic BP</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="respiratory_rate" render={({ field }) => <FormItem><FormLabel>Respiratory rate</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="etco2" render={({ field }) => <FormItem><FormLabel>EtCO2</FormLabel><FormControl><Input type="number" step="0.1" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="fio2" render={({ field }) => <FormItem><FormLabel>FiO2</FormLabel><FormControl><Input type="number" step="0.1" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="tidal_volume" render={({ field }) => <FormItem><FormLabel>Tidal volume</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="peak_pressure" render={({ field }) => <FormItem><FormLabel>Peak pressure</FormLabel><FormControl><Input type="number" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={vitalForm.control} name="temperature" render={({ field }) => <FormItem><FormLabel>Temperature</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={vitalForm.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                <Button type="submit"><Plus className="h-4 w-4 mr-2" />Add vital reading</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />WHO Time-Out</CardTitle></CardHeader>
          <CardContent>
            <Form {...timeOutForm}>
              <form className="space-y-4" onSubmit={timeOutForm.handleSubmit(saveTimeOut)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['team_members_introduced', 'Team members introduced'],
                    ['patient_name_confirmed', 'Patient name confirmed'],
                    ['procedure_confirmed', 'Procedure confirmed'],
                    ['site_confirmed', 'Site confirmed'],
                    ['surgeon_critical_steps_discussed', 'Critical steps discussed'],
                    ['anesthesia_concerns_discussed', 'Anesthesia concerns discussed'],
                    ['nursing_concerns_discussed', 'Nursing concerns discussed'],
                    ['prophylactic_antibiotics_given', 'Antibiotics given'],
                    ['antibiotics_timing_within_60_min', 'Antibiotics within 60 min'],
                    ['antibiotics_not_applicable', 'Antibiotics not applicable'],
                    ['essential_imaging_displayed', 'Essential imaging displayed'],
                    ['imaging_not_applicable', 'Imaging not applicable'],
                  ].map(([name, label]) => (
                    <FormField key={name} control={timeOutForm.control} name={name as keyof TimeOutValues} render={({ field }) => <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3"><FormControl><Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">{label}</FormLabel></FormItem>} />
                  ))}
                </div>
                <Button type="submit">Save WHO Time-Out</Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />WHO Sign-Out</CardTitle></CardHeader>
          <CardContent>
            <Form {...signOutForm}>
              <form className="space-y-4" onSubmit={signOutForm.handleSubmit(saveSignOut)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['procedure_name_recorded', 'Procedure name recorded'],
                    ['instrument_count_correct', 'Instrument count correct'],
                    ['sponge_count_correct', 'Sponge count correct'],
                    ['needle_count_correct', 'Needle count correct'],
                    ['specimens_labeled', 'Specimens labeled'],
                    ['equipment_problems_noted', 'Equipment problems noted'],
                  ].map(([name, label]) => (
                    <FormField key={name} control={signOutForm.control} name={name as keyof SignOutValues} render={({ field }) => <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3"><FormControl><Checkbox checked={field.value as boolean} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">{label}</FormLabel></FormItem>} />
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={signOutForm.control} name="specimen_count" render={({ field }) => <FormItem><FormLabel>Specimen count</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={signOutForm.control} name="equipment_problems_description" render={({ field }) => <FormItem><FormLabel>Equipment issues</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={signOutForm.control} name="key_recovery_concerns" render={({ field }) => <FormItem><FormLabel>Recovery concerns</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                <Button type="submit">Save WHO Sign-Out</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Syringe className="h-4 w-4" />Anesthesia Intra-Op Record</CardTitle></CardHeader>
          <CardContent>
            {!anesthesiaRecord ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No anesthesia record</AlertTitle>
                <AlertDescription>Start with the Pre-Op workspace to create the anesthesia record before charting intra-op details.</AlertDescription>
              </Alert>
            ) : (
              <Form {...anesthesiaForm}>
                <form className="space-y-4" onSubmit={anesthesiaForm.handleSubmit(saveAnesthesia)}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={anesthesiaForm.control} name="induction_time" render={({ field }) => <FormItem><FormLabel>Induction time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="intubation_time" render={({ field }) => <FormItem><FormLabel>Intubation time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="extubation_time" render={({ field }) => <FormItem><FormLabel>Extubation time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="airway_device" render={({ field }) => <FormItem><FormLabel>Airway device</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="tube_size" render={({ field }) => <FormItem><FormLabel>Tube size</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="intubation_attempts" render={({ field }) => <FormItem><FormLabel>Intubation attempts</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                  </div>
                  <FormField control={anesthesiaForm.control} name="intubation_difficulty" render={({ field }) => <FormItem><FormLabel>Intubation difficulty</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={anesthesiaForm.control} name="anesthesia_technique" render={({ field }) => <FormItem><FormLabel>Technique</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={anesthesiaForm.control} name="induction_agents" render={({ field }) => <FormItem><FormLabel>Induction agents</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="maintenance_agents" render={({ field }) => <FormItem><FormLabel>Maintenance agents</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="muscle_relaxants" render={({ field }) => <FormItem><FormLabel>Muscle relaxants</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="reversal_agents" render={({ field }) => <FormItem><FormLabel>Reversal agents</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <FormField control={anesthesiaForm.control} name="crystalloid_volume" render={({ field }) => <FormItem><FormLabel>Crystalloid (ml)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="colloid_volume" render={({ field }) => <FormItem><FormLabel>Colloid (ml)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="estimated_blood_loss" render={({ field }) => <FormItem><FormLabel>EBL (ml)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="urine_output" render={({ field }) => <FormItem><FormLabel>Urine output (ml)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                  </div>
                  <FormField control={anesthesiaForm.control} name="blood_products" render={({ field }) => <FormItem><FormLabel>Blood products</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={anesthesiaForm.control} name="intraop_complications" render={({ field }) => <FormItem><FormLabel>Intra-op complications</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={anesthesiaForm.control} name="pacu_handover_notes" render={({ field }) => <FormItem><FormLabel>PACU handover notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField control={anesthesiaForm.control} name="pain_management_plan" render={({ field }) => <FormItem><FormLabel>Pain management plan</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="post_op_nausea_plan" render={({ field }) => <FormItem><FormLabel>Post-op nausea plan</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                    <FormField control={anesthesiaForm.control} name="other_post_op_orders" render={({ field }) => <FormItem><FormLabel>Other post-op orders</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                  </div>
                  <Button type="submit">Update anesthesia record</Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Operative Note</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {operativeNote?.signed_at ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Signed operative note</AlertTitle>
                <AlertDescription>This operative note has been signed and is ready for downstream review.</AlertDescription>
              </Alert>
            ) : null}
            <Form {...noteForm}>
              <form className="space-y-4" onSubmit={noteForm.handleSubmit(saveOperativeNote)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={noteForm.control} name="dictated_by" render={({ field }) => <FormItem><FormLabel>Dictated by user ID</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="estimated_blood_loss" render={({ field }) => <FormItem><FormLabel>Estimated blood loss (ml)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="incision_time" render={({ field }) => <FormItem><FormLabel>Incision time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="closure_time" render={({ field }) => <FormItem><FormLabel>Closure time</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={noteForm.control} name="pre_operative_diagnosis" render={({ field }) => <FormItem><FormLabel>Pre-op diagnosis</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={noteForm.control} name="post_operative_diagnosis" render={({ field }) => <FormItem><FormLabel>Post-op diagnosis</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={noteForm.control} name="procedure_performed" render={({ field }) => <FormItem><FormLabel>Procedure performed</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={noteForm.control} name="findings" render={({ field }) => <FormItem><FormLabel>Findings</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={noteForm.control} name="technique_description" render={({ field }) => <FormItem><FormLabel>Technique description</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={noteForm.control} name="intraoperative_complications" render={({ field }) => <FormItem><FormLabel>Intra-operative complications</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={noteForm.control} name="implants_used" render={({ field }) => <FormItem><FormLabel>Implants used</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="drains_placed" render={({ field }) => <FormItem><FormLabel>Drains placed</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="sutures_used" render={({ field }) => <FormItem><FormLabel>Sutures used</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={noteForm.control} name="specimens_sent" render={({ field }) => <FormItem><FormLabel>Specimens sent</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <div className="grid gap-4 sm:grid-cols-[180px,1fr]">
                  <FormField control={noteForm.control} name="frozen_section" render={({ field }) => <FormItem className="mt-2 flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">Frozen section sent</FormLabel></FormItem>} />
                  <FormField control={noteForm.control} name="frozen_section_result" render={({ field }) => <FormItem><FormLabel>Frozen section result</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={noteForm.control} name="post_operative_plan" render={({ field }) => <FormItem><FormLabel>Post-op plan</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit">{operativeNote ? 'Update note' : 'Create note'}</Button>
                  {operativeNote && !operativeNote.signed_at ? <Button type="button" variant="outline" onClick={() => void signNote()}>Sign note</Button> : null}
                  {operativeNote ? <Button type="button" variant="outline" onClick={() => void downloadNotePdf()}><Download className="mr-2 h-4 w-4" />PDF</Button> : null}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Consumables & Implants</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Form {...consumableForm}>
            <form className="space-y-4" onSubmit={consumableForm.handleSubmit(saveConsumable)}>
              <div className="grid gap-4 xl:grid-cols-[2fr,1fr,1fr,1fr]">
                <div className="space-y-2">
                  <FormLabel>Item search</FormLabel>
                  <Input value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)} placeholder="Search drug or implant catalog..." />
                  {debouncedDrugSearch.length >= 2 ? (
                    <div className="max-h-48 overflow-y-auto rounded-lg border">
                      {drugsLoading ? <div className="px-3 py-4 text-sm text-muted-foreground">Loading items...</div> : drugResults.map((drug) => (
                        <button
                          key={drug.id}
                          type="button"
                          className="w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                          onClick={() => {
                            setSelectedDrug(drug);
                            consumableForm.setValue('item', drug.id, { shouldDirty: true, shouldValidate: true });
                            consumableForm.setValue('unit_cost', drug.reference_price ?? 0, { shouldDirty: true });
                            setDrugSearch(drug.generic_name);
                          }}
                        >
                          <div className="font-medium">{drug.generic_name}</div>
                          <div className="text-xs text-muted-foreground">{drug.code} {drug.reference_price != null ? `· ${formatCurrency(drug.reference_price)}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {selectedDrug ? <div className="text-xs text-muted-foreground">Selected: {selectedDrug.generic_name}</div> : null}
                </div>
                <FormField control={consumableForm.control} name="quantity_used" render={({ field }) => <FormItem><FormLabel>Qty used</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={consumableForm.control} name="unit_cost" render={({ field }) => <FormItem><FormLabel>Unit cost</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={consumableForm.control} name="lot_number" render={({ field }) => <FormItem><FormLabel>Lot number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField control={consumableForm.control} name="expiry_date" render={({ field }) => <FormItem><FormLabel>Expiry date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={consumableForm.control} name="is_implant" render={({ field }) => <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3 mt-6"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl><FormLabel className="!mt-0">Implant item</FormLabel></FormItem>} />
                <FormField control={consumableForm.control} name="implant_serial_number" render={({ field }) => <FormItem><FormLabel>Implant serial</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
              </div>
              <Button type="submit">Add consumable</Button>
            </form>
          </Form>
          <Separator />
          {consumables.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No consumables have been logged for this case yet.</div>
          ) : (
            <div className="space-y-2">
              {consumables.map((consumable) => (
                <div key={consumable.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{consumable.item_name}</p>
                    <p className="text-xs text-muted-foreground">Qty {consumable.quantity_used}{consumable.lot_number ? ` · Lot ${consumable.lot_number}` : ''}{consumable.is_implant && consumable.implant_serial_number ? ` · Implant ${consumable.implant_serial_number}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-muted-foreground">{formatCurrency(Number(consumable.unit_cost) * consumable.quantity_used)}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void removeConsumable(consumable.id)}
                      disabled={removingConsumableId === consumable.id}
                    >
                      {removingConsumableId === consumable.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
          aria-hidden="true"
        />
        <CardHeader className="relative pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Surgical AI Checklist Advisory
            <Badge variant={latestStoredChecklist ? 'info' : 'outline'} size="sm" className="ml-auto w-fit">
              {currentChecklistSessionId ? 'Session active' : 'Not started'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {!mappedProcedureKey ? (
            <p className="text-sm text-muted-foreground">AI checklist advisory is not available for this procedure.</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label>AI procedure key</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">{mappedProcedureKey || 'Not mapped'}</div>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">Current phase</p>
              <p className="mt-1 font-medium">{latestStoredChecklist?.current_phase || surgeryCase.ai_surgical_summary.checklist.current_phase || 'Not started'}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">Completion</p>
              <p className="mt-1 font-medium">{checklistPercentComplete}%</p>
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => void refreshSurgicalChecklistStatus()} disabled={checklistBusy || !currentChecklistSessionId}>
                {checklistBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh status
              </Button>
            </div>
          </div>

          {!currentChecklistSessionId ? (
            <Button type="button" onClick={() => void startSurgicalChecklist()} disabled={checklistBusy || !mappedProcedureKey}>
              {checklistBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start advisory checklist
            </Button>
          ) : (
            <>
              {checklistItems.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {checklistItems.map((item) => {
                    const checked = checkedItems.includes(item);
                    return (
                      <label key={item} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            const nextChecked = value === true;
                            setCheckedItems((current) =>
                              nextChecked ? Array.from(new Set([...current, item])) : current.filter((entry) => entry !== item)
                            );
                          }}
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No current checklist items are available yet. Refresh status after starting the session.</p>
              )}

              <Button type="button" onClick={() => void advanceSurgicalChecklist()} disabled={checklistBusy || checkedItems.length === 0}>
                {checklistBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Advance with selected items
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
