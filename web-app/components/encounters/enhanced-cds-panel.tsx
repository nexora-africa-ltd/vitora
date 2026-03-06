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
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAICDSEvaluate, useAIEnabled } from '@/lib/hooks/use-ai';
import type { AICDSAlertItem, AICDSEvaluateRequest } from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface EnhancedCDSPanelProps {
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

function CDSAlertCard({ alert }: { alert: AICDSAlertItem }) {
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
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EnhancedCDSPanel({
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
  const { mutate, data: result, isPending, isError, reset } = useAICDSEvaluate();
  const [showRecommendations, setShowRecommendations] = React.useState(false);
  const hasRun = React.useRef(false);

  const handleEvaluate = React.useCallback(() => {
    mutate({
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
  }, [mutate, medications, diagnoses, symptoms, pendingProcedures, labResults, allergies, patientAge, patientSex, isPregnant, region, facilityLevel]);

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
    if (!result?.alerts) return {};
    return result.alerts.reduce<Record<string, AICDSAlertItem[]>>((acc, alert) => {
      if (!acc[alert.severity]) acc[alert.severity] = [];
      acc[alert.severity]!.push(alert);
      return acc;
    }, {});
  }, [result?.alerts]);

  if (!isAIEnabled) return null;

  const alertCount = result?.alerts?.length ?? 0;
  const recCount = result?.recommendations?.length ?? 0;
  const hasResult = result && (alertCount > 0 || recCount > 0);
  const noAlerts = result && alertCount === 0 && recCount === 0;
  const isFallback = result?.mode === 'fallback';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              <span className="sm:hidden">AI Safety</span>
              <span className="hidden sm:inline">AI Safety Check</span>
            </CardTitle>
            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
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
        {!result && !isPending && !isError && (
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
                    <CDSAlertCard key={`${severity}-${i}`} alert={alert} />
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
                    {result.recommendations!.map((rec, i) => (
                      <CDSAlertCard key={`rec-${i}`} alert={rec} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Processing Stats */}
        {result && (
          <p className="text-xs text-muted-foreground">
            Evaluated {result.rules_evaluated} rules in {result.processing_time_ms.toFixed(0)}ms
          </p>
        )}

        {/* Advisory */}
        {(hasResult || noAlerts) && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>AI-generated safety check. Does not replace pharmacist review or clinical judgment.</span>
          </div>
        )}

        {/* Re-run */}
        {result && (
          <div className="flex justify-end">
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
        {isError && !result && (
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
    </Card>
  );
}
