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
  Pencil,
  Trash2,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { reflexApi } from '@/lib/api/reflex';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { ReflexRule, ReflexRuleCreateData, ReflexExecution } from '@/lib/types/reflex';
import { toast } from 'sonner';

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
// Operators & Priorities
// =============================================================================

const OPERATORS = [
  { value: 'GT', label: '> Greater Than' },
  { value: 'LT', label: '< Less Than' },
  { value: 'GTE', label: '≥ Greater Than or Equal' },
  { value: 'LTE', label: '≤ Less Than or Equal' },
  { value: 'EQ', label: '= Equals' },
  { value: 'NEQ', label: '≠ Not Equals' },
  { value: 'IN_RANGE', label: 'In Range (between)' },
  { value: 'OUT_OF_RANGE', label: 'Out of Range' },
  { value: 'CONTAINS', label: 'Contains (text)' },
  { value: 'CRITICAL', label: 'Is Critical Value' },
  { value: 'ABNORMAL', label: 'Is Abnormal' },
] as const;

const PRIORITIES = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'STAT', label: 'STAT' },
] as const;

const TEXT_OPERATORS = ['CONTAINS', 'EQ', 'NEQ'];
const RANGE_OPERATORS = ['IN_RANGE', 'OUT_OF_RANGE'];
const NO_THRESHOLD_OPERATORS = ['CRITICAL', 'ABNORMAL'];

// =============================================================================
// Page Component
// =============================================================================

