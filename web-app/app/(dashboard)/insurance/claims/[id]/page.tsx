'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Check,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  FileText,
  Lock,
  MessageSquare,
  Shield,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useInsuranceClaim,
  useSubmitClaim,
  useCancelClaim,
  useApproveClaim,
  useRejectClaim,
  useRespondToQuery,
  useMarkClaimPaid,
  useAppealClaim,
  useRequestEnrollmentOtp,
  useStartEnrollmentVisit,
  useValidateVisitAuthorization,
  useReserveClaimBalance,
  useSubmitClaimToHealthcloud,
  useCheckClaimRemittance,
  useSubmitClaimInvoice,
  useSubmitClaimCreditNote,
  useUploadClaimAttachment,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import usePermissions from '@/lib/hooks/use-permissions';
import { CLAIM_STATUS_LABELS } from '@/lib/types/insurance';
import type { InsuranceClaimItem, InsuranceVisitAuthorization } from '@/lib/types/insurance';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  query: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  partially_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  partially_paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  appealed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  written_off: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending_preauth: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  preauth_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  preauth_denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

export default function InsuranceClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { canPerformAction } = usePermissions();
  const claimId = Number(params.id);

  const canAdjudicate = canPerformAction('billing.adjudicate_claims');
  const canSubmitClaims = canPerformAction('billing.submit_insurance_claim');

  const { data: claim, isLoading, refetch } = useInsuranceClaim(claimId);
  const submitClaim = useSubmitClaim();
  const cancelClaim = useCancelClaim();
  const approveClaim = useApproveClaim();
  const rejectClaim = useRejectClaim();
  const respondToQuery = useRespondToQuery();
  const markPaid = useMarkClaimPaid();
  const appealClaim = useAppealClaim();
  const requestOtp = useRequestEnrollmentOtp();
  const startVisit = useStartEnrollmentVisit();
  const validateVisit = useValidateVisitAuthorization();
  const reserveBalance = useReserveClaimBalance();
  const submitToHealthcloud = useSubmitClaimToHealthcloud();
  const checkRemittance = useCheckClaimRemittance();
  const submitInvoice = useSubmitClaimInvoice();
  const submitCreditNote = useSubmitClaimCreditNote();
  const uploadAttachment = useUploadClaimAttachment();

  // Action dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [respondOpen, setRespondOpen] = useState(false);
  const [queryResponse, setQueryResponse] = useState('');
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealNotes, setAppealNotes] = useState('');

  // HealthCloud workflow state
  const [contactId, setContactId] = useState('');
  const [otp, setOtp] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [benefitType, setBenefitType] = useState('OUTPATIENT');
  const [benefitCode, setBenefitCode] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState(new Date().toISOString());
  const [authorizationId, setAuthorizationId] = useState<number | null>(null);
  const [authorizationToken, setAuthorizationToken] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [reservationAmount, setReservationAmount] = useState('');
  const [attachmentRef, setAttachmentRef] = useState('');
  const [workflowEvents, setWorkflowEvents] = useState<string[]>([]);

  const handleSubmit = async () => {
    try {
      await submitClaim.mutateAsync(claimId);
      toast({ title: 'Claim submitted', description: 'The claim has been submitted to the insurer.' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to submit claim.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelClaim.mutateAsync({ id: claimId, reason: 'Cancelled by user' });
      toast({ title: 'Claim cancelled' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel claim.', variant: 'destructive' });
    }
  };

  const handleApprove = async () => {
    try {
      await approveClaim.mutateAsync({ id: claimId, approved_amount: approvedAmount });
      toast({ title: 'Claim approved' });
      setApproveOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to approve claim.', variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    try {
      await rejectClaim.mutateAsync({ id: claimId, reason: rejectReason });
      toast({ title: 'Claim rejected' });
      setRejectOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to reject claim.', variant: 'destructive' });
    }
  };

  const handleRespondToQuery = async () => {
    try {
      await respondToQuery.mutateAsync({ id: claimId, response: queryResponse });
      toast({ title: 'Response sent' });
      setRespondOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to send response.', variant: 'destructive' });
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync({ id: claimId, paid_amount: paidAmount });
      toast({ title: 'Claim marked as paid' });
      setMarkPaidOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to mark claim as paid.', variant: 'destructive' });
    }
  };

  const handleAppeal = async () => {
    try {
      await appealClaim.mutateAsync({ id: claimId, notes: appealNotes || undefined });
      toast({ title: 'Appeal submitted' });
      setAppealOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to submit appeal.', variant: 'destructive' });
    }
  };

  const pushWorkflowEvent = (event: string) => {
    setWorkflowEvents((prev) => [event, ...prev].slice(0, 8));
  };

  const handleRequestOtp = async () => {
    if (!claim) return;
    if (!claim.patient_insurance || !contactId) return;
    try {
      const authorization = await requestOtp.mutateAsync({
        id: claim.patient_insurance,
        data: { contact_id: Number(contactId) },
      });
      setAuthorizationId(authorization.id);
      pushWorkflowEvent(`OTP requested for contact ${contactId}`);
      toast({ title: 'OTP requested', description: 'Check sandbox response or member phone.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to request OTP.', variant: 'destructive' });
    }
  };

  const handleStartVisit = async () => {
    if (!claim) return;
    if (!claim.patient_insurance || !contactId || !otp || !beneficiaryId || !benefitCode || !policyNumber) {
      toast({ title: 'Missing fields', description: 'Fill OTP/start visit fields first.', variant: 'destructive' });
      return;
    }
    try {
      const authorization: InsuranceVisitAuthorization = await startVisit.mutateAsync({
        id: claim.patient_insurance,
        data: {
          beneficiary_id: Number(beneficiaryId),
          benefit_type: benefitType,
          benefit_code: benefitCode,
          policy_number: policyNumber,
          policy_effective_date: policyEffectiveDate,
          otp,
          beneficiary_contact: Number(contactId),
          encounter: claim.encounter ?? undefined,
        },
      });
      setAuthorizationId(authorization.id);
      setAuthorizationToken(authorization.auth_token || '');
      pushWorkflowEvent(`Visit started: ${authorization.authorization_guid || 'N/A'}`);
      toast({ title: 'Visit started', description: 'Authorization token created.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to start visit.', variant: 'destructive' });
    }
  };

  const handleValidateAuthorization = async () => {
    if (!claim) return;
    if (!authorizationId) {
      toast({ title: 'Missing authorization', description: 'Start visit first.', variant: 'destructive' });
      return;
    }
    try {
      await validateVisit.mutateAsync({
        id: authorizationId,
        data: {
          first_name: claim.patient_name.split(' ')[0] || claim.patient_name,
          last_name: claim.patient_name.split(' ').slice(1).join(' ') || claim.patient_name,
          member_number: claim.member_number,
          auth_token: authorizationToken,
          visit_type: claim.claim_type === 'inpatient' ? 'INPATIENT' : 'OUTPATIENT',
          scheme_name: claim.plan_name,
        },
      });
      pushWorkflowEvent('Authorization token validated');
      toast({ title: 'Authorization validated' });
    } catch {
      toast({ title: 'Error', description: 'Failed to validate authorization.', variant: 'destructive' });
    }
  };

  const handleReserveBalance = async () => {
    if (!authorizationId || !invoiceNumber || !reservationAmount) {
      toast({ title: 'Missing fields', description: 'Authorization, invoice number, and amount are required.', variant: 'destructive' });
      return;
    }
    try {
      const result = await reserveBalance.mutateAsync({
        id: claimId,
        data: {
          authorization_id: authorizationId,
          invoice_number: invoiceNumber,
          amount: reservationAmount,
        },
      });
      pushWorkflowEvent(`Balance reserved: ${result.reservation_guid || result.id}`);
      toast({ title: 'Balance reserved' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reserve balance.', variant: 'destructive' });
    }
  };

  const handleSubmitHealthcloudClaim = async () => {
    try {
      await submitToHealthcloud.mutateAsync(claimId);
      pushWorkflowEvent('Claim submitted to HealthCloud');
      toast({ title: 'Claim sent to HealthCloud' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to submit claim to HealthCloud.', variant: 'destructive' });
    }
  };

  const handleSubmitInvoice = async () => {
    if (!claim) return;
    if (!invoiceNumber) {
      toast({ title: 'Invoice number required', variant: 'destructive' });
      return;
    }
    try {
      await submitInvoice.mutateAsync({
        id: claimId,
        data: {
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString(),
          lines: claim.items.map((item, idx) => ({
            item_code: item.service_code || `SVC-${idx + 1}`,
            item_name: item.service_description,
            charge_date: new Date().toISOString(),
            unit_price: Number(item.unit_price),
            quantity: item.quantity,
            line_number: idx + 1,
          })),
        },
      });
      pushWorkflowEvent('Invoice submitted to HealthCloud');
      toast({ title: 'Invoice submitted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to submit invoice.', variant: 'destructive' });
    }
  };

  const handleUploadAttachment = async () => {
    if (!attachmentRef) {
      toast({ title: 'Attachment reference required', variant: 'destructive' });
      return;
    }
    try {
      await uploadAttachment.mutateAsync({
        id: claimId,
        data: {
          attachment: attachmentRef,
          attachment_type: 'CLAIM_FORM',
          description: 'Uploaded from claim workflow page',
        },
      });
      pushWorkflowEvent('Claim attachment uploaded');
      toast({ title: 'Attachment uploaded' });
    } catch {
      toast({ title: 'Error', description: 'Failed to upload attachment.', variant: 'destructive' });
    }
  };

  const handleSubmitCreditNote = async () => {
    if (!claim) return;
    if (!invoiceNumber) {
      toast({ title: 'Invoice number required', variant: 'destructive' });
      return;
    }
    try {
      await submitCreditNote.mutateAsync({
        id: claimId,
        data: {
          invoice_number: `${invoiceNumber}-CRN`,
          invoice_date: new Date().toISOString(),
          lines: claim.items.slice(0, 1).map((item, idx) => ({
            item_code: item.service_code || `SVC-${idx + 1}`,
            item_name: item.service_description,
            charge_date: new Date().toISOString(),
            unit_price: Number(item.unit_price),
            quantity: 1,
            line_number: idx + 1,
          })),
        },
      });
      pushWorkflowEvent('Credit note submitted');
      toast({ title: 'Credit note submitted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to submit credit note.', variant: 'destructive' });
    }
  };

  const handleCheckRemittance = async () => {
    try {
      await checkRemittance.mutateAsync(claimId);
      pushWorkflowEvent('Claim remittance status refreshed');
      toast({ title: 'Remittance checked' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to check remittance.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!claim) {
    return <div className="text-center py-10 text-muted-foreground">Claim not found.</div>;
  }

  const canSubmit = claim.status === 'draft' && canSubmitClaims;
  const canCancel = ['draft', 'submitted', 'acknowledged'].includes(claim.status) && canSubmitClaims;
  const canApprove = ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canReject = ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canQuery = ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canRespond = claim.status === 'query' && canSubmitClaims;
  const canMarkPaid = ['approved', 'partially_approved'].includes(claim.status) && canAdjudicate;
  const canAppeal = claim.is_appealable && canSubmitClaims;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Claim ${claim.claim_number}`}
        helpContent="View claim details, line items, and manage claim lifecycle."
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/insurance/claims')}>
            All Claims
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {claim.patient_name}
            <span className="text-muted-foreground"> • {claim.member_number}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {claim.provider_name} • {claim.plan_name} • {claim.claim_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_COLORS[claim.status] || ''} shrink-0 w-fit`}>
            {CLAIM_STATUS_LABELS[claim.status] || claim.status}
          </Badge>
          {claim.is_overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      </div>

      {/* Action Buttons */}
      {(canSubmit || canCancel || canApprove || canReject || canRespond || canMarkPaid || canAppeal) && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2">
              {canSubmit && (
                <Button size="sm" onClick={handleSubmit} disabled={submitClaim.isPending} className="gap-1">
                  <Send className="h-3 w-3" /> Submit
                </Button>
              )}
              {canApprove && (
                <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Approve Claim</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Approved Amount (KES)</Label>
                        <Input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} placeholder={claim.total_amount} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
                        <Button onClick={handleApprove} disabled={approveClaim.isPending || !approvedAmount}>Approve</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canReject && (
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Reject Claim</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Reason *</Label>
                        <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleReject} disabled={rejectClaim.isPending || !rejectReason}>Reject</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canQuery && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1">
                      <MessageSquare className="h-3 w-3" /> Query
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Send Query</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">Query functionality is available via the insurer portal integration.</p>
                  </DialogContent>
                </Dialog>
              )}
              {canRespond && (
                <Dialog open={respondOpen} onOpenChange={setRespondOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="default" className="gap-1">
                      <MessageSquare className="h-3 w-3" /> Respond to Query
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Respond to Insurer Query</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      {claim.query_details && (
                        <div className="rounded bg-muted p-2 text-sm">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Query:</p>
                          <p>{claim.query_details}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label>Response *</Label>
                        <Textarea value={queryResponse} onChange={e => setQueryResponse(e.target.value)} rows={3} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRespondOpen(false)}>Cancel</Button>
                        <Button onClick={handleRespondToQuery} disabled={respondToQuery.isPending || !queryResponse}>Send Response</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canMarkPaid && (
                <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      <DollarSign className="h-3 w-3" /> Mark Paid
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Paid Amount (KES)</Label>
                        <Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder={claim.approved_amount} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
                        <Button onClick={handleMarkPaid} disabled={markPaid.isPending || !paidAmount}>Confirm</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canAppeal && (
                <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1">
                      <RotateCcw className="h-3 w-3" /> Appeal
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Appeal Claim</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Notes (optional)</Label>
                        <Textarea value={appealNotes} onChange={e => setAppealNotes(e.target.value)} rows={3} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAppealOpen(false)}>Cancel</Button>
                        <Button onClick={handleAppeal} disabled={appealClaim.isPending}>Submit Appeal</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={handleCancel} disabled={cancelClaim.isPending}>
                  <Trash2 className="h-3 w-3" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Claimed</p>
            <p className="text-lg font-semibold">{formatCurrency(claim.total_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(claim.approved_amount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Co-pay</p>
            <p className="text-lg font-semibold">{formatCurrency(claim.copay_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(claim.paid_amount)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> HealthCloud Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Contact ID (OTP)</Label>
              <Input value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="e.g. 5531" />
            </div>
            <div>
              <Label>Beneficiary ID</Label>
              <Input value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} placeholder="Eligibility member.id" />
            </div>
            <div>
              <Label>OTP</Label>
              <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="One-time PIN" />
            </div>
            <div>
              <Label>Benefit Type</Label>
              <Input value={benefitType} onChange={(e) => setBenefitType(e.target.value)} placeholder="OUTPATIENT" />
            </div>
            <div>
              <Label>Benefit Code</Label>
              <Input value={benefitCode} onChange={(e) => setBenefitCode(e.target.value)} placeholder="340" />
            </div>
            <div>
              <Label>Policy Number</Label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="POL/001" />
            </div>
            <div className="md:col-span-2">
              <Label>Policy Effective Date (ISO)</Label>
              <Input value={policyEffectiveDate} onChange={(e) => setPolicyEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label>Auth Record ID</Label>
              <Input value={authorizationId ?? ''} onChange={(e) => setAuthorizationId(Number(e.target.value) || null)} placeholder="Internal authorization ID" />
            </div>
            <div className="md:col-span-2">
              <Label>Authorization Token</Label>
              <Input value={authorizationToken} onChange={(e) => setAuthorizationToken(e.target.value)} placeholder="Token from start visit" />
            </div>
            <div>
              <Label>Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
            </div>
            <div>
              <Label>Reserve Amount</Label>
              <Input value={reservationAmount} onChange={(e) => setReservationAmount(e.target.value)} placeholder={claim.total_amount} />
            </div>
            <div>
              <Label>Attachment Ref</Label>
              <Input value={attachmentRef} onChange={(e) => setAttachmentRef(e.target.value)} placeholder="/path/to/file.pdf;type=application/pdf" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleRequestOtp} disabled={requestOtp.isPending}>
              <Lock className="h-3 w-3" /> Request OTP
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleStartVisit} disabled={startVisit.isPending}>
              <Shield className="h-3 w-3" /> Start Visit
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleValidateAuthorization} disabled={validateVisit.isPending}>
              <ClipboardCheck className="h-3 w-3" /> Validate Token
            </Button>
            <Button size="sm" variant="outline" onClick={handleReserveBalance} disabled={reserveBalance.isPending}>
              Reserve Balance
            </Button>
            <Button size="sm" onClick={handleSubmitHealthcloudClaim} disabled={submitToHealthcloud.isPending}>
              Submit Claim
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSubmitInvoice} disabled={submitInvoice.isPending}>
              Submit Invoice
            </Button>
            <Button size="sm" variant="secondary" onClick={handleUploadAttachment} disabled={uploadAttachment.isPending}>
              Upload Attachment
            </Button>
            <Button size="sm" variant="ghost" onClick={handleSubmitCreditNote} disabled={submitCreditNote.isPending}>
              Submit Credit Note
            </Button>
            <Button size="sm" variant="outline" onClick={handleCheckRemittance} disabled={checkRemittance.isPending}>
              Check Remittance
            </Button>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground mb-2">Workflow timeline</p>
            {workflowEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workflow events yet.</p>
            ) : (
              <div className="space-y-1">
                {workflowEvents.map((event, idx) => (
                  <p key={`${event}-${idx}`} className="text-sm">{event}</p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dates & Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Service Date</p>
                <p>{new Date(claim.service_date).toLocaleDateString()}</p>
              </div>
            </div>
            {claim.submission_date && (
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p>{new Date(claim.submission_date).toLocaleDateString()}</p>
                </div>
              </div>
            )}
            {claim.admission_date && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Admission</p>
                  <p>{new Date(claim.admission_date).toLocaleDateString()}</p>
                </div>
              </div>
            )}
            {claim.external_claim_id && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Insurer Ref</p>
                  <p className="font-mono text-xs">{claim.external_claim_id}</p>
                </div>
              </div>
            )}
            {claim.diagnosis_codes.length > 0 && (
              <div className="flex items-start gap-2 col-span-full">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Diagnosis Codes</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {claim.diagnosis_codes.map((code) => (
                      <Badge key={code} variant="secondary" className="text-xs font-mono">{code}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rejection / Query Info */}
      {(claim.rejection_reason || claim.query_details) && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="text-base text-yellow-800 dark:text-yellow-400">
              {claim.rejection_reason ? 'Rejection Reason' : 'Insurer Query'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {claim.rejection_reason && <p>{claim.rejection_reason}</p>}
            {claim.query_details && (
              <div className="space-y-2">
                <p><span className="font-medium">Query:</span> {claim.query_details}</p>
                {claim.query_response && (
                  <p><span className="font-medium">Response:</span> {claim.query_response}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<InsuranceClaimItem>
            data={claim.items}
            columns={[
              { key: 'service_description', header: 'Service', sortable: true, cell: (item) => (
                <div>
                  <p className="text-sm">{item.service_description}</p>
                  {item.service_code && <p className="text-xs text-muted-foreground font-mono">{item.service_code}</p>}
                </div>
              )},
              { key: 'quantity', header: 'Qty', sortable: true, sortType: 'number', cell: (item) => item.quantity },
              { key: 'unit_price', header: 'Unit Price', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.unit_price) },
              { key: 'claimed_amount', header: 'Claimed', sortable: true, sortType: 'number', cell: (item) => formatCurrency(item.claimed_amount) },
              { key: 'approved_amount', header: 'Approved', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.approved_amount) },
              { key: 'status', header: 'Status', cell: (item) => <Badge variant="secondary" className="text-xs">{item.status}</Badge> },
            ]}
            keyExtractor={(item) => item.id}
            emptyMessage="No line items."
          />
        </CardContent>
      </Card>

      {/* Notes */}
      {claim.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{claim.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
