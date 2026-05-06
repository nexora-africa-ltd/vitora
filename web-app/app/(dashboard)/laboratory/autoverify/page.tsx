'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Settings,
  Plus,
  Zap,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { autoverifyApi } from '@/lib/api/autoverify';
import type {
  DeltaCheckRule,
  AutoVerifyRule,
  AutoVerifyLog,
  AutoVerifyStats,
  AutoVerifyConfig,
} from '@/lib/types/autoverify';

// =============================================================================
// Helpers
// =============================================================================

function outcomeColor(outcome: string) {
  switch (outcome) {
    case 'PASS':
    case 'AUTO_VERIFIED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'FAIL':
    case 'BLOCKED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'NO_PRIOR':
    case 'SKIPPED':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
    case 'CAP_EXCEEDED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function conditionLabel(type: string) {
  const labels: Record<string, string> = {
    IN_REFERENCE_RANGE: 'In Reference Range',
    DELTA_CHECK_PASS: 'Delta Check Pass',
    QC_IN_CONTROL: 'QC In Control',
    NO_CRITICAL_FLAG: 'No Critical Flag',
    SPECIMEN_AGE_OK: 'Specimen Age OK',
    NUMERIC_RESULT: 'Numeric Result',
    NOT_AMENDED: 'Not Amended',
  };
  return labels[type] || type;
}

// =============================================================================
// Page Component
// =============================================================================

export default function AutoVerifyPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [showDeltaRuleDialog, setShowDeltaRuleDialog] = useState(false);

  // Queries
  const { data: stats } = useQuery({
    queryKey: ['autoverify-stats'],
    queryFn: () => autoverifyApi.getStats(),
  });

  const { data: config } = useQuery({
    queryKey: ['autoverify-config'],
    queryFn: () => autoverifyApi.getConfig(),
  });

  const { data: deltaRulesData } = useQuery({
    queryKey: ['autoverify-delta-rules'],
    queryFn: () => autoverifyApi.listDeltaRules(),
  });

  const { data: rulesData } = useQuery({
    queryKey: ['autoverify-rules'],
    queryFn: () => autoverifyApi.listRules(),
  });

  const { data: logsData } = useQuery({
    queryKey: ['autoverify-logs'],
    queryFn: () => autoverifyApi.listLogs(),
  });

  const { data: deltaResultsData } = useQuery({
    queryKey: ['autoverify-delta-results'],
    queryFn: () => autoverifyApi.listDeltaResults(),
  });

  // Mutations
  const toggleConfig = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!config) return Promise.reject('No config');
      return autoverifyApi.updateConfig(config.id, { is_enabled: enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoverify-config'] }),
  });

  const seedDeltaDefaults = useMutation({
    mutationFn: () => autoverifyApi.seedDeltaDefaults(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoverify-delta-rules'] }),
  });

  const deleteDeltaRule = useMutation({
    mutationFn: (id: number) => autoverifyApi.deleteDeltaRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoverify-delta-rules'] }),
  });

  const deleteAutoRule = useMutation({
    mutationFn: (id: number) => autoverifyApi.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoverify-rules'] }),
  });

  const deltaRules = deltaRulesData?.results || [];
  const autoRules = rulesData?.results || [];
  const logs = logsData?.results || [];
  const deltaResults = deltaResultsData?.results || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Auto-Verification"
          helpContent="Manage delta check rules and auto-verification criteria. Results passing all conditions are automatically verified, reducing manual workload while maintaining quality."
          actions={
            <div className="flex items-center gap-2">
              {config && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.is_enabled}
                    onCheckedChange={(checked) => toggleConfig.mutate(checked)}
                  />
                  <span className="text-sm font-medium">
                    {config.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              )}
            </div>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Auto-Verified</span>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats?.auto_verified ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {stats?.auto_verify_rate?.toFixed(1) ?? 0}% rate
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-xs text-muted-foreground">Blocked</span>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats?.blocked ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                Require manual review
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-muted-foreground">Delta Failures</span>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats?.delta_checks_failed ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                of {stats?.delta_checks_total ?? 0} checks
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">Total Evaluated</span>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats?.total_evaluated ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                Cap: {config?.max_auto_verify_percent ?? 70}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="delta-rules">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="delta-rules" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span className="sm:hidden">Delta</span>
              <span className="hidden sm:inline">Delta Rules</span>
            </TabsTrigger>
            <TabsTrigger value="verify-rules" className="gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span className="sm:hidden">Rules</span>
              <span className="hidden sm:inline">Verify Rules</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span className="sm:hidden">Logs</span>
              <span className="hidden sm:inline">Verification Log</span>
            </TabsTrigger>
            <TabsTrigger value="delta-results" className="gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              <span className="sm:hidden">Alerts</span>
              <span className="hidden sm:inline">Delta Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* Delta Check Rules Tab */}
          <TabsContent value="delta-rules" className="mt-4">
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base sm:text-lg">Delta Check Rules</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => seedDeltaDefaults.mutate()}
                  disabled={seedDeltaDefaults.isPending}
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Seed Defaults
                </Button>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={deltaRules}
                  keyExtractor={(r) => r.id}
                  columns={[
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    { key: 'check_type', header: 'Type', sortable: true, cell: (r) => r.check_type },
                    {
                      key: 'threshold',
                      header: 'Threshold',
                      cell: (r) =>
                        r.check_type === 'ABSOLUTE'
                          ? `±${r.threshold_absolute}`
                          : `${r.threshold_percent}%`,
                    },
                    { key: 'lookback_hours', header: 'Lookback', sortable: true, sortType: 'number', cell: (r) => `${r.lookback_hours}h` },
                    {
                      key: 'action',
                      header: 'Action',
                      sortable: true,
                      cell: (r) => (
                        <Badge variant="outline" className="text-xs">
                          {r.action.replace(/_/g, ' ')}
                        </Badge>
                      ),
                    },
                    {
                      key: 'is_active',
                      header: 'Active',
                      cell: (r) => (
                        <Badge className={r.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {r.is_active ? 'Yes' : 'No'}
                        </Badge>
                      ),
                    },
                    {
                      key: 'actions',
                      header: '',
                      cell: (r) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteDeltaRule.mutate(r.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ),
                    },
                  ]}
                  mobileCard={(r) => (
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{r.test_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.check_type} • {r.check_type === 'ABSOLUTE' ? `±${r.threshold_absolute}` : `${r.threshold_percent}%`} • {r.lookback_hours}h
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">{r.action.replace(/_/g, ' ')}</Badge>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auto-Verify Rules Tab */}
          <TabsContent value="verify-rules" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Auto-Verification Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={autoRules}
                  keyExtractor={(r) => r.id}
                  columns={[
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    {
                      key: 'condition_type',
                      header: 'Condition',
                      sortable: true,
                      cell: (r) => conditionLabel(r.condition_type),
                    },
                    { key: 'priority', header: 'Priority', sortable: true, sortType: 'number', cell: (r) => r.priority },
                    {
                      key: 'is_active',
                      header: 'Active',
                      cell: (r) => (
                        <Badge className={r.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                          {r.is_active ? 'Yes' : 'No'}
                        </Badge>
                      ),
                    },
                    {
                      key: 'actions',
                      header: '',
                      cell: (r) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteAutoRule.mutate(r.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ),
                    },
                  ]}
                  mobileCard={(r) => (
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{r.test_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {conditionLabel(r.condition_type)} • Priority {r.priority}
                        </p>
                      </div>
                      <Badge className={r.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verification Log Tab */}
          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Verification Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={logs}
                  keyExtractor={(r) => r.id}
                  defaultSortColumn="evaluated_at"
                  defaultSortDirection="desc"
                  columns={[
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    { key: 'patient_name', header: 'Patient', sortable: true, cell: (r) => r.patient_name, hideOnMobile: true },
                    {
                      key: 'outcome',
                      header: 'Outcome',
                      sortable: true,
                      cell: (r) => (
                        <Badge className={outcomeColor(r.outcome)}>
                          {r.outcome.replace(/_/g, ' ')}
                        </Badge>
                      ),
                    },
                    {
                      key: 'blocking_rule_condition',
                      header: 'Blocker',
                      cell: (r) => r.blocking_rule_condition ? conditionLabel(r.blocking_rule_condition) : '—',
                      hideOnMobile: true,
                    },
                    {
                      key: 'evaluated_at',
                      header: 'Time',
                      sortable: true,
                      sortType: 'date',
                      cell: (r) => new Date(r.evaluated_at).toLocaleString(),
                    },
                  ]}
                  mobileCard={(r) => (
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{r.test_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.patient_name} • {new Date(r.evaluated_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge className={outcomeColor(r.outcome)}>
                        {r.outcome.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delta Check Results Tab */}
          <TabsContent value="delta-results" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Delta Check Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveTable
                  data={deltaResults}
                  keyExtractor={(r) => r.id}
                  defaultSortColumn="evaluated_at"
                  defaultSortDirection="desc"
                  columns={[
                    { key: 'test_name', header: 'Test', sortable: true, cell: (r) => r.test_name },
                    { key: 'patient_name', header: 'Patient', sortable: true, cell: (r) => r.patient_name, hideOnMobile: true },
                    {
                      key: 'outcome',
                      header: 'Outcome',
                      sortable: true,
                      cell: (r) => (
                        <Badge className={outcomeColor(r.outcome)}>
                          {r.outcome}
                        </Badge>
                      ),
                    },
                    {
                      key: 'delta',
                      header: 'Change',
                      cell: (r) => {
                        if (r.delta_percent != null) return `${r.delta_percent.toFixed(1)}%`;
                        if (r.delta_absolute != null) return `±${r.delta_absolute}`;
                        return '—';
                      },
                    },
                    {
                      key: 'values',
                      header: 'Prev → Curr',
                      cell: (r) => `${r.previous_value ?? '—'} → ${r.current_value ?? '—'}`,
                      hideOnMobile: true,
                    },
                    {
                      key: 'action_taken',
                      header: 'Action',
                      cell: (r) => (
                        <Badge variant="outline" className="text-xs">
                          {r.action_taken.replace(/_/g, ' ')}
                        </Badge>
                      ),
                    },
                    {
                      key: 'evaluated_at',
                      header: 'Time',
                      sortable: true,
                      sortType: 'date',
                      cell: (r) => new Date(r.evaluated_at).toLocaleString(),
                      hideOnMobile: true,
                    },
                  ]}
                  mobileCard={(r) => (
                    <div className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{r.test_name} — {r.patient_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.previous_value} → {r.current_value}
                          {r.delta_percent != null && ` (${r.delta_percent.toFixed(1)}%)`}
                        </p>
                      </div>
                      <Badge className={outcomeColor(r.outcome)}>{r.outcome}</Badge>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
