'use client';

import { AlertTriangle, BrainCircuit, Clock3, GitBranchPlus, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
          <div>
            <CardTitle className="text-lg">{strategy === 'SMART' ? 'Smart bed recommendation' : 'Rules-based recommendation'}</CardTitle>
            <CardDescription>
              {strategy === 'SMART'
                ? 'Phase C combines workload, emergency buffer, infection control, and cohort grouping.'
                : 'Phase B evaluates ward constraints and candidate scores without occupying a bed.'}
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit shrink-0">
            {strategy === 'SMART' ? 'Phase C' : 'Phase B'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSuccess ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recommended bed</p>
                  <p className="text-2xl font-semibold">{recommendation.assigned_bed_number}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {'evaluation_time_ms' in recommendation && (
                    <Badge variant="secondary">{recommendation.evaluation_time_ms} ms</Badge>
                  )}
                  {'decision_outcome' in recommendation && (
                    <Badge variant="outline">{recommendation.decision_outcome}</Badge>
                  )}
                  {'workload_score' in recommendation && (
                    <Badge variant="outline">Workload {recommendation.workload_score.toFixed(2)}</Badge>
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Smart score breakdown</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(recommendation.smart_scores).map(([key, value]) => (
                    <div key={key} className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                      <p className="mt-1 text-sm font-medium">{formatValue(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {'candidates_evaluated' in recommendation && recommendation.candidates_evaluated.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Top evaluated beds</p>
                </div>
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  {recommendation.candidates_evaluated.slice(0, 3).map((candidate) => (
                    <div key={candidate.bed_id} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{candidate.bed_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {candidate.passed ? candidate.matched_constraints.join(', ') || 'Passed all constraints' : candidate.rejection_reason || candidate.failed_constraints.join(', ')}
                        </p>
                      </div>
                      <Badge variant="outline" className="w-fit shrink-0">Score {candidate.score.toFixed(2)}</Badge>
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