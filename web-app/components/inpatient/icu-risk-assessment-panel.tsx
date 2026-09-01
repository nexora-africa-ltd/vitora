/**
 * ICU Risk Assessment Panel
 *
 * Displays AI-predicted ICU risk assessment for admitted patients.
 * Uses TibaBot's POST /predict/icu/predict and /predict/icu/risk-stratify
 * endpoints via the backend proxy.
 *
 * Advisory only — clinician must review and confirm all predictions.
 *
 * Phase 4: ICU Predictor in Inpatient
 * @see docs/tibabot-integration-plan.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Info,
  Loader2,
  ShieldAlert,
  BrainCircuit,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAIICUPredict, useAIEnabled, useStoredICURiskResults, aiKeys } from '@/lib/hooks/use-ai';
import { AIICUPredictRequestSchema } from '@/lib/schemas/ai.schema';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AIICUPredictRequest,
  AIICUPredictResponse,
  AIICUCriticalAlert,
  AISOFAScoreBreakdown,
  AIICUEscalation,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface ICURiskAssessmentPanelProps {
  /** Admission ID for persistence */
  admissionId?: number;
  /** Patient age in years */
  patientAge: number;
  /** Patient gender */
  patientGender: 'M' | 'F' | 'O';
  /** Vital signs */
  vitals?: {
    temperature?: number | null;
    heart_rate?: number | null;
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    respiratory_rate?: number | null;
    spo2?: number | null;
  };
  /** Lab values */
  labs?: {
    wbc?: number | null;
    platelets?: number | null;
    creatinine?: number | null;
    bilirubin?: number | null;
    lactate?: number | null;
    pao2_fio2_ratio?: number | null;
  };
  /** Glasgow Coma Scale (3-15) */
  gcs?: number | null;
  /** Whether patient is on vasopressor support */
  onVasopressors?: boolean;
  /** Whether patient is on mechanical ventilation */
  onMechanicalVentilation?: boolean;
  /** 24-hour urine output in mL */
  urineOutputMlDay?: number | null;
  /** Admitting diagnosis text */
  admissionDiagnosis?: string;
  /** Current length of stay in days */
  lengthOfStayDays?: number | null;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Optional backend-precomputed readiness preflight */
  readinessPreflight?: {
    missingRequired: string[];
    missingAdvisory: string[];
    canRunPredict: boolean;
  };
}

// =============================================================================
// RISK LEVEL STYLES
// =============================================================================

