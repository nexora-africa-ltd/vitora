/**
 * Discharge Readiness Panel — AI-powered discharge assessment
 *
 * Displays composite readiness score, criteria checklist with met/unmet status,
 * vitals stability indicator, readmission risk, and recommendations.
 * Includes Kenya-specific criteria (NHIF/SHA coverage, CHW referral).
 *
 * Advisory only — clinician must review and confirm discharge decisions.
 *
 * Phase 5: Discharge Readiness
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Info,
  Loader2,
  BrainCircuit,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircularProgress } from '@/components/ui/circular-progress';
import { HelpPopover } from '@/components/shared/help-popover';
import { useFacility } from '@/lib/context/facility-context';
import { useAIDischargeAssess, useAIDischargeConditions, useAIEnabled, useStoredDischargeResults, aiKeys } from '@/lib/hooks/use-ai';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AIDischargeAssessRequest,
  AIDischargeAssessResponse,
  AIDischargeCriterion,
  AILabResultItem,
  AIVitalsSnapshot,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface DischargeReadinessPanelProps {
  /** Admission ID for persistence */
  admissionId?: number;
  /** Patient age in years */
  patientAge: number;
  /** Primary diagnosis */
  primaryDiagnosis: string;
  /** Admission type */
  admissionType?: 'medical' | 'surgical' | 'obstetric' | 'pediatric';
  /** Days since admission */
  daysAdmitted: number;
  /** Vitals from last 48h */
  vitalsHistory?: AIVitalsSnapshot[];
  /** Recent lab results */
  labResults?: AILabResultItem[];
  /** Current medications */
  currentMedications?: string[];
  /** Functional assessments */
  canAmbulate?: boolean | null;
  canTolerateOral?: boolean | null;
  /** Social/follow-up */
  hasFollowUpArranged?: boolean;
  hasCaregiverAtHome?: boolean | null;
  /** Kenya-specific */
  hasNhifOrSha?: boolean | null;
  chwReferralMade?: boolean | null;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** When true, auto-trigger the assessment (set by widget quick action) */
  autoTrigger?: boolean;
  /** Called after auto-trigger is consumed */
  onAutoTriggerConsumed?: () => void;
}

// =============================================================================
// READINESS LEVEL STYLES
// =============================================================================

