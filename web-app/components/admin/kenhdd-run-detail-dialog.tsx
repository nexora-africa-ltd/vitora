'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { kenhddApi } from '@/lib/api/kenhdd';
import { toast } from 'sonner';
import type { z } from 'zod';
import type {
  KENHDDFailedRecordSchema,
  KENHDDViolationDetailSchema,
} from '@/lib/schemas/kenhdd.schema';

type FailedRecord = z.infer<typeof KENHDDFailedRecordSchema>;
type ViolationDetail = z.infer<typeof KENHDDViolationDetailSchema>;

type ViewMode = 'by-record' | 'by-element';

interface KENHDDRunDetailDialogProps {
  runId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Maps KENHDD resource types to their frontend detail page paths. */
function getRecordHref(resourceType: string, recordId: string): string | null {
  switch (resourceType) {
    case 'PATIENT':
      return `/patients/${recordId}`;
    case 'ENCOUNTER':
      return `/encounters/${recordId}`;
    case 'LAB_RESULT':
      return `/laboratory/results/${recordId}`;
    case 'PRESCRIPTION':
      return `/pharmacy/prescriptions/${recordId}`;
    case 'MCH_VISIT':
      return `/mch/${recordId}`;
    case 'FACILITY':
      return `/clinics/${recordId}`;
    default:
      return null;
  }
}

function getResourceLabel(resourceType: string): string {
  switch (resourceType) {
    case 'PATIENT':
      return 'Patient';
    case 'ENCOUNTER':
      return 'Encounter';
    case 'LAB_RESULT':
      return 'Lab Result';
    case 'PRESCRIPTION':
      return 'Prescription';
    case 'MCH_VISIT':
      return 'MCH Visit';
    case 'FACILITY':
      return 'Facility';
    case 'DIAGNOSIS':
      return 'Diagnosis';
    default:
      return 'Record';
  }
}

interface ElementAggregate {
  element_id: string;
  element_name: string;
  field_name: string;
  requirement_level: string;
  fail_count: number;
  warning_count: number;
  total: number;
  sample_messages: string[];
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'FAIL':
      return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case 'WARNING':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    case 'PASS':
      return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    default:
      return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function getLevelBadge(level: string) {
  if (level === 'MANDATORY')
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
        Mandatory
      </Badge>
    );
  if (level === 'CONDITIONAL')
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 py-0">
        Conditional
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
      Optional
    </Badge>
  );
}