const RISK_LEVEL_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  low: {
    label: 'Low Risk',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  moderate: {
    label: 'Moderate Risk',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
  },
  high: {
    label: 'High Risk',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
  critical: {
    label: 'Critical Risk',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
  },
};

const SEVERITY_BADGE_STYLES: Record<string, string> = {
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const SOFA_ORGAN_LABELS: Record<string, string> = {
  respiratory: 'Respiratory',
  coagulation: 'Coagulation',
  liver: 'Liver',
  cardiovascular: 'Cardiovascular',
  neurological: 'Neurological',
  renal: 'Renal',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CriticalAlertItem({ alert }: { alert: AIICUCriticalAlert }) {
  return (
    <div
      className={cn(
        'rounded-md border p-2.5 text-sm',
        alert.severity === 'critical'
          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
          : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            alert.severity === 'critical'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
          )}
        />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn('shrink-0 px-1.5 py-0 text-xs', SEVERITY_BADGE_STYLES[alert.severity])}
            >
              {alert.severity}
            </Badge>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {alert.alert_type.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm">{alert.message}</p>
          {alert.recommendation && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Action:</span> {alert.recommendation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SOFABreakdownChart({ breakdown }: { breakdown: AISOFAScoreBreakdown }) {
  const organs = Object.entries(SOFA_ORGAN_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      score: breakdown[key as keyof AISOFAScoreBreakdown] ?? 0,
    }))
    .filter((o) => o.score !== null);

  return (
    <div className="space-y-2">
      {organs.map((organ) => (
        <div key={organ.key} className="flex items-center gap-2 text-sm">
          <span className="w-28 truncate text-muted-foreground">{organ.label}</span>
          <div className="flex-1">
            <Progress value={(Number(organ.score) / 4) * 100} className="h-2" />
          </div>
          <span
            className={cn(
              'w-5 text-right font-mono text-xs',
              Number(organ.score) >= 3
                ? 'font-bold text-red-600 dark:text-red-400'
                : Number(organ.score) >= 2
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-muted-foreground'
            )}
          >
            {organ.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function EscalationBanner({ escalation }: { escalation: AIICUEscalation }) {
  if (!escalation.recommended) return null;

  const urgencyColors: Record<string, string> = {
    immediate: 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700',
    urgent: 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700',
    routine: 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700',
  };

  const urgencyTextColors: Record<string, string> = {
    immediate: 'text-red-700 dark:text-red-400',
    urgent: 'text-orange-700 dark:text-orange-400',
    routine: 'text-blue-700 dark:text-blue-400',
  };

  const urgency = escalation.urgency || 'routine';

  return (
    <div className={cn('rounded-lg border p-3', urgencyColors[urgency])}>
      <div className="flex items-start gap-2">
        <TrendingUp className={cn('mt-0.5 h-5 w-5 shrink-0', urgencyTextColors[urgency])} />
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', urgencyTextColors[urgency])}>
            ICU Escalation Recommended — {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
          </p>
          {escalation.reasoning && (
            <p className="mt-1 text-xs text-muted-foreground">{escalation.reasoning}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RiskProbabilityBar({
  label,
  probability,
}: {
  label: string;
  probability: number | null | undefined;
}) {
  if (probability == null) return null;
  const percent = Math.round(probability * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            'font-medium',
            percent >= 80
              ? 'text-red-600 dark:text-red-400'
              : percent >= 60
                ? 'text-orange-600 dark:text-orange-400'
                : percent >= 40
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-green-600 dark:text-green-400'
          )}
        >
          {percent}%
        </span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ICURiskAssessmentPanel({
  admissionId,
  patientAge,
  patientGender,
  vitals,
  labs,
  gcs,
  onVasopressors,
  onMechanicalVentilation,
  urineOutputMlDay,
  admissionDiagnosis,
  lengthOfStayDays,
  disabled = false,
  readinessPreflight,
}: ICURiskAssessmentPanelProps) {
  const aiEnabled = useAIEnabled();
  const queryClient = useQueryClient();
  const { mutate, data: prediction, isPending, reset, isError } = useAIICUPredict();
  const {
    mutate: mutateStratify,
    data: stratifyPrediction,
    isPending: isStratifyPending,
    reset: resetStratify,
  } = useAIICUPredict();
  const [showDetails, setShowDetails] = React.useState(false);
  const lastRequestRef = React.useRef<AIICUPredictRequest | null>(null);
  const [hasSavedLastRequest, setHasSavedLastRequest] = React.useState(false);
  const panelId = React.useId();
  const [manualEntryOpen, setManualEntryOpen] = React.useState(false);
  const [manualRespiratoryRate, setManualRespiratoryRate] = React.useState('');
  const [manualSystolicBp, setManualSystolicBp] = React.useState('');
  const [manualDiastolicBp, setManualDiastolicBp] = React.useState('');
  const [manualPlatelets, setManualPlatelets] = React.useState('');
  const [manualWbc, setManualWbc] = React.useState('');
  const [manualLactate, setManualLactate] = React.useState('');
  const [manualBilirubin, setManualBilirubin] = React.useState('');
  const [manualCreatinine, setManualCreatinine] = React.useState('');
  const [manualGcs, setManualGcs] = React.useState('');
  const [manualPFRatio, setManualPFRatio] = React.useState('');
  const [manualOnVasopressors, setManualOnVasopressors] = React.useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [manualOnMechanicalVentilation, setManualOnMechanicalVentilation] = React.useState<
    'unknown' | 'yes' | 'no'
  >('unknown');

  const parseManualNumber = React.useCallback((value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, []);

  const lastRequestStorageKey = React.useMemo(
    () => `icu_last_request_${admissionId ?? 'no_admission'}`,
    [admissionId]
  );

  const saveLastRequest = React.useCallback(
    (payload: AIICUPredictRequest) => {
      lastRequestRef.current = payload;
      setHasSavedLastRequest(true);
      try {
        sessionStorage.setItem(lastRequestStorageKey, JSON.stringify(payload));
      } catch {
        // Ignore storage failures; in-memory ref still works for this session
      }
    },
    [lastRequestStorageKey]
  );

  React.useEffect(() => {
    lastRequestRef.current = null;
    setHasSavedLastRequest(false);
  }, [lastRequestStorageKey]);

  React.useEffect(() => {
    if (lastRequestRef.current) return;
    try {
      const raw = sessionStorage.getItem(lastRequestStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AIICUPredictRequest;
      const validated = AIICUPredictRequestSchema.safeParse(parsed);
      if (!validated.success) return;
      lastRequestRef.current = validated.data;
      setHasSavedLastRequest(true);
    } catch {
      // Ignore malformed persisted payload
    }
  }, [lastRequestStorageKey]);

  const handleClearManualInputs = React.useCallback(() => {
    setManualRespiratoryRate('');
    setManualSystolicBp('');
    setManualDiastolicBp('');
    setManualPlatelets('');
    setManualWbc('');
    setManualLactate('');
    setManualBilirubin('');
    setManualCreatinine('');
    setManualGcs('');
    setManualPFRatio('');
    setManualOnVasopressors('unknown');
    setManualOnMechanicalVentilation('unknown');
  }, []);

  // Load stored ICU results
  const { data: storedResults } = useStoredICURiskResults(admissionId);
  const latestStored = React.useMemo(() => {
    if (!storedResults || storedResults.length === 0) return undefined;
    return [...storedResults].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [storedResults]);

  // Normalize stored result_data — older records may have sofa_score/qsofa_score
  // as raw TibaBot objects instead of numbers.
  const normalizedStored = React.useMemo<AIICUPredictResponse | undefined>(() => {
    if (!latestStored?.result_data) return undefined;
    const rawResult =
      latestStored.result_data && typeof latestStored.result_data === 'object'
        ? latestStored.result_data
        : {};
    const raw = {
      ...(rawResult as Record<string, unknown>),
      risk_level: (rawResult as Record<string, unknown>).risk_level ?? latestStored.risk_level,
      risk_score: (rawResult as Record<string, unknown>).risk_score ?? latestStored.risk_score,
    } as Record<string, unknown>;

    let sofaScore = raw.sofa_score as number | null | undefined;
    let sofaBreakdown = raw.sofa_breakdown as AISOFAScoreBreakdown | null | undefined;
    if (raw.sofa_score != null && typeof raw.sofa_score === 'object') {
      const obj = raw.sofa_score as Record<string, number>;
      sofaScore = obj.total ?? null;
      sofaBreakdown = {
        respiratory: obj.respiratory ?? null,
        coagulation: obj.coagulation ?? null,
        liver: obj.liver ?? null,
        cardiovascular: obj.cardiovascular ?? null,
        neurological: obj.neurological ?? obj.cns ?? null,
        renal: obj.renal ?? null,
      };
    }

    let qsofaScore = raw.qsofa_score as number | null | undefined;
    let qsofaCriteria = raw.qsofa_criteria as string[] | undefined;
    if (raw.qsofa_score != null && typeof raw.qsofa_score === 'object') {
      const obj = raw.qsofa_score as Record<string, boolean | number>;
      qsofaScore = (obj.total as number) ?? null;
      qsofaCriteria = [];
      if (obj.altered_mentation) qsofaCriteria.push('Altered mentation (GCS < 15)');
      if (obj.respiratory_rate_high) qsofaCriteria.push('Respiratory rate >= 22');
      if (obj.systolic_bp_low) qsofaCriteria.push('Systolic BP <= 100');
    }

    return {
      ...raw,
      sofa_score: sofaScore,
      sofa_breakdown: sofaBreakdown,
      qsofa_score: qsofaScore,
      qsofa_criteria: qsofaCriteria,
    } as unknown as AIICUPredictResponse;
  }, [latestStored]);

  const displayPrediction: AIICUPredictResponse | undefined = prediction ?? normalizedStored;

  // Show success toast when prediction completes
  React.useEffect(() => {
    if (prediction && prediction.risk_level && !prediction.error) {
      const riskLabel =
        prediction.risk_level.charAt(0).toUpperCase() + prediction.risk_level.slice(1);
      const score =
        prediction.risk_score != null ? ` — ${Math.round(prediction.risk_score * 100)}%` : '';
      toast.success('ICU risk assessment complete', {
        description: `${riskLabel} risk${score}`,
      });
      if (admissionId) {
        queryClient.invalidateQueries({ queryKey: aiKeys.storedICURisk(admissionId) });
      }
    }
  }, [prediction, queryClient, admissionId]);

  // Advisory inputs that improve prediction quality but are not strict blockers.
  const ADVISORY_FIELDS = ['wbc', 'lactate', 'urine_output_ml_day'] as const;

  const FIELD_LABELS: Record<string, string> = {
    heart_rate: 'Heart Rate',
    systolic_bp: 'Systolic BP',
    diastolic_bp: 'Diastolic BP',
    respiratory_rate: 'Respiratory Rate',
    spo2: 'SpO2',
    temperature: 'Temperature',
    creatinine: 'Creatinine',
    wbc: 'WBC',
    platelets: 'Platelets',
    lactate: 'Lactate',
    bilirubin: 'Bilirubin Total',
    gcs: 'GCS Total',
    urine_output_ml_day: 'Urine Output (24h)',
    on_vasopressors: 'Vasopressor Status',
    pao2_fio2_ratio_or_ventilation_status: 'PF Ratio or Ventilation Status',
  };

  const manualOverrides = {
    respiratory_rate: parseManualNumber(manualRespiratoryRate),
    systolic_bp: parseManualNumber(manualSystolicBp),
    diastolic_bp: parseManualNumber(manualDiastolicBp),
    platelets: parseManualNumber(manualPlatelets),
    wbc: parseManualNumber(manualWbc),
    lactate: parseManualNumber(manualLactate),
    bilirubin: parseManualNumber(manualBilirubin),
    creatinine: parseManualNumber(manualCreatinine),
    gcs: parseManualNumber(manualGcs),
    pao2_fio2_ratio: parseManualNumber(manualPFRatio),
    on_vasopressors:
      manualOnVasopressors === 'unknown' ? undefined : manualOnVasopressors === 'yes',
    on_mechanical_ventilation:
      manualOnMechanicalVentilation === 'unknown'
        ? undefined
        : manualOnMechanicalVentilation === 'yes',
  };

  const hasManualOverrides = Object.values(manualOverrides).some((value) => value !== undefined);

  React.useEffect(() => {
    if (!manualEntryOpen) return;

    if (!manualRespiratoryRate && vitals?.respiratory_rate != null) {
      setManualRespiratoryRate(String(vitals.respiratory_rate));
    }
    if (!manualSystolicBp && vitals?.systolic_bp != null) {
      setManualSystolicBp(String(vitals.systolic_bp));
    }
    if (!manualDiastolicBp && vitals?.diastolic_bp != null) {
      setManualDiastolicBp(String(vitals.diastolic_bp));
    }
    if (!manualPlatelets && labs?.platelets != null) {
      setManualPlatelets(String(labs.platelets));
    }
    if (!manualWbc && labs?.wbc != null) {
      setManualWbc(String(labs.wbc));
    }
    if (!manualLactate && labs?.lactate != null) {
      setManualLactate(String(labs.lactate));
    }
    if (!manualBilirubin && labs?.bilirubin != null) {
      setManualBilirubin(String(labs.bilirubin));
    }
    if (!manualCreatinine && labs?.creatinine != null) {
      setManualCreatinine(String(labs.creatinine));
    }
    if (!manualGcs && gcs != null) {
      setManualGcs(String(gcs));
    }
    if (!manualPFRatio && labs?.pao2_fio2_ratio != null) {
      setManualPFRatio(String(labs.pao2_fio2_ratio));
    }
    if (manualOnVasopressors === 'unknown' && onVasopressors !== undefined) {
      setManualOnVasopressors(onVasopressors ? 'yes' : 'no');
    }
    if (manualOnMechanicalVentilation === 'unknown' && onMechanicalVentilation !== undefined) {
      setManualOnMechanicalVentilation(onMechanicalVentilation ? 'yes' : 'no');
    }
  }, [
    manualEntryOpen,
    manualRespiratoryRate,
    manualSystolicBp,
    manualDiastolicBp,
    manualPlatelets,
    manualWbc,
    manualLactate,
    manualBilirubin,
    manualCreatinine,
    manualGcs,
    manualPFRatio,
    manualOnVasopressors,
    manualOnMechanicalVentilation,
    vitals?.respiratory_rate,
    vitals?.systolic_bp,
    vitals?.diastolic_bp,
    labs?.platelets,
    labs?.wbc,
    labs?.lactate,
    labs?.bilirubin,
    labs?.creatinine,
    labs?.pao2_fio2_ratio,
    gcs,
    onVasopressors,
    onMechanicalVentilation,
  ]);

  // Don't render if AI is disabled
  if (!aiEnabled) return null;

  const effectiveVitals = {
    ...vitals,
    ...(manualOverrides.respiratory_rate != null
      ? { respiratory_rate: manualOverrides.respiratory_rate }
      : {}),
    ...(manualOverrides.systolic_bp != null ? { systolic_bp: manualOverrides.systolic_bp } : {}),
    ...(manualOverrides.diastolic_bp != null ? { diastolic_bp: manualOverrides.diastolic_bp } : {}),
  };

  const effectiveLabs = {
    ...labs,
    ...(manualOverrides.wbc != null ? { wbc: manualOverrides.wbc } : {}),
    ...(manualOverrides.platelets != null ? { platelets: manualOverrides.platelets } : {}),
    ...(manualOverrides.lactate != null ? { lactate: manualOverrides.lactate } : {}),
    ...(manualOverrides.bilirubin != null ? { bilirubin: manualOverrides.bilirubin } : {}),
    ...(manualOverrides.creatinine != null ? { creatinine: manualOverrides.creatinine } : {}),
    ...(manualOverrides.pao2_fio2_ratio != null
      ? { pao2_fio2_ratio: manualOverrides.pao2_fio2_ratio }
      : {}),
  };

  const effectiveGcs = gcs ?? manualOverrides.gcs;
  const effectiveOnVasopressors =
    onVasopressors !== undefined ? onVasopressors : manualOverrides.on_vasopressors;
  const effectiveOnMechanicalVentilation =
    onMechanicalVentilation !== undefined
      ? onMechanicalVentilation
      : manualOverrides.on_mechanical_ventilation;

  const computedMissingRequired: string[] = [];
  if (effectiveVitals.respiratory_rate == null) computedMissingRequired.push('respiratory_rate');
  if (effectiveVitals.systolic_bp == null) computedMissingRequired.push('systolic_bp');
  if (effectiveVitals.diastolic_bp == null) computedMissingRequired.push('diastolic_bp');
  if (effectiveLabs.platelets == null) computedMissingRequired.push('platelets');
  if (effectiveLabs.bilirubin == null) computedMissingRequired.push('bilirubin');
  if (effectiveLabs.creatinine == null) computedMissingRequired.push('creatinine');
  if (effectiveGcs == null) computedMissingRequired.push('gcs');

  const hasRespiratoryContext =
    effectiveLabs.pao2_fio2_ratio != null || effectiveOnMechanicalVentilation !== undefined;
  const hasPressorContext = effectiveOnVasopressors !== undefined;

  if (!hasRespiratoryContext) {
    computedMissingRequired.push('pao2_fio2_ratio_or_ventilation_status');
  }
  if (!hasPressorContext) {
    computedMissingRequired.push('on_vasopressors');
  }

  const computedMissingAdvisory = ADVISORY_FIELDS.filter((field) => {
    switch (field) {
      case 'wbc':
        return effectiveLabs.wbc == null;
      case 'lactate':
        return effectiveLabs.lactate == null;
      case 'urine_output_ml_day':
        return urineOutputMlDay == null;
      default:
        return false;
    }
  });

  const missingRequired =
    hasManualOverrides || !readinessPreflight
      ? computedMissingRequired
      : readinessPreflight.missingRequired;
  const missingAdvisory =
    hasManualOverrides || !readinessPreflight
      ? computedMissingAdvisory
      : readinessPreflight.missingAdvisory;
  const hasEnoughData =
    hasManualOverrides || !readinessPreflight
      ? missingRequired.length === 0
      : readinessPreflight.canRunPredict;

  const handlePredict = () => {
    const currentPatientData: AIICUPredictRequest['patient_data'] = {
      age: patientAge,
      gender: patientGender,
    };

    // Vitals
    if (effectiveVitals?.temperature != null)
      currentPatientData.temperature = effectiveVitals.temperature;
    if (effectiveVitals?.heart_rate != null)
      currentPatientData.heart_rate = effectiveVitals.heart_rate;
    if (effectiveVitals?.systolic_bp != null)
      currentPatientData.systolic_bp = effectiveVitals.systolic_bp;
    if (effectiveVitals?.diastolic_bp != null)
      currentPatientData.diastolic_bp = effectiveVitals.diastolic_bp;
    if (effectiveVitals?.respiratory_rate != null) {
      currentPatientData.respiratory_rate = effectiveVitals.respiratory_rate;
    }
    if (effectiveVitals?.spo2 != null) currentPatientData.spo2 = effectiveVitals.spo2;

    // Compute MAP if BP available
    if (effectiveVitals?.systolic_bp != null && effectiveVitals?.diastolic_bp != null) {
      currentPatientData.mean_arterial_pressure = Math.round(
        (effectiveVitals.systolic_bp + 2 * effectiveVitals.diastolic_bp) / 3
      );
    }

    // Labs
    if (effectiveLabs?.wbc != null) currentPatientData.wbc = effectiveLabs.wbc;
    if (effectiveLabs?.platelets != null) currentPatientData.platelets = effectiveLabs.platelets;
    if (effectiveLabs?.creatinine != null) currentPatientData.creatinine = effectiveLabs.creatinine;
    if (effectiveLabs?.bilirubin != null) currentPatientData.bilirubin = effectiveLabs.bilirubin;
    if (effectiveLabs?.lactate != null) currentPatientData.lactate = effectiveLabs.lactate;
    if (effectiveLabs?.pao2_fio2_ratio != null) {
      currentPatientData.pao2_fio2_ratio = effectiveLabs.pao2_fio2_ratio;
    }

    // Clinical context
    if (effectiveGcs != null) currentPatientData.gcs = effectiveGcs;
    if (urineOutputMlDay != null) currentPatientData.urine_output_ml_day = urineOutputMlDay;
    if (effectiveOnVasopressors != null)
      currentPatientData.on_vasopressors = effectiveOnVasopressors;
    if (effectiveOnMechanicalVentilation != null) {
      currentPatientData.on_mechanical_ventilation = effectiveOnMechanicalVentilation;
    }
    if (admissionDiagnosis?.trim()) currentPatientData.admission_diagnosis = admissionDiagnosis;
    if (lengthOfStayDays != null) currentPatientData.length_of_stay_days = lengthOfStayDays;

    const requestPayload: AIICUPredictRequest = {
      patient_data: currentPatientData,
      prediction_type: 'predict',
      admission_id: admissionId,
    };
    const stratifyPayload: AIICUPredictRequest = {
      patient_data: currentPatientData,
      prediction_type: 'risk-stratify',
      admission_id: admissionId,
    };

    const requestValidation = AIICUPredictRequestSchema.safeParse(requestPayload);
    if (!requestValidation.success) {
      toast.error('Missing required fields for ICU assessment', {
        description: 'Complete the required SOFA fields or use Enter Manually before running.',
      });
      return;
    }

    saveLastRequest(requestPayload);
    mutate(requestPayload);
    if (AIICUPredictRequestSchema.safeParse(stratifyPayload).success) {
      mutateStratify(stratifyPayload);
    }
  };

  const handleRerun = () => {
    reset();
    resetStratify();
    const lastRequestCandidate = lastRequestRef.current;
    if (lastRequestCandidate) {
      const mainValidation = AIICUPredictRequestSchema.safeParse(lastRequestCandidate);
      if (!mainValidation.success) {
        toast.error('Cannot re-run last assessment', {
          description:
            'The saved request is no longer valid. Complete required fields and run again.',
        });
        return;
      }

      mutate(lastRequestCandidate);
      const stratifyPayload: AIICUPredictRequest = {
        ...lastRequestCandidate,
        prediction_type: 'risk-stratify',
      };
      if (AIICUPredictRequestSchema.safeParse(stratifyPayload).success) {
        mutateStratify(stratifyPayload);
      }
      return;
    }
    handlePredict();
  };

  const riskConfig = displayPrediction?.risk_level
    ? RISK_LEVEL_CONFIG[displayPrediction.risk_level] || RISK_LEVEL_CONFIG.low
    : null;

  const hasPrediction =
    displayPrediction && displayPrediction.risk_level && !displayPrediction.error;
  const probabilitySource = stratifyPrediction ?? displayPrediction;
  const alertCount = displayPrediction?.critical_alerts?.length ?? 0;

  return (
    <Card
      className={cn(
        'border-dashed transition-colors duration-500',
        hasPrediction && riskConfig ? riskConfig.borderColor : 'border-muted-foreground/25',
        hasPrediction && 'bg-emerald-50/50 dark:bg-emerald-950/20'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4 text-red-500" />
            <span className="sm:hidden">ICU Risk</span>
            <span className="hidden sm:inline">ICU Risk Assessment</span>
            <Badge variant="outline" className="gap-1 text-xs font-normal">
              <BrainCircuit className="h-3 w-3" />
              Advisory
            </Badge>
          </CardTitle>
          <HelpPopover content="AI-powered ICU risk assessment analyzes patient vitals, lab values, and clinical data to compute SOFA/qSOFA scores and predict ICU escalation needs. This is advisory only — always use clinical judgment." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Run Assessment Button */}
        {!hasPrediction && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-center text-sm text-muted-foreground">
              {!hasEnoughData ? (
                <>
                  Complete minimum practical SOFA fields before running ICU risk assessment:{' '}
                  <span className="font-medium text-foreground">
                    {missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}
                  </span>
                </>
              ) : (
                'Run AI analysis to assess ICU risk, compute SOFA/qSOFA scores, and identify escalation needs.'
              )}
            </p>
            {hasEnoughData && missingAdvisory.length > 0 && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                <Info className="-mt-0.5 mr-1 inline h-3 w-3" />
                Accuracy improves with additional context:{' '}
                {missingAdvisory.map((f) => FIELD_LABELS[f]).join(', ')}. Some missing labs may be
                assumed as normal defaults by the backend.
              </p>
            )}
            {!hasEnoughData && (
              <Collapsible
                open={manualEntryOpen}
                onOpenChange={setManualEntryOpen}
                className="w-full"
              >
                <CollapsibleTrigger asChild>
                  <Button type="button" size="sm" variant="secondary" className="gap-2">
                    {manualEntryOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Enter Manually
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 w-full space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Manual values are used for this ICU assessment run and do not overwrite
                      charted records.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearManualInputs}
                      className="h-7 px-2 text-xs"
                    >
                      Clear Inputs
                    </Button>
                  </div>
                  <div className="grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-rr`}>Respiratory Rate</Label>
                      <Input
                        id={`${panelId}-manual-rr`}
                        type="number"
                        value={manualRespiratoryRate}
                        onChange={(e) => setManualRespiratoryRate(e.target.value)}
                        placeholder="22"
                        className={manualRespiratoryRate ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-sbp`}>Systolic BP</Label>
                      <Input
                        id={`${panelId}-manual-sbp`}
                        type="number"
                        value={manualSystolicBp}
                        onChange={(e) => setManualSystolicBp(e.target.value)}
                        placeholder="100"
                        className={manualSystolicBp ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-dbp`}>Diastolic BP</Label>
                      <Input
                        id={`${panelId}-manual-dbp`}
                        type="number"
                        value={manualDiastolicBp}
                        onChange={(e) => setManualDiastolicBp(e.target.value)}
                        placeholder="60"
                        className={manualDiastolicBp ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-wbc`}>WBC</Label>
                      <Input
                        id={`${panelId}-manual-wbc`}
                        type="number"
                        step="0.1"
                        value={manualWbc}
                        onChange={(e) => setManualWbc(e.target.value)}
                        placeholder="12.5"
                        className={manualWbc ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-lactate`}>Lactate</Label>
                      <Input
                        id={`${panelId}-manual-lactate`}
                        type="number"
                        step="0.1"
                        value={manualLactate}
                        onChange={(e) => setManualLactate(e.target.value)}
                        placeholder="2.0"
                        className={manualLactate ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-platelets`}>Platelets</Label>
                      <Input
                        id={`${panelId}-manual-platelets`}
                        type="number"
                        value={manualPlatelets}
                        onChange={(e) => setManualPlatelets(e.target.value)}
                        placeholder="150"
                        className={manualPlatelets ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-bilirubin`}>Bilirubin</Label>
                      <Input
                        id={`${panelId}-manual-bilirubin`}
                        type="number"
                        step="0.1"
                        value={manualBilirubin}
                        onChange={(e) => setManualBilirubin(e.target.value)}
                        placeholder="1.2"
                        className={manualBilirubin ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-creatinine`}>Creatinine</Label>
                      <Input
                        id={`${panelId}-manual-creatinine`}
                        type="number"
                        step="0.1"
                        value={manualCreatinine}
                        onChange={(e) => setManualCreatinine(e.target.value)}
                        placeholder="1.0"
                        className={manualCreatinine ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-gcs`}>GCS Total</Label>
                      <Input
                        id={`${panelId}-manual-gcs`}
                        type="number"
                        min={3}
                        max={15}
                        value={manualGcs}
                        onChange={(e) => setManualGcs(e.target.value)}
                        placeholder="15"
                        className={manualGcs ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-pf`}>PF Ratio</Label>
                      <Input
                        id={`${panelId}-manual-pf`}
                        type="number"
                        value={manualPFRatio}
                        onChange={(e) => setManualPFRatio(e.target.value)}
                        placeholder="320"
                        className={manualPFRatio ? 'font-medium text-green-700' : undefined}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-vent`}>Mechanical Ventilation</Label>
                      <Select
                        value={manualOnMechanicalVentilation}
                        onValueChange={(value) =>
                          setManualOnMechanicalVentilation(value as 'unknown' | 'yes' | 'no')
                        }
                      >
                        <SelectTrigger
                          id={`${panelId}-manual-vent`}
                          className={
                            manualOnMechanicalVentilation !== 'unknown'
                              ? 'font-medium text-green-700'
                              : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unknown">Unknown</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${panelId}-manual-pressors`}>On Vasopressors</Label>
                      <Select
                        value={manualOnVasopressors}
                        onValueChange={(value) =>
                          setManualOnVasopressors(value as 'unknown' | 'yes' | 'no')
                        }
                      >
                        <SelectTrigger
                          id={`${panelId}-manual-pressors`}
                          className={
                            manualOnVasopressors !== 'unknown'
                              ? 'font-medium text-green-700'
                              : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unknown">Unknown</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isPending || isStratifyPending || !hasEnoughData}
                onClick={handlePredict}
                className="gap-2"
              >
                {isPending || isStratifyPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <HeartPulse className="h-4 w-4" />
                    Run ICU Assessment
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Prediction Results */}
        {hasPrediction && riskConfig && (
          <div className="space-y-4">
            {/* Defaulted Labs Warning */}
            {displayPrediction.defaulted_labs && displayPrediction.defaulted_labs.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-amber-700 dark:text-amber-300">
                    <span className="font-medium">Normal values assumed</span> for{' '}
                    {displayPrediction.defaulted_labs.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.
                    Accuracy improves with actual lab results.
                  </p>
                </div>
              </div>
            )}

            {/* Risk Level Banner */}
            <div
              className={cn('rounded-lg border p-3', riskConfig.bgColor, riskConfig.borderColor)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <ShieldAlert className={cn('mt-0.5 h-5 w-5 shrink-0', riskConfig.color)} />
                  <div className="min-w-0">
                    <p className={cn('font-semibold', riskConfig.color)}>{riskConfig.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Risk Score: {Math.round(displayPrediction.risk_score * 100)}%
                      {displayPrediction.sofa_score != null && (
                        <> &bull; SOFA: {displayPrediction.sofa_score}/24</>
                      )}
                      {displayPrediction.qsofa_score != null && (
                        <> &bull; qSOFA: {displayPrediction.qsofa_score}/3</>
                      )}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    'shrink-0',
                    displayPrediction.risk_level === 'critical'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                      : displayPrediction.risk_level === 'high'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                        : displayPrediction.risk_level === 'moderate'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  )}
                >
                  {riskConfig.label}
                </Badge>
              </div>
            </div>

            {/* Escalation Recommendation */}
            {displayPrediction.escalation && (
              <EscalationBanner escalation={displayPrediction.escalation} />
            )}

            {/* Critical Alerts */}
            {alertCount > 0 && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  Critical Alerts ({alertCount})
                </h4>
                <div className="space-y-2">
                  {displayPrediction.critical_alerts!.map((alert, i) => (
                    <CriticalAlertItem key={i} alert={alert} />
                  ))}
                </div>
              </div>
            )}

            {/* Advisory Disclaimer */}
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                AI-generated assessment. SOFA/qSOFA scores and escalation recommendations are
                advisory only. Use clinical judgment to validate.
              </span>
            </div>

            {/* Expandable Details */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <span className="text-sm">{showDetails ? 'Hide' : 'Show'} Details</span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showDetails && (
              <Tabs defaultValue="scores" className="space-y-3">
                <TabsList className="grid h-auto w-full grid-cols-3">
                  <TabsTrigger value="scores" className="text-xs sm:text-sm">
                    Scores
                  </TabsTrigger>
                  <TabsTrigger value="probabilities" className="text-xs sm:text-sm">
                    <span className="sm:hidden">Probs</span>
                    <span className="hidden sm:inline">Probabilities</span>
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs sm:text-sm">
                    Actions
                  </TabsTrigger>
                </TabsList>

                {/* Scores Tab */}
                <TabsContent value="scores" className="space-y-4 pt-1">
                  {/* SOFA Breakdown */}
                  {displayPrediction.sofa_breakdown && (
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-1.5 text-sm font-medium">
                        SOFA Breakdown
                        <span className="text-xs font-normal text-muted-foreground">
                          (Total: {displayPrediction.sofa_score}/24)
                        </span>
                      </h4>
                      <SOFABreakdownChart breakdown={displayPrediction.sofa_breakdown} />
                    </div>
                  )}

                  {/* qSOFA Criteria */}
                  {displayPrediction.qsofa_criteria &&
                    displayPrediction.qsofa_criteria.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-sm font-medium">
                          qSOFA Criteria Met
                          <span className="text-xs font-normal text-muted-foreground">
                            ({displayPrediction.qsofa_score}/3)
                          </span>
                        </h4>
                        <ul className="space-y-1 pl-1">
                          {displayPrediction.qsofa_criteria.map((criteria, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-2 text-sm text-muted-foreground"
                            >
                              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                              {criteria}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </TabsContent>

                {/* Probabilities Tab */}
                <TabsContent value="probabilities" className="space-y-3 pt-1">
                  {probabilitySource?.sepsis_probability != null ||
                  probabilitySource?.aki_probability != null ||
                  probabilitySource?.deterioration_probability != null ? (
                    <>
                      <RiskProbabilityBar
                        label="Sepsis"
                        probability={probabilitySource?.sepsis_probability}
                      />
                      <RiskProbabilityBar
                        label="Acute Kidney Injury"
                        probability={probabilitySource?.aki_probability}
                      />
                      <RiskProbabilityBar
                        label="Clinical Deterioration"
                        probability={probabilitySource?.deterioration_probability}
                      />
                    </>
                  ) : (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      Run ICU Assessment to see individual condition probabilities.
                    </p>
                  )}
                </TabsContent>

                {/* Actions Tab */}
                <TabsContent value="actions" className="space-y-3 pt-1">
                  {displayPrediction.recommendations &&
                  displayPrediction.recommendations.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Recommendations</h4>
                      <ul className="list-inside list-disc space-y-1 pl-1 text-sm text-muted-foreground">
                        {displayPrediction.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      No specific recommendations at this time.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {/* Re-run Buttons */}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <AIFeedbackButtons
                messageId={`icu-predict-${panelId}`}
                serviceType="icu_predictor"
                userQuery={admissionDiagnosis}
                botResponse={`${displayPrediction.risk_level} risk${displayPrediction.risk_score != null ? ` — ${Math.round(displayPrediction.risk_score * 100)}%` : ''}`}
                metadata={{
                  prediction_type: 'predict',
                  risk_level: displayPrediction.risk_level,
                  risk_score: displayPrediction.risk_score,
                  sofa_score: displayPrediction.sofa_score,
                  qsofa_score: displayPrediction.qsofa_score,
                }}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    disabled ||
                    isPending ||
                    isStratifyPending ||
                    (!hasEnoughData && !hasSavedLastRequest)
                  }
                  onClick={handleRerun}
                  className="gap-1.5 text-xs"
                >
                  {isPending || isStratifyPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HeartPulse className="h-3.5 w-3.5" />
                  )}
                  Re-run Last Assessment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error State (TibaBot unavailable but returned gracefully) */}
        {displayPrediction && !hasPrediction && displayPrediction.error && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <div>
              <p>{displayPrediction.error}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handlePredict()}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Brain className="h-3.5 w-3.5" />
                )}
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Network error */}
        {isError && !displayPrediction && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p>Failed to connect to AI service. Please try again.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handlePredict()}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Brain className="h-3.5 w-3.5" />
                )}
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
