'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle,
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
  Download,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Minus,
  Clock,
  User,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { EmptyState } from '@/components/shared/empty-state';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { kenhddApi } from '@/lib/api/kenhdd';
import { KENHDDRunDetailDialog } from '@/components/admin/kenhdd-run-detail-dialog';
import { toast } from 'sonner';
import type {
  KENHDDResourceType,
} from '@/lib/types/kenhdd';
import type { z } from 'zod';
import type {
  KENHDDComplianceScoreSchema,
  KENHDDComplianceSummaryEntrySchema,
  KENHDDDataElementSchema,
  KENHDDValidationRunSchema,
} from '@/lib/schemas/kenhdd.schema';

type ComplianceSummaryEntry = z.infer<typeof KENHDDComplianceSummaryEntrySchema>;
type ComplianceScore = z.infer<typeof KENHDDComplianceScoreSchema>;
type ValidationRun = z.infer<typeof KENHDDValidationRunSchema>;
type DataElement = z.infer<typeof KENHDDDataElementSchema>;

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

const ALL_RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_CONFIG) as KENHDDResourceType[];

const ITEMS_PER_PAGE = 10;

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

function getScoreTone(score: number | null): 'default' | 'success' | 'warning' | 'critical' {
  if (score === null) return 'default';
  if (score >= 90) return 'success';
  if (score >= 70) return 'warning';
  return 'critical';
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Build a lookup from element_id to element metadata. */
function buildElementMap(elements: DataElement[]): Map<string, DataElement> {
  const map = new Map<string, DataElement>();
  for (const el of elements) {
    map.set(el.element_id, el);
  }
  return map;
}

/** Compute score delta between the two most recent runs for each resource type. */
function computeDeltas(
  runs: ValidationRun[]
): Record<string, { delta: number; prev: number; curr: number }> {
  const byResource: Record<string, ValidationRun[]> = {};
  for (const run of runs) {
    (byResource[run.resource_type] ??= []).push(run);
  }
  const deltas: Record<string, { delta: number; prev: number; curr: number }> = {};
  for (const [rt, rtRuns] of Object.entries(byResource)) {
    // Runs are already ordered by -run_at from the API
    const latest = rtRuns[0];
    const previous = rtRuns[1];
    if (latest && previous) {
      const curr = parseFloat(latest.compliance_score);
      const prev = parseFloat(previous.compliance_score);
      deltas[rt] = { delta: Math.round(curr - prev), prev: Math.round(prev), curr: Math.round(curr) };
    }
  }
  return deltas;
}

export default function KENHDDCompliancePage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [reportScores, setReportScores] = useState<ComplianceScore[] | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [resourcesSectionOpen, setResourcesSectionOpen] = useState(true);
  const [violationsSectionOpen, setViolationsSectionOpen] = useState(true);
  const [historySectionOpen, setHistorySectionOpen] = useState(true);
  const [changesSectionOpen, setChangesSectionOpen] = useState(true);
  const [violationsPage, setViolationsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // --- Data fetching ---
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

  const {
    data: elementsResponse,
  } = useQuery({
    queryKey: ['kenhdd-elements'],
    queryFn: () => kenhddApi.listElements(),
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

  const resourceRerunMutation = useMutation({
    mutationFn: (resourceType: KENHDDResourceType) =>
      kenhddApi.generateReport(resourceType, 100),
    onSuccess: (_scores, resourceType) => {
      queryClient.invalidateQueries({ queryKey: ['kenhdd-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kenhdd-runs'] });
      const label = RESOURCE_TYPE_CONFIG[resourceType]?.label ?? resourceType;
      toast.success(`${label} re-checked successfully.`);
    },
    onError: () => {
      toast.error('Failed to re-run resource check.');
    },
  });

  // --- Derived computations ---
  const elementMap = useMemo(
    () => buildElementMap(elementsResponse?.results ?? []),
    [elementsResponse]
  );

  const deltas = useMemo(() => computeDeltas(runs ?? []), [runs]);

  const checkedEntries = useMemo(
    () => (summary ?? []).filter((s) => s.compliance_score !== null),
    [summary]
  );

  const overallScore = useMemo(() => {
    if (checkedEntries.length === 0) return null;
    return Math.round(
      checkedEntries.reduce((sum, s) => sum + (s.compliance_score ?? 0), 0) /
        checkedEntries.length
    );
  }, [checkedEntries]);

  const overallMandatoryRate = useMemo(() => {
    if (checkedEntries.length === 0) return null;
    return Math.round(
      checkedEntries.reduce((sum, s) => sum + (s.mandatory_pass_rate ?? 0), 0) /
        checkedEntries.length
    );
  }, [checkedEntries]);

  const totalMandatoryBlockers = useMemo(() => {
    const violations = reportScores ?? checkedEntries;
    let count = 0;
    for (const entry of violations) {
      const viols = 'violations_by_element' in entry ? entry.violations_by_element : entry.violations;
      for (const [elId, c] of Object.entries(viols)) {
        const el = elementMap.get(elId);
        if (el?.requirement_level === 'MANDATORY') count += c;
      }
    }
    return count;
  }, [reportScores, checkedEntries, elementMap]);

  const worstResource = useMemo(() => {
    if (checkedEntries.length === 0) return null;
    return checkedEntries.reduce((worst, entry) =>
      (entry.compliance_score ?? 100) < (worst.compliance_score ?? 100) ? entry : worst
    );
  }, [checkedEntries]);

  const bestResource = useMemo(() => {
    if (checkedEntries.length === 0) return null;
    return checkedEntries.reduce((best, entry) =>
      (entry.compliance_score ?? 0) > (best.compliance_score ?? 0) ? entry : best
    );
  }, [checkedEntries]);

  // "What changed" entries: regressions (delta < 0) and improvements (delta > 0)
  const changes = useMemo(() => {
    const items: { resource: string; label: string; delta: number; curr: number }[] = [];
    for (const [rt, d] of Object.entries(deltas)) {
      if (d.delta !== 0) {
        items.push({
          resource: rt,
          label: RESOURCE_TYPE_CONFIG[rt as KENHDDResourceType]?.label ?? rt,
          delta: d.delta,
          curr: d.curr,
        });
      }
    }
    // Regressions first (most negative), then improvements
    items.sort((a, b) => a.delta - b.delta);
    return items;
  }, [deltas]);

  // Enriched violations for the blockers panel
  const enrichedViolations = useMemo(() => {
    const source = reportScores ?? checkedEntries;
    const rows: {
      resourceType: string;
      resourceLabel: string;
      elementId: string;
      elementName: string;
      fieldName: string;
      requirementLevel: string;
      dataType: string;
      count: number;
    }[] = [];
    for (const entry of source) {
      const viols = 'violations_by_element' in entry ? entry.violations_by_element : entry.violations;
      for (const [elId, count] of Object.entries(viols)) {
        const el = elementMap.get(elId);
        rows.push({
          resourceType: entry.resource_type,
          resourceLabel:
            RESOURCE_TYPE_CONFIG[entry.resource_type as KENHDDResourceType]?.label ?? entry.resource_type,
          elementId: elId,
          elementName: el?.name ?? elId,
          fieldName: el?.model_field ?? '—',
          requirementLevel: el?.requirement_level ?? 'UNKNOWN',
          dataType: el?.data_type ?? '—',
          count,
        });
      }
    }
    // Sort: MANDATORY first, then by count descending
    rows.sort((a, b) => {
      const aM = a.requirementLevel === 'MANDATORY' ? 0 : 1;
      const bM = b.requirementLevel === 'MANDATORY' ? 0 : 1;
      if (aM !== bM) return aM - bM;
      return b.count - a.count;
    });
    return rows;
  }, [reportScores, checkedEntries, elementMap]);

  // Filtered + sorted run history
  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    let filtered = historyFilter === 'all' ? [...runs] : runs.filter((r) => r.resource_type === historyFilter);
    const dir = sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortColumn) {
        case 'resource': {
          const aL = RESOURCE_TYPE_CONFIG[a.resource_type as KENHDDResourceType]?.label ?? a.resource_type;
          const bL = RESOURCE_TYPE_CONFIG[b.resource_type as KENHDDResourceType]?.label ?? b.resource_type;
          return aL.localeCompare(bL) * dir;
        }
        case 'score':
          return (parseFloat(a.compliance_score) - parseFloat(b.compliance_score)) * dir;
        case 'mandatory':
          return (parseFloat(a.mandatory_pass_rate) - parseFloat(b.mandatory_pass_rate)) * dir;
        case 'records':
          return (a.records_compliant - b.records_compliant) * dir;
        case 'run_by': {
          const aName = a.run_by_name ?? '';
          const bName = b.run_by_name ?? '';
          return aName.localeCompare(bName) * dir;
        }
        case 'date':
        default:
          return (new Date(a.run_at).getTime() - new Date(b.run_at).getTime()) * dir;
      }
    });
    return filtered;
  }, [runs, historyFilter, sortColumn, sortDirection]);

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'date' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column)
      return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  // Most recent run timestamp
  const latestRunAt = useMemo(() => {
    const dates = (summary ?? []).map((s) => s.run_at).filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }, [summary]);

  const latestRunBy = useMemo(() => {
    if (!latestRunAt) return null;
    const entry = (summary ?? []).find((s) => s.run_at === latestRunAt);
    return entry?.run_by ?? null;
  }, [summary, latestRunAt]);

  const latestRunByResource = useMemo(() => {
    const map: Record<string, number> = {};
    for (const run of (runs ?? [])) {
      if (!map[run.resource_type]) {
        map[run.resource_type] = run.id;
      }
    }
    return map;
  }, [runs]);

  const totalViolationsPages = Math.ceil(enrichedViolations.length / ITEMS_PER_PAGE);
  const paginatedViolations = enrichedViolations.slice(
    (violationsPage - 1) * ITEMS_PER_PAGE,
    violationsPage * ITEMS_PER_PAGE
  );

  const totalHistoryPages = Math.ceil(filteredRuns.length / ITEMS_PER_PAGE);
  const paginatedRuns = filteredRuns.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE
  );

  const openLatestRunForResource = (resourceType: string) => {
    const runId = latestRunByResource[resourceType];
    if (runId) {
      setSelectedRunId(runId);
      setRunDetailOpen(true);
    }
  };

  const hasNeverRun = checkedEntries.length === 0 && !summaryLoading;

  const handleExport = async (resourceType: KENHDDResourceType, format: 'csv' | 'json') => {
    try {
      const blob = await kenhddApi.exportReport(resourceType, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kenhdd_${resourceType.toLowerCase()}_report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded.');
    } catch {
      toast.error('Export failed.');
    }
  };

  // --- Render ---

  if (hasNeverRun && !reportMutation.isPending) {
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
                <RefreshCw className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Run Compliance Check</span>
                <span className="sm:hidden">Run Check</span>
              </Button>
            }
          />
          <EmptyState
            icon={ShieldCheck}
            title="No compliance data yet"
            description="Run a KENHDD compliance check to validate your data against the Kenya National Health Data Dictionary. Results will show which resource types are compliant, which need attention, and what to fix first."
            action={{
              label: 'Run Compliance Check',
              onClick: () => reportMutation.mutate(),
            }}
          />
        </div>
      </PullToRefresh>
    );
  }

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
              <span className="hidden sm:inline">Run Compliance Check</span>
              <span className="sm:hidden">Run Check</span>
            </Button>
          }
        />

        {/* Loading overlay while check is running */}
        {reportMutation.isPending && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <div className="text-sm font-medium">Running compliance check…</div>
                <div className="text-xs text-muted-foreground">
                  Validating records across all 7 resource types. This may take a moment.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Latest Run Summary Band */}
        {!summaryLoading && latestRunAt && (
          <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl sm:text-3xl font-bold ${getScoreColor(overallScore)}`}>
                    {overallScore !== null ? `${overallScore}%` : '—'}
                  </span>
                  {getScoreBadge(overallScore)}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Overall compliance across {checkedEntries.length} resource type{checkedEntries.length !== 1 ? 's' : ''}
                  {overallMandatoryRate !== null && (
                    <> · Mandatory pass rate: <span className="font-medium">{overallMandatoryRate}%</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimeAgo(latestRunAt)}
                </div>
                {latestRunBy && (
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {latestRunBy}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Remediation KPI Cards */}
        {summaryLoading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : summaryError ? (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center text-destructive">
              Failed to load compliance summary.
            </CardContent>
          </Card>
        ) : checkedEntries.length > 0 ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <AdminStatCard
              title="Mandatory Blockers"
              value={totalMandatoryBlockers}
              description="Failing mandatory field checks"
              icon={<ShieldAlert className="h-4 w-4" />}
              tone={totalMandatoryBlockers > 0 ? 'critical' : 'success'}
              valueClassName={totalMandatoryBlockers > 0 ? 'text-destructive' : 'text-emerald-600'}
            />
            <AdminStatCard
              title="Below Threshold"
              value={checkedEntries.filter((s) => (s.compliance_score ?? 0) < 90).length}
              description={`of ${checkedEntries.length} types below 90%`}
              icon={<Target className="h-4 w-4" />}
              tone={checkedEntries.some((s) => (s.compliance_score ?? 0) < 70) ? 'warning' : 'default'}
            />
            <AdminStatCard
              title="Best Resource"
              value={bestResource
                ? `${Math.round(bestResource.compliance_score ?? 0)}%`
                : '—'}
              description={bestResource
                ? RESOURCE_TYPE_CONFIG[bestResource.resource_type as KENHDDResourceType]?.label
                : undefined}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="success"
            />
            <AdminStatCard
              title="Needs Most Work"
              value={worstResource
                ? `${Math.round(worstResource.compliance_score ?? 0)}%`
                : '—'}
              description={worstResource
                ? RESOURCE_TYPE_CONFIG[worstResource.resource_type as KENHDDResourceType]?.label
                : undefined}
              icon={<TrendingDown className="h-4 w-4" />}
              tone={getScoreTone(worstResource?.compliance_score ?? null)}
            />
          </div>
        ) : null}

        {/* What Changed Since Last Run */}
        {changes.length > 0 && (
          <Card>
            <CardHeader
              className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
              onClick={() => setChangesSectionOpen((o) => !o)}
            >
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                What Changed
                <Badge variant="secondary" className="ml-1 text-xs">{changes.length}</Badge>
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${changesSectionOpen ? '' : '-rotate-90'}`} />
              </CardTitle>
            </CardHeader>
            {changesSectionOpen && (
              <CardContent>
                <div className="space-y-2">
                  {changes.map((change) => (
                    <div
                      key={change.resource}
                      className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => openLatestRunForResource(change.resource)}
                      title={`View latest ${change.label} run details`}
                    >
                      {change.delta < 0 ? (
                        <ArrowDownRight className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-green-500 shrink-0" />
                      )}
                      <span className="font-medium">{change.label}</span>
                      <span className="text-muted-foreground">
                        {change.delta < 0 ? 'dropped' : 'improved'}{' '}
                        <span className={change.delta < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                          {Math.abs(change.delta)} point{Math.abs(change.delta) !== 1 ? 's' : ''}
                        </span>
                        {' '}to {change.curr}%
                      </span>
                      {getScoreBadge(change.curr)}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Compliance by Resource Type — Actionable Cards */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
            onClick={() => setResourcesSectionOpen((o) => !o)}
          >
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              Compliance by Resource Type
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${resourcesSectionOpen ? '' : '-rotate-90'}`} />
            </CardTitle>
          </CardHeader>
          {resourcesSectionOpen && (
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : summary ? (
              <div className="space-y-2">
                {summary.map((entry) => {
                  const config = RESOURCE_TYPE_CONFIG[entry.resource_type as KENHDDResourceType];
                  if (!config) return null;
                  const Icon = config.icon;
                  const score = entry.compliance_score;
                  const mandRate = entry.mandatory_pass_rate;
                  const violationCount = Object.values(entry.violations).reduce((a, b) => a + b, 0);
                  const violationTypeCount = Object.keys(entry.violations).length;
                  const delta = deltas[entry.resource_type];

                  return (
                    <div
                      key={entry.resource_type}
                      className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => openLatestRunForResource(entry.resource_type)}
                      title={`View latest ${config.label} validation details`}
                    >
                      {/* Left: icon + label + meta */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {config.label}
                            {delta && delta.delta !== 0 && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                                  delta.delta > 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {delta.delta > 0 ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {Math.abs(delta.delta)}pt
                              </span>
                            )}
                            {delta && delta.delta === 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                <Minus className="h-3 w-3" />
                                unchanged
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.records_checked > 0
                              ? `${entry.records_compliant}/${entry.records_checked} records · Mandatory: ${mandRate !== null ? `${Math.round(mandRate)}%` : '—'}`
                              : 'No data yet'}
                          </div>
                        </div>
                      </div>

                      {/* Right: violations + score + badge + actions */}
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
                        {violationCount > 0 && score !== null && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            {violationCount} violation{violationCount !== 1 ? 's' : ''} ({violationTypeCount} field{violationTypeCount !== 1 ? 's' : ''})
                          </div>
                        )}
                        <div className={`text-sm font-semibold w-12 text-right ${getScoreColor(score)}`}>
                          {score !== null ? `${Math.round(score)}%` : '—'}
                        </div>
                        {getScoreBadge(score)}
                        {/* Per-resource actions */}
                        {score !== null && (
                          <div className="flex items-center gap-1 ml-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={`Re-run ${config.label}`}
                              disabled={resourceRerunMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                resourceRerunMutation.mutate(entry.resource_type as KENHDDResourceType);
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={`Export ${config.label} report`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExport(entry.resource_type as KENHDDResourceType, 'csv');
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
          )}
        </Card>

        {/* Prioritized Blockers Panel */}
        {enrichedViolations.length > 0 && (
          <Card>
            <CardHeader
              className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
              onClick={() => setViolationsSectionOpen((o) => !o)}
            >
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                {reportScores ? 'Violations from Latest Check' : 'Outstanding Violations'}
                <Badge variant="secondary" className="ml-1 text-xs">{enrichedViolations.length}</Badge>
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${violationsSectionOpen ? '' : '-rotate-90'}`} />
              </CardTitle>
            </CardHeader>
            {violationsSectionOpen && (
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-[550px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Resource</th>
                      <th className="pb-2 font-medium">Element</th>
                      <th className="pb-2 font-medium hidden sm:table-cell">Field</th>
                      <th className="pb-2 font-medium">Level</th>
                      <th className="pb-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedViolations.map((v) => (
                      <tr
                        key={`${v.resourceType}-${v.elementId}`}
                        className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openLatestRunForResource(v.resourceType)}
                        title={`View latest ${v.resourceLabel} run details`}
                      >
                        <td className="py-2">{v.resourceLabel}</td>
                        <td className="py-2">
                          <div className="font-medium text-xs">{v.elementName}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{v.elementId}</div>
                        </td>
                        <td className="py-2 hidden sm:table-cell text-xs text-muted-foreground font-mono">
                          {v.fieldName}
                        </td>
                        <td className="py-2">
                          {v.requirementLevel === 'MANDATORY' ? (
                            <Badge variant="destructive" className="text-xs">
                              Mandatory
                            </Badge>
                          ) : v.requirementLevel === 'CONDITIONAL' ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              Conditional
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Optional
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant="destructive" className="text-xs">
                            {v.count}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalViolationsPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t mt-3">
                  <span className="text-xs text-muted-foreground">
                    Page {violationsPage} of {totalViolationsPages} ({enrichedViolations.length} violations)
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={violationsPage <= 1} onClick={() => setViolationsPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={violationsPage >= totalViolationsPages} onClick={() => setViolationsPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
            )}
          </Card>
        )}

        {/* Run History */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle
              className="text-base sm:text-lg flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setHistorySectionOpen((o) => !o)}
            >
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Run History
              {filteredRuns.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{filteredRuns.length}</Badge>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${historySectionOpen ? '' : '-rotate-90'}`} />
            </CardTitle>
            <Select value={historyFilter} onValueChange={(v) => { setHistoryFilter(v); setHistoryPage(1); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {ALL_RESOURCE_TYPES.map((rt) => (
                  <SelectItem key={rt} value={rt}>
                    {RESOURCE_TYPE_CONFIG[rt].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          {historySectionOpen && (
          <CardContent>
            {runsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : paginatedRuns.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <table className="min-w-[600px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('resource')}>
                          Resource <SortIcon column="resource" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium text-right">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('score')}>
                          Score <SortIcon column="score" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium text-right">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('mandatory')}>
                          Mandatory <SortIcon column="mandatory" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium text-right">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('records')}>
                          Records <SortIcon column="records" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('run_by')}>
                          Run By <SortIcon column="run_by" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium">
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('date')}>
                          Date <SortIcon column="date" />
                        </button>
                      </th>
                      <th className="pb-2 font-medium text-right">Export</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRuns.map((run) => {
                      const score = parseFloat(run.compliance_score);
                      return (
                        <tr
                          key={run.id}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setSelectedRunId(run.id);
                            setRunDetailOpen(true);
                          }}
                        >
                          <td className="py-2">
                            <div className="flex items-center gap-1.5">
                              {score >= 90 ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              ) : score >= 70 ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              ) : (
                                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                              )}
                              {RESOURCE_TYPE_CONFIG[run.resource_type as KENHDDResourceType]?.label ??
                                run.resource_type}
                            </div>
                          </td>
                          <td className={`py-2 text-right font-semibold ${getScoreColor(score)}`}>
                            {score.toFixed(0)}%
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
                          <td className="py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Export CSV"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExport(run.resource_type as KENHDDResourceType, 'csv');
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t mt-3">
                  <span className="text-xs text-muted-foreground">
                    Page {historyPage} of {totalHistoryPages} ({filteredRuns.length} runs)
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>
                  {historyFilter === 'all'
                    ? 'No validation runs yet. Click "Run Compliance Check" to begin.'
                    : `No runs for ${RESOURCE_TYPE_CONFIG[historyFilter as KENHDDResourceType]?.label ?? historyFilter}.`
                  }
                </p>
              </div>
            )}
          </CardContent>
          )}
        </Card>
        {/* Run Detail Dialog */}
        <KENHDDRunDetailDialog
          runId={selectedRunId}
          open={runDetailOpen}
          onOpenChange={setRunDetailOpen}
        />
      </div>
    </PullToRefresh>
  );
}
