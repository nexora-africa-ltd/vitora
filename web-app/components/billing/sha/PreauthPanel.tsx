/**
 * DHA HIE Pre-authorization Panel
 * Handles submission and status tracking of pre-authorization requests
 *
 * Flow:
 * 1. User fills in procedure details
 * 2. Submits pre-auth request (requires valid consent token)
 * 3. Status auto-refreshes until DHA responds (APPROVED/DENIED)
 */
'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSubmitPreauth, usePreauthStatus } from '@/lib/hooks/use-sha';
import type { PreauthDecision } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface PreauthPanelProps {
  /** Claim ID to pre-authorize */
  claimId: number;
  /** Consent token ID (must be valid/validated) */
  consentTokenId?: number;
  /** Existing pre-auth ID (if already submitted) */
  preauthId?: number;
  /** Primary diagnosis code from encounter */
  diagnosisCodes?: string[];
  /** Callback on successful preauth */
  onPreauthComplete?: (preauthId: number, decision: PreauthDecision) => void;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDecisionBadge(decision: PreauthDecision) {
  switch (decision) {
    case 'APPROVED':
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3 animate-pulse" />
          Pending DHA Review
        </Badge>
      );
    case 'DENIED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    case 'EXPIRED':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Clock className="mr-1 h-3 w-3" />
          Expired
        </Badge>
      );
  }
}

// ============================================================================
// Component
// ============================================================================

export function PreauthPanel({
  claimId,
  consentTokenId,
  preauthId: initialPreauthId,
  diagnosisCodes = [],
  onPreauthComplete,
  className,
}: PreauthPanelProps) {
  const [preauthId, setPreauthId] = useState<number | undefined>(initialPreauthId);
  const [procedureCode, setProcedureCode] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitPreauth = useSubmitPreauth();
  const { data: preauthStatus } = usePreauthStatus(preauthId);

  // Notify parent when decision arrives
  React.useEffect(() => {
    if (preauthStatus && preauthStatus.decision !== 'PENDING' && preauthId) {
      onPreauthComplete?.(preauthId, preauthStatus.decision);
    }
  }, [preauthStatus?.decision, preauthId, onPreauthComplete, preauthStatus]);

  const handleSubmit = () => {
    if (!consentTokenId) {
      setError('A valid consent token is required before submitting pre-authorization.');
      return;
    }
    if (!procedureCode.trim()) {
      setError('Procedure code is required.');
      return;
    }

    setError(null);
    submitPreauth.mutate(
      {
        claim_id: claimId,
        consent_token_id: consentTokenId,
        procedure_code: procedureCode.trim(),
        diagnosis_codes: diagnosisCodes,
        estimated_cost: estimatedCost || '0',
        scheduled_date: scheduledDate,
        clinical_notes: clinicalNotes,
      },
      {
        onSuccess: (response) => {
          setPreauthId(response.preauth_id);
        },
        onError: (err: Error) => {
          setError(err.message || 'Failed to submit pre-authorization');
        },
      }
    );
  };

  // If we already have a preauth, show status
  if (preauthId && preauthStatus) {
    return (
      <Card className={cn('relative overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-4 w-4 text-primary" />
              Pre-authorization
            </CardTitle>
            {getDecisionBadge(preauthStatus.decision)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Reference</span>
              <p className="font-mono text-xs">{preauthStatus.preauth_reference || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Procedure</span>
              <p>{preauthStatus.procedure_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Estimated Cost</span>
              <p>KES {Number(preauthStatus.estimated_cost).toLocaleString()}</p>
            </div>
            {preauthStatus.approved_amount && (
              <div>
                <span className="text-muted-foreground">Approved Amount</span>
                <p className="font-medium text-green-700 dark:text-green-400">
                  KES {Number(preauthStatus.approved_amount).toLocaleString()}
                </p>
              </div>
            )}
            {preauthStatus.valid_until && (
              <div>
                <span className="text-muted-foreground">Valid Until</span>
                <p>{format(parseISO(preauthStatus.valid_until), 'dd MMM yyyy')}</p>
              </div>
            )}
            {preauthStatus.submitted_at && (
              <div>
                <span className="text-muted-foreground">Submitted</span>
                <p>{format(parseISO(preauthStatus.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
          </div>

          {preauthStatus.decision === 'DENIED' && preauthStatus.denial_reason && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Denial Reason
              </p>
              <p className="text-sm text-destructive/80 mt-1">{preauthStatus.denial_reason}</p>
            </div>
          )}

          {preauthStatus.decision === 'PENDING' && (
            <p className="text-xs text-muted-foreground">
              Auto-refreshing status every 15 seconds...
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show submission form
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="h-4 w-4 text-primary" />
          Pre-authorization Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!consentTokenId && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/10 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Obtain patient consent first before submitting pre-authorization.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="procedure-code">Procedure Code *</Label>
            <Input
              id="procedure-code"
              value={procedureCode}
              onChange={(e) => setProcedureCode(e.target.value)}
              placeholder="e.g., SHA-PROC-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated-cost">Estimated Cost (KES)</Label>
            <Input
              id="estimated-cost"
              type="number"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduled-date">Scheduled Date</Label>
            <Input
              id="scheduled-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clinical-notes">Clinical Notes</Label>
          <Textarea
            id="clinical-notes"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            placeholder="Reason for procedure, clinical justification..."
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitPreauth.isPending || !consentTokenId}
          size="sm"
        >
          {submitPreauth.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCheck className="mr-2 h-4 w-4" />
          )}
          Submit Pre-authorization
        </Button>
      </CardContent>
    </Card>
  );
}
