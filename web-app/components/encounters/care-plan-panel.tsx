/**
 * Care Plan Panel — AI-powered care plan generation
 *
 * Displays structured care plans with prioritized goals, grouped interventions,
 * discharge criteria, follow-up instructions, and FHIR R4 export.
 * Includes KEML facility-level medication notes and CDS safety alerts.
 *
 * Advisory only — clinician must review and confirm all recommendations.
 *
 * Phase 5: Care Plan Generator
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  Info,
  Loader2,
  BrainCircuit,
  Target,
  Trash2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAICarePlanGenerate, useAIEnabled, useStoredCarePlans, aiKeys } from '@/lib/hooks/use-ai';
import { aiApi } from '@/lib/api/ai';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AICarePlanGenerateRequest,
  AICarePlanResponse,
  AICarePlanGoal,
  AICarePlanInterventionCategory,
  AICarePlanFollowUp,
  AILabResultItem,
} from '@/lib/types/ai';
import type { NursingCarePlanEntryCreateData } from '@/lib/types/inpatient';

// =============================================================================
// TYPES
// =============================================================================

export interface CarePlanPanelProps {
  /** Encounter ID for persistence */
  encounterId?: number;
  /** Admission ID for persistence */
  admissionId?: number;
  /** Primary diagnosis (confirmed) */
  primaryDiagnosis?: string;
  /** Chief complaint from triage (used when no diagnosis yet) */
  chiefComplaint?: string;
  /** ICD-10 code if available */
  icd10Code?: string;
  /** Severity */
  severity?: string;
  /** Patient age */
  patientAge: number;
  /** Patient sex */
  patientSex: 'male' | 'female';
  /** Whether patient is pregnant */
  isPregnant?: boolean;
  /** Kenya facility level */
  facilityLevel?: string;
  /** Comorbidities */
  comorbidities?: string[];
  /** Allergies */
  allergies?: string[];
  /** Current medications */
  currentMedications?: string[];
  /** Vitals as key-value */
  vitals?: Record<string, number>;
  /** Recent lab results */
  labResults?: AILabResultItem[];
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** When true, auto-trigger generation (set by widget quick action) */
  autoTrigger?: boolean;
  /** Called after auto-trigger is consumed */
  onAutoTriggerConsumed?: () => void;
  /** Callback to apply AI care plan as ADPIE nursing entries. When provided, shows "Apply to Kardex" button. */
  onApplyToKardex?: (entries: NursingCarePlanEntryCreateData[]) => void;
  /** Whether Apply to Kardex is currently pending */
  isApplyingToKardex?: boolean;
  /** Whether this care plan was already applied to the Kardex (idempotency guard). */
  appliedToKardex?: boolean;
}

// =============================================================================
// PRIORITY STYLES
// =============================================================================

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

const CATEGORY_LABELS: Record<string, string> = {
  medications: 'Medications',
  investigations: 'Investigations',
  nursing: 'Nursing Care',
  nutrition: 'Nutrition',
  patient_education: 'Patient Education',
  rehabilitation: 'Rehabilitation',
  referrals: 'Referrals',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
        >
          <span className="flex items-center gap-2">
            {title}
            {count != null && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {count}
              </Badge>
            )}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function GoalItem({ goal }: { goal: AICarePlanGoal }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Target className={cn(
        'h-4 w-4 mt-0.5 shrink-0',
        goal.priority === 'high' ? 'text-red-500' :
        goal.priority === 'medium' ? 'text-yellow-500' :
        'text-blue-500'
      )} />
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{goal.description}</p>
          <Badge variant="secondary" className={cn('text-xs', PRIORITY_STYLES[goal.priority])}>
            {goal.priority}
          </Badge>
        </div>
        {goal.timeframe && (
          <p className="text-xs text-muted-foreground">Timeframe: {goal.timeframe}</p>
        )}
        {goal.measurable_target && (
          <p className="text-xs text-muted-foreground">Target: {goal.measurable_target}</p>
        )}
      </div>
    </div>
  );
}

