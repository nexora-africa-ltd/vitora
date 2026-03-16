'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Save, Plus, Trash2, Clock, CheckCircle2, BrainCircuit, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { MultiDiagnosisInput, type DiagnosisEntry } from '@/components/shared';
import { emptyDiagnosisCodeValue } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DischargeReadinessPanel } from '@/components/inpatient/discharge-readiness-panel';
import { useAdmission, useCreateDischarge, useAdmissionWardRounds, useAdmissionOrders } from '@/lib/hooks/use-inpatient';
import { useAIEnabled, useAIClinicalAssist, useAICDSEvaluate } from '@/lib/hooks/use-ai';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import type { DischargeType, DischargeMedication, MaternityContinuityAction } from '@/lib/types/inpatient';
import type { AICDSAlertItem, AIPatientContext, AIEncounterContext } from '@/lib/types/ai';

const DISCHARGE_TYPES: { value: DischargeType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal Discharge' },
  { value: 'ROUTINE', label: 'Routine Discharge' },
  { value: 'AGAINST_ADVICE', label: 'Against Medical Advice' },
  { value: 'TRANSFERRED', label: 'Transfer to Another Facility' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'ABSCONDED', label: 'Absconded/Left Without Notice' },
];

const MATERNITY_CONTINUITY_ACTIONS: { value: MaternityContinuityAction; label: string; description: string }[] = [
  {
    value: 'SCHEDULE_EARLY_PNC',
    label: 'Schedule Early PNC',
    description: 'Book the early postnatal follow-up date before discharge.',
  },
  {
    value: 'ROUTE_TO_PNC_QUEUE',
    label: 'Route Directly To PNC Queue',
    description: 'Send the mother straight to the PNC queue from discharge.',
  },
];

