'use client';

import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, GitBranchPlus, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  PredictedDischarge,
  RuleBasedBedAssignmentResponse,
  SmartRecommendBedResponse,
} from '@/lib/types/inpatient';

type RecommendationStrategy = 'SMART' | 'RULES';

interface BedRecommendationCardProps {
  strategy: RecommendationStrategy;
  isLoading?: boolean;
  smartRecommendation?: SmartRecommendBedResponse;
  ruleRecommendation?: RuleBasedBedAssignmentResponse;
  onSwitchToManual: () => void;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => `${key}: ${formatValue(entryValue)}`)
      .join(' | ');
  }
  return 'N/A';
}

function PredictedDischargeList({ predictions }: { predictions: PredictedDischarge[] }) {
  if (predictions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Predicted bed releases</p>
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        {predictions.slice(0, 4).map((prediction) => (
          <div key={prediction.admission_id} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{prediction.bed_number} • {prediction.patient_name}</p>
              <p className="text-xs text-muted-foreground">
                {prediction.source === 'expected_discharge' ? 'Clinician-set discharge date' : 'Estimated from average LOS'}
              </p>
            </div>
            <Badge variant="outline" className="w-fit shrink-0">
              {prediction.hours_until_available == null ? 'Timing unavailable' : `${prediction.hours_until_available}h`}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCORE_HELP: Record<string, { help: string; icon: typeof TrendingUp; iconColor: string; bg: string }> = {
  workload: {
    help: 'Measures how evenly patients are spread across nurses in this ward. A lower workload score means staff have more capacity for safe care.',
    icon: TrendingUp,
    iconColor: 'text-blue-500',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
  },
  infection_risk: {
    help: 'Indicates whether the bed placement introduces cross-infection risk based on the patient\'s isolation needs and neighbouring bed occupants.',
    icon: ShieldAlert,
    iconColor: 'text-amber-500',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
  },
  cohort_match: {
    help: 'Reflects how well the patient fits the current bed neighbourhood — same diagnosis group, compatible age range, and similar acuity level.',
    icon: GitBranchPlus,
    iconColor: 'text-violet-500',
    bg: 'bg-violet-50/50 dark:bg-violet-950/20',
  },
  emergency_buffer: {
    help: 'Tracks whether the ward still has beds reserved for unplanned emergency admissions after this placement.',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
  },
};

function getScoreInfo(key: string, value: unknown) {
  const lowerKey = key.toLowerCase();
  const match = Object.entries(SCORE_HELP).find(([k]) => lowerKey.includes(k));
  const defaults = {
    icon: BrainCircuit,
    iconColor: 'text-muted-foreground',
    bg: 'bg-muted/20',
    helpText: null as string | null,
    numericValue: null as number | null,
  };

  if (match) {
    defaults.icon = match[1].icon;
    defaults.iconColor = match[1].iconColor;
    defaults.bg = match[1].bg;
    defaults.helpText = match[1].help;
  }

  if (typeof value === 'number' && value >= 0 && value <= 1) {
    defaults.numericValue = value;
  }

  return defaults;
}

export function BedRecommendationCard({
  strategy,
  isLoading = false,
  smartRecommendation,
  ruleRecommendation,
  onSwitchToManual,
}: BedRecommendationCardProps) {
  const recommendation = strategy === 'SMART' ? smartRecommendation : ruleRecommendation;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Finding the best bed</CardTitle>
          <CardDescription>Evaluating ward capacity, constraints, and patient fit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bed recommendation</CardTitle>
          <CardDescription>Select a ward to evaluate a recommended placement.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isSuccess = recommendation.success && recommendation.assigned_bed_id !== null;
  const predictedDischarges = 'predicted_discharges' in recommendation ? recommendation.predicted_discharges : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{strategy === 'SMART' ? 'Smart bed recommendation' : 'Rules-based recommendation'}</CardTitle>
            <HelpPopover content={
              strategy === 'SMART'
                ? 'Scores beds using workload balance, emergency buffer protection, infection control, and patient cohort grouping.'
                : 'Evaluates ward constraints and ranks candidate beds by compatibility score.'
            } />
          </div>
          <Badge variant="outline" className="w-fit shrink-0">
            {strategy === 'SMART' ? 'Multi-factor' : 'Rule-based'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSuccess ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 to-background p-4 dark:border-emerald-800/40 dark:from-emerald-950/30">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended bed</p>
                    <p className="text-2xl font-semibold tracking-tight">{recommendation.assigned_bed_number}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {'evaluation_time_ms' in recommendation && (
                    <Badge variant="secondary" className="text-xs">{recommendation.evaluation_time_ms} ms</Badge>
                  )}
                  {'decision_outcome' in recommendation && (
                    <Badge variant="outline" className="text-xs">{recommendation.decision_outcome}</Badge>
                  )}
                  {'workload_score' in recommendation && (
                    <Badge variant="outline" className="text-xs">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      Workload {recommendation.workload_score.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {'decision_reason' in recommendation && recommendation.decision_reason && (
              <Alert>
                <GitBranchPlus className="h-4 w-4" />
                <AlertDescription>{recommendation.decision_reason}</AlertDescription>
              </Alert>
            )}

            {'emergency_buffer_enforced' in recommendation && recommendation.emergency_buffer_enforced && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  Emergency buffer rules were enforced. Beds reserved for emergency admissions were excluded from this recommendation.
                </AlertDescription>
              </Alert>
            )}

            {'infection_isolation_triggered' in recommendation && recommendation.infection_isolation_triggered && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Infection control signals influenced this recommendation. Isolation capability was prioritized during scoring.
                </AlertDescription>
              </Alert>
            )}

            {'smart_scores' in recommendation && Object.keys(recommendation.smart_scores).length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Smart score breakdown</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(recommendation.smart_scores).map(([key, value]) => {
                    const scoreInfo = getScoreInfo(key, value);
                    return (
                      <div key={key} className={`rounded-xl border p-3 ${scoreInfo.bg}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <scoreInfo.icon className={`h-3.5 w-3.5 ${scoreInfo.iconColor}`} />
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                          </div>
                          {scoreInfo.helpText && <HelpPopover content={scoreInfo.helpText} />}
                        </div>
                        <p className="mt-1.5 text-lg font-semibold">{formatValue(value)}</p>
                        {scoreInfo.numericValue !== null && (
                          <Progress value={Math.min(scoreInfo.numericValue * 100, 100)} className="mt-2 h-1.5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {'candidates_evaluated' in recommendation && recommendation.candidates_evaluated.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Top evaluated beds</p>
                </div>
                <div className="space-y-2">
                  {recommendation.candidates_evaluated.slice(0, 3).map((candidate, index) => (
                    <div key={candidate.bed_id} className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${index === 0 ? 'border-primary/20 bg-primary/5' : 'bg-muted/20'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{candidate.bed_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {candidate.passed ? candidate.matched_constraints.join(', ') || 'Passed all constraints' : candidate.rejection_reason || candidate.failed_constraints.join(', ')}
                          </p>
                        </div>
                      </div>
                      <Badge variant={index === 0 ? 'default' : 'outline'} className="w-fit shrink-0">Score {candidate.score.toFixed(2)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <PredictedDischargeList predictions={predictedDischarges} />
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {recommendation.error
                  || ('decision_reason' in recommendation && recommendation.decision_reason)
                  || 'No suitable bed recommendation is available for the current criteria.'}
              </AlertDescription>
            </Alert>

            <PredictedDischargeList predictions={predictedDischarges} />

            {'candidates_evaluated' in recommendation && recommendation.candidates_evaluated.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">Candidates were evaluated but none passed all constraints.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review the ward rules or switch to manual selection if you need to proceed with a justified override.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onSwitchToManual}>
            Switch to manual selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
