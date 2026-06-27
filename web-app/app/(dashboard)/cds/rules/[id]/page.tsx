'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Archive,
  Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cdsApi } from '@/lib/api/cds';
import { formatDateTime } from '@/lib/utils/format';
import { toast } from 'sonner';

const STATUS_BADGE_VARIANTS: Record<string, 'secondary' | 'success' | 'warning' | 'outline'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  RETIRED: 'outline',
};

const PRIORITY_BADGE_VARIANTS: Record<string, 'destructive' | 'warning' | 'info' | 'secondary' | 'outline'> = {
  CRITICAL: 'destructive',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'secondary',
  INFO: 'outline',
};

const CATEGORY_LABELS: Record<string, string> = {
  DRUG_ALLERGY: 'Drug-Allergy Interaction',
  DRUG_DRUG: 'Drug-Drug Interaction',
  CRITICAL_LAB: 'Critical Lab Value',
  VITAL_SIGN: 'Vital Sign Alert',
  GUIDELINE: 'Clinical Guideline',
  PREVENTIVE: 'Preventive Care',
  DOSAGE: 'Dosage Check',
};

const EVIDENCE_LABELS: Record<string, string> = {
  A: 'Level A — Strong evidence',
  B: 'Level B — Moderate evidence',
  C: 'Level C — Limited evidence',
  D: 'Level D — Expert consensus',
};

// ────────────────────────────────────────────────────────────────────────────
// Human-readable condition display
// ────────────────────────────────────────────────────────────────────────────

