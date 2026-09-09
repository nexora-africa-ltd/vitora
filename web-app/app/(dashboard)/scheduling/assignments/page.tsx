// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Assignment Engine workspace for scheduling operations.
 * Access path: /scheduling/assignments.
 */
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  assignmentDecisionsApi,
  assignmentOverridesApi,
  assignmentRulesApi,
  assignmentsApi,
  resourcesApi,
  shiftsApi,
} from '@/lib/api/scheduling';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePatients } from '@/lib/hooks/use-patients';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import {
  buildAutoAssignReason,
  getTargetReferenceLabel,
  getTargetReferencePlaceholder,
  isPatientTargetRelevant,
} from '@/lib/scheduling/assignment-engine';
import { formatDateTime } from '@/lib/utils/format';
import type { AssignmentType, ManualOverrideRequest } from '@/lib/types/scheduling';

type ValueType = 'string' | 'number' | 'boolean';
type ConstraintOperator = '==' | '!=' | 'in' | 'contains' | '>' | '<' | '>=' | '<=';

interface WhenConditionRow {
  id: string;
  key: string;
  valueType: ValueType;
  value: string;
}

interface ConstraintRow {
  id: string;
  field: string;
  operator: ConstraintOperator;
  valueType: ValueType;
  value: string;
  listValue: string;
}

interface ScoringRow {
  id: string;
  field: string;
  weight: string;
  condition: string;
}

const createRowId = () => Math.random().toString(36).slice(2, 10);

