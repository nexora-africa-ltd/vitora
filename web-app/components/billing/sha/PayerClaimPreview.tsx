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

import React, { useState } from 'react';
import {
  AlertCircle,
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
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';

interface PayerClaimPreviewProps {
  claimId: number;
  /** Only show for submitted/processing/approved/rejected claims */
  claimStatus: string;
}

/** Map payer workflow states to display info */
const PAYER_STATE_CONFIG: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; icon: React.ElementType }> = {
  IN_REVIEW: { label: 'In Review', variant: 'secondary', icon: Clock },
  CLINICAL_REVIEW: { label: 'Clinical Review', variant: 'secondary', icon: Clock },
  MEDICAL_REVIEW: { label: 'Medical Review', variant: 'secondary', icon: Clock },
  UNDER_COMMITTEE_REVIEW: { label: 'Committee Review', variant: 'secondary', icon: Clock },
  SENT_TO_SURVEILLANCE: { label: 'Fraud Surveillance', variant: 'destructive', icon: AlertCircle },
  MANUAL_REVIEW: { label: 'Manual Review (Passed)', variant: 'outline', icon: CheckCircle2 },
  CLARIFICATION_AFTER_AUTOMATIC_CHECKS: { label: 'Clarification Needed', variant: 'destructive', icon: AlertCircle },
  SENT_BACK: { label: 'Sent Back', variant: 'destructive', icon: XCircle },
  MISSING_DOCUMENTS: { label: 'Missing Documents', variant: 'destructive', icon: AlertCircle },
  SENT_FOR_PAYMENT_PROCESSING: { label: 'Queued for Payment', variant: 'default', icon: CheckCircle2 },
  APPROVED: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  PAID: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  APPEALED: { label: 'Under Appeal', variant: 'secondary', icon: Clock },
};

export function PayerClaimPreview({ claimId, claimStatus }: PayerClaimPreviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [payerData, setPayerData] = useState<IlmCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only show for claims that have been submitted
  const showableStatuses = ['submitted', 'processing', 'approved', 'rejected', 'paid', 'query'];
  if (!showableStatuses.includes(claimStatus)) {
    return null;
  }

  async function fetchPayerView() {
    setLoading(true);
    setError(null);
    try {
      const result = await shaApi.ilmPreviewPayerClaim(claimId);
      setPayerData(result);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Failed to fetch payer claim view.';
      setError(msg);
      toast({
        title: 'Payer preview failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const payload = payerData?.payload as Record<string, unknown> | null | undefined;
  const payerState = (payload?.workflowState ?? payload?.payer_claim_status ?? null) as string | null;
  const processingNotes = (payload?.processing_notes ?? payload?.claim_notes ?? null) as string | null;
  const invoiceFlags = (payload?.invoice_flags ?? null) as string[] | null;
  const stateConfig = payerState ? PAYER_STATE_CONFIG[payerState] : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Payer Adjudication View
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPayerView}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : payerData ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Eye className="h-3.5 w-3.5 mr-1.5" />
            )}
            {payerData ? 'Refresh' : 'Fetch Payer View'}
          </Button>
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
            {/* Payer Workflow State */}
            {payerState && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payer Status</span>
                {stateConfig ? (
                  <Badge variant={stateConfig.variant} className="gap-1.5">
                    <stateConfig.icon className="h-3 w-3" />
                    {stateConfig.label}
                  </Badge>
                ) : (
                  <Badge variant="outline">{payerState}</Badge>
                )}
              </div>
            )}

            {/* Processing Notes */}
            {processingNotes && (
              <div className="space-y-1">
                <span className="text-sm font-medium">Processing Notes</span>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                  {processingNotes}
                </p>
              </div>
            )}

            {/* Invoice Flags */}
            {invoiceFlags && invoiceFlags.length > 0 && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Invoice Flags
                </span>
                <div className="flex flex-wrap gap-1">
                  {invoiceFlags.map((flag, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                      {flag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* HTTP status from the ILM call */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
              <span>DHA Response: HTTP {payerData.status_code}</span>
              {payerData.status_code && payerData.status_code >= 200 && payerData.status_code < 300 && (
                <span className="text-green-600">✓ Success</span>
              )}
            </div>

            {/* Raw payload (collapsed) */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Raw response payload
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
