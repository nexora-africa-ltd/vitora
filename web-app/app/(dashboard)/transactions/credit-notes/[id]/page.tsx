/**
 * Credit Note Detail Page
 * View credit note details, approve/reject, process refund
 */
'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  ScrollText,
  Undo2,
  User,
  FileText,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreditNote,
  useApproveCreditNote,
  useRejectCreditNote,
  useProcessRefund,
} from '@/lib/hooks/billing';
import { formatCurrency } from '@/lib/utils/format';
import type { CreditNoteRefundData } from '@/lib/types/billing';
import { toast } from 'sonner';

// ============================================================================
// Status config
// ============================================================================

const statusConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  DRAFT: { color: 'bg-slate-100 text-slate-700', icon: ScrollText, label: 'Draft' },
  APPROVED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Approved' },
  REJECTED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Rejected' },
  REFUNDED: { color: 'bg-blue-100 text-blue-700', icon: Undo2, label: 'Refunded' },
};

const reasonLabels: Record<string, string> = {
  OVERCHARGE: 'Overcharge',
  SERVICE_NOT_RENDERED: 'Service Not Rendered',
  DUPLICATE_BILLING: 'Duplicate Billing',
  DUPLICATE: 'Duplicate Charge',
  DUPLICATE_CHARGE: 'Duplicate Charge',
  PRICING_ERROR: 'Pricing Error',
  OTHER: 'Other',
  INSURANCE: 'Insurance Adjustment',
  INSURANCE_ADJUSTMENT: 'Insurance Adjustment',
  GOODWILL: 'Goodwill',
};

// ============================================================================
// Main Page
// ============================================================================

export default function CreditNoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const { data: creditNote, isLoading, error } = useCreditNote(id);
  const approveMutation = useApproveCreditNote();
  const rejectMutation = useRejectCreditNote();
  const refundMutation = useProcessRefund();

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundMethod, setRefundMethod] = useState<CreditNoteRefundData['refund_method']>('CASH');
  const [refundReference, setRefundReference] = useState('');

  // --- Handlers ---

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(id);
      toast.success('Credit note approved');
    } catch {
      toast.error('Failed to approve credit note');
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    try {
      await rejectMutation.mutateAsync({ id, reason: rejectionReason });
      toast.success('Credit note rejected');
      setShowRejectDialog(false);
      setRejectionReason('');
    } catch {
      toast.error('Failed to reject credit note');
    }
  };

  const handleRefund = async () => {
    try {
      await refundMutation.mutateAsync({
        id,
        data: {
          refund_method: refundMethod,
          refund_reference: refundReference || undefined,
        },
      });
      toast.success('Refund processed successfully');
      setShowRefundDialog(false);
      setRefundReference('');
    } catch {
      toast.error('Failed to process refund');
    }
  };

  // --- Render states ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !creditNote) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Credit Note Not Found" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The credit note you&apos;re looking for doesn&apos;t exist or has been removed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const config = statusConfig[creditNote.status] ?? { color: 'bg-slate-100 text-slate-700', icon: ScrollText, label: creditNote.status };
  const StatusIcon = config.icon;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Credit Note ${creditNote.credit_note_number}`}
        helpContent="View credit note details. Approve, reject, or process refunds for pending credit notes."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {creditNote.status === 'DRAFT' && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive/10"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </Button>
              </>
            )}
            {creditNote.status === 'APPROVED' && (
              <Button onClick={() => setShowRefundDialog(true)} disabled={refundMutation.isPending}>
                <Undo2 className="h-4 w-4 mr-2" />
                Process Refund
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {creditNote.patient_name || 'Unknown Patient'}
            <span className="text-muted-foreground">
              {' '}• Invoice {creditNote.invoice_number || `#${creditNote.invoice}`}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Requested {format(new Date(creditNote.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg font-bold">{formatCurrency(parseFloat(creditNote.amount))}</span>
          <Badge className={`${config.color} gap-1 shrink-0 w-fit`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Reason</span>
              <span className="font-medium">{reasonLabels[creditNote.reason] || creditNote.reason}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Detail</span>
              <span className="text-right max-w-[60%]">{creditNote.reason_detail || '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{formatCurrency(parseFloat(creditNote.amount))}</span>
            </div>
            {creditNote.refund_method && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Refund Method</span>
                  <span>{creditNote.refund_method}</span>
                </div>
              </>
            )}
            {creditNote.refund_reference && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Refund Reference</span>
                  <span className="font-mono text-xs">{creditNote.refund_reference}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Workflow Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Requested By</span>
              <span>{creditNote.requested_by_name || creditNote.requested_by_username || `User #${creditNote.requested_by}`}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Requested At</span>
              <span>{format(new Date(creditNote.created_at), 'dd MMM yyyy, HH:mm')}</span>
            </div>
            {creditNote.approved_by && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Approved By</span>
                  <span>{creditNote.approved_by_name || creditNote.approved_by_username || `User #${creditNote.approved_by}`}</span>
                </div>
                {creditNote.approved_at && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Approved At</span>
                      <span>{format(new Date(creditNote.approved_at), 'dd MMM yyyy, HH:mm')}</span>
                    </div>
                  </>
                )}
              </>
            )}
            {creditNote.rejected_by && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rejected By</span>
                  <span>User #{creditNote.rejected_by}</span>
                </div>
                {creditNote.rejection_reason && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rejection Reason</span>
                      <span className="text-right max-w-[60%]">{creditNote.rejection_reason}</span>
                    </div>
                  </>
                )}
              </>
            )}
            {creditNote.refunded_at && (
              <>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Refunded At</span>
                  <span>{format(new Date(creditNote.refunded_at), 'dd MMM yyyy, HH:mm')}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Credit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Reason for Rejection</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Explain why this credit note is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount</Label>
              <p className="text-lg font-bold">{formatCurrency(parseFloat(creditNote.amount))}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-method">Refund Method</Label>
              <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as CreditNoteRefundData['refund_method'])}>
                <SelectTrigger id="refund-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="MPESA">M-Pesa</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reference">Reference Number (optional)</Label>
              <Input
                id="refund-reference"
                placeholder="e.g. M-Pesa confirmation code"
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRefund} disabled={refundMutation.isPending}>
              {refundMutation.isPending ? 'Processing...' : 'Process Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
