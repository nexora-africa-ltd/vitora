/**
 * Lab Interpret Panel — AI-powered lab result interpretation
 *
 * Displays flagged abnormal results, detected multi-lab patterns,
 * critical alerts, and suggested follow-up labs.
 * Falls back to local reference range checks when TibaBot is unavailable.
 *
 * Advisory only — clinician must review and confirm all interpretations.
 *
 * Phase 5: Lab Assist
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Beaker,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAILabInterpret, useAIEnabled } from '@/lib/hooks/use-ai';
import type {
  AILabResultItem,
  AILabFlag,
  AILabPattern,
  AILabInterpretResponse,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface LabInterpretPanelProps {
  /** Patient age in years */
  patientAge: number;
  /** Patient sex */
  patientSex: 'male' | 'female';
  /** Whether patient is pregnant */
  isPregnant?: boolean;
  /** Gestational weeks if pregnant */
  gestationalWeeks?: number | null;
  /** Lab results to interpret */
  labResults: AILabResultItem[];
  /** Current diagnoses for context */
  diagnoses?: string[];
  /** Whether the panel is disabled */
  disabled?: boolean;
}

// =============================================================================
// STATUS STYLES
// =============================================================================

const FLAG_STATUS_STYLES: Record<string, { label: string; color: string; bgColor: string }> = {
  critical_high: {
    label: 'Critical High',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
  },
  critical_low: {
    label: 'Critical Low',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
  },
  high: {
    label: 'High',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
  },
  low: {
    label: 'Low',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
  },
  normal: {
    label: 'Normal',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
  },
};

const SIGNIFICANCE_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  significant: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  monitor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function FlagItem({ flag }: { flag: AILabFlag }) {
  const style = FLAG_STATUS_STYLES[flag.status] ?? FLAG_STATUS_STYLES.normal!;
  const { bgColor, color, label } = style!;
  return (
    <div className={cn('rounded-md p-2.5 border text-sm', bgColor, 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-sm">{flag.test_name.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">
            {flag.value} {flag.unit}
            {flag.reference_range && (
              <> &bull; Ref: {flag.reference_range.low}–{flag.reference_range.high} {flag.reference_range.unit ?? flag.unit}</>
            )}
            {flag.deviation_percent != null && (
              <> &bull; {flag.deviation_percent > 0 ? '+' : ''}{flag.deviation_percent.toFixed(1)}%</>
            )}
          </p>
          {flag.message && (
            <p className="text-xs text-muted-foreground">{flag.message}</p>
          )}
        </div>
        <Badge variant="secondary" className={cn('text-xs shrink-0', color)}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

function PatternItem({ pattern }: { pattern: AILabPattern }) {
  return (
    <div className="rounded-md p-2.5 border border-border text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-sm">{pattern.pattern_name}</p>
          {pattern.description && (
            <p className="text-xs text-muted-foreground">{pattern.description}</p>
          )}
          {pattern.contributing_tests && pattern.contributing_tests.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tests: {pattern.contributing_tests.join(', ')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="secondary" className={cn('text-xs', SIGNIFICANCE_STYLES[pattern.significance])}>
            {pattern.significance}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {Math.round(pattern.confidence * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function LabInterpretPanel({
  patientAge,
  patientSex,
  isPregnant = false,
  gestationalWeeks,
  labResults,
  diagnoses,
  disabled,
}: LabInterpretPanelProps) {
  const isAIEnabled = useAIEnabled();
  const { mutate, data: result, isPending, isError, reset } = useAILabInterpret();
  const [showDetails, setShowDetails] = React.useState(false);

  if (!isAIEnabled) return null;
  if (!labResults || labResults.length === 0) return null;

  const handleInterpret = () => {
    mutate({
      patient_age: patientAge,
      patient_sex: patientSex,
      is_pregnant: isPregnant,
      gestational_weeks: gestationalWeeks,
      lab_results: labResults,
      diagnoses,
    });
  };

  const hasResult = result && result.flags && result.flags.length > 0;
  const abnormalFlags = result?.flags?.filter((f) => f.status !== 'normal') ?? [];
  const criticalAlerts = result?.critical_alerts ?? [];
  const patterns = result?.patterns ?? [];
  const isFallback = result?.mode === 'fallback';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Lab Interpretation</CardTitle>
            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
            <HelpPopover content="AI-powered lab result interpretation. Flags abnormal values, detects multi-lab patterns, and suggests follow-up tests. Advisory only — clinician must confirm." />
          </div>
          {isFallback && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Offline Mode
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Initial State — Run Button */}
        {!hasResult && !isPending && !isError && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isPending}
            onClick={handleInterpret}
            className="gap-2"
          >
            <Beaker className="h-4 w-4" />
            Interpret {labResults.length} Result{labResults.length > 1 ? 's' : ''}
          </Button>
        )}

        {/* Loading State */}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing lab results...
          </div>
        )}

        {/* Results */}
        {hasResult && (
          <div className="space-y-3">
            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Critical Alerts ({criticalAlerts.length})
                </h4>
                {criticalAlerts.map((alert, i) => (
                  <div key={i} className="rounded-md p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
                    {alert}
                  </div>
                ))}
              </div>
            )}

            {/* Abnormal Flags Summary */}
            {abnormalFlags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  Flagged Results ({abnormalFlags.length})
                </h4>
                {abnormalFlags.map((flag, i) => (
                  <FlagItem key={i} flag={flag} />
                ))}
              </div>
            )}

            {/* Patterns */}
            {patterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Detected Patterns ({patterns.length})
                </h4>
                {patterns.map((pattern, i) => (
                  <PatternItem key={i} pattern={pattern} />
                ))}
              </div>
            )}

            {/* Interpretation Summary */}
            {result.interpretation_summary && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2.5">
                {result.interpretation_summary}
              </div>
            )}

            {/* Expandable Details */}
            {result.suggested_followup_labs && result.suggested_followup_labs.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full justify-between text-muted-foreground hover:text-foreground"
                >
                  <span className="text-sm">Suggested Follow-up Labs</span>
                  {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showDetails && (
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
                    {result.suggested_followup_labs.map((lab, i) => (
                      <li key={i}>{lab}</li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* Advisory Disclaimer */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>AI-generated interpretation. Reference ranges are age/sex-specific. Use clinical judgment to validate.</span>
            </div>

            {/* Re-run */}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isPending}
                onClick={() => { reset(); handleInterpret(); }}
                className="gap-1.5 text-xs"
              >
                <Beaker className="h-3.5 w-3.5" />
                Re-interpret
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && !result && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div>
              <p>Failed to interpret lab results. Please try again.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleInterpret}
                disabled={isPending}
                className="mt-2 gap-1.5"
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Beaker className="h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
