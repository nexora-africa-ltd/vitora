'use client';

/**
 * Patient vitals flag review panel.
 *
 * Purpose:
 * - Lightweight clinician workflow for reviewing vitals-derived suggestions:
 *   acknowledge, map codes, accept, and reject.
 *
 * Usage:
 * - Render inside patient detail clinical sections.
 *
 * Inputs:
 * - patientId: numeric patient ID.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, ThumbsDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useAcceptVitalFlagSuggestion,
  useAcknowledgeVitalFlagSuggestion,
  useMapVitalFlagSuggestionCodes,
  usePatientVitalFlagSuggestions,
  useRejectVitalFlagSuggestion,
} from '@/lib/hooks/use-vital-flag-suggestions';
import type {
  VitalFlagResolutionAction,
  VitalFlagSuggestion,
} from '@/lib/types/vital-flag-suggestion';

const severityClasses: Record<string, string> = {
  CRITICAL: 'bg-destructive/10 text-destructive',
  WARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  INFO: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
};

const statusClasses: Record<string, string> = {
  NEW: 'bg-muted text-foreground',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  MAPPED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
  SUPERSEDED: 'bg-muted text-muted-foreground',
};

function prettyFlagKey(flagKey: string): string {
  return flagKey
    .split('_')
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(' ');
}

function defaultResolutionAction(item: VitalFlagSuggestion): VitalFlagResolutionAction {
  if (
    item.flag_key.includes('HYPERTENSION') ||
    item.flag_key.includes('BMI_') ||
    item.flag_key.includes('MALNUTRITION')
  ) {
    return 'ADD_CHRONIC_CONDITION';
  }
  return 'CREATE_DIAGNOSIS_PROVISIONAL';
}

function defaultConditionName(item: VitalFlagSuggestion): string {
  if (item.selected_icd11_title) return item.selected_icd11_title;
  if (item.suggested_icd11_title) return item.suggested_icd11_title;
  return prettyFlagKey(item.flag_key);
}

export function PatientVitalFlagSuggestionsTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = usePatientVitalFlagSuggestions(patientId);
  const acknowledgeMutation = useAcknowledgeVitalFlagSuggestion(patientId);
  const mapCodesMutation = useMapVitalFlagSuggestionCodes(patientId);
  const acceptMutation = useAcceptVitalFlagSuggestion(patientId);
  const rejectMutation = useRejectVitalFlagSuggestion(patientId);

  const [reviewing, setReviewing] = useState<VitalFlagSuggestion | null>(null);
  const [resolutionAction, setResolutionAction] = useState<VitalFlagResolutionAction>('CREATE_DIAGNOSIS_PROVISIONAL');
  const [reviewNote, setReviewNote] = useState('');
  const [conditionName, setConditionName] = useState('');

  const [rejecting, setRejecting] = useState<VitalFlagSuggestion | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const items = useMemo(() => data ?? [], [data]);
  const openItems = useMemo(
    () => items.filter((item) => item.status === 'NEW' || item.status === 'ACKNOWLEDGED' || item.status === 'MAPPED'),
    [items]
  );

  const isBusy =
    acknowledgeMutation.isPending ||
    mapCodesMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending;

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded bg-muted/40" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {openItems.length} open flag{openItems.length === 1 ? '' : 's'} • {items.length} total
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm italic text-muted-foreground">
          No vitals-derived review flags for this patient.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const hasSuggestedMapping = !!(item.suggested_icd10 || item.suggested_icd11_code);
            const isOpen = item.status === 'NEW' || item.status === 'ACKNOWLEDGED' || item.status === 'MAPPED';
            const evidence = Object.entries(item.evidence_json || {}).slice(0, 3);

            return (
              <Card key={item.id} className="border-border/70">
                <CardContent className="space-y-3 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{prettyFlagKey(item.flag_key)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.clinical_domain || 'Clinical'} • Detected {new Date(item.detected_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={severityClasses[item.severity] || 'bg-muted'}>{item.severity_display}</Badge>
                      <Badge className={statusClasses[item.status] || 'bg-muted'}>{item.status_display}</Badge>
                    </div>
                  </div>

                  {evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {evidence.map(([key, value]) => (
                        <span key={key} className="rounded bg-muted px-2 py-0.5">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}

                  {(item.suggested_icd10_code || item.suggested_icd11_code) && (
                    <p className="text-xs text-muted-foreground">
                      Suggested mapping:{' '}
                      {item.suggested_icd10_code ? `ICD-10 ${item.suggested_icd10_code}` : ''}
                      {item.suggested_icd10_code && item.suggested_icd11_code ? ' • ' : ''}
                      {item.suggested_icd11_code ? `ICD-11 ${item.suggested_icd11_code}` : ''}
                    </p>
                  )}

                  {isOpen && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {item.status === 'NEW' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => acknowledgeMutation.mutate({ suggestionId: item.id, data: { note: 'Reviewed in panel' } })}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Acknowledge
                        </Button>
                      )}

                      {item.mapping_status !== 'CONFIRMED' && hasSuggestedMapping && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() =>
                            mapCodesMutation.mutate({
                              suggestionId: item.id,
                              data: {
                                selected_icd10: item.suggested_icd10,
                                selected_icd11_code: item.suggested_icd11_code,
                                selected_icd11_title: item.suggested_icd11_title,
                              },
                            })
                          }
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Confirm Mapping
                        </Button>
                      )}

                      <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          setReviewing(item);
                          setResolutionAction(defaultResolutionAction(item));
                          setConditionName(defaultConditionName(item));
                          setReviewNote('');
                        }}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Accept
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={isBusy}
                        onClick={() => {
                          setRejecting(item);
                          setRejectReason('');
                        }}
                      >
                        <ThumbsDown className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Vital Flag Suggestion</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Resolution action</Label>
              <Select
                value={resolutionAction}
                onValueChange={(value) => setResolutionAction(value as VitalFlagResolutionAction)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREATE_DIAGNOSIS_PROVISIONAL">Create provisional diagnosis</SelectItem>
                  <SelectItem value="CREATE_DIAGNOSIS_CONFIRMED">Create confirmed diagnosis</SelectItem>
                  <SelectItem value="ADD_CHRONIC_CONDITION">Add chronic condition</SelectItem>
                  <SelectItem value="NOTE_ONLY">Note only</SelectItem>
                  <SelectItem value="NO_ACTION">No action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {resolutionAction === 'ADD_CHRONIC_CONDITION' && (
              <div className="space-y-2">
                <Label>Condition name</Label>
                <Input
                  value={conditionName}
                  onChange={(event) => setConditionName(event.target.value)}
                  placeholder="e.g. Hypertension"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Clinical note</Label>
              <Textarea
                rows={3}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Optional note for audit trail"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setReviewing(null)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                disabled={
                  isBusy ||
                  !reviewing ||
                  (resolutionAction === 'ADD_CHRONIC_CONDITION' && !conditionName.trim())
                }
                onClick={() => {
                  if (!reviewing) return;
                  acceptMutation.mutate(
                    {
                      suggestionId: reviewing.id,
                      data: {
                        resolution_action: resolutionAction,
                        note: reviewNote,
                        selected_icd10: reviewing.selected_icd10 ?? reviewing.suggested_icd10,
                        selected_icd11_code:
                          reviewing.selected_icd11_code || reviewing.suggested_icd11_code,
                        selected_icd11_title:
                          reviewing.selected_icd11_title || reviewing.suggested_icd11_title,
                        diagnosis_type: 'WORKING',
                        certainty:
                          resolutionAction === 'CREATE_DIAGNOSIS_CONFIRMED'
                            ? 'confirmed'
                            : 'provisional',
                        condition_name:
                          resolutionAction === 'ADD_CHRONIC_CONDITION' ? conditionName.trim() : undefined,
                        chronic_status: resolutionAction === 'ADD_CHRONIC_CONDITION' ? 'ACTIVE' : undefined,
                      },
                    },
                    {
                      onSuccess: () => {
                        setReviewing(null);
                      },
                    }
                  );
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Vital Flag Suggestion</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Document why this suggestion is not clinically applicable"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setRejecting(null)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isBusy || !rejecting || !rejectReason.trim()}
                onClick={() => {
                  if (!rejecting) return;
                  rejectMutation.mutate(
                    {
                      suggestionId: rejecting.id,
                      data: { reason: rejectReason.trim() },
                    },
                    {
                      onSuccess: () => {
                        setRejecting(null);
                        setRejectReason('');
                      },
                    }
                  );
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
