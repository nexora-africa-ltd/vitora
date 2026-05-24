/**
 * Enhanced CDS Panel — TibaBot-powered clinical decision support evaluation
 *
 * Supplements the existing CDS alerts panel with AI-powered evaluation
 * including drug-drug interactions, contraindications, protocol adherence,
 * KEML formulary compliance, and dosing checks.
 *
 * This component runs independently from the local CDS engine and displays
 * additional alerts discovered by TibaBot that the local rules may miss.
 *
 * Advisory only — clinician must review and confirm all alerts.
 *
 * Phase 5: Enhanced CDS Evaluation
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  ShieldCheck,
  BrainCircuit,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAICDSEvaluate, useAIEnabled, useStoredCDSResults, aiKeys } from '@/lib/hooks/use-ai';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import { useQueryClient } from '@tanstack/react-query';
import { useFormularySearch, useSmpcDetail } from '@/lib/hooks/use-formulary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { AICDSAlertItem, AICDSEvaluateRequest, AICDSEvaluateResponse } from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface EnhancedCDSPanelProps {
  /** Encounter ID for persistence */
  encounterId?: number;
  /** Current medications */
  medications?: string[];
  /** Current diagnoses */
  diagnoses?: string[];
  /** Patient symptoms */
  symptoms?: string[];
  /** Pending procedures */
  pendingProcedures?: string[];
  /** Lab results as test_name → value */
  labResults?: Record<string, number>;
  /** Known allergies */
  allergies?: string[];
  /** Patient age */
  patientAge?: number | null;
  /** Patient sex */
  patientSex?: 'male' | 'female' | null;
  /** Whether patient is pregnant */
  isPregnant?: boolean;
  /** Kenya county/region */
  region?: string;
  /** Facility level (H1-H5) */
  facilityLevel?: string;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Auto-run on mount when true (default: false) */
  autoRun?: boolean;
  /** When true, auto-trigger evaluation (set by widget quick action) */
  autoTrigger?: boolean;
  /** Called after auto-trigger is consumed */
  onAutoTriggerConsumed?: () => void;
}