function parseBuilderValue(valueType: ValueType, rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (valueType === 'number') {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (valueType === 'boolean') {
    return trimmed.toLowerCase() === 'true';
  }
  return trimmed;
}

function inferValueType(value: unknown): ValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const ASSIGNMENT_TYPES: AssignmentType[] = [
  'APPOINTMENT',
  'SHIFT',
  'BED_ASSIGNMENT',
  'LAB_BATCH',
  'THEATRE_SLOT',
];

const OVERRIDE_REASON_OPTIONS: ManualOverrideRequest['override_reason'][] = [
  'PATIENT_REQUEST',
  'STAFF_UNAVAILABLE',
  'EMERGENCY',
  'SPECIALIZATION_NEEDED',
  'LOAD_BALANCING',
  'ADMINISTRATIVE',
  'OTHER',
];

const OPERATOR_OPTIONS: ConstraintOperator[] = ['==', '!=', 'in', 'contains', '>', '<', '>=', '<='];

export default function SchedulingAssignmentsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isSuperuser } = usePermissions();
  const canAccessAssignmentEngine = isSuperuser;
  const canWrite = isSuperuser;

  const [tab, setTab] = useState<'rules' | 'decisions' | 'overrides'>('rules');
  const [search, setSearch] = useState('');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [manualOverrideOpen, setManualOverrideOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [selectedOverrideId, setSelectedOverrideId] = useState<number | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleEditorLoading, setRuleEditorLoading] = useState(false);
  const [seedBannerMessage, setSeedBannerMessage] = useState('');
  const [seedBannerCodes, setSeedBannerCodes] = useState<string[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  const [ruleName, setRuleName] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [ruleAppliesTo, setRuleAppliesTo] = useState<AssignmentType>('APPOINTMENT');
  const [rulePriority, setRulePriority] = useState('100');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleWhenRows, setRuleWhenRows] = useState<WhenConditionRow[]>([]);
  const [ruleConstraintRows, setRuleConstraintRows] = useState<ConstraintRow[]>([
    {
      id: createRowId(),
      field: 'is_active',
      operator: '==',
      valueType: 'boolean',
      value: 'true',
      listValue: '',
    },
  ]);
  const [ruleScoringRows, setRuleScoringRows] = useState<ScoringRow[]>([]);
  const [ruleFallbackAction, setRuleFallbackAction] = useState('leave_unassigned');

  const [autoAssignType, setAutoAssignType] = useState<AssignmentType>('APPOINTMENT');
  const [autoAssignPatientId, setAutoAssignPatientId] = useState('');
  const [autoAssignShiftId, setAutoAssignShiftId] = useState('');
  const [autoAssignTargetReference, setAutoAssignTargetReference] = useState('');
  const [autoAssignReason, setAutoAssignReason] = useState('');

  const [overrideTargetType, setOverrideTargetType] = useState('Appointment');
  const [overrideTargetId, setOverrideTargetId] = useState('');
  const [overrideResourceId, setOverrideResourceId] = useState('');
  const [overrideReason, setOverrideReason] =
    useState<ManualOverrideRequest['override_reason']>('PATIENT_REQUEST');
  const [overrideJustification, setOverrideJustification] = useState('');

  const resetRuleBuilder = () => {
    setEditingRuleId(null);
    setRuleName('');
    setRuleCode('');
    setRuleAppliesTo('APPOINTMENT');
    setRulePriority('100');
    setRuleDescription('');
    setRuleWhenRows([]);
    setRuleConstraintRows([
      {
        id: createRowId(),
        field: 'is_active',
        operator: '==',
        valueType: 'boolean',
        value: 'true',
        listValue: '',
      },
    ]);
    setRuleScoringRows([]);
    setRuleFallbackAction('leave_unassigned');
  };

  const loadRuleIntoBuilder = (rule: {
    id: number;
    name: string;
    rule_code: string;
    applies_to: AssignmentType;
    priority: number;
    description: string;
    rule_definition: Record<string, unknown>;
  }) => {
    const definition = rule.rule_definition || {};
    const whenDefinition =
      definition.when && typeof definition.when === 'object' && !Array.isArray(definition.when)
        ? (definition.when as Record<string, unknown>)
        : {};
    const constraintsDefinition = Array.isArray(definition.constraints)
      ? definition.constraints
      : [];
    const scoringDefinition = Array.isArray(definition.scoring) ? definition.scoring : [];
    const fallbackAction =
      definition.fallback &&
      typeof definition.fallback === 'object' &&
      !Array.isArray(definition.fallback) &&
      typeof (definition.fallback as { action?: unknown }).action === 'string'
        ? String((definition.fallback as { action?: string }).action)
        : 'leave_unassigned';

    setEditingRuleId(rule.id);
    setRuleName(rule.name || '');
    setRuleCode(rule.rule_code || '');
    setRuleAppliesTo(rule.applies_to || 'APPOINTMENT');
    setRulePriority(String(rule.priority ?? 100));
    setRuleDescription(rule.description || '');
    setRuleFallbackAction(fallbackAction);

    const whenRows: WhenConditionRow[] = Object.entries(whenDefinition).map(([key, value]) => ({
      id: createRowId(),
      key,
      valueType: inferValueType(value),
      value: valueToText(value),
    }));
    setRuleWhenRows(whenRows);

    const constraintRows: ConstraintRow[] = constraintsDefinition
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const row = item as { field?: unknown; operator?: unknown; value?: unknown };
        const operator = OPERATOR_OPTIONS.includes(String(row.operator) as ConstraintOperator)
          ? (String(row.operator) as ConstraintOperator)
          : '==';

        if (operator === 'in' && Array.isArray(row.value)) {
          const firstValue = row.value[0];
          return {
            id: createRowId(),
            field: String(row.field || ''),
            operator,
            valueType: inferValueType(firstValue),
            value: '',
            listValue: row.value.map((value) => valueToText(value)).join(', '),
          };
        }

        return {
          id: createRowId(),
          field: String(row.field || ''),
          operator,
          valueType: inferValueType(row.value),
          value: valueToText(row.value),
          listValue: '',
        };
      });
    setRuleConstraintRows(
      constraintRows.length > 0
        ? constraintRows
        : [
            {
              id: createRowId(),
              field: 'is_active',
              operator: '==',
              valueType: 'boolean',
              value: 'true',
              listValue: '',
            },
          ]
    );

    const scoringRows: ScoringRow[] = scoringDefinition
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const row = item as { field?: unknown; weight?: unknown; if?: unknown };
        return {
          id: createRowId(),
          field: String(row.field || ''),
          weight: String(row.weight ?? 1),
          condition: typeof row.if === 'string' ? row.if : '',
        };
      });
    setRuleScoringRows(scoringRows);
  };

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['scheduling', 'assignment-rules', debouncedSearch],
    queryFn: () =>
      assignmentRulesApi.list({
        page_size: 100,
        rule_code: debouncedSearch || undefined,
      }),
    enabled: canAccessAssignmentEngine,
  });

  const { data: decisionsData, isLoading: decisionsLoading } = useQuery({
    queryKey: ['scheduling', 'assignment-decisions'],
    queryFn: () => assignmentDecisionsApi.list({ page_size: 100 }),
    enabled: canAccessAssignmentEngine,
  });

  const { data: overridesData, isLoading: overridesLoading } = useQuery({
    queryKey: ['scheduling', 'assignment-overrides'],
    queryFn: () => assignmentOverridesApi.list({ page_size: 100 }),
    enabled: canAccessAssignmentEngine,
  });

  const { data: patientsData } = usePatients({ page_size: 100 });
  const { data: shiftsData } = useQuery({
    queryKey: ['scheduling', 'assignment-shifts'],
    queryFn: () =>
      shiftsApi.list({
        page_size: 150,
        ordering: '-shift_date',
      }),
    enabled: canAccessAssignmentEngine,
  });
  const { data: resourcesData } = useQuery({
    queryKey: ['scheduling', 'assignment-resources'],
    queryFn: () => resourcesApi.list({ page_size: 100, resource_type: 'PERSON', is_active: true }),
    enabled: canAccessAssignmentEngine,
  });

  const createRuleMutation = useMutation({
    mutationFn: assignmentRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-rules'] });
      toast({ title: 'Assignment rule created' });
      setRuleDialogOpen(false);
      resetRuleBuilder();
    },
    onError: () => {
      toast({ title: 'Unable to create rule', variant: 'destructive' });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof assignmentRulesApi.update>[1] }) =>
      assignmentRulesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-rules'] });
      toast({ title: 'Assignment rule updated' });
      setRuleDialogOpen(false);
      resetRuleBuilder();
    },
    onError: () => {
      toast({ title: 'Unable to update rule', variant: 'destructive' });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? assignmentRulesApi.deactivate(id) : assignmentRulesApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-rules'] });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => assignmentRulesApi.seedDefaults(false),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-rules'] });
      setSeedBannerCodes(result.created_rule_codes);
      setSeedBannerMessage(
        result.created > 0
          ? `Initialized ${result.created} default rule${result.created === 1 ? '' : 's'}.`
          : 'Defaults already initialized; no new rules were created.'
      );
      toast({
        title: 'Assignment defaults initialized',
        description: `Created ${result.created} rules (${result.total_rules} total).`,
      });
    },
    onError: () => {
      toast({ title: 'Unable to initialize defaults', variant: 'destructive' });
    },
  });

  const autoAssignMutation = useMutation({
    mutationFn: assignmentsApi.autoAssign,
    onSuccess: (result) => {
      if (!result.success) {
        toast({ title: result.error || 'Auto-assign failed', variant: 'destructive' });
        return;
      }
      toast({
        title: 'Auto-assign complete',
        description: result.assigned_resource
          ? `Assigned to ${result.assigned_resource.name}`
          : 'No assignment created',
      });
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-decisions'] });
      setAutoAssignOpen(false);
    },
    onError: () => toast({ title: 'Auto-assign failed', variant: 'destructive' }),
  });

  const manualOverrideMutation = useMutation({
    mutationFn: assignmentsApi.manualOverride,
    onSuccess: (result) => {
      if (!result.success) {
        toast({ title: result.error || 'Override failed', variant: 'destructive' });
        return;
      }
      toast({ title: 'Override submitted' });
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-overrides'] });
      setManualOverrideOpen(false);
    },
    onError: () => toast({ title: 'Override failed', variant: 'destructive' }),
  });

  const reviewOverrideMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'reject' }) =>
      action === 'approve'
        ? assignmentOverridesApi.approve(id)
        : assignmentOverridesApi.reject(id, 'Rejected by scheduler'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'assignment-overrides'] });
      setSelectedOverrideId(null);
      toast({ title: 'Override updated' });
    },
  });

  const rules = useMemo(() => rulesData?.results ?? [], [rulesData]);
  const decisions = useMemo(() => decisionsData?.results ?? [], [decisionsData]);
  const overrides = useMemo(() => overridesData?.results ?? [], [overridesData]);
  const resources = useMemo(() => resourcesData?.results ?? [], [resourcesData]);
  const patients = useMemo(() => patientsData?.results ?? [], [patientsData]);
  const shifts = useMemo(() => shiftsData?.results ?? [], [shiftsData]);

  const filteredRules = useMemo(() => {
    if (!debouncedSearch.trim()) return rules;
    const q = debouncedSearch.toLowerCase();
    return rules.filter(
      (rule) => rule.name.toLowerCase().includes(q) || rule.rule_code.toLowerCase().includes(q)
    );
  }, [rules, debouncedSearch]);

  const patientTargetRelevant = useMemo(
    () => isPatientTargetRelevant(autoAssignType),
    [autoAssignType]
  );
  const shiftTargetRelevant = autoAssignType === 'SHIFT';

  const patientOptions = useMemo(
    () =>
      patients.map((patient) => ({
        value: String(patient.id),
        label: patient.full_name || `${patient.first_name} ${patient.last_name}`,
        sublabel: patient.mrn,
      })),
    [patients]
  );

  const shiftOptions = useMemo(
    () =>
      shifts.map((shift) => ({
        value: String(shift.id),
        label: `${shift.staff_resource_name} · ${shift.shift_type}`,
        sublabel: `${shift.shift_date} ${shift.start_time}-${shift.end_time}`,
      })),
    [shifts]
  );

  const ruleDefinitionPreview = useMemo(() => {
    const when: Record<string, unknown> = {};
    for (const row of ruleWhenRows) {
      if (!row.key.trim()) continue;
      when[row.key.trim()] = parseBuilderValue(row.valueType, row.value);
    }

    const constraints = ruleConstraintRows
      .filter((row) => row.field.trim())
      .map((row) => {
        const base = {
          field: row.field.trim(),
          operator: row.operator,
        };
        if (row.operator === 'in') {
          return {
            ...base,
            value: row.listValue
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => parseBuilderValue(row.valueType, item)),
          };
        }
        return {
          ...base,
          value: parseBuilderValue(row.valueType, row.value),
        };
      });

    const scoring = ruleScoringRows
      .filter((row) => row.field.trim())
      .map((row) => ({
        field: row.field.trim(),
        weight: Number(row.weight) || 1,
        ...(row.condition.trim() ? { if: row.condition.trim() } : {}),
      }));

    return {
      version: '1.0',
      when,
      constraints,
      scoring,
      fallback: { action: ruleFallbackAction },
    };
  }, [ruleConstraintRows, ruleFallbackAction, ruleScoringRows, ruleWhenRows]);

  const handleSaveRule = () => {
    if (!ruleName.trim() || !ruleCode.trim()) {
      toast({ title: 'Rule name and rule code are required', variant: 'destructive' });
      return;
    }

    const hasInvalidConstraint = ruleConstraintRows.some((row) => {
      if (!row.field.trim()) return true;
      if (row.operator === 'in') return row.listValue.trim().length === 0;
      return row.value.trim().length === 0;
    });

    if (hasInvalidConstraint) {
      toast({
        title: 'Complete all constraint rows before creating the rule',
        variant: 'destructive',
      });
      return;
    }

      const payload = {
        name: ruleName,
        rule_code: ruleCode,
        applies_to: ruleAppliesTo,
        priority: Number(rulePriority) || 100,
        description: ruleDescription,
        rule_definition: ruleDefinitionPreview,
        is_active: true,
      };

      if (editingRuleId) {
        updateRuleMutation.mutate({ id: editingRuleId, data: payload });
      } else {
        createRuleMutation.mutate(payload);
      }
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Assignment Engine"
          helpContent="Manage assignment rules, review assignment decisions, and process manual overrides for scheduling automation."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
              {canWrite ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setAutoAssignOpen(true)}>
                    Auto-assign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setManualOverrideOpen(true)}>
                    Manual override
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      resetRuleBuilder();
                      setRuleDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New rule
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        {!canAccessAssignmentEngine ? (
          <Card className="border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">Superuser access required</p>
            <p className="mt-1 text-sm">
              Assignment Engine configuration and actions are restricted to platform superusers.
            </p>
          </Card>
        ) : null}

        {canAccessAssignmentEngine ? (
          <>

        <Card className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rules by name or rule code"
              className="pl-9"
            />
          </div>
        </Card>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="decisions">Decisions</TabsTrigger>
            <TabsTrigger value="overrides">Overrides</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            {seedBannerMessage ? (
              <Card className="mb-4 border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{seedBannerMessage}</p>
                  {seedBannerCodes.length > 0 ? (
                    <p className="text-xs">
                      Created rule codes: <span className="font-mono">{seedBannerCodes.join(', ')}</span>
                    </p>
                  ) : null}
                </div>
              </Card>
            ) : null}
            {rules.length === 0 && canWrite ? (
              <Card className="mb-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">No assignment rules configured</p>
                    <p className="text-sm text-muted-foreground">
                      Initialize baseline defaults for appointment, shift, bed, lab, and theatre assignment types.
                    </p>
                  </div>
                  <Button
                    onClick={() => seedDefaultsMutation.mutate()}
                    disabled={seedDefaultsMutation.isPending}
                  >
                    {seedDefaultsMutation.isPending ? 'Initializing...' : 'Initialize defaults'}
                  </Button>
                </div>
              </Card>
            ) : null}
            <ResponsiveTable
              data={filteredRules}
              keyExtractor={(item) => item.id}
              isLoading={rulesLoading}
              emptyMessage="No assignment rules found."
              columns={[
                { key: 'name', header: 'Rule', sortable: true, cell: (item) => item.name },
                { key: 'rule_code', header: 'Code', sortable: true, cell: (item) => item.rule_code },
                { key: 'applies_to', header: 'Applies to', sortable: true, cell: (item) => item.applies_to },
                { key: 'priority', header: 'Priority', sortable: true, cell: (item) => item.priority },
                {
                  key: 'is_active',
                  header: 'Status',
                  cell: (item) => (
                    <Badge variant={item.is_active ? 'default' : 'outline'}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) =>
                    canWrite ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setRuleEditorLoading(true);
                            try {
                              const fullRule = await assignmentRulesApi.get(item.id);
                              loadRuleIntoBuilder(fullRule);
                              setRuleDialogOpen(true);
                            } catch {
                              toast({ title: 'Unable to load rule for editing', variant: 'destructive' });
                            } finally {
                              setRuleEditorLoading(false);
                            }
                          }}
                          disabled={ruleEditorLoading}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRuleId(item.id);
                            toggleRuleMutation.mutate({ id: item.id, active: item.is_active });
                          }}
                          disabled={toggleRuleMutation.isPending && selectedRuleId === item.id}
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="decisions" className="mt-4">
            <ResponsiveTable
              data={decisions}
              keyExtractor={(item) => item.id}
              isLoading={decisionsLoading}
              emptyMessage="No assignment decisions captured yet."
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              columns={[
                { key: 'assignment_type', header: 'Type', sortable: true, cell: (item) => item.assignment_type },
                { key: 'target_type', header: 'Target', sortable: true, cell: (item) => `${item.target_type} #${item.target_id}` },
                { key: 'assigned_resource_name', header: 'Assigned resource', sortable: true, cell: (item) => item.assigned_resource_name || 'None' },
                { key: 'decision_outcome', header: 'Outcome', sortable: true, cell: (item) => item.decision_outcome },
                { key: 'decision_reason', header: 'Reason', cell: (item) => <span className="line-clamp-2 text-sm">{item.decision_reason}</span> },
                { key: 'created_at', header: 'Time', sortable: true, sortType: 'date', cell: (item) => formatDateTime(item.created_at) },
              ]}
            />
          </TabsContent>

          <TabsContent value="overrides" className="mt-4">
            <ResponsiveTable
              data={overrides}
              keyExtractor={(item) => item.id}
              isLoading={overridesLoading}
              emptyMessage="No assignment overrides yet."
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              columns={[
                { key: 'target', header: 'Target', cell: (item) => `${item.target_type} #${item.target_id}` },
                {
                  key: 'resources',
                  header: 'Resource change',
                  cell: (item) =>
                    `${item.original_resource_name || 'Unassigned'} -> ${item.new_resource_name || `Resource #${item.new_resource}`}`,
                },
                { key: 'override_reason', header: 'Reason', sortable: true, cell: (item) => item.override_reason },
                {
                  key: 'approval_status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => (
                    <Badge variant={item.approval_status === 'APPROVED' ? 'default' : 'outline'}>
                      {item.approval_status}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) =>
                    canWrite && item.approval_status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedOverrideId(item.id);
                            reviewOverrideMutation.mutate({ id: item.id, action: 'approve' });
                          }}
                          disabled={reviewOverrideMutation.isPending && selectedOverrideId === item.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOverrideId(item.id);
                            reviewOverrideMutation.mutate({ id: item.id, action: 'reject' });
                          }}
                          disabled={reviewOverrideMutation.isPending && selectedOverrideId === item.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </TabsContent>
        </Tabs>
          </>
        ) : null}

        <Dialog
          open={ruleDialogOpen}
          onOpenChange={(open) => {
            setRuleDialogOpen(open);
            if (!open) {
              resetRuleBuilder();
              setRuleEditorLoading(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRuleId ? 'Edit Assignment Rule' : 'Create Assignment Rule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule name</Label>
                <Input id="rule-name" value={ruleName} onChange={(event) => setRuleName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-code">Rule code</Label>
                <Input id="rule-code" value={ruleCode} onChange={(event) => setRuleCode(event.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rule-applies">Applies to</Label>
                  <Select value={ruleAppliesTo} onValueChange={(value) => setRuleAppliesTo(value as AssignmentType)}>
                    <SelectTrigger id="rule-applies"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-priority">Priority</Label>
                  <Input id="rule-priority" value={rulePriority} onChange={(event) => setRulePriority(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-description">Description</Label>
                <Textarea id="rule-description" value={ruleDescription} onChange={(event) => setRuleDescription(event.target.value)} placeholder="Short purpose of this rule" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>When Conditions</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() =>
                      setRuleWhenRows((current) => [
                        ...current,
                        { id: createRowId(), key: '', valueType: 'string', value: '' },
                      ])
                    }
                  >
                    Add condition
                  </Button>
                </div>
                {ruleWhenRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No conditions means this rule applies to all requests of this type.</p>
                ) : (
                  <div className="space-y-2">
                    {ruleWhenRows.map((row) => (
                      <div key={row.id} className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_1fr_auto]">
                        <Input
                          value={row.key}
                          onChange={(event) =>
                            setRuleWhenRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, key: event.target.value } : item
                              )
                            )
                          }
                          placeholder="context key (e.g. appointment_type)"
                        />
                        <Select
                          value={row.valueType}
                          onValueChange={(value) =>
                            setRuleWhenRows((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? { ...item, valueType: value as ValueType }
                                  : item
                              )
                            )
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">string</SelectItem>
                            <SelectItem value="number">number</SelectItem>
                            <SelectItem value="boolean">boolean</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={row.value}
                          onChange={(event) =>
                            setRuleWhenRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, value: event.target.value } : item
                              )
                            )
                          }
                          placeholder={row.valueType === 'boolean' ? 'true/false' : 'value'}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setRuleWhenRows((current) => current.filter((item) => item.id !== row.id))
                          }
                          aria-label="Remove condition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Constraints</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() =>
                      setRuleConstraintRows((current) => [
                        ...current,
                        {
                          id: createRowId(),
                          field: '',
                          operator: '==',
                          valueType: 'string',
                          value: '',
                          listValue: '',
                        },
                      ])
                    }
                  >
                    Add constraint
                  </Button>
                </div>
                <div className="space-y-2">
                  {ruleConstraintRows.map((row) => (
                    <div key={row.id} className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_auto]">
                      <Input
                        value={row.field}
                        onChange={(event) =>
                          setRuleConstraintRows((current) =>
                            current.map((item) =>
                              item.id === row.id ? { ...item, field: event.target.value } : item
                            )
                          )
                        }
                        placeholder="resource field (e.g. metadata.specialty)"
                      />
                      <Select
                        value={row.operator}
                        onValueChange={(value) =>
                          setRuleConstraintRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    operator: value as ConstraintOperator,
                                    value: value === 'in' ? '' : item.value,
                                    listValue: value === 'in' ? item.listValue : '',
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPERATOR_OPTIONS.map((operator) => (
                            <SelectItem key={operator} value={operator}>{operator}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={row.valueType}
                        onValueChange={(value) =>
                          setRuleConstraintRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, valueType: value as ValueType }
                                : item
                            )
                          )
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">string</SelectItem>
                          <SelectItem value="number">number</SelectItem>
                          <SelectItem value="boolean">boolean</SelectItem>
                        </SelectContent>
                      </Select>
                      {row.operator === 'in' ? (
                        <Input
                          value={row.listValue}
                          onChange={(event) =>
                            setRuleConstraintRows((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? { ...item, listValue: event.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="comma-separated values"
                        />
                      ) : (
                        <Input
                          value={row.value}
                          onChange={(event) =>
                            setRuleConstraintRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, value: event.target.value } : item
                              )
                            )
                          }
                          placeholder={row.valueType === 'boolean' ? 'true/false' : 'value'}
                        />
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setRuleConstraintRows((current) => current.filter((item) => item.id !== row.id))
                        }
                        aria-label="Remove constraint"
                        disabled={ruleConstraintRows.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Scoring</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() =>
                      setRuleScoringRows((current) => [
                        ...current,
                        { id: createRowId(), field: '', weight: '1', condition: '' },
                      ])
                    }
                  >
                    Add score
                  </Button>
                </div>
                {ruleScoringRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No scoring rows means all matching candidates are treated equally.</p>
                ) : (
                  <div className="space-y-2">
                    {ruleScoringRows.map((row) => (
                      <div key={row.id} className="grid gap-2 sm:grid-cols-[1.2fr_0.6fr_1fr_auto]">
                        <Input
                          value={row.field}
                          onChange={(event) =>
                            setRuleScoringRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, field: event.target.value } : item
                              )
                            )
                          }
                          placeholder="resource numeric field"
                        />
                        <Input
                          value={row.weight}
                          onChange={(event) =>
                            setRuleScoringRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, weight: event.target.value } : item
                              )
                            )
                          }
                          placeholder="weight"
                        />
                        <Input
                          value={row.condition}
                          onChange={(event) =>
                            setRuleScoringRows((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, condition: event.target.value } : item
                              )
                            )
                          }
                          placeholder="optional context key for if"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setRuleScoringRows((current) => current.filter((item) => item.id !== row.id))
                          }
                          aria-label="Remove scoring row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="rule-fallback">Fallback action</Label>
                <Select value={ruleFallbackAction} onValueChange={setRuleFallbackAction}>
                  <SelectTrigger id="rule-fallback"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave_unassigned">leave_unassigned</SelectItem>
                    <SelectItem value="notify_scheduler">notify_scheduler</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Generated JSON (read-only)</Label>
                <Textarea
                  readOnly
                  value={JSON.stringify(ruleDefinitionPreview, null, 2)}
                  className="min-h-28 font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSaveRule}
                disabled={
                  createRuleMutation.isPending ||
                  updateRuleMutation.isPending ||
                  ruleEditorLoading ||
                  !ruleName.trim() ||
                  !ruleCode.trim()
                }
              >
                {createRuleMutation.isPending || updateRuleMutation.isPending
                  ? editingRuleId
                    ? 'Saving...'
                    : 'Creating...'
                  : editingRuleId
                    ? 'Save changes'
                    : 'Create rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Auto-Assign</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="auto-type">Assignment type</Label>
                <Select
                  value={autoAssignType}
                  onValueChange={(value) => {
                    setAutoAssignType(value as AssignmentType);
                    setAutoAssignPatientId('');
                    setAutoAssignShiftId('');
                    setAutoAssignTargetReference('');
                  }}
                >
                  <SelectTrigger id="auto-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {patientTargetRelevant ? (
                <div className="space-y-2">
                  <Label htmlFor="auto-patient">Patient target (optional)</Label>
                  <SearchableSelect
                    id="auto-patient"
                    options={patientOptions}
                    value={autoAssignPatientId}
                    onValueChange={setAutoAssignPatientId}
                    placeholder="Select patient"
                    searchPlaceholder="Search patients by name or MRN"
                    emptyMessage="No matching patients"
                  />
                </div>
              ) : shiftTargetRelevant ? (
                <div className="space-y-2">
                  <Label htmlFor="auto-shift">Shift reference</Label>
                  <SearchableSelect
                    id="auto-shift"
                    options={shiftOptions}
                    value={autoAssignShiftId}
                    onValueChange={setAutoAssignShiftId}
                    placeholder="Select shift"
                    searchPlaceholder="Search by staff, date, or shift type"
                    emptyMessage="No matching shifts"
                  />
                  <p className="text-xs text-muted-foreground">
                    Selected shift is sent as context in assignment reason.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="auto-target-reference">{getTargetReferenceLabel(autoAssignType)}</Label>
                  <Input
                    id="auto-target-reference"
                    value={autoAssignTargetReference}
                    onChange={(event) => setAutoAssignTargetReference(event.target.value)}
                    placeholder={getTargetReferencePlaceholder(autoAssignType)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This assignment type does not use a patient target. Provide a target reference for audit context.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="auto-reason">Reason</Label>
                <Textarea id="auto-reason" value={autoAssignReason} onChange={(event) => setAutoAssignReason(event.target.value)} placeholder="Reason for assignment decision" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAutoAssignOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  autoAssignMutation.mutate({
                    assignment_type: autoAssignType,
                    patient_id:
                      patientTargetRelevant && autoAssignPatientId
                        ? Number(autoAssignPatientId)
                        : undefined,
                    reason: buildAutoAssignReason(
                      autoAssignReason,
                      shiftTargetRelevant
                        ? autoAssignShiftId
                          ? `SHIFT-${autoAssignShiftId}`
                          : ''
                        : autoAssignTargetReference
                    ),
                  })
                }
                disabled={autoAssignMutation.isPending}
              >
                {autoAssignMutation.isPending ? 'Running...' : 'Run auto-assign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={manualOverrideOpen} onOpenChange={setManualOverrideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Manual Override</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="override-target-type">Target type</Label>
                  <Input id="override-target-type" value={overrideTargetType} onChange={(event) => setOverrideTargetType(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="override-target-id">Target id</Label>
                  <Input id="override-target-id" value={overrideTargetId} onChange={(event) => setOverrideTargetId(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-resource">New resource</Label>
                <Select value={overrideResourceId} onValueChange={setOverrideResourceId}>
                  <SelectTrigger id="override-resource"><SelectValue placeholder="Select replacement resource" /></SelectTrigger>
                  <SelectContent>
                    {resources.map((resource) => (
                      <SelectItem key={resource.id} value={String(resource.id)}>
                        {resource.name} · {resource.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-reason">Override reason</Label>
                <Select
                  value={overrideReason}
                  onValueChange={(value) =>
                    setOverrideReason(value as ManualOverrideRequest['override_reason'])
                  }
                >
                  <SelectTrigger id="override-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERRIDE_REASON_OPTIONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-justification">Justification</Label>
                <Textarea id="override-justification" value={overrideJustification} onChange={(event) => setOverrideJustification(event.target.value)} placeholder="Clinical or operational reason for this override" />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Manual override may require approval based on current rule settings.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualOverrideOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  manualOverrideMutation.mutate({
                    target_type: overrideTargetType,
                    target_id: Number(overrideTargetId),
                    new_resource_id: Number(overrideResourceId),
                    override_reason: overrideReason,
                    justification: overrideJustification,
                    requires_approval: true,
                  })
                }
                disabled={
                  manualOverrideMutation.isPending ||
                  !overrideTargetId ||
                  !overrideResourceId ||
                  !overrideJustification.trim()
                }
              >
                {manualOverrideMutation.isPending ? 'Submitting...' : 'Submit override'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
