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
  Activity,
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
import { HelpPopover } from '@/components/shared/help-popover';
import { useAIICUPredict, useAIEnabled } from '@/lib/hooks/use-ai';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import type {
  AIICUPredictRequest,
  AIICUPredictResponse,
  AIICUCriticalAlert,
  AISOFAScoreBreakdown,
  AIICUEscalation,
  AIICUPredictionType,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface ICURiskAssessmentPanelProps {
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
        'rounded-md p-2.5 border text-sm',
        alert.severity === 'critical'
          ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            'h-4 w-4 mt-0.5 shrink-0',
            alert.severity === 'critical'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
          )}
        />
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={cn('text-xs px-1.5 py-0 shrink-0', SEVERITY_BADGE_STYLES[alert.severity])}
            >
              {alert.severity}
            </Badge>
            <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              {alert.alert_type.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm">{alert.message}</p>
          {alert.recommendation && (
            <p className="text-xs text-muted-foreground mt-1">
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
          <span className="w-28 text-muted-foreground truncate">{organ.label}</span>
          <div className="flex-1">
            <Progress
              value={(Number(organ.score) / 4) * 100}
              className="h-2"
            />
          </div>
          <span
            className={cn(
              'w-5 text-right font-mono text-xs',
              Number(organ.score) >= 3
                ? 'text-red-600 dark:text-red-400 font-bold'
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
    <div className={cn('rounded-lg p-3 border', urgencyColors[urgency])}>
      <div className="flex items-start gap-2">
        <TrendingUp className={cn('h-5 w-5 mt-0.5 shrink-0', urgencyTextColors[urgency])} />
        <div className="min-w-0">
          <p className={cn('font-semibold text-sm', urgencyTextColors[urgency])}>
            ICU Escalation Recommended — {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
          </p>
          {escalation.reasoning && (
            <p className="text-xs text-muted-foreground mt-1">{escalation.reasoning}</p>
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
  patientAge,
  patientGender,
  vitals,
  labs,
  gcs,
  onVasopressors = false,
  onMechanicalVentilation = false,
  urineOutputMlDay,
  admissionDiagnosis,
  lengthOfStayDays,
  disabled = false,
}: ICURiskAssessmentPanelProps) {
  const aiEnabled = useAIEnabled();
  const { mutate, data: prediction, isPending, reset, isError } = useAIICUPredict();
  const [showDetails, setShowDetails] = React.useState(false);
  const [predictionType, setPredictionType] = React.useState<AIICUPredictionType>('predict');
  const panelId = React.useId();

  // Show success toast when prediction completes
  React.useEffect(() => {
    if (prediction && prediction.risk_level && !prediction.error) {
      const riskLabel = prediction.risk_level.charAt(0).toUpperCase() + prediction.risk_level.slice(1);
      const score = prediction.risk_score != null ? ` — ${Math.round(prediction.risk_score * 100)}%` : '';
      toast.success('ICU risk assessment complete', {
        description: `${riskLabel} risk${score}`,
      });
    }
  }, [prediction]);

  // Don't render if AI is disabled
  if (!aiEnabled) return null;

  const hasEnoughData =
    vitals?.heart_rate != null ||
    vitals?.spo2 != null ||
    vitals?.systolic_bp != null ||
    vitals?.temperature != null;

  const handlePredict = (type?: AIICUPredictionType) => {
    const useType = type ?? predictionType;
    setPredictionType(useType);

    const patientData: AIICUPredictRequest['patient_data'] = {
      age: patientAge,
      gender: patientGender,
    };

    // Vitals
    if (vitals?.temperature != null) patientData.temperature = vitals.temperature;
    if (vitals?.heart_rate != null) patientData.heart_rate = vitals.heart_rate;
    if (vitals?.systolic_bp != null) patientData.systolic_bp = vitals.systolic_bp;
    if (vitals?.diastolic_bp != null) patientData.diastolic_bp = vitals.diastolic_bp;
    if (vitals?.respiratory_rate != null) patientData.respiratory_rate = vitals.respiratory_rate;
    if (vitals?.spo2 != null) patientData.spo2 = vitals.spo2;

    // Compute MAP if BP available
    if (vitals?.systolic_bp != null && vitals?.diastolic_bp != null) {
      patientData.mean_arterial_pressure =
        Math.round((vitals.systolic_bp + 2 * vitals.diastolic_bp) / 3);
    }

    // Labs
    if (labs?.wbc != null) patientData.wbc = labs.wbc;
    if (labs?.platelets != null) patientData.platelets = labs.platelets;
    if (labs?.creatinine != null) patientData.creatinine = labs.creatinine;
    if (labs?.bilirubin != null) patientData.bilirubin = labs.bilirubin;
    if (labs?.lactate != null) patientData.lactate = labs.lactate;
    if (labs?.pao2_fio2_ratio != null) patientData.pao2_fio2_ratio = labs.pao2_fio2_ratio;

    // Clinical context
    if (gcs != null) patientData.gcs = gcs;
    if (urineOutputMlDay != null) patientData.urine_output_ml_day = urineOutputMlDay;
    if (onVasopressors) patientData.on_vasopressors = true;
    if (onMechanicalVentilation) patientData.on_mechanical_ventilation = true;
    if (admissionDiagnosis?.trim()) patientData.admission_diagnosis = admissionDiagnosis;
    if (lengthOfStayDays != null) patientData.length_of_stay_days = lengthOfStayDays;

    mutate({ patient_data: patientData, prediction_type: useType });
  };

  const riskConfig = prediction?.risk_level
    ? RISK_LEVEL_CONFIG[prediction.risk_level] || RISK_LEVEL_CONFIG.low
    : null;

  const hasPrediction = prediction && prediction.risk_level && !prediction.error;
  const alertCount = prediction?.critical_alerts?.length ?? 0;

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
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-red-500" />
            <span className="sm:hidden">ICU Risk</span>
            <span className="hidden sm:inline">ICU Risk Assessment</span>
            <Badge variant="outline" className="text-xs font-normal gap-1">
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
            <p className="text-sm text-muted-foreground text-center">
              {hasEnoughData
                ? 'Run AI analysis to assess ICU risk, compute SOFA/qSOFA scores, and identify escalation needs.'
                : 'Enter patient vitals to enable ICU risk assessment.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isPending || !hasEnoughData}
                onClick={() => handlePredict('predict')}
                className="gap-2"
              >
                {isPending && predictionType === 'predict' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <HeartPulse className="h-4 w-4" />
                    ICU Risk
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isPending || !hasEnoughData}
                onClick={() => handlePredict('risk-stratify')}
                className="gap-2"
              >
                {isPending && predictionType === 'risk-stratify' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4" />
                    <span className="sm:hidden">Stratify</span>
                    <span className="hidden sm:inline">Risk Stratify</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Prediction Results */}
        {hasPrediction && riskConfig && (
          <div className="space-y-4">
            {/* Risk Level Banner */}
            <div
              className={cn(
                'rounded-lg p-3 border',
                riskConfig.bgColor,
                riskConfig.borderColor
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <ShieldAlert className={cn('h-5 w-5 mt-0.5 shrink-0', riskConfig.color)} />
                  <div className="min-w-0">
                    <p className={cn('font-semibold', riskConfig.color)}>
                      {riskConfig.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Risk Score: {Math.round(prediction.risk_score * 100)}%
                      {prediction.sofa_score != null && (
                        <> &bull; SOFA: {prediction.sofa_score}/24</>
                      )}
                      {prediction.qsofa_score != null && (
                        <> &bull; qSOFA: {prediction.qsofa_score}/3</>
                      )}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    'shrink-0',
                    prediction.risk_level === 'critical'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                      : prediction.risk_level === 'high'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                        : prediction.risk_level === 'moderate'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  )}
                >
                  {riskConfig.label}
                </Badge>
              </div>
            </div>

            {/* Escalation Recommendation */}
            {prediction.escalation && (
              <EscalationBanner escalation={prediction.escalation} />
            )}

            {/* Critical Alerts */}
            {alertCount > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  Critical Alerts ({alertCount})
                </h4>
                <div className="space-y-2">
                  {prediction.critical_alerts!.map((alert, i) => (
                    <CriticalAlertItem key={i} alert={alert} />
                  ))}
                </div>
              </div>
            )}

            {/* Advisory Disclaimer */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                AI-generated assessment. SOFA/qSOFA scores and escalation recommendations
                are advisory only. Use clinical judgment to validate.
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
              <span className="text-sm">
                {showDetails ? 'Hide' : 'Show'} Details
              </span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showDetails && (
              <Tabs defaultValue="scores" className="space-y-3">
                <TabsList className="w-full grid grid-cols-3 h-auto">
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
                  {prediction.sofa_breakdown && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-1.5">
                        SOFA Breakdown
                        <span className="text-xs text-muted-foreground font-normal">
                          (Total: {prediction.sofa_score}/24)
                        </span>
                      </h4>
                      <SOFABreakdownChart breakdown={prediction.sofa_breakdown} />
                    </div>
                  )}

                  {/* qSOFA Criteria */}
                  {prediction.qsofa_criteria && prediction.qsofa_criteria.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-1.5">
                        qSOFA Criteria Met
                        <span className="text-xs text-muted-foreground font-normal">
                          ({prediction.qsofa_score}/3)
                        </span>
                      </h4>
                      <ul className="space-y-1 pl-1">
                        {prediction.qsofa_criteria.map((criteria, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            {criteria}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                {/* Probabilities Tab */}
                <TabsContent value="probabilities" className="space-y-3 pt-1">
                  {prediction.sepsis_probability != null ||
                  prediction.aki_probability != null ||
                  prediction.deterioration_probability != null ? (
                    <>
                      <RiskProbabilityBar
                        label="Sepsis"
                        probability={prediction.sepsis_probability}
                      />
                      <RiskProbabilityBar
                        label="Acute Kidney Injury"
                        probability={prediction.aki_probability}
                      />
                      <RiskProbabilityBar
                        label="Clinical Deterioration"
                        probability={prediction.deterioration_probability}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Run &quot;Risk Stratify&quot; to see individual condition probabilities.
                    </p>
                  )}
                </TabsContent>

                {/* Actions Tab */}
                <TabsContent value="actions" className="space-y-3 pt-1">
                  {prediction.recommendations && prediction.recommendations.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Recommendations</h4>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                        {prediction.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No specific recommendations at this time.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {/* Re-run Buttons */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
              <AIFeedbackButtons
                messageId={`icu-${predictionType}-${panelId}`}
                serviceType="icu_predictor"
                userQuery={admissionDiagnosis}
                botResponse={`${prediction.risk_level} risk${prediction.risk_score != null ? ` — ${Math.round(prediction.risk_score * 100)}%` : ''}`}
                metadata={{
                  prediction_type: predictionType,
                  risk_level: prediction.risk_level,
                  risk_score: prediction.risk_score,
                  sofa_score: prediction.sofa_score,
                  qsofa_score: prediction.qsofa_score,
                }}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => {
                  reset();
                  handlePredict('predict');
                }}
                className="gap-1.5 text-xs"
              >
                {isPending && predictionType === 'predict' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <HeartPulse className="h-3.5 w-3.5" />
                )}
                Re-run ICU Risk
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => {
                  reset();
                  handlePredict('risk-stratify');
                }}
                className="gap-1.5 text-xs"
              >
                {isPending && predictionType === 'risk-stratify' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                Re-run Risk Stratify
              </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error State (TibaBot unavailable but returned gracefully) */}
        {prediction && !hasPrediction && prediction.error && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-500" />
            <div>
              <p>{prediction.error}</p>
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
        {isError && !prediction && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
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
