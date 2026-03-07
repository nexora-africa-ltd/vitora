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
  ChevronUp,
  ClipboardList,
  Download,
  Info,
  Loader2,
  BrainCircuit,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAICarePlanGenerate, useAIEnabled } from '@/lib/hooks/use-ai';
import { aiApi } from '@/lib/api/ai';
import { toast } from 'sonner';
import type {
  AICarePlanGenerateRequest,
  AICarePlanResponse,
  AICarePlanGoal,
  AICarePlanInterventionCategory,
  AICarePlanFollowUp,
  AILabResultItem,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface CarePlanPanelProps {
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
// MAIN COMPONENT
// =============================================================================

export function CarePlanPanel({
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
}: CarePlanPanelProps) {
  const isAIEnabled = useAIEnabled();
  const { mutate, data: result, isPending, isError, reset } = useAICarePlanGenerate();
  const [isExporting, setIsExporting] = React.useState(false);

  // Show success toast when care plan is generated
  React.useEffect(() => {
    if (result && result.goals && result.goals.length > 0) {
      const totalInterventions = result.interventions?.reduce(
        (sum, cat) => sum + cat.items.length, 0
      ) ?? 0;
      toast.success('Care plan generated', {
        description: `${result.goals.length} goal(s), ${totalInterventions} intervention(s)`,
      });
    }
  }, [result]);

  // Auto-trigger from widget quick action
  React.useEffect(() => {
    if (autoTrigger && isAIEnabled && !isPending && !result) {
      mutate({
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

  const hasResult = result && result.goals && result.goals.length > 0;
  const isFallback = result?.mode === 'fallback';

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
            <BrainCircuit className="h-3.5 w-3.5 text-purple-500" />
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
              <span className="font-medium">{result.primary_diagnosis}</span>
              {result.icd10_code && (
                <Badge variant="secondary" className="text-xs">{result.icd10_code}</Badge>
              )}
              {result.severity && (
                <Badge variant="outline" className="text-xs">{result.severity}</Badge>
              )}
              {result.template_used && (
                <span className="text-xs text-muted-foreground">Template: {result.template_used}</span>
              )}
            </div>

            {/* CDS Safety Alerts */}
            {result.cds_alerts && result.cds_alerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Safety Alerts ({result.cds_alerts.length})
                </h4>
                {result.cds_alerts.map((alert, i) => (
                  <div key={i} className="rounded-md p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-sm text-orange-800 dark:text-orange-200">
                    {typeof alert === 'object' && alert !== null
                      ? (alert as Record<string, unknown>).message as string ?? JSON.stringify(alert)
                      : String(alert)}
                  </div>
                ))}
              </div>
            )}

            {/* Tabbed Content */}
            <Tabs defaultValue="goals" className="space-y-3">
              <TabsList className="w-full grid grid-cols-3 h-auto p-1">
                <TabsTrigger
                  value="goals"
                  className="text-xs data-[state=active]:text-sm data-[state=active]:font-semibold transition-all gap-1.5"
                >
                  Goals
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {result.goals.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="interventions"
                  className="text-xs data-[state=active]:text-sm data-[state=active]:font-semibold transition-all gap-1.5"
                >
                  <span className="sm:hidden">Rx</span>
                  <span className="hidden sm:inline">Interventions</span>
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {result.interventions.reduce((sum, cat) => sum + cat.items.length, 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="discharge"
                  className="text-xs data-[state=active]:text-sm data-[state=active]:font-semibold transition-all gap-1.5"
                >
                  <span className="sm:hidden">D/C</span>
                  <span className="hidden sm:inline">Discharge</span>
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {(result.discharge_criteria?.length || 0) + (result.follow_up ? 1 : 0)}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Goals Tab */}
              <TabsContent value="goals" className="space-y-1 pt-1">
                {result.goals.map((goal, i) => (
                  <GoalItem key={i} goal={goal} />
                ))}
              </TabsContent>

              {/* Interventions Tab */}
              <TabsContent value="interventions" className="space-y-4 pt-1">
                {result.interventions.map((cat, i) => (
                  <InterventionCategorySection key={i} category={cat} />
                ))}
                {result.facility_level_notes && result.facility_level_notes.length > 0 && (
                  <div className="space-y-1 rounded-md p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Facility Level Notes</p>
                    {result.facility_level_notes.map((note, i) => (
                      <p key={i} className="text-xs text-blue-600 dark:text-blue-300">{note}</p>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Discharge Tab */}
              <TabsContent value="discharge" className="space-y-3 pt-1">
                {result.discharge_criteria && result.discharge_criteria.length > 0 ? (
                  <div className="space-y-1">
                    <h5 className="text-sm font-medium">Discharge Criteria</h5>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                      {result.discharge_criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No specific discharge criteria generated.
                  </p>
                )}
                {result.follow_up && <FollowUpSection followUp={result.follow_up} />}
              </TabsContent>
            </Tabs>

            {/* Evidence Sources */}
            {result.evidence_sources && result.evidence_sources.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Sources: {result.evidence_sources.join(', ')}
              </div>
            )}

            {/* Advisory */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>AI-generated care plan. Review all interventions and adjust based on clinical judgment and patient response.</span>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => { reset(); handleGenerate(); }}
                className="gap-1.5 text-xs"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Regenerate
              </Button>
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