export default function DischargePage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const { data: wardRounds } = useAdmissionWardRounds(admissionId);
  const { data: orders } = useAdmissionOrders(admissionId);
  const createDischarge = useCreateDischarge();
  const isAIEnabled = useAIEnabled();
  const clinicalAssist = useAIClinicalAssist();
  const cdsEvaluate = useAICDSEvaluate();
  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;

  const [dischargeType, setDischargeType] = useState<DischargeType>('NORMAL');
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [patientInstructions, setPatientInstructions] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [medications, setMedications] = useState<DischargeMedication[]>([]);
  const [maternityContinuityAction, setMaternityContinuityAction] = useState<MaternityContinuityAction>('NONE');

  // Clearance states
  const [billingClearance, setBillingClearance] = useState(false);
  const [pharmacyClearance, setPharmacyClearance] = useState(false);
  const [nursingClearance, setNursingClearance] = useState(false);

  // CDS safety check dialog state
  const [cdsAlerts, setCdsAlerts] = useState<AICDSAlertItem[]>([]);
  const [showCdsDialog, setShowCdsDialog] = useState(false);

  // Calculate length of stay
  const lengthOfStay = useMemo(() => {
    if (!admission?.admission_date) return 0;
    const admissionDate = new Date(admission.admission_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - admissionDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [admission?.admission_date]);

  // Check if all clearances are complete
  const allClearancesComplete = billingClearance && pharmacyClearance && nursingClearance;
  const requiresMaternityContinuityAction = !!admission?.mch_registration && ['NORMAL', 'TRANSFERRED'].includes(dischargeType);
  const requiresScheduledFollowUpDate = requiresMaternityContinuityAction && maternityContinuityAction === 'SCHEDULE_EARLY_PNC';

  useEffect(() => {
    if (admission?.mch_registration && maternityContinuityAction === 'NONE') {
      setMaternityContinuityAction('SCHEDULE_EARLY_PNC');
    }
  }, [admission?.mch_registration, maternityContinuityAction]);

  // Build rich clinical context from admission data for AI calls
  const patientCtx = useMemo((): AIPatientContext => {
    // Extract allergies & comorbidities from latest ward round or admission notes
    const latestRound = wardRounds?.results?.[0];
    const allergies: string[] = [];
    const comorbidities: string[] = [];
    const currentMeds: string[] = [];

    // Gather current medications from prescriptions
    if (orders?.prescriptions) {
      for (const rx of orders.prescriptions) {
        if (rx.status !== 'CANCELLED' && rx.status !== 'EXPIRED') {
          for (const item of rx.items) {
            currentMeds.push(`${item.drug_name} ${item.dosage} ${item.frequency}`);
          }
        }
      }
    }

    return {
      patient_age: admission?.patient_age ?? 0,
      patient_sex: admission?.patient_gender === 'M' ? 'male' : 'female',
      allergies,
      comorbidities,
      current_medications: currentMeds,
    };
  }, [admission, wardRounds, orders]);

  const encounterCtx = useMemo((): AIEncounterContext => {
    const latestRound = wardRounds?.results?.[0];
    const vitals = latestRound?.vital_signs;

    return {
      chief_complaint: admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || undefined,
      admission_diagnosis: admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || undefined,
      ward_name: admission?.ward_name || undefined,
      bed_number: admission?.bed_number || undefined,
      admission_status: admission?.admission_status,
      length_of_stay_days: lengthOfStay,
      condition_status: latestRound?.condition_status,
      diet: latestRound?.diet_orders || admission?.diet || undefined,
      special_instructions: admission?.special_instructions || undefined,
      vitals: vitals ? {
        temperature: vitals.temperature ?? undefined,
        pulse: vitals.pulse ?? undefined,
        spo2: vitals.spo2 ?? undefined,
        rr: vitals.respiratory_rate ?? undefined,
      } : undefined,
    };
  }, [admission, wardRounds, lengthOfStay]);

  // Build supplementary text for AI prompts with investigations, prescriptions, ward round progress
  const clinicalHistoryText = useMemo(() => {
    const parts: string[] = [];

    // Ward rounds summary (last 3)
    if (wardRounds?.results && wardRounds.results.length > 0) {
      const recentRounds = wardRounds.results.slice(0, 3);
      const roundsSummary = recentRounds.map((wr) =>
        `${wr.round_date}: Condition ${wr.condition_status}. S: ${wr.subjective || 'N/A'}. A: ${wr.assessment || 'N/A'}. P: ${wr.plan || 'N/A'}.`
      ).join(' | ');
      parts.push(`Ward rounds: ${roundsSummary}`);
    }

    // Lab orders summary
    if (orders?.lab_orders && orders.lab_orders.length > 0) {
      const labSummary = orders.lab_orders.map((lo) => {
        const tests = lo.items.map((item) => {
          const r = item.result;
          if (r?.formatted_value) return `${item.test_name}: ${r.formatted_value}${r.is_critical_result ? ' [CRITICAL]' : ''}`;
          return `${item.test_name}: ${lo.status}`;
        }).join(', ');
        return tests;
      }).join('; ');
      parts.push(`Lab results: ${labSummary}`);
    }

    // Imaging orders summary
    if (orders?.imaging_orders && orders.imaging_orders.length > 0) {
      const imagingSummary = orders.imaging_orders.map((io) => {
        const procs = io.items.map((item) => `${item.procedure_name} (${item.modality})`).join(', ');
        return `${procs}: ${io.status}`;
      }).join('; ');
      parts.push(`Imaging: ${imagingSummary}`);
    }

    // Prescriptions summary
    if (orders?.prescriptions && orders.prescriptions.length > 0) {
      const rxSummary = orders.prescriptions
        .filter((rx) => rx.status !== 'CANCELLED')
        .map((rx) => rx.items.map((item) => `${item.drug_name} ${item.dosage} ${item.frequency}`).join(', '))
        .join('; ');
      if (rxSummary) parts.push(`Prescriptions during stay: ${rxSummary}`);
    }

    return parts.join(' \n');
  }, [wardRounds, orders]);

  // Wire TibaBot context so the AI chat widget is admission-aware
  useEffect(() => {
    if (!setEncounterAwareContext || !admission) return;

    setEncounterAwareContext(
      patientCtx,
      encounterCtx
    );

    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [admission, setEncounterAwareContext, patientCtx, encounterCtx]);

  const addMedication = () => {
    const newMed: DischargeMedication = {
      drug_name: '',
      dosage: '',
      frequency: '',
      duration: '',
      instructions: ''
    };
    setMedications([...medications, newMed]);
  };

  const updateMedication = (index: number, field: keyof DischargeMedication, value: string) => {
    const updated: DischargeMedication[] = medications.map((med, i) => {
      if (i === index) {
        return { ...med, [field]: value };
      }
      return med;
    });
    setMedications(updated);
  };

  const removeMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  // AI-generate discharge summary
  const handleGenerateSummary = useCallback(async () => {
    if (!admission) return;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryDisplay = primaryEntry?.code.icd11Display || primaryEntry?.code.icd10Display || '';
    const diagnosis = primaryDisplay || admission.admitting_diagnosis_text || admission.admitting_diagnosis || '';
    const medsText = medications.filter((m) => m.drug_name).map((m) => `${m.drug_name} ${m.dosage} ${m.frequency}`).join(', ');
    const queryParts = [
      `Generate a concise discharge summary for a ${admission.patient_age ?? 'unknown age'}-year-old ${admission.patient_gender === 'M' ? 'male' : 'female'} patient.`,
      `Admitting diagnosis: ${diagnosis}.`,
      `Length of stay: ${lengthOfStay} days. Ward: ${admission.ward_name || 'N/A'}. Discharge type: ${dischargeType}.`,
    ];
    if (medsText) queryParts.push(`Discharge medications: ${medsText}.`);
    if (clinicalHistoryText) queryParts.push(clinicalHistoryText);
    queryParts.push('Include: hospital course, treatment given, condition at discharge, and follow-up plan.');

    try {
      const result = await clinicalAssist.mutateAsync({
        query: queryParts.join(' '),
        patient_context: patientCtx,
        encounter_context: encounterCtx,
      });
      if (result.response) {
        setDischargeSummary(result.response);
        toast({ title: 'Draft Generated', description: 'TibaBot drafted a discharge summary. Please review and edit.' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate discharge summary. Please write it manually.', variant: 'destructive' });
    }
  }, [admission, diagnoses, medications, lengthOfStay, dischargeType, clinicalAssist, toast, patientCtx, encounterCtx, clinicalHistoryText]);

  // AI-generate patient instructions
  const handleGenerateInstructions = useCallback(async () => {
    if (!admission) return;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryDisplay = primaryEntry?.code.icd11Display || primaryEntry?.code.icd10Display || '';
    const diagnosis = primaryDisplay || admission.admitting_diagnosis_text || admission.admitting_diagnosis || '';
    const medsText = medications.filter((m) => m.drug_name).map((m) => `${m.drug_name} ${m.dosage} ${m.frequency} for ${m.duration || 'as directed'}${m.instructions ? ` (${m.instructions})` : ''}`).join('; ');
    const queryParts = [
      `Generate clear, patient-friendly discharge instructions for a patient diagnosed with ${diagnosis}.`,
    ];
    if (medsText) queryParts.push(`Medications to take at home: ${medsText}.`);
    if (clinicalHistoryText) queryParts.push(`Clinical context: ${clinicalHistoryText}`);
    queryParts.push('Include: medication schedule, dietary advice, activity restrictions, red-flag symptoms to watch for, and when to return to hospital. Use simple language.');

    try {
      const result = await clinicalAssist.mutateAsync({
        query: queryParts.join(' '),
        patient_context: patientCtx,
        encounter_context: encounterCtx,
      });
      if (result.response) {
        setPatientInstructions(result.response);
        toast({ title: 'Draft Generated', description: 'TibaBot drafted patient instructions. Please review and edit.' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate patient instructions. Please write them manually.', variant: 'destructive' });
    }
  }, [admission, diagnoses, medications, clinicalAssist, toast, patientCtx, encounterCtx, clinicalHistoryText]);

  // Helper to extract code string from DiagnosisEntry
  const getDiagCode = (entry: DiagnosisEntry) =>
    entry.code.icd11Code || entry.code.icd10Display?.split(' - ')[0] || '';
  const getDiagDescription = (entry: DiagnosisEntry) =>
    entry.code.icd11Display?.split(' - ').slice(1).join(' - ') ||
    entry.code.icd10Display?.split(' - ').slice(1).join(' - ') || '';

  // Execute the actual discharge submission
  const executeDischarge = async () => {
    if (!admission) return;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryCode = primaryEntry ? getDiagCode(primaryEntry) : admission.admitting_diagnosis || '';
    const primaryText = primaryEntry ? getDiagDescription(primaryEntry) : admission.admitting_diagnosis_text || '';
    try {
      await createDischarge.mutateAsync({
        admission: admissionId,
        discharge_type: dischargeType,
        discharge_date: new Date().toISOString(),
        discharged_by: user?.id || 0,
        admission_diagnosis: admission.admitting_diagnosis || '',
        final_diagnosis: primaryCode,
        final_diagnosis_text: primaryText,
        diagnoses: diagnoses
          .filter((d) => getDiagCode(d))
          .map((d) => ({
            role: d.role,
            code: getDiagCode(d),
            description: getDiagDescription(d),
          })),
        treatment_summary: dischargeSummary,
        patient_instructions: patientInstructions,
        maternity_continuity_action: admission.mch_registration ? maternityContinuityAction : undefined,
        follow_up_date: requiresScheduledFollowUpDate ? followUpDate || undefined : undefined,
        follow_up_instructions: followUpInstructions || undefined,
        discharge_medications: medications.filter((m) => m.drug_name),
        billing_clearance: billingClearance,
        pharmacy_clearance: pharmacyClearance,
        nursing_clearance: nursingClearance,
      });
      toast({ title: 'Success', description: 'Patient discharged successfully' });
      router.push('/admissions');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to discharge patient', variant: 'destructive' });
      console.error(error);
    }
  };

  const handleSubmit = async () => {
    if (!admission || !dischargeSummary || !patientInstructions) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (requiresMaternityContinuityAction && maternityContinuityAction === 'NONE') {
      toast({
        title: 'Maternity Continuity Required',
        description: 'Choose whether to schedule early PNC or route directly to the PNC queue.',
        variant: 'destructive',
      });
      return;
    }

    if (requiresScheduledFollowUpDate && !followUpDate) {
      toast({
        title: 'Follow-up Date Required',
        description: 'Scheduling early PNC requires a follow-up date.',
        variant: 'destructive',
      });
      return;
    }

    if (!allClearancesComplete) {
      toast({
        title: 'Clearances Required',
        description: 'All department clearances must be completed before discharge',
        variant: 'destructive',
      });
      return;
    }

    // Run CDS safety checks if AI is enabled
    if (isAIEnabled) {
      try {
        const allDiagTexts = diagnoses
          .map((d) => d.code.icd11Display || d.code.icd10Display || '')
          .filter(Boolean);
        if (allDiagTexts.length === 0 && (admission.admitting_diagnosis_text || admission.admitting_diagnosis)) {
          allDiagTexts.push(admission.admitting_diagnosis_text || admission.admitting_diagnosis || '');
        }
        const medNames = medications.filter((m) => m.drug_name).map((m) => m.drug_name);
        const cdsResult = await cdsEvaluate.mutateAsync({
          medications: medNames,
          diagnoses: allDiagTexts,
          patient_age: admission.patient_age,
          patient_sex: admission.patient_gender === 'M' ? 'male' : admission.patient_gender === 'F' ? 'female' : null,
        });
        if (cdsResult.alerts && cdsResult.alerts.length > 0) {
          setCdsAlerts(cdsResult.alerts);
          setShowCdsDialog(true);
          return; // Wait for clinician to acknowledge
        }
      } catch {
        // CDS check failed — proceed without blocking discharge
      }
    }

    await executeDischarge();
  };

  if (isLoading) {
    return <DischargeSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot discharge a patient without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (admission.admission_status !== 'ACTIVE') {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Patient Already Discharged</p>
        <p className="text-muted-foreground mt-2">
          This admission has already been discharged or is inactive.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission Details
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Discharge Patient"
        helpContent={`Discharging ${admission.patient_name} from ${admission.ward_name}. Complete the discharge summary, medications, and clearances.`}
      />

      {/* Patient Summary with LOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div>
              <p className="text-sm text-muted-foreground">Admission Number</p>
              <p className="font-medium">{admission.admission_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admitting Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Length of Stay</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {lengthOfStay} days
              </p>
            </div>
          </div>
          {admission.mch_registration && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">Maternity Episode</p>
              <p className="mt-1 text-amber-900">
                Linked to {admission.mch_registration_number || `MCH #${admission.mch_registration}`}. Choose whether discharge should schedule early PNC or send the mother directly to the PNC queue.
              </p>
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-amber-900">
                <Link href={`/mch/${admission.mch_registration}`}>Open MCH registration</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Discharge Readiness Assessment */}
      {isAIEnabled && (
        <DischargeReadinessPanel
          admissionId={admissionId}
          patientAge={admission.patient_age ?? 0}
          primaryDiagnosis={admission.admitting_diagnosis_text || admission.admitting_diagnosis || ''}
          daysAdmitted={lengthOfStay}
          hasFollowUpArranged={!!followUpDate}
        />
      )}

      {/* Department Clearances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Department Clearances
          </CardTitle>
          <CardDescription>
            All clearances must be completed before discharge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="billing-clearance"
                checked={billingClearance}
                onCheckedChange={(checked) => setBillingClearance(checked === true)}
              />
              <Label htmlFor="billing-clearance" className="cursor-pointer">
                Billing Clearance
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="pharmacy-clearance"
                checked={pharmacyClearance}
                onCheckedChange={(checked) => setPharmacyClearance(checked === true)}
              />
              <Label htmlFor="pharmacy-clearance" className="cursor-pointer">
                Pharmacy Clearance
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="nursing-clearance"
                checked={nursingClearance}
                onCheckedChange={(checked) => setNursingClearance(checked === true)}
              />
              <Label htmlFor="nursing-clearance" className="cursor-pointer">
                Nursing Clearance
              </Label>
            </div>
          </div>
          {!allClearancesComplete && (
            <p className="text-sm text-amber-600 mt-4">
              ⚠️ All clearances must be checked before you can discharge the patient.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Discharge Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discharge Summary</CardTitle>
          <CardDescription>
            Complete the discharge summary and follow-up instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Discharge Type */}
          <div className="space-y-2">
            <Label htmlFor="discharge-type">Discharge Type *</Label>
            <Select value={dischargeType} onValueChange={(v) => setDischargeType(v as DischargeType)}>
              <SelectTrigger id="discharge-type" aria-label="Discharge Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCHARGE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Discharge Diagnoses (multi) */}
          <MultiDiagnosisInput
            value={diagnoses}
            onChange={setDiagnoses}
            label="Discharge Diagnoses"
          />

          {/* Discharge Summary (Treatment Summary) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="discharge-summary">Discharge Summary *</Label>
              {isAIEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={clinicalAssist.isPending}
                  className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  {clinicalAssist.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BrainCircuit className="h-3.5 w-3.5" />
                  )}
                  Generate with TibaBot
                </Button>
              )}
            </div>
            <Textarea
              id="discharge-summary"
              value={dischargeSummary}
              onChange={(e) => setDischargeSummary(e.target.value)}
              placeholder="Provide a comprehensive summary of the patient's hospital stay, treatment given, and outcomes..."
              rows={6}
            />
          </div>

          {/* Patient Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="patient-instructions">Patient Instructions *</Label>
              {isAIEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateInstructions}
                  disabled={clinicalAssist.isPending}
                  className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  {clinicalAssist.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BrainCircuit className="h-3.5 w-3.5" />
                  )}
                  Generate with TibaBot
                </Button>
              )}
            </div>
            <Textarea
              id="patient-instructions"
              value={patientInstructions}
              onChange={(e) => setPatientInstructions(e.target.value)}
              placeholder="Discharge instructions for patient..."
              rows={3}
            />
          </div>

          {admission.mch_registration && (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="space-y-1">
                <Label htmlFor="maternity-continuity-action">Postpartum Continuity Action *</Label>
                <p className="text-sm text-amber-900">
                  Make early PNC part of the discharge workflow instead of documenting follow-up only.
                </p>
              </div>
              <Select
                value={maternityContinuityAction}
                onValueChange={(value) => setMaternityContinuityAction(value as MaternityContinuityAction)}
              >
                <SelectTrigger id="maternity-continuity-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERNITY_CONTINUITY_ACTIONS.map((action) => (
                    <SelectItem key={action.value} value={action.value} title={action.description}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {MATERNITY_CONTINUITY_ACTIONS.find((action) => action.value === maternityContinuityAction)?.description}
              </p>
            </div>
          )}

          {/* Follow-up */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="follow-up-date">
                {requiresScheduledFollowUpDate ? 'Early PNC Date *' : 'Follow-up Date'}
              </Label>
              <DatePicker
                value={followUpDate ? parseISO(followUpDate) : undefined}
                onChange={(date) => setFollowUpDate(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder={requiresScheduledFollowUpDate ? 'Select early PNC date' : admission.mch_registration ? 'Optional when routing directly to PNC' : 'Select follow-up date'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow-up-instructions">Follow-up Instructions</Label>
              <Input
                id="follow-up-instructions"
                value={followUpInstructions}
                onChange={(e) => setFollowUpInstructions(e.target.value)}
                placeholder={admission.mch_registration ? 'e.g., Escort mother to PNC queue after pharmacy clearance' : 'e.g., Return to OPD in 2 weeks'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discharge Medications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Discharge Medications</CardTitle>
              <CardDescription>
                Medications to be taken at home after discharge
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addMedication}>
              <Plus className="h-4 w-4 mr-2" />
              Add Medication
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No discharge medications added. Click &quot;Add Medication&quot; to add.
            </p>
          ) : (
            <div className="space-y-4">
              {medications.map((med, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Medication {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedication(index)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Medication Name *</Label>
                      <Input
                        value={med.drug_name}
                        onChange={(e) => updateMedication(index, 'drug_name', e.target.value)}
                        placeholder="e.g., Amoxicillin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dosage *</Label>
                      <Input
                        value={med.dosage}
                        onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                        placeholder="e.g., 500mg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency *</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                        placeholder="e.g., 8 hourly"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Instructions</Label>
                      <Input
                        value={med.instructions || ''}
                        onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                        placeholder="e.g., Take after meals"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createDischarge.isPending || cdsEvaluate.isPending || !dischargeSummary || !patientInstructions || !allClearancesComplete || (requiresScheduledFollowUpDate && !followUpDate)}
        >
          {cdsEvaluate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {createDischarge.isPending ? 'Discharging...' : cdsEvaluate.isPending ? 'Running safety checks...' : 'Confirm Discharge'}
        </Button>
      </div>

      {/* CDS Safety Check Dialog */}
      <AlertDialog open={showCdsDialog} onOpenChange={setShowCdsDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Safety Alerts
            </AlertDialogTitle>
            <AlertDialogDescription>
              TibaBot identified the following concerns. Review before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cdsAlerts.map((alert, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 space-y-1 ${
                  alert.severity === 'critical'
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    : alert.severity === 'high'
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${
                    alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                  <span className="text-sm font-medium">{alert.title}</span>
                  <Badge variant="outline" className="ml-auto text-xs">{alert.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                {alert.recommendation && (
                  <p className="text-xs text-muted-foreground italic">{alert.recommendation}</p>
                )}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back & Review</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDischarge}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Acknowledge & Discharge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DischargeSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-96" />
    </div>
  );
}