const READINESS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  ready: {
    label: 'Ready for Discharge',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  near_ready: {
    label: 'Near Ready',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
  },
  not_ready: {
    label: 'Not Ready',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  vitals: 'Vital Signs',
  labs: 'Laboratory',
  functional: 'Functional',
  medication: 'Medication',
  social: 'Social / Support',
  follow_up: 'Follow-up',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CriterionItem({ criterion }: { criterion: AIDischargeCriterion }) {
  return (
    <div className="flex items-start gap-2 py-1.5" role="listitem" aria-label={`${criterion.name}: ${criterion.met ? 'met' : 'not met'}`}>
      {criterion.met ? (
        <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <X className="h-4 w-4 mt-0.5 shrink-0 text-red-500 dark:text-red-400" />
      )}
      <div className="min-w-0">
        <p className={cn('text-sm', criterion.met ? 'text-muted-foreground' : 'font-medium')}>
          {criterion.name}
        </p>
        {(criterion.details || criterion.notes) && (
          <p className="text-xs text-muted-foreground">{criterion.details || criterion.notes}</p>
        )}
        {criterion.current_value != null && criterion.target_value != null && (
          <p className="text-xs text-muted-foreground">
            Current: {criterion.current_value} · Target: {criterion.target_value}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DischargeReadinessPanel({
  admissionId,
  patientAge,
  primaryDiagnosis,
  admissionType = 'medical',
  daysAdmitted,
  vitalsHistory,
  labResults,
  currentMedications,
  canAmbulate,
  canTolerateOral,
  hasFollowUpArranged = false,
  hasCaregiverAtHome,
  hasNhifOrSha,
  chwReferralMade,
  disabled,
  autoTrigger,
  onAutoTriggerConsumed,
}: DischargeReadinessPanelProps) {
  const isAIEnabled = useAIEnabled();
  const { hasModule } = useFacility();
  const queryClient = useQueryClient();
  const { mutate, data: result, isPending, isError, reset } = useAIDischargeAssess();
  const [showDetails, setShowDetails] = React.useState(false);
  const panelId = React.useId();

  // Load supported conditions (for condition-specific criteria indicators)
  const { data: conditionsData } = useAIDischargeConditions();
  const hasConditionSpecificCriteria = conditionsData?.conditions?.some(
    (c) => primaryDiagnosis.toLowerCase().includes(c.toLowerCase())
  ) ?? false;

  // Load stored discharge results
  const { data: storedResults } = useStoredDischargeResults(admissionId);
  const latestStored = storedResults?.[0];
  const displayResult: AIDischargeAssessResponse | undefined = result
    ?? (latestStored?.result_data as unknown as AIDischargeAssessResponse | undefined);

  // Show success toast when assessment completes
  React.useEffect(() => {
    if (result && result.readiness_level) {
      const score = Math.round(result.readiness_score * 100);
      const levelLabel = result.readiness_level === 'ready' ? 'Ready'
        : result.readiness_level === 'near_ready' ? 'Near ready' : 'Not ready';
      toast.success('Discharge assessment complete', {
        description: `${levelLabel} — ${score}% readiness score`,
      });
      if (admissionId) {
        queryClient.invalidateQueries({ queryKey: aiKeys.storedDischarge(admissionId) });
      }
    }
  }, [result, queryClient, admissionId]);

  // Auto-trigger from widget quick action
  const autoTriggerRef = React.useRef(autoTrigger);
  autoTriggerRef.current = autoTrigger;
  const hasFiredAutoTrigger = React.useRef(false);

  React.useEffect(() => {
    if (autoTriggerRef.current && isAIEnabled && !isPending && !displayResult && !hasFiredAutoTrigger.current) {
      hasFiredAutoTrigger.current = true;
      mutate({
        admission_id: admissionId,
        patient_age: patientAge,
        primary_diagnosis: primaryDiagnosis,
        admission_type: admissionType,
        days_admitted: daysAdmitted,
        vitals_history: vitalsHistory,
        lab_results: labResults,
        current_medications: currentMedications,
        can_ambulate: canAmbulate,
        can_tolerate_oral: canTolerateOral,
        has_follow_up_arranged: hasFollowUpArranged,
        has_caregiver_at_home: hasCaregiverAtHome,
        has_nhif_or_sha: hasNhifOrSha,
        chw_referral_made: chwReferralMade,
      });
      onAutoTriggerConsumed?.();
    }
  }, [autoTrigger, isAIEnabled, isPending, displayResult, mutate, admissionId, patientAge, primaryDiagnosis, admissionType, daysAdmitted, vitalsHistory, labResults, currentMedications, canAmbulate, canTolerateOral, hasFollowUpArranged, hasCaregiverAtHome, hasNhifOrSha, chwReferralMade, onAutoTriggerConsumed]);

  // Map criteria categories to facility modules — hide criteria for disabled modules
  const CATEGORY_MODULE_MAP: Record<string, keyof import('@/lib/auth/context').FacilityModules> = {
    labs: 'laboratory',
    medication: 'pharmacy',
  };

  // Group criteria by category, filtering out categories for disabled facility modules
  const groupedCriteria = React.useMemo(() => {
    if (!displayResult?.criteria) return {};
    return displayResult.criteria.reduce<Record<string, AIDischargeCriterion[]>>((acc, c) => {
      const cat = c.category || 'other';
      const requiredModule = CATEGORY_MODULE_MAP[cat];
      if (requiredModule && !hasModule(requiredModule)) return acc;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(c);
      return acc;
    }, {});
  }, [displayResult?.criteria, hasModule]);

  if (!isAIEnabled) return null;

  const handleAssess = () => {
    mutate({
      admission_id: admissionId,
      patient_age: patientAge,
      primary_diagnosis: primaryDiagnosis,
      admission_type: admissionType,
      days_admitted: daysAdmitted,
      vitals_history: vitalsHistory,
      lab_results: labResults,
      current_medications: currentMedications,
      can_ambulate: canAmbulate,
      can_tolerate_oral: canTolerateOral,
      has_follow_up_arranged: hasFollowUpArranged,
      has_caregiver_at_home: hasCaregiverAtHome,
      has_nhif_or_sha: hasNhifOrSha,
      chw_referral_made: chwReferralMade,
    });
  };

  const hasResult = displayResult && displayResult.readiness_level;
  const readinessConfig = hasResult ? READINESS_CONFIG[displayResult.readiness_level] : null;
  const isFallback = displayResult?.mode === 'fallback';

  return (
    <Card className={cn(
      'transition-colors duration-500',
      hasResult && 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Discharge Readiness</CardTitle>
            <BrainCircuit className="h-3.5 w-3.5 text-purple-500" />
            <HelpPopover content="AI-powered discharge readiness assessment. Evaluates clinical, functional, and social criteria. Includes Kenya-specific checks (SHA coverage, CHW referral). Advisory only." />
          </div>
          {isFallback && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Offline Mode
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Initial State */}
        {!hasResult && !isPending && !isError && !displayResult && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isPending}
              onClick={handleAssess}
              className="gap-2"
            >
              <ClipboardCheck className="h-4 w-4" />
              Assess Discharge Readiness
            </Button>
            {hasConditionSpecificCriteria && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                Condition-specific criteria available for this diagnosis
              </p>
            )}
          </div>
        )}

        {/* Loading */}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Evaluating discharge criteria...
          </div>
        )}

        {/* Results */}
        {hasResult && readinessConfig && (
          <div className="space-y-3">
            {/* Readiness Score Banner */}
            <div
              className={cn('rounded-lg p-4 border', readinessConfig.bgColor, readinessConfig.borderColor)}
              role="status"
              aria-label={`Discharge readiness: ${readinessConfig.label}, ${Math.round(displayResult.readiness_score * 100)} percent`}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <CircularProgress
                  value={displayResult.readiness_score * 100}
                  size={80}
                  strokeWidth={6}
                  aria-valuenow={Math.round(displayResult.readiness_score * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Readiness score"
                  indicatorClassName={cn(
                    displayResult.readiness_level === 'ready'
                      ? 'stroke-green-500 dark:stroke-green-400'
                      : displayResult.readiness_level === 'near_ready'
                        ? 'stroke-yellow-500 dark:stroke-yellow-400'
                        : 'stroke-red-500 dark:stroke-red-400'
                  )}
                >
                  <span className={cn('text-lg font-bold', readinessConfig.color)}>
                    {Math.round(displayResult.readiness_score * 100)}%
                  </span>
                </CircularProgress>
                <div>
                  <p className={cn('font-semibold', readinessConfig.color)}>
                    {readinessConfig.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {displayResult.unmet_criteria_count > 0
                      ? `${displayResult.unmet_criteria_count} unmet criteria remaining`
                      : 'All criteria met'}
                  </p>
                </div>
              </div>
            </div>

            {/* Vitals Stability */}
            {displayResult.vitals_stability && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Vitals:</span>
                <Badge variant="secondary" className={cn(
                  'text-xs',
                  displayResult.vitals_stability === 'stable' ? 'text-green-700 dark:text-green-400' :
                  displayResult.vitals_stability === 'improving' ? 'text-blue-700 dark:text-blue-400' :
                  'text-red-700 dark:text-red-400'
                )}>
                  {displayResult.vitals_stability}
                </Badge>
              </div>
            )}

            {/* Readmission Risk */}
            {displayResult.readmission_risk != null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Readmission risk:</span>
                <span className="font-medium">{Math.round(displayResult.readmission_risk * 100)}%</span>
                {displayResult.readmission_risk_level && (
                  <Badge variant="secondary" className="text-xs">
                    {displayResult.readmission_risk_level}
                  </Badge>
                )}
              </div>
            )}

            {/* Criteria Checklist */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              aria-controls={`${panelId}-criteria`}
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <span className="text-sm">
                Criteria Checklist ({displayResult.criteria?.length ?? 0})
              </span>
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showDetails && (
              <div id={`${panelId}-criteria`} role="list" aria-label="Discharge criteria checklist" className="space-y-3">
                {Object.entries(groupedCriteria).map(([category, criteria]) => (
                  <div key={category} className="space-y-1" role="group" aria-label={CATEGORY_LABELS[category] ?? category}>
                    <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABELS[category] ?? category}
                    </h5>
                    <div className="divide-y divide-border">
                      {criteria.map((c, i) => (
                        <CriterionItem key={i} criterion={c} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {displayResult.recommendations && displayResult.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Recommendations</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                  {displayResult.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Advisory */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>AI-generated assessment. Discharge decisions require clinical judgment and attending physician approval.</span>
            </div>

            {/* Feedback + Re-run */}
            <div className="flex items-center justify-between">
              <AIFeedbackButtons
                messageId={`discharge-${panelId}`}
                serviceType="discharge_readiness"
                userQuery={primaryDiagnosis}
                botResponse={`${readinessConfig.label} — ${Math.round(displayResult.readiness_score * 100)}%`}
                metadata={{
                  readiness_level: displayResult.readiness_level,
                  readiness_score: displayResult.readiness_score,
                  condition: primaryDiagnosis,
                  unmet_count: displayResult.unmet_criteria_count,
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => { reset(); handleAssess(); }}
                className="gap-1.5 text-xs"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Re-assess
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-destructive/10 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div>
              <p>{displayResult ? 'Re-assessment failed. Showing previous result.' : 'Failed to assess discharge readiness. Please try again.'}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAssess}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
