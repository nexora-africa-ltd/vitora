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
          <div>
            <span className="text-xs text-muted-foreground">Condition (JSON)</span>
            <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(rule.condition, null, 2)}
            </pre>
          </div>
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