function FailedRecordRow({
  record,
  resourceType,
}: {
  record: FailedRecord;
  resourceType: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const href = getRecordHref(resourceType, record.record_id);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium font-mono">
            Record #{record.record_id}
          </span>
          {record.is_compliant ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5 py-0">
              Compliant
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Non-Compliant
            </Badge>
          )}
          {href && (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
            >
              View {getResourceLabel(resourceType)}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          {record.fail_count > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {record.fail_count}
            </span>
          )}
          {record.warning_count > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              {record.warning_count}
            </span>
          )}
          {record.pass_count > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {record.pass_count}
            </span>
          )}
        </div>
      </button>

      {expanded && record.violation_details.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
          {record.violation_details.map((v: ViolationDetail, idx: number) => (
            <div
              key={`${v.element_id}-${idx}`}
              className="flex items-start gap-2 text-xs p-1.5 rounded bg-background"
            >
              {getStatusIcon(v.status)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{v.element_name}</span>
                  {getLevelBadge(v.requirement_level)}
                </div>
                <div className="text-muted-foreground mt-0.5">{v.message}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="font-mono">{v.element_id}</span>
                  <span>·</span>
                  <span className="font-mono">{v.field_name}</span>
                  {v.value && (
                    <>
                      <span>·</span>
                      <span>
                        Value: <span className="font-mono">{v.value}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && record.violation_details.length === 0 && (
        <div className="border-t px-3 py-3 text-xs text-muted-foreground text-center">
          No violation details recorded for this record.
        </div>
      )}
    </div>
  );
}

export function KENHDDRunDetailDialog({
  runId,
  open,
  onOpenChange,
}: KENHDDRunDetailDialogProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('by-record');

  const {
    data: runDetail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['kenhdd-run-detail', runId],
    queryFn: () => kenhddApi.getRunDetail(runId!),
    enabled: open && runId !== null,
  });

  const revalidateMutation = useMutation({
    mutationFn: () => kenhddApi.revalidateFailures(runId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kenhdd-runs'] });
      queryClient.invalidateQueries({ queryKey: ['kenhdd-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kenhdd-run-detail', runId] });
      toast.success('Failed records revalidated. Check latest run for results.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('Revalidation failed.');
    },
  });

  // Aggregate violations by element, sorted by frequency
  const elementAggregates = useMemo<ElementAggregate[]>(() => {
    if (!runDetail) return [];
    const map = new Map<string, ElementAggregate>();
    for (const record of runDetail.failed_records) {
      for (const v of record.violation_details) {
        const existing = map.get(v.element_id);
        if (existing) {
          if (v.status === 'FAIL') existing.fail_count++;
          if (v.status === 'WARNING') existing.warning_count++;
          existing.total++;
          if (existing.sample_messages.length < 3 && !existing.sample_messages.includes(v.message)) {
            existing.sample_messages.push(v.message);
          }
        } else {
          map.set(v.element_id, {
            element_id: v.element_id,
            element_name: v.element_name,
            field_name: v.field_name,
            requirement_level: v.requirement_level,
            fail_count: v.status === 'FAIL' ? 1 : 0,
            warning_count: v.status === 'WARNING' ? 1 : 0,
            total: 1,
            sample_messages: [v.message],
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [runDetail]);

  const score = runDetail
    ? parseFloat(runDetail.compliance_score)
    : null;

  const mandatoryRate = runDetail
    ? parseFloat(runDetail.mandatory_pass_rate)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            Run Detail
            {runDetail && (
              <Badge variant="outline" className="ml-1 text-xs font-normal">
                #{runDetail.id}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Failed records and their violations for this validation run.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            Failed to load run details.
          </div>
        )}

        {runDetail && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Run summary bar */}
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {runDetail.resource_type}
                  </span>
                  <span className={`text-lg font-bold ${
                    score !== null && score >= 90
                      ? 'text-green-600'
                      : score !== null && score >= 70
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}>
                    {score !== null ? `${score.toFixed(0)}%` : '—'}
                  </span>
                  {score !== null && score >= 90 ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Compliant
                    </Badge>
                  ) : score !== null && score >= 70 ? (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      Partial
                    </Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      Non-Compliant
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {runDetail.records_compliant}/{runDetail.records_checked} compliant
                  {' · '}Mandatory: {mandatoryRate !== null ? `${mandatoryRate.toFixed(0)}%` : '—'}
                  {' · '}{new Date(runDetail.run_at).toLocaleString()}
                  {runDetail.run_by_name && ` · ${runDetail.run_by_name}`}
                </div>
              </div>

              {/* Revalidate action */}
              {runDetail.total_failed > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revalidateMutation.isPending}
                  onClick={() => revalidateMutation.mutate()}
                >
                  {revalidateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Revalidate Failed</span>
                  <span className="sm:hidden">Revalidate</span>
                </Button>
              )}
            </div>

            {/* View mode toggle + content */}
            {runDetail.failed_records.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-lg border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        viewMode === 'by-record'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('by-record')}
                    >
                      By Record
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({runDetail.total_failed})
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        viewMode === 'by-element'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('by-element')}
                    >
                      By Element
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({elementAggregates.length})
                      </span>
                    </button>
                  </div>
                </div>

                {viewMode === 'by-record' ? (
                  <div className="space-y-2">
                    {runDetail.failed_records.map((record) => (
                      <FailedRecordRow
                        key={record.id}
                        record={record}
                        resourceType={runDetail.resource_type}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {elementAggregates.map((el) => (
                      <div
                        key={el.element_id}
                        className="border rounded-lg p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-medium">
                              {el.element_name}
                            </span>
                            {getLevelBadge(el.requirement_level)}
                          </div>
                          <div className="flex items-center gap-2 text-xs shrink-0">
                            {el.fail_count > 0 && (
                              <span className="flex items-center gap-1 text-red-600 font-medium">
                                <XCircle className="h-3 w-3" />
                                {el.fail_count}
                              </span>
                            )}
                            {el.warning_count > 0 && (
                              <span className="flex items-center gap-1 text-amber-600 font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                {el.warning_count}
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              {el.total} total
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{el.element_id}</span>
                          <span>·</span>
                          <span className="font-mono">{el.field_name}</span>
                        </div>
                        {el.sample_messages.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5 border-t">
                            {el.sample_messages.map((msg, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-muted-foreground/60 shrink-0">
                                  ·
                                </span>
                                <span>{msg}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                <p>All records passed validation.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
