'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Users,
  Stethoscope,
  Building2,
  FlaskConical,
  Pill,
  Baby,
  FileText,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { kenhddApi } from '@/lib/api/kenhdd';
import { toast } from 'sonner';
import type {
  KENHDDResourceType,
} from '@/lib/types/kenhdd';
import type { z } from 'zod';
import type {
  KENHDDComplianceScoreSchema,
  KENHDDComplianceSummaryEntrySchema,
  KENHDDValidationRunSchema,
} from '@/lib/schemas/kenhdd.schema';

type ComplianceSummaryEntry = z.infer<typeof KENHDDComplianceSummaryEntrySchema>;
type ComplianceScore = z.infer<typeof KENHDDComplianceScoreSchema>;
type ValidationRun = z.infer<typeof KENHDDValidationRunSchema>;

const RESOURCE_TYPE_CONFIG: Record<
  KENHDDResourceType,
  { label: string; icon: typeof Users }
> = {
  PATIENT: { label: 'Patient', icon: Users },
  ENCOUNTER: { label: 'Encounter', icon: Stethoscope },
  DIAGNOSIS: { label: 'Diagnosis', icon: FileText },
  FACILITY: { label: 'Facility', icon: Building2 },
  LAB_RESULT: { label: 'Lab Result', icon: FlaskConical },
  PRESCRIPTION: { label: 'Prescription', icon: Pill },
  MCH_VISIT: { label: 'MCH Visit', icon: Baby },
};

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBadge(score: number | null) {
  if (score === null)
    return <Badge variant="secondary">Not Run</Badge>;
  if (score >= 90)
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        Compliant
      </Badge>
    );
  if (score >= 70)
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Partial
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
      Non-Compliant
    </Badge>
  );
}

export default function KENHDDCompliancePage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [reportScores, setReportScores] = useState<ComplianceScore[] | null>(null);

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ['kenhdd-summary'],
    queryFn: kenhddApi.getSummary,
  });

  const {
    data: runs,
    isLoading: runsLoading,
  } = useQuery({
    queryKey: ['kenhdd-runs'],
    queryFn: () => kenhddApi.listRuns(),
  });

  const reportMutation = useMutation({
    mutationFn: () => kenhddApi.generateReport(undefined, 100),
    onSuccess: (scores: ComplianceScore[]) => {
      setReportScores(scores);
      queryClient.invalidateQueries({ queryKey: ['kenhdd-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kenhdd-runs'] });
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s.compliance_pct, 0) / scores.length)
          : 0;
      toast.success(`Compliance check complete — average score: ${avgScore}%`);
    },
    onError: () => {
      toast.error('Failed to generate compliance report.');
    },
  });

  // Compute overall stats from summary
  const overallScore =
    summary && summary.filter((s) => s.compliance_score !== null).length > 0
      ? Math.round(
          summary
            .filter((s) => s.compliance_score !== null)
            .reduce((sum, s) => sum + (s.compliance_score ?? 0), 0) /
            summary.filter((s) => s.compliance_score !== null).length
        )
      : null;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="KENHDD Compliance"
          helpContent="Validates data against Kenya National Health Data Dictionary (KENHDD) standards. Checks that Patient, Encounter, Diagnosis, Facility, Lab, Prescription, and MCH records conform to the national schema. DHA Compliance: Gap #33."
          actions={
            <Button
              onClick={() => reportMutation.mutate()}
              disabled={reportMutation.isPending}
              size="sm"
            >
              {reportMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run Compliance Check
            </Button>
          }
        />

        {/* Overall Score + Element Count */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
          {summaryLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : summaryError ? (
            <Card className="col-span-full">
              <CardContent className="p-6 text-center text-destructive">
                Failed to load compliance summary.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Overall Compliance
                  </div>
                  <div className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
                    {overallScore !== null ? `${overallScore}%` : '—'}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Resource Types Checked
                  </div>
                  <div className="text-2xl font-bold">
                    {summary?.filter((s) => s.compliance_score !== null).length ?? 0}
                    <span className="text-sm font-normal text-muted-foreground"> / 7</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Total Runs
                  </div>
                  <div className="text-2xl font-bold">
                    {runs?.length ?? 0}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Per-Resource Type Scores */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Compliance by Resource Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-2">
                {summary.map((entry) => {
                  const config = RESOURCE_TYPE_CONFIG[entry.resource_type as KENHDDResourceType];
                  if (!config) return null;
                  const Icon = config.icon;
                  const score = entry.compliance_score;
                  const violationCount = Object.keys(entry.violations).length;

                  return (
                    <div
                      key={entry.resource_type}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{config.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.records_checked > 0
                              ? `${entry.records_compliant}/${entry.records_checked} records compliant`
                              : 'No data yet'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {violationCount > 0 && score !== null && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            {violationCount} issue{violationCount !== 1 ? 's' : ''}
                          </div>
                        )}
                        <div className={`text-sm font-semibold w-12 text-right ${getScoreColor(score)}`}>
                          {score !== null ? `${Math.round(score)}%` : '—'}
                        </div>
                        {getScoreBadge(score)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Latest Report Violations */}
        {reportScores && reportScores.some((s) => Object.keys(s.violations_by_element).length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">
                Violations from Latest Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-[400px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Resource</th>
                      <th className="pb-2 font-medium">Element</th>
                      <th className="pb-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportScores.map((score) =>
                      Object.entries(score.violations_by_element).map(
                        ([elementId, count]) => (
                          <tr
                            key={`${score.resource_type}-${elementId}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2">
                              {RESOURCE_TYPE_CONFIG[score.resource_type as KENHDDResourceType]?.label ??
                                score.resource_type}
                            </td>
                            <td className="py-2 font-mono text-xs">{elementId}</td>
                            <td className="py-2 text-right">
                              <Badge variant="destructive" className="text-xs">
                                {count}
                              </Badge>
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validation Run History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : runs && runs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-[500px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Resource</th>
                      <th className="pb-2 font-medium text-right">Score</th>
                      <th className="pb-2 font-medium text-right">Mandatory Rate</th>
                      <th className="pb-2 font-medium text-right">Records</th>
                      <th className="pb-2 font-medium">Run By</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 20).map((run) => (
                      <tr key={run.id} className="border-b last:border-0">
                        <td className="py-2">
                          {RESOURCE_TYPE_CONFIG[run.resource_type as KENHDDResourceType]?.label ??
                            run.resource_type}
                        </td>
                        <td className={`py-2 text-right font-semibold ${getScoreColor(parseFloat(run.compliance_score))}`}>
                          {parseFloat(run.compliance_score).toFixed(0)}%
                        </td>
                        <td className="py-2 text-right">
                          {parseFloat(run.mandatory_pass_rate).toFixed(0)}%
                        </td>
                        <td className="py-2 text-right">
                          {run.records_compliant}/{run.records_checked}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {run.run_by_name ?? '—'}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(run.run_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No validation runs yet. Click &quot;Run Compliance Check&quot; to begin.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}
