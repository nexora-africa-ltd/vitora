/**
 * AI Risk Assessment Panel
 *
 * Displays AI-predicted condition risk assessment during triage.
 * Uses TibaBot's POST /predict/condition endpoint via the backend proxy.
 *
 * Advisory only — clinician must review and confirm all predictions.
 *
 * Phase 3: Condition Predictor in Triage
 * @see docs/tibabot-integration-plan.md
 */
'use client';

import * as React from 'react';
import {
  Brain,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert,
  Sparkles,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAIConditionPredict, useAIEnabled } from '@/lib/hooks/use-ai';
import type {
  AIConditionPredictRequest,
  AIConditionPredictResponse,
  AIConditionRiskFactor,
  AIDifferentialCondition,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface AIRiskAssessmentPanelProps {
  /** Patient age in years */
  patientAge: number;
  /** Patient gender */
  patientGender: 'M' | 'F' | 'O';
  /** Chief complaint text */
  chiefComplaint?: string;
  /** Chief complaint category */
  chiefComplaintCategory?: string;
  /** Vital signs */
  vitals?: {
    spo2?: number | null;
    heart_rate?: number | null;
    systolic_bp?: number | null;
    diastolic_bp?: number | null;
    temperature?: number | null;
    respiratory_rate?: number | null;
  };
  /** Clinical assessment */
  painScore?: number | null;
  mentalStatus?: string;
  mobility?: string;
  allergies?: string;
  /** Whether the form is disabled */
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
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function RiskFactorItem({ factor }: { factor: AIConditionRiskFactor }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Badge
        variant="secondary"
        className={cn('shrink-0 text-xs px-1.5 py-0', SEVERITY_BADGE_STYLES[factor.severity])}
      >
        {factor.severity}
      </Badge>
      <div className="min-w-0">
        <span className="font-medium">{factor.factor}</span>
        {factor.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{factor.description}</p>
        )}
      </div>
    </div>
  );
}

function DifferentialItem({ condition }: { condition: AIDifferentialCondition }) {
  const confidencePercent = Math.round(condition.confidence * 100);
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate">{condition.condition}</span>
        {condition.icd10_code && (
          <Badge variant="outline" className="shrink-0 text-xs font-mono">
            {condition.icd10_code}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              confidencePercent >= 80
                ? 'bg-red-500'
                : confidencePercent >= 60
                  ? 'bg-orange-500'
                  : confidencePercent >= 40
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
            )}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-8 text-right">
          {confidencePercent}%
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AIRiskAssessmentPanel({
  patientAge,
  patientGender,
  chiefComplaint,
  chiefComplaintCategory,
  vitals,
  painScore,
  mentalStatus,
  mobility,
  allergies,
  disabled = false,
}: AIRiskAssessmentPanelProps) {
  const aiEnabled = useAIEnabled();
  const { mutate, data: prediction, isPending, reset } = useAIConditionPredict();
  const [showDetails, setShowDetails] = React.useState(false);

  // Don't render if AI is disabled
  if (!aiEnabled) return null;

  const hasEnoughData =
    chiefComplaint?.trim() ||
    chiefComplaintCategory ||
    vitals?.spo2 != null ||
    vitals?.heart_rate != null ||
    vitals?.temperature != null;

  const handlePredict = () => {
    // Build patient features from form state
    const features: AIConditionPredictRequest['patient_features'] = {
      age: patientAge,
      gender: patientGender,
    };

    if (chiefComplaint?.trim()) features.chief_complaint = chiefComplaint;
    if (chiefComplaintCategory) features.chief_complaint_category = chiefComplaintCategory;
    if (vitals?.spo2 != null) features.spo2 = vitals.spo2;
    if (vitals?.heart_rate != null) features.heart_rate = vitals.heart_rate;
    if (vitals?.systolic_bp != null) features.systolic_bp = vitals.systolic_bp;
    if (vitals?.diastolic_bp != null) features.diastolic_bp = vitals.diastolic_bp;
    if (vitals?.temperature != null) features.temperature = vitals.temperature;
    if (vitals?.respiratory_rate != null) features.respiratory_rate = vitals.respiratory_rate;
    if (painScore != null) features.pain_score = painScore;
    if (mentalStatus) features.mental_status = mentalStatus;
    if (mobility) features.mobility = mobility;
    if (allergies?.trim()) features.allergies = allergies;

    mutate({ patient_features: features });
  };

  const riskConfig = prediction?.risk_level
    ? RISK_LEVEL_CONFIG[prediction.risk_level] || RISK_LEVEL_CONFIG.low
    : null;

  const hasPrediction = prediction && prediction.primary_condition;

  return (
    <Card
      className={cn(
        'border-dashed',
        hasPrediction && riskConfig ? riskConfig.borderColor : 'border-muted-foreground/25'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            AI Risk Assessment
            <Badge variant="outline" className="text-xs font-normal gap-1">
              <Sparkles className="h-3 w-3" />
              Advisory
            </Badge>
          </CardTitle>
          <HelpPopover content="AI-powered risk assessment analyzes patient features (age, gender, vitals, chief complaint) to identify potential high-risk conditions. This is advisory only — always use clinical judgment." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Run Assessment Button */}
        {!hasPrediction && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground text-center">
              {hasEnoughData
                ? 'Run AI analysis on current patient data to identify potential risk conditions.'
                : 'Enter chief complaint and vitals to enable AI risk assessment.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isPending || !hasEnoughData}
              onClick={handlePredict}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4" />
                  Run AI Assessment
                </>
              )}
            </Button>
          </div>
        )}

        {/* Prediction Results */}
        {hasPrediction && riskConfig && (
          <div className="space-y-4">
            {/* Primary Condition Banner */}
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
                      {prediction.primary_condition}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Confidence: {Math.round(prediction.confidence * 100)}% &bull;{' '}
                      {riskConfig.label}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    'shrink-0',
                    SEVERITY_BADGE_STYLES[prediction.risk_level]
                  )}
                >
                  {riskConfig.label}
                </Badge>
              </div>
            </div>

            {/* Advisory Disclaimer */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                AI-generated assessment. Use clinical judgment to validate.
                This does not replace clinical decision-making.
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
                {prediction.risk_factors && prediction.risk_factors.length > 0 && (
                  <span className="ml-1">
                    ({prediction.risk_factors.length} risk factor
                    {prediction.risk_factors.length !== 1 ? 's' : ''})
                  </span>
                )}
              </span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showDetails && (
              <div className="space-y-4 pt-1">
                {/* Risk Factors */}
                {prediction.risk_factors && prediction.risk_factors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      Risk Factors
                    </h4>
                    <div className="space-y-2 pl-1">
                      {prediction.risk_factors.map((rf, i) => (
                        <RiskFactorItem key={i} factor={rf} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Differential Conditions */}
                {prediction.differential_conditions &&
                  prediction.differential_conditions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Differential Conditions</h4>
                      <div className="space-y-0.5 pl-1">
                        {prediction.differential_conditions.map((dc, i) => (
                          <DifferentialItem key={i} condition={dc} />
                        ))}
                      </div>
                    </div>
                  )}

                {/* Recommendations */}
                {prediction.recommendations && prediction.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Recommendations</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                      {prediction.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Re-run Button */}
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => {
                  reset();
                  handlePredict();
                }}
                className="gap-1.5 text-xs"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Brain className="h-3.5 w-3.5" />
                )}
                Re-run Assessment
              </Button>
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
                onClick={handlePredict}
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
