/**
 * Investigation Suggestions Panel — AI-powered investigation ordering support
 *
 * Displays structured investigation suggestions grouped by priority,
 * with LOINC codes and rationale. Clinician can accept suggestions
 * to pre-fill lab/imaging order forms.
 *
 * Advisory only — clinician must explicitly accept each suggestion.
 *
 * @see docs/ai-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  FlaskConical,
  Loader2,
  Sparkles,
  CheckCircle2,
  Plus,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  TestTubes,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import {
  useAIInvestigationSuggest,
  useAIEnabled,
  useStoredInvestigationSuggestions,
} from '@/lib/hooks/use-ai';
import { toast } from 'sonner';
import type {
  AIInvestigationSuggestRequest,
  AIInvestigationSuggestResponse,
  AIInvestigationSuggestion,
} from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface InvestigationSuggestionsPanelProps {
  /** Encounter ID for persistence */
  encounterId?: number;
  /** Chief complaint from the encounter */
  chiefComplaint?: string;
  /** Working/confirmed diagnoses */
  diagnoses?: string[];
  /** Current symptoms */
  symptoms?: string[];
  /** Investigations already ordered (excluded from suggestions) */
  existingOrders?: string[];
  /** Lab results already available */
  existingResults?: Record<string, unknown>;
  /** Patient age */
  patientAge?: number;
  /** Patient sex */
  patientSex?: 'M' | 'F';
  /** Whether patient is pregnant */
  isPregnant?: boolean;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Auto-trigger on mount (from quick action) */
  autoTrigger?: boolean;
  /** Callback when autoTrigger is consumed */
  onAutoTriggerConsumed?: () => void;
  /** Called when clinician accepts a suggestion to pre-fill an order */
  onAcceptSuggestion?: (suggestion: AIInvestigationSuggestion) => void;
}

// =============================================================================
// PRIORITY CONFIG
// =============================================================================