function ConditionDisplay({ condition }: { condition: Record<string, unknown> | null }) {
  if (!condition || typeof condition !== 'object') {
    return <p className="text-sm text-muted-foreground italic">No trigger conditions defined.</p>;
  }

  const type = condition.type as string;

  switch (type) {
    case 'vital_range': {
      const vital = (condition.vital as string) || 'unknown';
      const min = condition.min as number | undefined;
      const max = condition.max as number | undefined;
      const minLabel = condition.min_label as string | undefined;
      const maxLabel = condition.max_label as string | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">Vital Sign Range</Badge>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border p-2">
              <span className="text-xs text-muted-foreground">Vital Sign</span>
              <p className="text-sm font-medium capitalize">{vital.replace(/_/g, ' ')}</p>
            </div>
            {min != null && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Minimum Threshold</span>
                <p className="text-sm font-medium">
                  &lt; {min} {minLabel && <span className="text-muted-foreground">({minLabel})</span>}
                </p>
              </div>
            )}
            {max != null && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Maximum Threshold</span>
                <p className="text-sm font-medium">
                  &gt; {max} {maxLabel && <span className="text-muted-foreground">({maxLabel})</span>}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Triggers when {vital.replace(/_/g, ' ')} is
            {min != null && max != null ? ` below ${min} or above ${max}` : min != null ? ` below ${min}` : ` above ${max}`}.
          </p>
        </div>
      );
    }

    case 'drug_allergy': {
      const checkMode = condition.check_mode as string | undefined;
      const substance = condition.substance as string | undefined;
      const crossReactive = condition.cross_reactive as string[] | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">Drug-Allergy Interaction</Badge>
          {checkMode === 'prescribing' ? (
            <p className="text-sm">
              Triggers when prescribing a drug that matches any of the patient&apos;s recorded allergies.
            </p>
          ) : substance ? (
            <div className="space-y-2">
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Substance</span>
                <p className="text-sm font-medium capitalize">{substance}</p>
              </div>
              {crossReactive && crossReactive.length > 0 && (
                <div className="rounded border p-2">
                  <span className="text-xs text-muted-foreground">Cross-reactive drugs</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {crossReactive.map((drug) => (
                      <Badge key={drug} variant="outline" className="text-xs capitalize">{drug}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Triggers when patient has allergy to {substance} and is prescribed {substance} or cross-reactive drugs.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Generic drug-allergy check.</p>
          )}
        </div>
      );
    }

    case 'drug_drug': {
      const drugs = condition.drugs as string[] | undefined;
      const interaction = condition.interaction as string | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">Drug-Drug Interaction</Badge>
          {drugs && drugs.length > 0 && (
            <div className="rounded border p-2">
              <span className="text-xs text-muted-foreground">Interacting Drugs</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {drugs.map((drug) => (
                  <Badge key={drug} variant="outline" className="text-xs capitalize">{drug}</Badge>
                ))}
              </div>
            </div>
          )}
          {interaction && (
            <div className="rounded border p-2">
              <span className="text-xs text-muted-foreground">Interaction Type</span>
              <p className="text-sm font-medium">{interaction}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Triggers when patient is taking or being prescribed interacting drug combinations.
          </p>
        </div>
      );
    }

    case 'lab_range': {
      const testName = condition.test_name as string | undefined;
      const min = condition.min as number | undefined;
      const max = condition.max as number | undefined;
      const unit = condition.unit as string | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">Lab Value Range</Badge>
          <div className="grid gap-2 sm:grid-cols-2">
            {testName && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Lab Test</span>
                <p className="text-sm font-medium">{testName}</p>
              </div>
            )}
            {min != null && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Low Threshold</span>
                <p className="text-sm font-medium">&lt; {min} {unit || ''}</p>
              </div>
            )}
            {max != null && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">High Threshold</span>
                <p className="text-sm font-medium">&gt; {max} {unit || ''}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Triggers when {testName || 'lab value'} is outside the defined range.
          </p>
        </div>
      );
    }

    case 'custom': {
      const expression = condition.expression as string | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">Custom Rule</Badge>
          {expression && (
            <div className="rounded border p-2">
              <span className="text-xs text-muted-foreground">Expression</span>
              <p className="text-sm font-mono text-xs">{expression}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Custom rule evaluated against encounter context.
          </p>
        </div>
      );
    }

    case 'ml_model': {
      const model = condition.model as string | undefined;
      const threshold = condition.threshold as number | undefined;
      return (
        <div className="space-y-2">
          <Badge variant="secondary">ML Model</Badge>
          <div className="grid gap-2 sm:grid-cols-2">
            {model && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Model</span>
                <p className="text-sm font-medium">{model}</p>
              </div>
            )}
            {threshold != null && (
              <div className="rounded border p-2">
                <span className="text-xs text-muted-foreground">Threshold</span>
                <p className="text-sm font-medium">{threshold}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Triggers when ML model prediction exceeds threshold.
          </p>
        </div>
      );
    }

    default:
      return (
        <div className="space-y-2">
          <Badge variant="outline">Unknown Type: {type || 'none'}</Badge>
          <p className="text-sm text-muted-foreground italic">
            Condition type not recognized. See raw JSON below for details.
          </p>
        </div>
      );
  }
}

// ────────────────────────────────────────────────────────────────────────────

export default function CDSRuleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ruleId = Number(id);

  const { data: rule, isLoading } = useQuery({
    queryKey: ['cds-rule', ruleId],
    queryFn: () => cdsApi.getRule(ruleId),
    enabled: !isNaN(ruleId),
  });

  const activateMutation = useMutation({
    mutationFn: () => cdsApi.activateRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rule', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      toast.success('Rule activated');
    },
    onError: () => toast.error('Failed to activate rule'),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => cdsApi.deactivateRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rule', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      toast.success('Rule deactivated');
    },
    onError: () => toast.error('Failed to deactivate rule'),
  });

  const retireMutation = useMutation({
    mutationFn: () => cdsApi.retireRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rule', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      toast.success('Rule retired');
    },
    onError: () => toast.error('Failed to retire rule'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="CDS Rule" />
        <Card className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </Card>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="space-y-4">
        <PageHeader title="CDS Rule" />
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Rule not found</p>
        </Card>
      </div>
    );
  }

  const canActivate = rule.status === 'DRAFT' || rule.status === 'INACTIVE';
  const canDeactivate = rule.status === 'ACTIVE';
  const canRetire = rule.status !== 'RETIRED';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${rule.code}`}
        helpContent="View and manage CDS rule details. Activate, deactivate, or retire rules to control clinical decision support behavior."
        actions={
          <div className="flex gap-2">
            {canActivate && (
              <Button size="sm" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                <Play className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Activate</span>
              </Button>
            )}
            {canDeactivate && (
              <Button size="sm" variant="outline" onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending}>
                <Pause className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Deactivate</span>
              </Button>
            )}
            {canRetire && (
              <Button size="sm" variant="destructive" onClick={() => retireMutation.mutate()} disabled={retireMutation.isPending}>
                <Archive className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Retire</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {rule.name}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {CATEGORY_LABELS[rule.category] ?? rule.category} • {EVIDENCE_LABELS[rule.evidence_level] ?? rule.evidence_level}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={PRIORITY_BADGE_VARIANTS[rule.priority] ?? 'secondary'}>{rule.priority}</Badge>
          <Badge variant={STATUS_BADGE_VARIANTS[rule.status] ?? 'secondary'}>{rule.status}</Badge>
        </div>
      </div>

      {/* Description */}
      {rule.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{rule.description}</p></CardContent>
        </Card>
      )}

      {/* Rule Logic */}
      <Card>
        <CardHeader><CardTitle className="text-base">Rule Logic</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground">Action Type</span>
            <p className="text-sm font-medium">{rule.action_type}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Message Template</span>
            <p className="text-sm bg-muted/50 p-2 rounded font-mono text-xs">{rule.action_message}</p>
          </div>
          {rule.suggestion && (
            <div>
              <span className="text-xs text-muted-foreground">Suggestion</span>
              <p className="text-sm">{rule.suggestion}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trigger Conditions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Trigger Conditions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ConditionDisplay condition={rule.condition} />
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              View raw condition JSON
            </summary>
            <pre className="mt-2 bg-muted/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(rule.condition, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Triggers</div>
          <div className="text-2xl font-bold">{rule.trigger_count}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Override Rate</div>
          <div className="text-2xl font-bold">
            {rule.override_rate != null ? `${rule.override_rate}%` : 'N/A'}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Created</div>
          <div className="text-sm font-medium">{formatDateTime(rule.created_at)}</div>
          {rule.created_by_name && (
            <div className="text-xs text-muted-foreground">by {rule.created_by_name}</div>
          )}
        </Card>
      </div>

      {/* References */}
      {rule.references.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">References</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {rule.references.map((ref, idx) => (
                <li key={idx} className="text-sm">{ref}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Approval */}
      {rule.approved_by_name && (
        <Card>
          <CardHeader><CardTitle className="text-base">Approval</CardTitle></CardHeader>
          <CardContent className="text-sm">
            Approved by <span className="font-medium">{rule.approved_by_name}</span>
            {rule.approved_at && <> on {formatDateTime(rule.approved_at)}</>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
