/**
 * PayerClaimPreview — Shows the payer (SHA) adjudication view of a claim.
 *
 * Fetches the payer's perspective from DHA via POST /ilm/preview-payer/
 * to display:
 * - Current payer workflow state (adjudication stage)
 * - Processing notes from the payer
 * - Invoice flags / issues
 * - Payment details (if approved/paid)
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';
import {
  isPayerPreviewEligibleStatus,
  payerPreviewQueryKey,
  payerPreviewStorageKey,
  payerStateNeedsAttention,
  type PayerPreviewSnapshot,
} from '@/lib/sha/payer-preview';

interface PayerClaimPreviewProps {
  claimId: number;
  claimStatus: string;
  isActive?: boolean;
  onNavigateToTab?: (tab: 'overview' | 'workflow' | 'interventions' | 'adjudication') => void;
  onAttentionChange?: (attention: boolean) => void;
}

interface PaymentDetails {
  approvedAmount: string | null;
  paidAmount: string | null;
  paymentReference: string | null;
  paymentDate: string | null;
  currency: string | null;
}

interface NormalizedPayerPayload {
  rawPayload: Record<string, unknown> | null;
  payerState: string | null;
  processingNotes: string | null;
  invoiceFlags: string[];
  payment: PaymentDetails;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) return stringValue;
  }
  return null;
}

function normalizePayerPayload(payload: unknown): NormalizedPayerPayload {
  const rawPayload = asRecord(payload);
  const paymentRecord = asRecord(
    rawPayload?.payment_details ?? rawPayload?.payment ?? rawPayload?.paymentInfo
  );

  return {
    rawPayload,
    payerState: firstString(
      rawPayload?.workflowState,
      rawPayload?.workflow_state,
      rawPayload?.payer_claim_status,
      rawPayload?.claim_status
    ),
    processingNotes: firstString(
      rawPayload?.processing_notes,
      rawPayload?.claim_notes,
      rawPayload?.adjudication_notes,
      rawPayload?.notes
    ),
    invoiceFlags: asStringArray(
      rawPayload?.invoice_flags ?? rawPayload?.flags ?? rawPayload?.issues
    ),
    payment: {
      approvedAmount: firstString(
        rawPayload?.approved_amount,
        rawPayload?.approvedAmount,
        paymentRecord?.approved_amount,
        paymentRecord?.approvedAmount
      ),
      paidAmount: firstString(
        rawPayload?.paid_amount,
        rawPayload?.paidAmount,
        paymentRecord?.paid_amount,
        paymentRecord?.paidAmount
      ),
      paymentReference: firstString(
        rawPayload?.payment_reference,
        rawPayload?.paymentReference,
        paymentRecord?.payment_reference,
        paymentRecord?.paymentReference
      ),
      paymentDate: firstString(
        rawPayload?.payment_date,
        rawPayload?.paymentDate,
        paymentRecord?.payment_date,
        paymentRecord?.paymentDate
      ),
      currency: firstString(rawPayload?.currency, paymentRecord?.currency),
    },
  };
}

function getPayerAction(payerState: string | null): {
  label: string;
  tab: 'overview' | 'workflow';
} | null {
  switch (payerState) {
    case 'MISSING_DOCUMENTS':
    case 'CLARIFICATION_AFTER_AUTOMATIC_CHECKS':
    case 'SENT_BACK':
      return { label: 'Open workflow', tab: 'workflow' };
    case 'REJECTED':
    case 'QUERY':
      return { label: 'Review in overview', tab: 'overview' };
    case 'APPROVED':
    case 'PAID':
    case 'SENT_FOR_PAYMENT_PROCESSING':
      return { label: 'Open overview', tab: 'overview' };
    default:
      return null;
  }
}

/** Map payer workflow states to display info */
const PAYER_STATE_CONFIG: Record<
  string,
  {
    label: string;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
    icon: React.ElementType;
  }
> = {
  IN_REVIEW: { label: 'In Review', variant: 'secondary', icon: Clock },
  CLINICAL_REVIEW: { label: 'Clinical Review', variant: 'secondary', icon: Clock },
  MEDICAL_REVIEW: { label: 'Medical Review', variant: 'secondary', icon: Clock },
  UNDER_COMMITTEE_REVIEW: { label: 'Committee Review', variant: 'secondary', icon: Clock },
  SENT_TO_SURVEILLANCE: { label: 'Fraud Surveillance', variant: 'destructive', icon: AlertCircle },
  MANUAL_REVIEW: { label: 'Manual Review (Passed)', variant: 'outline', icon: CheckCircle2 },
  CLARIFICATION_AFTER_AUTOMATIC_CHECKS: {
    label: 'Clarification Needed',
    variant: 'destructive',
    icon: AlertCircle,
  },
  SENT_BACK: { label: 'Sent Back', variant: 'destructive', icon: XCircle },
  MISSING_DOCUMENTS: { label: 'Missing Documents', variant: 'destructive', icon: AlertCircle },
  SENT_FOR_PAYMENT_PROCESSING: {
    label: 'Queued for Payment',
    variant: 'default',
    icon: CheckCircle2,
  },
  APPROVED: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  PAID: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  APPEALED: { label: 'Under Appeal', variant: 'secondary', icon: Clock },
};