// =============================================================================
// SEVERITY STYLES
// =============================================================================

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof AlertTriangle;
}> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    icon: Info,
  },
  low: {
    label: 'Low',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: Info,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  'drug-interaction': 'Drug Interaction',
  contraindication: 'Contraindication',
  'protocol-adherence': 'Protocol Adherence',
  'lab-critical': 'Lab Critical',
  dosing: 'Dosing',
  formulary: 'Formulary',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function CDSAlertCard({ alert, onViewSmpc }: { alert: AICDSAlertItem; onViewSmpc?: (drugName: string) => void }) {
  const config = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.low!;
  const { icon: Icon, bgColor, borderColor, color, label: severityLabel } = config!;

  return (
    <div className={cn('rounded-md p-2.5 border text-sm', bgColor, borderColor)}>
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', color)} />
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={cn('text-xs px-1.5 py-0 shrink-0', color)}>
              {severityLabel}
            </Badge>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {CATEGORY_LABELS[alert.category] ?? alert.category}
            </span>
          </div>
          <p className="font-medium text-sm">{alert.title}</p>
          <p className="text-sm text-muted-foreground">{alert.message}</p>
          {alert.recommendation && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Recommendation:</span> {alert.recommendation}
            </p>
          )}
          {alert.evidence_level && (
            <p className="text-xs text-muted-foreground">
              Evidence: {alert.evidence_level}
            </p>
          )}
          {/* Formulary/interaction alerts — link to SmPC monograph */}
          {(alert.category === 'formulary' || alert.category === 'drug-interaction' || alert.category === 'contraindication') && onViewSmpc && alert.title && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
              onClick={() => onViewSmpc(alert.title)}
            >
              <BookOpen className="h-3 w-3" />
              View SmPC Monograph
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EnhancedCDSPanel({
  encounterId,
  medications,
  diagnoses,
  symptoms,
  pendingProcedures,
  labResults,
  allergies,
  patientAge,
  patientSex,
  isPregnant = false,
  region,
  facilityLevel,
  disabled,
  autoRun = false,
  autoTrigger,
  onAutoTriggerConsumed,
}: EnhancedCDSPanelProps) {
  const isAIEnabled = useAIEnabled();
  const queryClient = useQueryClient();
  const { mutate, data: result, isPending, isError, reset } = useAICDSEvaluate();
  const [showRecommendations, setShowRecommendations] = React.useState(false);
  const [smpcSearchQuery, setSmpcSearchQuery] = React.useState('');
  const [smpcModalOpen, setSmpcModalOpen] = React.useState(false);
  const hasRun = React.useRef(false);
  const panelId = React.useId();

  // Formulary search for SmPC linking
  const { data: formularyData } = useFormularySearch(smpcSearchQuery);
  const smpcDocId = formularyData?.smpc?.[0]?.id ?? null;
  const { data: smpcDetail, isLoading: smpcLoading } = useSmpcDetail(smpcModalOpen ? smpcDocId : null);

  const handleViewSmpc = React.useCallback((drugName: string) => {
    // Extract a useful drug name from the alert title
    // Alert titles often look like "Metformin — KEML Level Warning" or "Drug Interaction: Metformin + Warfarin"
    const cleanName = drugName.split(/[—:+]/)[0]?.trim() || drugName;
    setSmpcSearchQuery(cleanName);
    setSmpcModalOpen(true);
  }, []);

  // Load stored CDS results
  const { data: storedResults } = useStoredCDSResults(encounterId);
  const latestStored = storedResults?.[0];
  const displayResult: AICDSEvaluateResponse | undefined = result
    ?? (latestStored?.result_data as unknown as AICDSEvaluateResponse | undefined);

  // Show success toast when evaluation completes
  React.useEffect(() => {
    if (result) {
      const alertCount = result.alerts?.length ?? 0;
      const recCount = result.recommendations?.length ?? 0;
      toast.success('Safety check complete', {
        description: alertCount > 0
          ? `${alertCount} alert(s), ${recCount} recommendation(s)`
          : 'No safety concerns detected',
      });
      if (encounterId) {
        queryClient.invalidateQueries({ queryKey: aiKeys.storedCDS(encounterId) });
      }
    }
  }, [result, queryClient, encounterId]);

  const handleEvaluate = React.useCallback(() => {
    mutate({
      encounter_id: encounterId,
      medications,
      diagnoses,
      symptoms,
      pending_procedures: pendingProcedures,
      lab_results: labResults,
      allergies,
      patient_age: patientAge,
      patient_sex: patientSex,
      is_pregnant: isPregnant,
      region,
      facility_level: facilityLevel,
    });
  }, [mutate, encounterId, medications, diagnoses, symptoms, pendingProcedures, labResults, allergies, patientAge, patientSex, isPregnant, region, facilityLevel]);

  // Auto-run on mount if requested
  React.useEffect(() => {
    if (autoRun && isAIEnabled && !hasRun.current && !disabled) {
      hasRun.current = true;
      handleEvaluate();
    }
  }, [autoRun, isAIEnabled, disabled, handleEvaluate]);

  // Auto-trigger from widget quick action
  React.useEffect(() => {
    if (autoTrigger && isAIEnabled && !isPending) {
      handleEvaluate();
      onAutoTriggerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  // Group alerts by severity
  const alertsBySeverity = React.useMemo(() => {
    if (!displayResult?.alerts) return {};
    return displayResult.alerts.reduce<Record<string, AICDSAlertItem[]>>((acc, alert) => {
      if (!acc[alert.severity]) acc[alert.severity] = [];
      acc[alert.severity]!.push(alert);
      return acc;
    }, {});
  }, [displayResult?.alerts]);

  if (!isAIEnabled) return null;

  const alertCount = displayResult?.alerts?.length ?? 0;
  const recCount = displayResult?.recommendations?.length ?? 0;
  const hasResult = displayResult && (alertCount > 0 || recCount > 0);
  const noAlerts = displayResult && alertCount === 0 && recCount === 0;
  const isFallback = displayResult?.mode === 'fallback';

  return (
    <Card className={cn(
      'transition-colors duration-500',
      (hasResult || noAlerts) && 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              <span className="sm:hidden">AI Safety</span>
              <span className="hidden sm:inline">AI Safety Check</span>
            </CardTitle>
            <BrainCircuit className="h-3.5 w-3.5 text-purple-500" />
            <HelpPopover content="TibaBot-powered safety evaluation. Checks drug interactions, contraindications, protocol adherence, KEML formulary compliance, and dosing. Supplements local CDS rules." />
          </div>
          <div className="flex items-center gap-2">
            {isFallback && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Offline
              </Badge>
            )}
            {result && (
              <Badge variant="secondary" className="text-xs">
                {result.rules_fired}/{result.rules_evaluated} rules
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Initial State */}
        {!displayResult && !isPending && !isError && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isPending}
            onClick={handleEvaluate}
            className="gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            Run AI Safety Check
          </Button>
        )}

        {/* Loading */}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Evaluating safety rules...
          </div>
        )}

        {/* No Alerts — All Clear */}
        {noAlerts && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md p-3 border border-green-200 dark:border-green-800">
            <ShieldCheck className="h-4 w-4" />
            <span>No safety concerns detected.</span>
          </div>
        )}

        {/* Alerts */}
        {hasResult && (
          <div className="space-y-3">
            {/* Display in severity order: critical, high, medium, low */}
            {['critical', 'high', 'medium', 'low'].map((severity) => {
              const alerts = alertsBySeverity[severity];
              if (!alerts || alerts.length === 0) return null;
              return (
                <div key={severity} className="space-y-2">
                  {alerts.map((alert, i) => (
                    <CDSAlertCard key={`${severity}-${i}`} alert={alert} onViewSmpc={handleViewSmpc} />
                  ))}
                </div>
              );
            })}

            {/* Recommendations (collapsible) */}
            {recCount > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRecommendations(!showRecommendations)}
                  className="w-full justify-between text-muted-foreground hover:text-foreground"
                >
                  <span className="text-sm">Recommendations ({recCount})</span>
                  {showRecommendations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showRecommendations && (
                  <div className="space-y-2">
                    {displayResult.recommendations!.map((rec, i) => (
                      <CDSAlertCard key={`rec-${i}`} alert={rec} onViewSmpc={handleViewSmpc} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Processing Stats */}
        {displayResult && (
          <p className="text-xs text-muted-foreground">
            Evaluated {displayResult.rules_evaluated} rules in {displayResult.processing_time_ms.toFixed(0)}ms
          </p>
        )}

        {/* Advisory */}
        {(hasResult || noAlerts) && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>AI-generated safety check. Does not replace pharmacist review or clinical judgment.</span>
          </div>
        )}

        {/* Feedback + Re-run */}
        {displayResult && (
          <div className="flex items-center justify-between">
            <AIFeedbackButtons
              messageId={`cds-${panelId}`}
              serviceType="cds_rules"
              userQuery={medications?.join(', ')}
              botResponse={`${alertCount} alert(s), ${recCount} recommendation(s)`}
              metadata={{
                rules_fired: displayResult.rules_fired,
                alert_count: alertCount,
                severity_max: displayResult.alerts?.[0]?.severity,
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || isPending}
              onClick={() => { reset(); handleEvaluate(); }}
              className="gap-1.5 text-xs"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Re-evaluate
            </Button>
          </div>
        )}

        {/* Error */}
        {isError && !displayResult && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div>
              <p>Failed to run safety check. Please try again.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleEvaluate}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* SmPC Monograph Modal — triggered from CDS alert "View SmPC" links */}
      <Dialog open={smpcModalOpen} onOpenChange={setSmpcModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base">
              {smpcLoading ? 'Loading...' : smpcDetail?.product_name || `SmPC — ${smpcSearchQuery}`}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            {smpcLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : smpcDetail ? (
              <div className="space-y-3 text-sm">
                {smpcDetail.pharmaceutical_form && (
                  <p><span className="font-medium text-xs text-muted-foreground">Form:</span> {smpcDetail.pharmaceutical_form}</p>
                )}
                {smpcDetail.active_ingredients.length > 0 && (
                  <p><span className="font-medium text-xs text-muted-foreground">Active Ingredients:</span> {smpcDetail.active_ingredients.join(', ')}</p>
                )}
                {smpcDetail.indications && (
                  <div><h4 className="text-xs font-medium mb-0.5">Indications</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.indications}</p></div>
                )}
                {smpcDetail.contraindications && (
                  <div><h4 className="text-xs font-medium mb-0.5">Contraindications</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.contraindications}</p></div>
                )}
                {smpcDetail.interactions && (
                  <div><h4 className="text-xs font-medium mb-0.5">Drug Interactions</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.interactions}</p></div>
                )}
                {smpcDetail.warnings && (
                  <div><h4 className="text-xs font-medium mb-0.5">Warnings</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.warnings}</p></div>
                )}
                {smpcDetail.adverse_effects && (
                  <div><h4 className="text-xs font-medium mb-0.5">Adverse Effects</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.adverse_effects}</p></div>
                )}
                {smpcDetail.pregnancy_lactation && (
                  <div><h4 className="text-xs font-medium mb-0.5">Pregnancy & Lactation</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.pregnancy_lactation}</p></div>
                )}
                {smpcDetail.posology && (
                  <div><h4 className="text-xs font-medium mb-0.5">Posology</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{smpcDetail.posology}</p></div>
                )}
              </div>
            ) : formularyData && formularyData.total_results === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No SmPC monograph found for &ldquo;{smpcSearchQuery}&rdquo;
              </p>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Searching formulary...
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