export default function ReflexTestingPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ReflexRule | null>(null);

  // Queries
  const { data: rulesData } = useQuery({
    queryKey: ['reflex-rules'],
    queryFn: () => reflexApi.listRules(),
  });

  const { data: executionsData } = useQuery({
    queryKey: ['reflex-executions'],
    queryFn: () => reflexApi.listExecutions(),
  });

  const { data: testsData } = useQuery({
    queryKey: ['lab-tests-for-reflex'],
    queryFn: () => laboratoryApi.listTests({ page_size: 200 }),
  });

  // Mutations
  const seedMutation = useMutation({
    mutationFn: () => reflexApi.seedDefaults(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reflex-rules'] });
      toast.success(data.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ReflexRuleCreateData) => reflexApi.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reflex-rules'] });
      setDialogOpen(false);
      toast.success('Reflex rule created');
    },
    onError: () => toast.error('Failed to create rule'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ReflexRuleCreateData> }) =>
      reflexApi.updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reflex-rules'] });
      setDialogOpen(false);
      setEditingRule(null);
      toast.success('Reflex rule updated');
    },
    onError: () => toast.error('Failed to update rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reflexApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reflex-rules'] });
      toast.success('Reflex rule deleted');
    },
    onError: () => toast.error('Failed to delete rule'),
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
  const tests = testsData?.results || [];

  // Stats
  const totalRules = rulesData?.count || 0;
  const activeRules = rules.filter((r) => r.is_active).length;
  const pendingSuggestions = executions.filter((e) => e.status === 'SUGGESTED').length;
  const autoOrdered = executions.filter((e) => e.status === 'ORDERED').length;

  const openCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const openEdit = (rule: ReflexRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Reflex Testing"
          helpContent="Configure rules that automatically order or suggest follow-up tests based on initial results. For example, abnormal TSH triggers Free T4 testing."
          actions={
            <div className="flex items-center gap-2">
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                variant="outline"
                size="sm"
              >
                <Zap className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}</span>
                <span className="sm:hidden">Seed</span>
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Add Rule</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
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
                  key: 'trigger_test_name',
                  header: 'Trigger',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p className="font-medium">{item.trigger_test_code}</p>
                      <p className="text-xs text-muted-foreground">
                        {operatorLabel(item.operator)} {item.threshold_value ?? item.text_value ?? ''}
                        {item.threshold_high != null ? `–${item.threshold_high}` : ''}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'reflex_test_name',
                  header: 'Reflex Test',
                  sortable: true,
                  cell: (item) => (
                    <div>
                      <p className="font-medium">{item.reflex_test_code}</p>
                      <p className="text-xs text-muted-foreground">{item.reflex_test_name}</p>
                    </div>
                  ),
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
                  hideOnMobile: true,
                },
                {
                  key: 'priority',
                  header: 'Priority',
                  sortable: true,
                  cell: (item) => (
                    <Badge variant="outline" className="shrink-0 w-fit">
                      {item.priority}
                    </Badge>
                  ),
                  hideOnMobile: true,
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
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete reflex rule?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the rule &quot;{item.description || item.trigger_test_code + ' → ' + item.reflex_test_code}&quot;.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(item.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ),
                },
              ]}
              mobileCard={(item) => (
                <div className="p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {item.trigger_test_code} {operatorLabel(item.operator)} {item.threshold_value ?? item.text_value ?? ''} → {item.reflex_test_code}
                      </p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                    </div>
                    <Badge className={`${actionBadgeColor(item.action)} shrink-0 w-fit`}>
                      {item.action === 'AUTO_ORDER' ? 'Auto' : 'Suggest'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-xs">{item.priority}</Badge>
                      <Badge
                        className={`text-xs ${
                          item.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive"
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            />
          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <ReflexRuleDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingRule(null);
          }}
          rule={editingRule}
          tests={tests}
          onSubmit={(data) => {
            if (editingRule) {
              updateMutation.mutate({ id: editingRule.id, data });
            } else {
              createMutation.mutate(data as ReflexRuleCreateData);
            }
          }}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// Create/Edit Dialog
// =============================================================================

interface ReflexRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ReflexRule | null;
  tests: Array<{ id: number; code: string; name: string }>;
  onSubmit: (data: Partial<ReflexRuleCreateData>) => void;
  isPending: boolean;
}

function ReflexRuleDialog({ open, onOpenChange, rule, tests, onSubmit, isPending }: ReflexRuleDialogProps) {
  const [triggerTest, setTriggerTest] = useState<string>('');
  const [reflexTest, setReflexTest] = useState<string>('');
  const [operator, setOperator] = useState<string>('GT');
  const [thresholdValue, setThresholdValue] = useState<string>('');
  const [thresholdHigh, setThresholdHigh] = useState<string>('');
  const [textValue, setTextValue] = useState<string>('');
  const [action, setAction] = useState<string>('SUGGEST');
  const [priority, setPriority] = useState<string>('ROUTINE');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  // Reset form when dialog opens or rule changes
  const resetForm = () => {
    if (rule) {
      setTriggerTest(String(rule.trigger_test));
      setReflexTest(String(rule.reflex_test));
      setOperator(rule.operator);
      setThresholdValue(rule.threshold_value != null ? String(rule.threshold_value) : '');
      setThresholdHigh(rule.threshold_high != null ? String(rule.threshold_high) : '');
      setTextValue(rule.text_value || '');
      setAction(rule.action);
      setPriority(rule.priority);
      setDescription(rule.description);
      setIsActive(rule.is_active);
    } else {
      setTriggerTest('');
      setReflexTest('');
      setOperator('GT');
      setThresholdValue('');
      setThresholdHigh('');
      setTextValue('');
      setAction('SUGGEST');
      setPriority('ROUTINE');
      setDescription('');
      setIsActive(true);
    }
  };

  // Reset when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) resetForm();
    onOpenChange(newOpen);
  };

  const needsThreshold = !TEXT_OPERATORS.includes(operator) && !NO_THRESHOLD_OPERATORS.includes(operator);
  const needsRange = RANGE_OPERATORS.includes(operator);
  const needsText = TEXT_OPERATORS.includes(operator);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<ReflexRuleCreateData> = {
      trigger_test: Number(triggerTest),
      reflex_test: Number(reflexTest),
      operator: operator as ReflexRuleCreateData['operator'],
      action: action as ReflexRuleCreateData['action'],
      priority,
      description,
      is_active: isActive,
    };
    if (needsThreshold && thresholdValue) {
      data.threshold_value = Number(thresholdValue);
    }
    if (needsRange && thresholdHigh) {
      data.threshold_high = Number(thresholdHigh);
    }
    if (needsText && textValue) {
      data.text_value = textValue;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Reflex Rule' : 'Create Reflex Rule'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Trigger Test */}
          <div className="space-y-1.5">
            <Label>Trigger Test *</Label>
            <Select value={triggerTest} onValueChange={setTriggerTest}>
              <SelectTrigger>
                <SelectValue placeholder="Select trigger test..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {tests.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.code} — {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operator */}
          <div className="space-y-1.5">
            <Label>Condition *</Label>
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Threshold Value */}
          {needsThreshold && (
            <div className={`grid gap-3 ${needsRange ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1.5">
                <Label>{needsRange ? 'Low Threshold' : 'Threshold Value'}</Label>
                <Input
                  type="number"
                  step="any"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  placeholder="e.g. 10.0"
                />
              </div>
              {needsRange && (
                <div className="space-y-1.5">
                  <Label>High Threshold</Label>
                  <Input
                    type="number"
                    step="any"
                    value={thresholdHigh}
                    onChange={(e) => setThresholdHigh(e.target.value)}
                    placeholder="e.g. 20.0"
                  />
                </div>
              )}
            </div>
          )}

          {/* Text Value */}
          {needsText && (
            <div className="space-y-1.5">
              <Label>Text Value</Label>
              <Input
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="e.g. positive, reactive"
              />
            </div>
          )}

          {/* Reflex Test */}
          <div className="space-y-1.5">
            <Label>Reflex Test (to order) *</Label>
            <Select value={reflexTest} onValueChange={setReflexTest}>
              <SelectTrigger>
                <SelectValue placeholder="Select reflex test..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {tests.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.code} — {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Action *</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_ORDER">Auto Order</SelectItem>
                  <SelectItem value="SUGGEST">Suggest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. TSH > 10 mIU/L → order Free T4"
              rows={2}
            />
          </div>

          {/* Active toggle (edit only) */}
          {rule && (
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="cursor-pointer">{isActive ? 'Active' : 'Inactive'}</Label>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!triggerTest || !reflexTest || isPending}
            >
              {isPending ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