export function PayerClaimPreview({
  claimId,
  claimStatus,
  isActive = false,
  onNavigateToTab,
  onAttentionChange,
}: PayerClaimPreviewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [payerData, setPayerData] = useState<IlmCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [changeSummary, setChangeSummary] = useState<string[]>([]);
  const previousFingerprintRef = useRef<string | null>(null);
  const hasAutoFetchedRef = useRef(false);

  const isEligibleStatus = isPayerPreviewEligibleStatus(claimStatus);
  const normalizedPayload = useMemo(
    () => normalizePayerPayload(payerData?.payload),
    [payerData?.payload]
  );
  const stateConfig = normalizedPayload.payerState
    ? PAYER_STATE_CONFIG[normalizedPayload.payerState]
    : null;
  const nextAction = useMemo(
    () => getPayerAction(normalizedPayload.payerState),
    [normalizedPayload.payerState]
  );
  const shouldPoll =
    isActive &&
    ['submitted', 'acknowledged', 'under_review', 'processing', 'query'].includes(claimStatus);
  const isStale = lastFetchedAt ? Date.now() - lastFetchedAt.getTime() > 5 * 60 * 1000 : false;
  const lastFetchedLabel = lastFetchedAt ? lastFetchedAt.toLocaleTimeString() : null;

  const applySnapshot = useCallback(
    (snapshot: PayerPreviewSnapshot) => {
      setPayerData(snapshot.result);
      const normalized = normalizePayerPayload(snapshot.result.payload);
      previousFingerprintRef.current = JSON.stringify({
        statusCode: snapshot.result.status_code,
        payerState: normalized.payerState,
        processingNotes: normalized.processingNotes,
        invoiceFlags: normalized.invoiceFlags,
        payment: normalized.payment,
      });
      setChangeSummary([]);
      const fetchedDate = new Date(snapshot.fetchedAtIso);
      setLastFetchedAt(Number.isNaN(fetchedDate.getTime()) ? null : fetchedDate);
      onAttentionChange?.(payerStateNeedsAttention(normalized.payerState));
    },
    [onAttentionChange]
  );

  useEffect(() => {
    setPayerData(null);
    setError(null);
    setLastFetchedAt(null);
    setChangeSummary([]);
    previousFingerprintRef.current = null;
    hasAutoFetchedRef.current = false;
    onAttentionChange?.(false);
  }, [claimId, onAttentionChange]);

  useEffect(() => {
    if (!isEligibleStatus) return;
    const cached = queryClient.getQueryData<PayerPreviewSnapshot>(payerPreviewQueryKey(claimId));
    if (cached) {
      applySnapshot(cached);
      return;
    }
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(payerPreviewStorageKey(claimId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PayerPreviewSnapshot;
      if (parsed && parsed.claimId === claimId && parsed.result && parsed.fetchedAtIso) {
        applySnapshot(parsed);
        queryClient.setQueryData(payerPreviewQueryKey(claimId), parsed);
      }
    } catch {
      window.localStorage.removeItem(payerPreviewStorageKey(claimId));
    }
  }, [applySnapshot, claimId, isEligibleStatus, queryClient]);

  const fetchPayerView = useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await shaApi.ilmPreviewPayerClaim(claimId);
        const normalized = normalizePayerPayload(result.payload);
        const fingerprint = JSON.stringify({
          statusCode: result.status_code,
          payerState: normalized.payerState,
          processingNotes: normalized.processingNotes,
          invoiceFlags: normalized.invoiceFlags,
          payment: normalized.payment,
        });

        if (previousFingerprintRef.current && previousFingerprintRef.current !== fingerprint) {
          const previous = JSON.parse(previousFingerprintRef.current) as {
            payerState: string | null;
            processingNotes: string | null;
            invoiceFlags: string[];
            payment: PaymentDetails;
          };
          const changes: string[] = [];
          if (previous.payerState !== normalized.payerState && normalized.payerState) {
            changes.push(`Status changed to ${normalized.payerState}.`);
          }
          if (
            previous.processingNotes !== normalized.processingNotes &&
            normalized.processingNotes
          ) {
            changes.push('Processing notes updated.');
          }
          const previousFlags = previous.invoiceFlags.join('|');
          const nextFlags = normalized.invoiceFlags.join('|');
          if (previousFlags !== nextFlags) {
            changes.push('Invoice flags changed.');
          }
          const previousPayment = JSON.stringify(previous.payment);
          const nextPayment = JSON.stringify(normalized.payment);
          if (previousPayment !== nextPayment) {
            changes.push('Payment details updated.');
          }
          setChangeSummary(changes);
        } else {
          setChangeSummary([]);
        }

        previousFingerprintRef.current = fingerprint;
        setPayerData(result);
        const fetchedAt = new Date();
        setLastFetchedAt(fetchedAt);
        onAttentionChange?.(payerStateNeedsAttention(normalized.payerState));

        const snapshot: PayerPreviewSnapshot = {
          claimId,
          result,
          fetchedAtIso: fetchedAt.toISOString(),
        };
        queryClient.setQueryData(payerPreviewQueryKey(claimId), snapshot);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(payerPreviewStorageKey(claimId), JSON.stringify(snapshot));
        }
      } catch (e: unknown) {
        const axiosError = e as { response?: { data?: { error?: string } }; message?: string };
        const msg =
          axiosError.response?.data?.error ??
          axiosError.message ??
          'Failed to fetch payer claim view.';
        setError(msg);
        if (!opts?.silent) {
          toast({
            title: 'Payer preview failed',
            description: msg,
            variant: 'destructive',
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [claimId, onAttentionChange, queryClient, toast]
  );

  useEffect(() => {
    if (!isEligibleStatus || !isActive || hasAutoFetchedRef.current) return;
    hasAutoFetchedRef.current = true;
    void fetchPayerView({ silent: true });
  }, [fetchPayerView, isActive, isEligibleStatus]);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchPayerView({ silent: true });
    }, 45000);
    return () => window.clearInterval(timer);
  }, [fetchPayerView, shouldPoll]);

  if (!isEligibleStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Payer Adjudication View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Payer preview becomes available after submission and during adjudication states.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Payer Adjudication View
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastFetchedLabel && (
              <Badge variant={isStale ? 'destructive' : 'outline'} className="text-xs">
                {isStale ? 'Stale' : 'Fresh'} • {lastFetchedLabel}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPayerView()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : payerData ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              )}
              {payerData ? 'Refresh' : 'Fetch Payer View'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!payerData && !error && !loading && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Fetch Payer View&quot; to see how SHA is processing this claim.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {payerData && (
          <div className="space-y-4">
            {changeSummary.length > 0 && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="mb-1 text-sm font-medium">Updates since last check</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {changeSummary.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </div>
            )}

            {normalizedPayload.payerState && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payer Status</span>
                {stateConfig ? (
                  <Badge variant={stateConfig.variant} className="gap-1.5">
                    <stateConfig.icon className="h-3 w-3" />
                    {stateConfig.label}
                  </Badge>
                ) : (
                  <Badge variant="outline">{normalizedPayload.payerState}</Badge>
                )}
              </div>
            )}

            {nextAction && onNavigateToTab && (
              <div className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm text-muted-foreground">Recommended next action</span>
                <Button size="sm" variant="outline" onClick={() => onNavigateToTab(nextAction.tab)}>
                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                  {nextAction.label}
                </Button>
              </div>
            )}

            {normalizedPayload.processingNotes && (
              <div className="space-y-1">
                <span className="text-sm font-medium">Processing Notes</span>
                <p className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                  {normalizedPayload.processingNotes}
                </p>
              </div>
            )}

            {normalizedPayload.invoiceFlags.length > 0 && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Invoice Flags
                </span>
                <div className="flex flex-wrap gap-1">
                  {normalizedPayload.invoiceFlags.map((flag, index) => (
                    <Badge
                      key={`${flag}-${index}`}
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-xs dark:border-amber-800 dark:bg-amber-900/20"
                    >
                      {flag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(normalizedPayload.payment.approvedAmount ||
              normalizedPayload.payment.paidAmount ||
              normalizedPayload.payment.paymentDate ||
              normalizedPayload.payment.paymentReference) && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Payment Details</span>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {normalizedPayload.payment.approvedAmount && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Approved Amount</p>
                      <p className="font-medium">
                        {normalizedPayload.payment.currency
                          ? `${normalizedPayload.payment.currency} `
                          : ''}
                        {normalizedPayload.payment.approvedAmount}
                      </p>
                    </div>
                  )}
                  {normalizedPayload.payment.paidAmount && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Paid Amount</p>
                      <p className="font-medium">
                        {normalizedPayload.payment.currency
                          ? `${normalizedPayload.payment.currency} `
                          : ''}
                        {normalizedPayload.payment.paidAmount}
                      </p>
                    </div>
                  )}
                  {normalizedPayload.payment.paymentDate && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Payment Date</p>
                      <p className="font-medium">{normalizedPayload.payment.paymentDate}</p>
                    </div>
                  )}
                  {normalizedPayload.payment.paymentReference && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Payment Reference</p>
                      <p className="break-all font-medium">
                        {normalizedPayload.payment.paymentReference}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>DHA Response: HTTP {payerData.status_code}</span>
              {payerData.status_code &&
                payerData.status_code >= 200 &&
                payerData.status_code < 300 && <span className="text-green-600">✓ Success</span>}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Raw response payload
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(normalizedPayload.rawPayload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