const PRIORITY_CONFIG = {
  stat: {
    label: 'STAT',
    icon: Zap,
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
    order: 0,
  },
  urgent: {
    label: 'Urgent',
    icon: AlertTriangle,
    badgeClass: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    order: 1,
  },
  routine: {
    label: 'Routine',
    icon: Clock,
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    order: 2,
  },
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

export function InvestigationSuggestionsPanel({
  encounterId,
  chiefComplaint,
  diagnoses,
  symptoms,
  existingOrders,
  existingResults,
  patientAge,
  patientSex,
  isPregnant,
  disabled = false,
  autoTrigger = false,
  onAutoTriggerConsumed,
  onAcceptSuggestion,
}: InvestigationSuggestionsPanelProps) {
  const isAIEnabled = useAIEnabled();
  const mutation = useAIInvestigationSuggest();
  const { data: storedResults } = useStoredInvestigationSuggestions(encounterId);
  const [result, setResult] = React.useState<AIInvestigationSuggestResponse | null>(null);
  const [dismissedNames, setDismissedNames] = React.useState<Set<string>>(new Set());
  const [acceptedNames, setAcceptedNames] = React.useState<Set<string>>(new Set());
  const autoTriggered = React.useRef(false);

  // Load last stored result on mount
  React.useEffect(() => {
    if (storedResults?.length && storedResults[0] && !result) {
      const latest = storedResults[0];
      setResult(latest.result_data as unknown as AIInvestigationSuggestResponse);
    }
  }, [storedResults, result]);

  // Auto-trigger from quick action
  React.useEffect(() => {
    if (autoTrigger && !autoTriggered.current && !mutation.isPending && !disabled) {
      autoTriggered.current = true;
      onAutoTriggerConsumed?.();
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  if (!isAIEnabled) return null;

  function handleGenerate() {
    const payload: AIInvestigationSuggestRequest = {
      encounter_id: encounterId,
      ...(chiefComplaint ? { chief_complaint: chiefComplaint } : {}),
      ...(diagnoses?.length ? { diagnoses } : {}),
      ...(symptoms?.length ? { symptoms } : {}),
      ...(existingOrders?.length ? { existing_orders: existingOrders } : {}),
      ...(existingResults && Object.keys(existingResults).length
        ? { existing_results: existingResults }
        : {}),
      ...(patientAge != null ? { patient_age: patientAge } : {}),
      ...(patientSex ? { patient_sex: patientSex } : {}),
      ...(isPregnant != null ? { is_pregnant: isPregnant } : {}),
    };

    // Reset dismissed/accepted on new generation
    setDismissedNames(new Set());
    setAcceptedNames(new Set());

    mutation.mutate(payload, {
      onSuccess: (data) => {
        setResult(data);
        toast.success(
          `${data.total_suggestions} investigation${data.total_suggestions !== 1 ? 's' : ''} suggested`
        );
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to suggest investigations');
      },
    });
  }

  function handleAccept(suggestion: AIInvestigationSuggestion) {
    setAcceptedNames((prev) => new Set(prev).add(suggestion.name));
    onAcceptSuggestion?.(suggestion);
    if (!onAcceptSuggestion) {
      toast.success(`"${suggestion.name}" accepted`);
    }
  }

  function handleDismiss(suggestion: AIInvestigationSuggestion) {
    setDismissedNames((prev) => new Set(prev).add(suggestion.name));
  }

  // Group suggestions by priority
  const grouped = React.useMemo(() => {
    if (!result?.suggestions) return [];

    const groups: Record<string, AIInvestigationSuggestion[]> = {};
    for (const s of result.suggestions) {
      if (dismissedNames.has(s.name)) continue;
      const priority = s.priority || 'routine';
      if (!groups[priority]) groups[priority] = [];
      groups[priority].push(s);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => {
        const orderA = PRIORITY_CONFIG[a as keyof typeof PRIORITY_CONFIG]?.order ?? 99;
        const orderB = PRIORITY_CONFIG[b as keyof typeof PRIORITY_CONFIG]?.order ?? 99;
        return orderA - orderB;
      })
      .map(([priority, items]) => ({ priority, items }));
  }, [result, dismissedNames]);

  const activeSuggestionCount = grouped.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <TestTubes className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">
            <span className="sm:hidden">Investigations</span>
            <span className="hidden sm:inline">Investigation Suggestions</span>
          </CardTitle>
          <HelpPopover content="AI-suggested investigations based on diagnoses, symptoms, and clinical context. Advisory only — review and confirm each suggestion before ordering." />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={disabled || mutation.isPending}
          className="gap-1.5"
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {result ? 'Refresh' : 'Suggest'}
          </span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* No result yet */}
        {!result && !mutation.isPending && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click &quot;Suggest&quot; to get AI-powered investigation recommendations
            based on the current clinical context.
          </p>
        )}

        {/* Loading */}
        {mutation.isPending && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Analyzing clinical context...</span>
          </div>
        )}

        {/* Error */}
        {mutation.isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {mutation.error?.message || 'Failed to suggest investigations. Please try again.'}
          </div>
        )}

        {/* Results */}
        {result && !mutation.isPending && (
          <>
            {/* Matched conditions */}
            {result.matched_conditions?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">Matched:</span>
                {result.matched_conditions.map((c) => (
                  <Badge key={c} variant="secondary" className="text-xs">
                    {c.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}

            {/* Priority groups */}
            {grouped.map(({ priority, items }) => {
              const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.routine;
              const PriorityIcon = config.icon;
              return (
                <div key={priority} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <PriorityIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">{config.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {items.length}
                    </Badge>
                  </div>

                  <div className="space-y-2 pl-6">
                    {items.map((s) => (
                      <SuggestionCard
                        key={s.name}
                        suggestion={s}
                        isAccepted={acceptedNames.has(s.name)}
                        onAccept={() => handleAccept(s)}
                        onDismiss={() => handleDismiss(s)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Empty after dismissals */}
            {activeSuggestionCount === 0 && result.suggestions.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                All suggestions reviewed.
              </p>
            )}

            {/* No suggestions from TibaBot */}
            {result.suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No additional investigations suggested for this clinical context.
              </p>
            )}

            {/* Disclaimer + feedback */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground italic">
                {result.disclaimer || 'Advisory only — clinical confirmation required.'}
              </p>
              {result.stored_id && (
                <AIFeedbackButtons messageId={result.stored_id} serviceType="investigation_suggest" />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SUGGESTION CARD
// =============================================================================

interface SuggestionCardProps {
  suggestion: AIInvestigationSuggestion;
  isAccepted: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

function SuggestionCard({ suggestion, isAccepted, onAccept, onDismiss }: SuggestionCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 transition-colors',
        isAccepted && 'bg-green-500/5 border-green-500/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{suggestion.name}</span>
            <Badge variant="outline" className="text-xs capitalize">
              {suggestion.category}
            </Badge>
            {suggestion.loinc_code && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {suggestion.loinc_code}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{suggestion.loinc_display || 'LOINC code'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
          {suggestion.timing && (
            <p className="text-xs text-muted-foreground">
              <Clock className="inline h-3 w-3 mr-1" />
              {suggestion.timing}
            </p>
          )}
          {suggestion.min_facility_level && (
            <p className="text-xs text-muted-foreground">
              Min. facility: {suggestion.min_facility_level}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isAccepted ? (
            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Accepted
            </Badge>
          ) : (
            <>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAccept}>
                      <Plus className="h-4 w-4 text-green-600" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add to lab orders</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDismiss}>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Dismiss</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
