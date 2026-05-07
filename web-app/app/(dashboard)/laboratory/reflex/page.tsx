'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Repeat2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Plus,
  Clock,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { reflexApi } from '@/lib/api/reflex';
import type { ReflexRule, ReflexExecution } from '@/lib/types/reflex';

// =============================================================================
// Helpers
// =============================================================================

function executionStatusColor(status: string) {
  switch (status) {
    case 'TRIGGERED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'ORDERED':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'SUGGESTED':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function actionBadgeColor(action: string) {
  return action === 'AUTO_ORDER'
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
}

function operatorLabel(op: string) {
  const labels: Record<string, string> = {
    GT: '>', LT: '<', GTE: '≥', LTE: '≤', EQ: '=', NEQ: '≠',
    IN_RANGE: 'In Range', OUT_OF_RANGE: 'Out of Range',
    CONTAINS: 'Contains', CRITICAL: 'Critical', ABNORMAL: 'Abnormal',
  };
  return labels[op] || op;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Page Component
// =============================================================================

export default function ReflexTestingPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  // Queries
  const { data: rulesData } = useQuery({
    queryKey: ['reflex-rules'],
    queryFn: () => reflexApi.listRules(),
  });

  const { data: executionsData } = useQuery({
    queryKey: ['reflex-executions'],
    queryFn: () => reflexApi.listExecutions(),
  });

  // Mutations
  const seedMutation = useMutation({
    mutationFn: () => reflexApi.seedDefaults(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reflex-rules'] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => reflexApi.approveExecution(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reflex-executions'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => reflexApi.rejectExecution(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reflex-executions'] }),
  });

  const rules = rulesData?.results || [];
  const executions = executionsData?.results || [];

  // Stats
  const totalRules = rulesData?.count || 0;
  const activeRules = rules.filter((r) => r.is_active).length;
  const pendingSuggestions = executions.filter((e) => e.status === 'SUGGESTED').length;
  const autoOrdered = executions.filter((e) => e.status === 'ORDERED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Reflex Testing"
          helpContent="Configure rules that automatically order or suggest follow-up tests based on initial results. For example, abnormal TSH triggers Free T4 testing."
          actions={
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              variant="outline"
              size="sm"
            >
              <Zap className="mr-2 h-4 w-4" />
              {seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Repeat2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Rules</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{totalRules}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{activeRules}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{pendingSuggestions}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Auto-Ordered</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{autoOrdered}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="executions">
          <TabsList>
            <TabsTrigger value="executions" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="sm:hidden">Activity</span>
              <span className="hidden sm:inline">Executions</span>
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <Repeat2 className="h-4 w-4" />
              Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="executions" className="mt-4">
            <ResponsiveTable
              data={executions}
              keyExtractor={(item) => item.id}
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'trigger_test_name',
                  header: 'Trigger Test',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p className="font-medium">{item.trigger_test_name}</p>
                      <p className="text-xs text-muted-foreground">Value: {item.trigger_value}</p>
                    </div>
                  ),
                },
                {
                  key: 'reflex_test_name',
                  header: 'Reflex Test',
                  sortable: true,
                  cell: (item) => item.reflex_test_name,
                },
                {
                  key: 'action',
                  header: 'Action',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${actionBadgeColor(item.action)} shrink-0 w-fit`}>
                      {item.action === 'AUTO_ORDER' ? 'Auto' : 'Suggest'}
                    </Badge>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${executionStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status}
                    </Badge>
                  ),
                },
                {
                  key: 'created_at',
                  header: 'When',
                  sortable: true,
                  sortType: 'date',
                  cell: (item) => formatDate(item.created_at),
                  hideOnMobile: true,
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) =>
                    item.status === 'SUGGESTED' ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveMutation.mutate(item.id);
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectMutation.mutate(item.id);
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.trigger_test_name}</p>
                      <p className="text-xs text-muted-foreground">→ {item.reflex_test_name}</p>
                    </div>
                    <Badge className={`${executionStatusColor(item.status)} shrink-0 w-fit`}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Value: {item.trigger_value}
                    </span>
                    {item.status === 'SUGGESTED' && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-green-600"
                          onClick={() => approveMutation.mutate(item.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-red-600"
                          onClick={() => rejectMutation.mutate(item.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <ResponsiveTable
              data={rules}
              keyExtractor={(item) => item.id}
              columns={[
                {
                  key: 'name',
                  header: 'Rule Name',
                  sortable: true,
                  cell: (item) => item.name,
                },
                {
                  key: 'trigger_test_name',
                  header: 'Trigger',
                  sortable: true,
                  cell: (item) => (
                    <span>
                      {item.trigger_test_code} {operatorLabel(item.operator)}{' '}
                      {item.threshold_value ?? ''}
                    </span>
                  ),
                },
                {
                  key: 'reflex_test_name',
                  header: 'Reflex Test',
                  sortable: true,
                  cell: (item) => item.reflex_test_code,
                },
                {
                  key: 'action',
                  header: 'Action',
                  sortable: true,
                  cell: (item) => (
                    <Badge className={`${actionBadgeColor(item.action)} shrink-0 w-fit`}>
                      {item.action === 'AUTO_ORDER' ? 'Auto Order' : 'Suggest'}
                    </Badge>
                  ),
                },
                {
                  key: 'is_active',
                  header: 'Active',
                  sortable: true,
                  cell: (item) => (
                    <Badge
                      className={
                        item.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                      }
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="font-medium">{item.name}</p>
                    <Badge className={`${actionBadgeColor(item.action)} shrink-0 w-fit`}>
                      {item.action === 'AUTO_ORDER' ? 'Auto' : 'Suggest'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.trigger_test_code} {operatorLabel(item.operator)} {item.threshold_value ?? ''} → {item.reflex_test_code}
                  </p>
                </div>
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