function InterventionCategorySection({ category }: { category: AICarePlanInterventionCategory }) {
  return (
    <div className="space-y-1.5">
      <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {CATEGORY_LABELS[category.category] ?? category.category}
      </h5>
      <div className="space-y-1">
        {category.items.map((item, i) => (
          <div key={i} className="rounded-md p-2 bg-muted/30 text-sm">
            <p className="font-medium">{item.action}</p>
            {item.frequency && (
              <p className="text-xs text-muted-foreground mt-0.5">Frequency: {item.frequency}</p>
            )}
            {item.rationale && (
              <p className="text-xs text-muted-foreground">Rationale: {item.rationale}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpSection({ followUp }: { followUp: AICarePlanFollowUp }) {
  const followUpTiming = followUp.timing || followUp.appointment;
  return (
    <div className="space-y-2 rounded-md p-2.5 border border-border">
      {followUpTiming && (
        <h5 className="text-sm font-medium">Follow-up: {followUpTiming}</h5>
      )}
      {followUp.instructions && (
        <p className="text-sm text-muted-foreground">{followUp.instructions}</p>
      )}
      {followUp.red_flags && followUp.red_flags.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Red Flags:</p>
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5 pl-1">
            {followUp.red_flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AI → ADPIE MAPPING
// =============================================================================

const CATEGORY_LABELS_MAP: Record<string, string> = {
  medications: 'Medications',
  investigations: 'Investigations',
  nursing: 'Nursing Care',
  nutrition: 'Nutrition',
  patient_education: 'Patient Education',
  rehabilitation: 'Rehabilitation',
  referrals: 'Referrals',
};

/**
 * Maps an AI CarePlanResponse into NursingCarePlanEntry ADPIE records.
 * Creates one entry per goal. Interventions and rationale are shared across all entries.
 */
function mapAIToADPIE(plan: AICarePlanResponse): NursingCarePlanEntryCreateData[] {
  const now = new Date().toISOString();

  // Format all interventions into a plan-of-action text block
  const planOfAction = plan.interventions
    .map((cat) => {
      const label = CATEGORY_LABELS_MAP[cat.category] ?? cat.category;
      const items = cat.items
        .map((item) => {
          let line = `- ${item.action}`;
          if (item.frequency) line += ` (${item.frequency})`;
          return line;
        })
        .join('\n');
      return `${label}:\n${items}`;
    })
    .join('\n\n');

  // Collect all rationales
  const rationales = plan.interventions
    .flatMap((cat) => cat.items.filter((i) => i.rationale).map((i) => `- ${i.rationale}`));
  const evidenceLine = plan.evidence_sources?.length
    ? `\n\nEvidence: ${plan.evidence_sources.join(', ')}`
    : '';
  const scientificRationale = (rationales.length > 0 ? rationales.join('\n') : 'See AI-generated care plan for rationale.') + evidenceLine;

  // One entry per goal
  return plan.goals.map((goal) => {
    const goalText = [
      goal.description,
      goal.measurable_target ? `Target: ${goal.measurable_target}` : null,
      goal.timeframe ? `Timeframe: ${goal.timeframe}` : null,
    ]
      .filter(Boolean)
      .join('. ');

    return {
      recorded_at: now,
      assessment: `AI-generated care plan for ${plan.primary_diagnosis}${plan.severity ? ` (${plan.severity})` : ''}. Priority: ${goal.priority}.`,
      nursing_diagnosis: plan.primary_diagnosis,
      goal_and_outcome_criteria: goalText,
      plan_of_action: planOfAction,
      scientific_rationale: scientificRationale,
    };
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CarePlanPanel({
  encounterId,
  admissionId,
  primaryDiagnosis,
  chiefComplaint,
  icd10Code,
  severity,
  patientAge,
  patientSex,
  isPregnant = false,
  facilityLevel = 'H3',
  comorbidities,
  allergies,
  currentMedications,
  vitals,
  labResults,
  disabled,
  autoTrigger,
  onAutoTriggerConsumed,
  onApplyToKardex,
  isApplyingToKardex,
  appliedToKardex: appliedToKardexProp,
}: CarePlanPanelProps) {
  const isAIEnabled = useAIEnabled();
  const queryClient = useQueryClient();
  const { mutate, data: result, isPending, isError, reset } = useAICarePlanGenerate();
  const [isExporting, setIsExporting] = React.useState(false);
  const [appliedThisSession, setAppliedThisSession] = React.useState(false);
  const panelId = React.useId();

  // Idempotency: treat as applied if the prop says so OR we applied it this session
  const isAppliedToKardex = appliedToKardexProp || appliedThisSession;

  // Load stored care plan
  const storedParams = React.useMemo(
    () => ({ encounter_id: encounterId, admission_id: admissionId }),
    [encounterId, admissionId],
  );
  const { data: storedResults } = useStoredCarePlans(storedParams);
  const latestStored = storedResults?.[0];

  // Hydrate from stored result if no fresh result yet
  const displayResult: AICarePlanResponse | undefined = result
    ?? (latestStored?.result_data as unknown as AICarePlanResponse | undefined);

  // Show success toast when care plan is generated
  React.useEffect(() => {
    if (result && result.goals && result.goals.length > 0) {
      const totalInterventions = result.interventions?.reduce(
        (sum, cat) => sum + cat.items.length, 0
      ) ?? 0;
      toast.success('Care plan generated', {
        description: `${result.goals.length} goal(s), ${totalInterventions} intervention(s)`,
      });
      // Invalidate stored results cache so it refreshes
      queryClient.invalidateQueries({ queryKey: aiKeys.storedCarePlans(storedParams) });
    }
  }, [result, queryClient, storedParams]);

  // Auto-trigger from widget quick action
  React.useEffect(() => {
    if (autoTrigger && isAIEnabled && !isPending && !displayResult) {
      mutate({
        encounter_id: encounterId,
        admission_id: admissionId,
        primary_diagnosis: primaryDiagnosis || undefined,
        chief_complaint: chiefComplaint || undefined,
        icd10_code: icd10Code,
        severity,
        comorbidities,
        patient_age: patientAge,
        patient_sex: patientSex,
        is_pregnant: isPregnant,
        facility_level: facilityLevel,
        allergies,
        current_medications: currentMedications,
        vitals,
        lab_results: labResults,
      });
      onAutoTriggerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  if (!isAIEnabled) return null;

  const handleGenerate = () => {
    mutate({
      encounter_id: encounterId,
      admission_id: admissionId,
      primary_diagnosis: primaryDiagnosis || undefined,
      chief_complaint: chiefComplaint || undefined,
      icd10_code: icd10Code,
      severity,
      comorbidities,
      patient_age: patientAge,
      patient_sex: patientSex,
      is_pregnant: isPregnant,
      facility_level: facilityLevel,
      allergies,
      current_medications: currentMedications,
      vitals,
      lab_results: labResults,
    });
  };

  const handleExportFHIR = async () => {
    setIsExporting(true);
    try {
      const fhirData = await aiApi.generateCarePlanFHIR({
        encounter_id: encounterId,
        admission_id: admissionId,
        primary_diagnosis: primaryDiagnosis || undefined,
        chief_complaint: chiefComplaint || undefined,
        icd10_code: icd10Code,
        severity,
        comorbidities,
        patient_age: patientAge,
        patient_sex: patientSex,
        is_pregnant: isPregnant,
        facility_level: facilityLevel,
        allergies,
        current_medications: currentMedications,
        vitals,
        lab_results: labResults,
      });
      const blob = new Blob([JSON.stringify(fhirData, null, 2)], { type: 'application/fhir+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const label = (primaryDiagnosis || chiefComplaint || 'care-plan').replace(/\s+/g, '-').toLowerCase();
      a.download = `care-plan-${label}.fhir.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — user can retry
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = () => {
    reset();
    // Delete the latest stored result if available
    if (latestStored?.id) {
      aiApi.deleteStoredCarePlan(latestStored.id).then(() => {
        queryClient.invalidateQueries({ queryKey: aiKeys.storedCarePlans(storedParams) });
        toast.success('Care plan cleared');
      }).catch(() => {
        toast.error('Failed to clear stored care plan');
      });
    } else {
      toast.success('Care plan cleared');
    }
  };

  const hasResult = displayResult && displayResult.goals && displayResult.goals.length > 0;
  const isFallback = displayResult?.mode === 'fallback';

  return (
    <Card className={cn(
      'transition-colors duration-500',
      hasResult && 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Care Plan</CardTitle>
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
              AI
            </Badge>
            <HelpPopover content="AI-generated care plan with goals, interventions, and discharge criteria. Validated against KEML formulary and CDS safety rules. Advisory only." />
          </div>
          {isFallback && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Template Only
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Initial State */}
        {!hasResult && !isPending && !isError && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isPending}
            onClick={handleGenerate}
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            Generate Care Plan
          </Button>
        )}

        {/* Loading */}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating care plan...
          </div>
        )}

        {/* Results */}
        {hasResult && (
          <div className="space-y-3">
            {/* Diagnosis Header */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-medium">{displayResult.primary_diagnosis}</span>
              {displayResult.icd10_code && (
                <Badge variant="secondary" className="text-xs">{displayResult.icd10_code}</Badge>
              )}
              {displayResult.severity && (
                <Badge variant="outline" className="text-xs">{displayResult.severity}</Badge>
              )}
              {displayResult.template_used && (
                <span className="text-xs text-muted-foreground">Template: {displayResult.template_used}</span>
              )}
            </div>

            {/* CDS Safety Alerts */}
            {displayResult.cds_alerts && displayResult.cds_alerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Safety Alerts ({displayResult.cds_alerts.length})
                </h4>
                {displayResult.cds_alerts.map((alert, i) => (
                  <div key={i} className="rounded-md p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-sm text-orange-800 dark:text-orange-200">
                    {typeof alert === 'object' && alert !== null
                      ? (alert as Record<string, unknown>).message as string ?? JSON.stringify(alert)
                      : String(alert)}
                  </div>
                ))}
              </div>
            )}

            {/* Collapsible Sections */}
            <div className="divide-y rounded-md border">
              {/* Goals */}
              <CollapsibleSection
                title="Goals"
                count={displayResult.goals.length}
                defaultOpen
              >
                <div className="space-y-1">
                  {displayResult.goals.map((goal, i) => (
                    <GoalItem key={i} goal={goal} />
                  ))}
                </div>
              </CollapsibleSection>

              {/* Interventions */}
              <CollapsibleSection
                title="Interventions"
                count={displayResult.interventions.reduce((sum, cat) => sum + cat.items.length, 0)}
                defaultOpen
              >
                <div className="space-y-4">
                  {displayResult.interventions.map((cat, i) => (
                    <InterventionCategorySection key={i} category={cat} />
                  ))}
                  {displayResult.facility_level_notes && displayResult.facility_level_notes.length > 0 && (
                    <div className="space-y-1 rounded-md p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Facility Level Notes</p>
                      {displayResult.facility_level_notes.map((note, i) => (
                        <p key={i} className="text-xs text-blue-600 dark:text-blue-300">{note}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* Discharge & Follow-up */}
              <CollapsibleSection
                title="Discharge & Follow-up"
                count={(displayResult.discharge_criteria?.length || 0) + (displayResult.follow_up ? 1 : 0)}
              >
                <div className="space-y-3">
                  {displayResult.discharge_criteria && displayResult.discharge_criteria.length > 0 ? (
                    <div className="space-y-1">
                      <h5 className="text-sm font-medium">Discharge Criteria</h5>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                        {displayResult.discharge_criteria.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No specific discharge criteria generated.
                    </p>
                  )}
                  {displayResult.follow_up && <FollowUpSection followUp={displayResult.follow_up} />}
                </div>
              </CollapsibleSection>
            </div>

            {/* Evidence Sources */}
            {displayResult.evidence_sources && displayResult.evidence_sources.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Sources: {displayResult.evidence_sources.join(', ')}
              </div>
            )}

            {/* Advisory */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>AI-generated care plan. Review all interventions and adjust based on clinical judgment and patient response.</span>
            </div>

            {/* Feedback + Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
              <AIFeedbackButtons
                messageId={`careplan-${panelId}`}
                serviceType="care_plan"
                userQuery={primaryDiagnosis || chiefComplaint}
                botResponse={`Goals: ${displayResult.goals.map(g => g.description).join('; ')}`}
                metadata={{
                  mode: displayResult.mode,
                  template_used: displayResult.template_used,
                  llm_enriched: displayResult.llm_enriched,
                  facility_level: facilityLevel,
                  goals_count: displayResult.goals.length,
                  interventions_count: displayResult.interventions.reduce((s, c) => s + c.items.length, 0),
                }}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <TooltipProvider delayDuration={300}>
                  {isAppliedToKardex ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || isPending}
                      onClick={() => { reset(); setAppliedThisSession(false); handleGenerate(); }}
                      className="gap-1.5 text-xs"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate New
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || isPending}
                      onClick={() => { reset(); handleGenerate(); }}
                      className="gap-1.5 text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </Button>
                  )}
                  {isAppliedToKardex ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled
                            className="gap-1.5 text-xs text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Clear
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This care plan has been applied to the Kardex. Generate a new one to make changes.</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="gap-1.5 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                  {onApplyToKardex && (
                    isAppliedToKardex ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              disabled
                              className="gap-1.5 text-xs"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Applied to Kardex
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Already applied to the Kardex. Use &ldquo;Generate New&rdquo; to create a different plan.</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={isApplyingToKardex}
                        onClick={() => {
                          const entries = mapAIToADPIE(displayResult);
                          onApplyToKardex(entries);
                          setAppliedThisSession(true);
                        }}
                        className="gap-1.5 text-xs"
                      >
                        {isApplyingToKardex ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-3.5 w-3.5" />
                        )}
                        Apply to Kardex ({displayResult.goals.length})
                      </Button>
                    )
                  )}
                </TooltipProvider>
                <Button
                  type="button"
                  variant="outline"
                size="sm"
                disabled={isExporting}
                onClick={handleExportFHIR}
                className="gap-1.5 text-xs"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export FHIR R4
              </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {isError && !result && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div>
              <p>Failed to generate care plan. Please try again.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
