'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Loader2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  buildHealthcloudEligibilityView,
  HealthcloudEligibilityCards,
} from '@/components/insurance/healthcloud-eligibility-cards';
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
  useStartHealthcloudSession,
  useRequestHealthcloudSessionOtp,
  useStartHealthcloudSessionVisit,
  useVisitAuthorizations,
  useValidateVisitAuthorization,
  useReserveClaimBalance,
  useSubmitClaimToHealthcloud,
  useRefreshClaimExternalStatus,
  useCheckClaimRemittance,
  useSubmitClaimInvoice,
  useSubmitClaimCreditNote,
  useUploadClaimAttachmentFile,
} from '@/lib/hooks/use-insurance';
import { useInvoice } from '@/lib/hooks/billing';
import { useToast } from '@/lib/hooks/use-toast';
import usePermissions from '@/lib/hooks/use-permissions';
import { CLAIM_STATUS_LABELS } from '@/lib/types/insurance';
import type {
  InsuranceVisitAuthorization,
  VerifyViaHealthcloudResult,
} from '@/lib/types/insurance';

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

const REQUIRED_ATTACHMENT_TYPES = [
  'CLAIM_FORM',
  'PREAUTH_FORM',
  'PRESCRIPTION',
  'LAB_ORDER',
  'IMAGING_ORDER',
] as const;

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

type CreditNoteLineForm = {
  item_code: string;
  item_name: string;
  charge_date: string;
  unit_price: string;
  quantity: string;
};

function createEmptyCreditNoteLine(): CreditNoteLineForm {
  return {
    item_code: '',
    item_name: '',
    charge_date: new Date().toISOString(),
    unit_price: '',
    quantity: '1',
  };
}

function cleanApiErrorMessage(message: string): string {
  const trimmed = message.trim();
  const normalizeDetail = (value: string) =>
    value
      .replace(/\\"/g, '"')
      .replace(/"([A-Z_]+)"/g, '$1');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
      const details = Object.entries(parsed)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            const firstText = value.find((item) => typeof item === 'string');
            return firstText ? `${key.replace(/_/g, ' ')}: ${normalizeDetail(firstText)}` : null;
          }
          if (typeof value === 'string') {
            return `${key.replace(/_/g, ' ')}: ${normalizeDetail(value)}`;
          }
          return null;
        })
        .filter((row): row is string => Boolean(row));
      if (details.length > 0) {
        return details.join('; ');
      }
    } catch {
      // Fall back to original formatting below.
    }
  }

  if (trimmed.startsWith("['") && trimmed.endsWith("']")) {
    return trimmed.slice(2, -2);
  }

  if (trimmed.includes(': ')) {
    return normalizeDetail(trimmed.slice(trimmed.lastIndexOf(': ') + 2).trim());
  }

  return normalizeDetail(trimmed);
}

function extractApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;

  if (typeof data === 'string') {
    return cleanApiErrorMessage(data);
  }

  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    const candidate = payload.error ?? payload.detail ?? payload.message;

    if (typeof candidate === 'string') {
      return cleanApiErrorMessage(candidate);
    }

    if (Array.isArray(candidate)) {
      const first = candidate.find((item) => typeof item === 'string');
      if (typeof first === 'string') {
        return cleanApiErrorMessage(first);
      }
    }
  }

  return null;
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
  const { data: authorizationListData } = useVisitAuthorizations(
    claim
      ? {
          patient: claim.patient,
          enrollment: claim.patient_insurance,
          ordering: '-updated_at',
        }
      : undefined
  );
  const submitClaim = useSubmitClaim();
  const cancelClaim = useCancelClaim();
  const approveClaim = useApproveClaim();
  const rejectClaim = useRejectClaim();
  const respondToQuery = useRespondToQuery();
  const markPaid = useMarkClaimPaid();
  const appealClaim = useAppealClaim();
  const startSession = useStartHealthcloudSession();
  const requestSessionOtp = useRequestHealthcloudSessionOtp();
  const startSessionVisit = useStartHealthcloudSessionVisit();
  const validateVisit = useValidateVisitAuthorization();
  const reserveBalance = useReserveClaimBalance();
  const submitToHealthcloud = useSubmitClaimToHealthcloud();
  const refreshExternalStatus = useRefreshClaimExternalStatus();
  const checkRemittance = useCheckClaimRemittance();
  const submitInvoice = useSubmitClaimInvoice();
  const submitCreditNote = useSubmitClaimCreditNote();
  const uploadAttachmentFile = useUploadClaimAttachmentFile();

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
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteDate, setCreditNoteDate] = useState(new Date().toISOString());
  const [creditNoteLines, setCreditNoteLines] = useState<CreditNoteLineForm[]>([createEmptyCreditNoteLine()]);

  // HealthCloud workflow state
  const [session, setSession] = useState<InsuranceVisitAuthorization | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<VerifyViaHealthcloudResult | null>(null);
  const [contactId, setContactId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [benefitType, setBenefitType] = useState('OUTPATIENT');
  const [benefitCode, setBenefitCode] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState(new Date().toISOString());
  const [authorizationToken, setAuthorizationToken] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [reservationAmount, setReservationAmount] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, File | null>>({});
  const [uploadedAttachments, setUploadedAttachments] = useState<Array<{ label: string; ref: string; type?: string }>>([]);
  const [uploadingAttachmentType, setUploadingAttachmentType] = useState<string | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<string[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const contactStepRef = useRef<HTMLDivElement | null>(null);
  const visitStepRef = useRef<HTMLDivElement | null>(null);
  const validateStepRef = useRef<HTMLDivElement | null>(null);
  const reserveStepRef = useRef<HTMLDivElement | null>(null);
  const attachmentStepRef = useRef<HTMLDivElement | null>(null);
  const submitStepRef = useRef<HTMLDivElement | null>(null);

  const { data: linkedInvoice } = useInvoice(claim?.invoice ?? undefined);

  const eligibilityView = useMemo(
    () => buildHealthcloudEligibilityView(eligibilityResult),
    [eligibilityResult]
  );

  const eligibilityContacts = useMemo(() => eligibilityView?.contacts ?? [], [eligibilityView?.contacts]);
  const eligibilityBenefits = useMemo(() => eligibilityView?.benefits ?? [], [eligibilityView?.benefits]);

  useEffect(() => {
    if (session) return;
    const existingSessions = authorizationListData?.results ?? [];
    const existing = existingSessions.find((item) => item.status !== 'failed' && item.status !== 'expired');
    if (!existing) return;

    setSession(existing);
    if (eligibilityResult) return;

    const rawPayload = (existing.eligibility_payload ?? {}) as Record<string, unknown>;
    const cover = rawPayload.cover as Record<string, unknown> | undefined;
    const member = rawPayload.member as Record<string, unknown> | undefined;
    const benefits = Array.isArray(rawPayload.benefits) ? rawPayload.benefits : [];

    setEligibilityResult({
      eligible: Boolean(member?.isActive),
      status: String(cover?.status ?? existing.auth_status ?? existing.status),
      plan_name: String(cover?.schemeName ?? ''),
      member_number: existing.member_number,
      annual_balance: null,
      copay_percent: null,
      message: 'Loaded from existing HealthCloud session.',
      raw_response: {
        ...rawPayload,
        cover: cover ?? {},
        member: member ?? {},
        benefits,
      },
    });
  }, [authorizationListData?.results, eligibilityResult, session]);

  useEffect(() => {
    if (!session) return;

    setContactId((prev) => {
      if (prev) return prev;
      const preferred = session.selected_beneficiary_contact_id ?? session.beneficiary_contact_id;
      return preferred ? String(preferred) : '';
    });
    setBeneficiaryId((prev) => (prev || (session.beneficiary_id ? String(session.beneficiary_id) : '')));
    setBenefitType((prev) => prev || session.selected_benefit_type || session.benefit_type || 'OUTPATIENT');
    setBenefitCode((prev) => prev || session.selected_benefit_code || session.benefit_code || '');
    setPolicyNumber((prev) => prev || session.policy_number || '');
    setPolicyEffectiveDate((prev) => {
      if (prev) return prev;
      const rawPolicyDate =
        typeof session.raw_payload?.policy_effective_date === 'string'
          ? session.raw_payload.policy_effective_date
          : typeof session.raw_payload?.policyEffectiveDate === 'string'
          ? session.raw_payload.policyEffectiveDate
          : '';
      return rawPolicyDate || new Date().toISOString();
    });
    setAuthorizationToken((prev) => prev || session.auth_token || session.authorization_guid || '');
    setInvoiceNumber((prev) => prev || linkedInvoice?.invoice_number || claim?.claim_number || '');
    setReservationAmount((prev) => {
      if (prev) return prev;
      const latestReservedAmount = claim?.latest_balance_reservation?.amount;
      if (latestReservedAmount) return latestReservedAmount;
      const insurerPortion = Math.max(Number(claim?.total_amount || 0) - Number(claim?.copay_amount || 0), 0);
      return insurerPortion > 0 ? insurerPortion.toFixed(2) : '';
    });
  }, [
    claim?.claim_number,
    claim?.copay_amount,
    claim?.latest_balance_reservation?.amount,
    claim?.total_amount,
    linkedInvoice?.invoice_number,
    session,
  ]);

  useEffect(() => {
    const fromClaim = (claim?.attachments_meta ?? [])
      .map((item) => ({
        type: String(item.content_type || '').toUpperCase(),
        label: String(item.filename || item.content_type || 'Attachment'),
        ref: String(item.url || ''),
      }))
      .filter((item) => item.ref);
    if (fromClaim.length > 0) {
      setUploadedAttachments(fromClaim);
    }
  }, [claim?.attachments_meta]);

  const canRequestOtp = Boolean(session?.id && session.workflow_step === 'eligibility_verified');
  const canStartVisit = Boolean(session?.id && session.status === 'otp_requested');
  const canValidateToken = Boolean(session?.id && session.status === 'authorized');

  const showErrorToast = ({
    title,
    description,
    error,
  }: {
    title: string;
    description: string;
    error?: unknown;
  }) => {
    const apiMessage = extractApiErrorMessage(error);
    const message = apiMessage || description;
    setInlineError(message);
    toast({ title, description: message, variant: 'destructive' });
  };

  const pickPreferredBenefit = useCallback((benefits: Array<Record<string, unknown>>) => {
    if (benefits.length === 0) return null;
    const claimType = String(claim?.claim_type || '').toLowerCase();
    const desiredType = claimType === 'inpatient' ? 'INPATIENT' : 'OUTPATIENT';
    const preferred = benefits.find((row) => {
      const benefitTypeValue = String(row.benefitType || '').toUpperCase();
      return benefitTypeValue.includes(desiredType);
    });
    return preferred ?? benefits.find((row) => typeof row.benefitCode === 'string') ?? null;
  }, [claim?.claim_type]);

  const workflowSteps = useMemo(() => {
    const hasSession = Boolean(session?.id);
    const hasOtp = session?.status === 'otp_requested' || session?.status === 'authorized' || session?.status === 'validated';
    const hasVisitStarted = session?.status === 'authorized' || session?.status === 'validated';
    const hasValidation = session?.status === 'validated';
    const claimSubmitted = Boolean(claim?.external_claim_id) || claim?.status !== 'draft';
    return [
      { key: 'eligibility', title: '1. Eligibility', done: hasSession, current: !hasSession },
      { key: 'otp', title: '2. OTP', done: hasOtp, current: hasSession && !hasOtp },
      { key: 'visit', title: '3. Start Visit', done: hasVisitStarted, current: hasOtp && !hasVisitStarted },
      { key: 'validate', title: '4. Validate', done: hasValidation, current: hasVisitStarted && !hasValidation },
      { key: 'submit', title: '5. Submit Claim', done: claimSubmitted, current: hasValidation && !claimSubmitted },
    ];
  }, [claim?.external_claim_id, claim?.status, session?.id, session?.status]);

  const focusStep = (ref: React.RefObject<HTMLDivElement | null>) => {
    const container = ref.current;
    if (!container) return;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const firstField = container.querySelector('input, select, textarea, button') as HTMLElement | null;
    firstField?.focus();
  };

  useEffect(() => {
    if (eligibilityBenefits.length === 0) return;
    const benefits = eligibilityBenefits.map((benefit) => ({
      benefitCode: benefit.benefitCode,
      benefitType: benefit.benefitType,
    })) as Array<Record<string, unknown>>;
    const preferred = pickPreferredBenefit(benefits);
    if (!preferred) return;

    const selected = eligibilityBenefits.find((benefit) => benefit.benefitCode === benefitCode);
    const claimType = String(claim?.claim_type || '').toLowerCase();
    const desiredType = claimType === 'inpatient' ? 'INPATIENT' : 'OUTPATIENT';
    const selectedType = String(selected?.benefitType || '').toUpperCase();
    const shouldReplace = !benefitCode || !selectedType.includes(desiredType);
    if (!shouldReplace) return;

    if (typeof preferred.benefitCode === 'string') setBenefitCode(preferred.benefitCode);
    if (typeof preferred.benefitType === 'string') setBenefitType(preferred.benefitType);
  }, [benefitCode, claim?.claim_type, eligibilityBenefits, pickPreferredBenefit]);

  const displayedLineItems = useMemo(() => {
    if (claim?.items?.length) {
      return claim.items.map((item) => ({
        id: `claim-${item.id}`,
        service: item.service_description,
        code: item.service_code,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        claimed: Number(item.claimed_amount),
        approved: Number(item.approved_amount),
        status: item.status,
      }));
    }

    const invoiceItems = linkedInvoice?.items ?? [];
    return invoiceItems.map((item) => ({
      id: `invoice-${item.id}`,
      service: item.description,
      code: item.service_name || item.drug_name || item.lab_order_name || undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      claimed: Number(item.line_total),
      approved: Number(item.insurance_approved_amount || item.line_total),
      status: 'draft',
    }));
  }, [claim?.items, linkedInvoice?.items]);

  const handleSubmit = async () => {
    try {
      await submitClaim.mutateAsync(claimId);
      setInlineError(null);
      toast({ title: 'Claim submitted', description: 'The claim has been submitted to the insurer.' });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to submit claim.', error });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelClaim.mutateAsync({ id: claimId, reason: 'Cancelled by user' });
      setInlineError(null);
      toast({ title: 'Claim cancelled' });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to cancel claim.', error });
    }
  };

  const handleApprove = async () => {
    try {
      await approveClaim.mutateAsync({ id: claimId, approved_amount: approvedAmount });
      setInlineError(null);
      toast({ title: 'Claim approved' });
      setApproveOpen(false);
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to approve claim.', error });
    }
  };

  const handleReject = async () => {
    try {
      await rejectClaim.mutateAsync({ id: claimId, reason: rejectReason });
      setInlineError(null);
      toast({ title: 'Claim rejected' });
      setRejectOpen(false);
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to reject claim.', error });
    }
  };

  const handleRespondToQuery = async () => {
    try {
      await respondToQuery.mutateAsync({ id: claimId, response: queryResponse });
      setInlineError(null);
      toast({ title: 'Response sent' });
      setRespondOpen(false);
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to send response.', error });
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync({ id: claimId, paid_amount: paidAmount });
      setInlineError(null);
      toast({ title: 'Claim marked as paid' });
      setMarkPaidOpen(false);
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to mark claim as paid.', error });
    }
  };

  const handleAppeal = async () => {
    try {
      await appealClaim.mutateAsync({ id: claimId, notes: appealNotes || undefined });
      setInlineError(null);
      toast({ title: 'Appeal submitted' });
      setAppealOpen(false);
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to submit appeal.', error });
    }
  };

  const pushWorkflowEvent = (event: string) => {
    setWorkflowEvents((prev) => [event, ...prev].slice(0, 8));
  };

  const handleStartSession = async () => {
    if (!claim?.patient_insurance) {
      showErrorToast({
        title: 'Missing enrollment',
        description: 'Claim must be linked to a patient insurance enrollment.',
      });
      return;
    }
    try {
      const response = await startSession.mutateAsync(claim.patient_insurance);
      setInlineError(null);
      setSession(response.session);
      setEligibilityResult(response.eligibility);

      const member = response.eligibility.raw_response?.member as Record<string, unknown> | undefined;
      const cover = response.eligibility.raw_response?.cover as Record<string, unknown> | undefined;
      const contacts = Array.isArray(member?.contacts)
        ? (member?.contacts as Array<Record<string, unknown>>)
        : [];
      const firstContact = contacts.find((row) => Number(row.id ?? 0) > 0);

      if (member?.id) setBeneficiaryId(String(member.id));
      if (cover?.policyNumber) setPolicyNumber(String(cover.policyNumber));
      if (firstContact?.id) setContactId(String(firstContact.id));

      const benefits = Array.isArray(response.eligibility.raw_response?.benefits)
        ? (response.eligibility.raw_response?.benefits as Array<Record<string, unknown>>)
        : [];
      const preferredBenefit = pickPreferredBenefit(benefits);
      if (preferredBenefit) {
        if (typeof preferredBenefit.benefitCode === 'string') setBenefitCode(preferredBenefit.benefitCode);
        if (typeof preferredBenefit.benefitType === 'string') setBenefitType(preferredBenefit.benefitType);
      }

      pushWorkflowEvent('Eligibility session started');
      toast({ title: 'Eligibility loaded', description: response.eligibility.message });
    } catch (error) {
      showErrorToast({
        title: 'Error',
        description: 'Failed to start HealthCloud eligibility session.',
        error,
      });
    }
  };

  const handleRequestOtp = async () => {
    if (!claim || !session?.id) return;
    if (!claim.patient_insurance || !contactId) return;
    try {
      const authorization = await requestSessionOtp.mutateAsync({
        id: claim.patient_insurance,
        data: { session_id: session.id, contact_id: Number(contactId) },
      });
      setInlineError(null);
      setSession(authorization);
      pushWorkflowEvent(`OTP requested for contact ${contactId}`);
      toast({ title: 'OTP requested', description: 'Check sandbox response or member phone.' });
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to request OTP.', error });
    }
  };

  const handleStartVisit = async () => {
    if (!claim) return;
    if (!session?.id) {
      showErrorToast({ title: 'Missing session', description: 'Run eligibility first.' });
      return;
    }
    if (!claim.patient_insurance || !contactId || !beneficiaryId || !benefitCode || !policyNumber) {
      showErrorToast({ title: 'Missing fields', description: 'Fill start-visit fields first.' });
      return;
    }
    try {
      const authorization: InsuranceVisitAuthorization = await startSessionVisit.mutateAsync({
        id: claim.patient_insurance,
        data: {
          session_id: session.id,
          beneficiary_id: Number(beneficiaryId),
          benefit_type: benefitType,
          benefit_code: benefitCode,
          policy_number: policyNumber,
          policy_effective_date: policyEffectiveDate,
          otp: '',
          beneficiary_contact: Number(contactId),
          encounter: claim.encounter ?? undefined,
        },
      });
      setInlineError(null);
      setSession(authorization);
      setAuthorizationToken(authorization.auth_token || '');
      pushWorkflowEvent(`Visit started: ${authorization.authorization_guid || 'N/A'}`);
      toast({ title: 'Visit started', description: 'Authorization token created.' });
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to start visit.', error });
    }
  };

  const handleValidateAuthorization = async () => {
    if (!claim) return;
    if (!session?.id) {
      showErrorToast({ title: 'Missing authorization', description: 'Start visit first.' });
      return;
    }
    try {
      const response = await validateVisit.mutateAsync({
        id: session.id,
        data: {
          first_name: claim.patient_name.split(' ')[0] || claim.patient_name,
          last_name: claim.patient_name.split(' ').slice(1).join(' ') || claim.patient_name,
          member_number: claim.member_number,
          auth_token: authorizationToken,
          visit_type: claim.claim_type === 'inpatient' ? 'INPATIENT' : 'OUTPATIENT',
          scheme_name: claim.plan_name,
        },
      });
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'validated',
          workflow_step: 'authorization_validated',
          auth_status:
            typeof response?.auth_status === 'string' ? response.auth_status : prev.auth_status,
        };
      });
      setInlineError(null);
      pushWorkflowEvent('Authorization token validated');
      toast({ title: 'Authorization validated' });
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to validate authorization.', error });
    }
  };

  const handleReserveBalance = async () => {
    if (!session?.id || !invoiceNumber || !reservationAmount) {
      showErrorToast({ title: 'Missing fields', description: 'Authorization, invoice number, and amount are required.' });
      return;
    }
    try {
      const result = await reserveBalance.mutateAsync({
        id: claimId,
        data: {
          authorization_id: session.id,
          invoice_number: invoiceNumber,
          amount: reservationAmount,
        },
      });
      setInlineError(null);
      pushWorkflowEvent(`Balance reserved: ${result.reservation_guid || result.id}`);
      toast({ title: 'Balance reserved' });
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to reserve balance.', error });
    }
  };

  const handleSubmitHealthcloudClaim = async () => {
    try {
      await submitToHealthcloud.mutateAsync(claimId);
      setInlineError(null);
      pushWorkflowEvent('Claim submitted to HealthCloud');
      toast({ title: 'Claim sent to HealthCloud' });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to submit claim to HealthCloud.', error });
    }
  };

  const handleRefreshExternalStatus = async () => {
    try {
      await refreshExternalStatus.mutateAsync(claimId);
      setInlineError(null);
      pushWorkflowEvent('Claim status refreshed from HealthCloud');
      toast({ title: 'External status refreshed' });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to refresh external status.', error });
    }
  };

  const handleSubmitInvoice = async () => {
    if (!claim) return;
    if (!invoiceNumber) {
      showErrorToast({ title: 'Invoice number required', description: 'Enter an invoice number before submitting.' });
      return;
    }
    try {
      await submitInvoice.mutateAsync({
        id: claimId,
        data: {
          invoice_number: invoiceNumber,
        },
      });
      setInlineError(null);
      pushWorkflowEvent('Invoice submitted to HealthCloud');
      toast({ title: 'Invoice submitted' });
    } catch (error) {
      showErrorToast({
        title: 'Invoice submission failed',
        description: 'Failed to submit invoice.',
        error,
      });
    }
  };

  const handleUploadAttachmentType = async (attachmentType: string) => {
    if (!claim?.external_claim_id) {
      showErrorToast({
        title: 'Submit claim first',
        description: 'Upload to Slade requires external claim id. Submit claim to HealthCloud first.',
      });
      return;
    }

    const selectedFile = attachmentFiles[attachmentType] ?? null;
    if (!selectedFile) {
      showErrorToast({
        title: 'File required',
        description: `Select a file for ${attachmentType} before uploading.`,
      });
      return;
    }

    try {
      setUploadingAttachmentType(attachmentType);
      const response = await uploadAttachmentFile.mutateAsync({
        id: claimId,
        file: selectedFile,
        data: {
          attachment_type: attachmentType,
          description: `Uploaded ${attachmentType} from claim workflow page`,
        },
      });

      setUploadedAttachments((prev) => [
        {
          type: attachmentType,
          label: `${attachmentType} - ${selectedFile.name}`,
          ref: response.attachment_ref || selectedFile.name,
        },
        ...prev,
      ]);
      setInlineError(null);
      setAttachmentFiles((prev) => ({ ...prev, [attachmentType]: null }));
      pushWorkflowEvent(`${attachmentType} uploaded`);
      toast({ title: 'Attachment uploaded', description: `${attachmentType} uploaded to Slade.` });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: `Failed to upload ${attachmentType}.`, error });
    } finally {
      setUploadingAttachmentType(null);
    }
  };

  const handleSubmitCreditNote = async () => {
    if (!claim) return;
    if (!creditNoteNumber.trim()) {
      showErrorToast({ title: 'Credit note number required', description: 'Enter a credit note number before submitting.' });
      return;
    }
    if (!creditNoteDate.trim()) {
      showErrorToast({ title: 'Credit note date required', description: 'Enter a credit note date before submitting.' });
      return;
    }
    if (creditNoteLines.length === 0) {
      showErrorToast({ title: 'Credit note line required', description: 'Add at least one credit note line.' });
      return;
    }

    const hasInvalidLine = creditNoteLines.some((line) => {
      if (!line.item_name.trim() || !line.charge_date.trim()) {
        return true;
      }
      const unitPrice = Number(line.unit_price);
      const quantity = Number(line.quantity);
      return !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0;
    });

    if (hasInvalidLine) {
      showErrorToast({
        title: 'Invalid credit note lines',
        description: 'Each line needs item name, charge date, positive unit price, and positive quantity.',
      });
      return;
    }

    try {
      await submitCreditNote.mutateAsync({
        id: claimId,
        data: {
          invoice_number: creditNoteNumber.trim(),
          invoice_date: creditNoteDate,
          lines: creditNoteLines.map((line, idx) => ({
            item_code: line.item_code.trim() || `CRN-ITEM-${idx + 1}`,
            item_name: line.item_name.trim(),
            charge_date: line.charge_date,
            unit_price: Number(line.unit_price),
            quantity: Number(line.quantity),
            line_number: idx + 1,
          })),
        },
      });
      setInlineError(null);
      pushWorkflowEvent('Credit note submitted');
      toast({ title: 'Credit note submitted' });
      setCreditNoteOpen(false);
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to submit credit note.', error });
    }
  };

  const handleOpenCreditNoteDialog = () => {
    setCreditNoteNumber(invoiceNumber ? `${invoiceNumber}-CRN` : '');
    setCreditNoteDate(new Date().toISOString());
    setCreditNoteLines([createEmptyCreditNoteLine()]);
    setCreditNoteOpen(true);
  };

  const updateCreditNoteLine = (
    lineIndex: number,
    field: keyof CreditNoteLineForm,
    value: string
  ) => {
    setCreditNoteLines((prev) =>
      prev.map((line, idx) => (idx === lineIndex ? { ...line, [field]: value } : line))
    );
  };

  const addCreditNoteLine = () => {
    setCreditNoteLines((prev) => [...prev, createEmptyCreditNoteLine()]);
  };

  const prefillCreditNoteFromInvoiceLines = () => {
    if (displayedLineItems.length === 0) {
      return;
    }
    const nextLines = displayedLineItems.map((item) => ({
      item_code: item.code || '',
      item_name: item.service,
      charge_date: creditNoteDate || new Date().toISOString(),
      unit_price: String(item.unitPrice),
      quantity: String(item.quantity),
    }));
    setCreditNoteLines(nextLines.length > 0 ? nextLines : [createEmptyCreditNoteLine()]);
  };

  const removeCreditNoteLine = (lineIndex: number) => {
    setCreditNoteLines((prev) => prev.filter((_, idx) => idx !== lineIndex));
  };


  const handleCheckRemittance = async () => {
    try {
      await checkRemittance.mutateAsync(claimId);
      setInlineError(null);
      pushWorkflowEvent('Claim remittance status refreshed');
      toast({ title: 'Remittance checked' });
      refetch();
    } catch (error) {
      showErrorToast({ title: 'Error', description: 'Failed to check remittance.', error });
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
  const allowManualAdjudication = !claim.is_healthcloud_enabled;
  const canApprove = allowManualAdjudication && ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canReject = allowManualAdjudication && ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canQuery = allowManualAdjudication && ['submitted', 'acknowledged', 'under_review'].includes(claim.status) && canAdjudicate;
  const canRespond = allowManualAdjudication && claim.status === 'query' && canSubmitClaims;
  const canMarkPaid = allowManualAdjudication && ['approved', 'partially_approved'].includes(claim.status) && canAdjudicate;
  const canAppeal = allowManualAdjudication && claim.is_appealable && canSubmitClaims;
  const hasValidatedAuthorization = session?.status === 'validated';
  const hasExternalClaim = Boolean(claim.external_claim_id);
  const hasActiveReservation = claim.latest_balance_reservation?.status === 'reserved';
  const hasInvoiceNumber = invoiceNumber.trim().length > 0;
  const hasReservationAmount = reservationAmount.trim().length > 0;
  const canReserveBalanceAction = Boolean(hasValidatedAuthorization && hasInvoiceNumber && hasReservationAmount);
  const canSubmitHealthcloudClaim = Boolean(hasValidatedAuthorization && hasActiveReservation);
  const canUploadAttachments = hasExternalClaim;
  const canSubmitInvoiceAction = Boolean(hasExternalClaim && hasActiveReservation && hasInvoiceNumber);
  const canSubmitCreditNoteAction = hasExternalClaim;
  const canSubmitCreditNoteForm =
    canSubmitCreditNoteAction
    && Boolean(creditNoteNumber.trim())
    && Boolean(creditNoteDate.trim())
    && creditNoteLines.length > 0
    && creditNoteLines.every((line) => {
      const unitPrice = Number(line.unit_price);
      const quantity = Number(line.quantity);
      return Boolean(line.item_name.trim())
        && Boolean(line.charge_date.trim())
        && Number.isFinite(unitPrice)
        && unitPrice > 0
        && Number.isFinite(quantity)
        && quantity > 0;
    });
  const canCheckRemittance = hasExternalClaim;
  const canRefreshExternalStatus = hasExternalClaim;
  const externalWorkflowStateRaw = claim.latest_submit_claim_external?.workflow_state;
  const externalWorkflowState =
    typeof externalWorkflowStateRaw === 'string' && externalWorkflowStateRaw.trim().length > 0
      ? externalWorkflowStateRaw
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Claim ${claim.claim_number}`}
        helpContent="View claim details, line items, and manage claim lifecycle."
        actions={
          <div className="flex items-center gap-2">
            {canRefreshExternalStatus && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshExternalStatus}
                disabled={refreshExternalStatus.isPending}
              >
                Refresh External Status
              </Button>
            )}
            {canCheckRemittance && (
              <Button size="sm" variant="outline" onClick={handleCheckRemittance} disabled={checkRemittance.isPending}>
                Check Remittance
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push('/insurance/claims')}>
              All Claims
            </Button>
          </div>
        }
      />

      {inlineError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{inlineError}</AlertDescription>
        </Alert>
      )}

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
          {externalWorkflowState && (
            <Badge variant="outline" className="shrink-0 w-fit text-[10px] uppercase tracking-wide">
              HC {externalWorkflowState}
            </Badge>
          )}
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
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Session</p>
            <p className="text-sm">
              {session
                ? `#${session.id} • ${session.workflow_step || session.status}`
                : 'No active HealthCloud session'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
            {workflowSteps.map((step) => (
              <button
                key={step.title}
                type="button"
                onClick={() => {
                  if (step.key === 'eligibility' || step.key === 'otp') focusStep(contactStepRef);
                  if (step.key === 'visit') focusStep(visitStepRef);
                  if (step.key === 'validate') focusStep(validateStepRef);
                  if (step.key === 'submit') focusStep(submitStepRef);
                }}
                className={`rounded-md border px-3 py-2 text-left text-xs transition hover:border-primary ${step.done ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : step.current ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30' : 'border-border bg-muted/30'}`}
              >
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.done ? 'Done' : step.current ? 'Current' : 'Pending'}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div ref={contactStepRef}>
              <Label>Contact ID (OTP)</Label>
              {eligibilityContacts.length > 0 ? (
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  <option value="" className="bg-background text-foreground">Select contact</option>
                  {eligibilityContacts.map((contact) => (
                    <option key={contact.id} value={String(contact.id)} className="bg-background text-foreground">
                      {contact.id} - {contact.contactValue}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  placeholder="e.g. 5531"
                />
              )}
              {(canRequestOtp || requestSessionOtp.isPending) && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleRequestOtp}
                    disabled={requestSessionOtp.isPending}
                  >
                    <Lock className="mr-1 h-3 w-3" /> Request OTP
                  </Button>
                </div>
              )}
            </div>
            <div ref={visitStepRef}>
              <Label>Beneficiary ID</Label>
              <Input value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} placeholder="Eligibility member.id" />
            </div>
            <div>
              <Label>Start Visit</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Uses the OTP sent to the selected contact; no manual OTP entry needed here.
              </p>
              {(canStartVisit || startSessionVisit.isPending) && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleStartVisit}
                    disabled={startSessionVisit.isPending}
                  >
                    <Shield className="mr-1 h-3 w-3" /> Start Visit
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Benefit Type</Label>
              <Input
                value={benefitType}
                onChange={(e) => setBenefitType(e.target.value)}
                placeholder="OUTPATIENT"
              />
            </div>
            <div>
              <Label>Benefit Code</Label>
              {eligibilityBenefits.length > 0 ? (
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground"
                  value={benefitCode}
                  onChange={(e) => {
                    const selectedCode = e.target.value;
                    setBenefitCode(selectedCode);
                    const selected = eligibilityBenefits.find(
                      (benefit) => benefit.benefitCode === selectedCode
                    );
                    if (selected?.benefitType) {
                      setBenefitType(selected.benefitType);
                    }
                  }}
                >
                  <option value="" className="bg-background text-foreground">Select benefit</option>
                  {eligibilityBenefits.map((benefit, idx) => (
                    <option
                      key={`${benefit.benefitCode || 'benefit'}-${idx}`}
                      value={benefit.benefitCode || ''}
                      className="bg-background text-foreground"
                    >
                      {benefit.benefitCode || 'N/A'} - {benefit.benefitName || 'Benefit'}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={benefitCode}
                  onChange={(e) => setBenefitCode(e.target.value)}
                  placeholder="340"
                />
              )}
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
              <Label>Session ID</Label>
              <Input value={session?.id ?? ''} readOnly placeholder="Start eligibility session" />
            </div>
            <div className="md:col-span-2" ref={validateStepRef}>
              <Label>Authorization Token</Label>
              <Input value={authorizationToken} onChange={(e) => setAuthorizationToken(e.target.value)} placeholder="Token from start visit" />
              {(canValidateToken || validateVisit.isPending) && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleValidateAuthorization}
                    disabled={validateVisit.isPending}
                  >
                    <ClipboardCheck className="mr-1 h-3 w-3" /> Validate Token
                  </Button>
                </div>
              )}
            </div>
            <div ref={reserveStepRef}>
              <Label>Reserve Amount (Shillings)</Label>
              <Input value={reservationAmount} onChange={(e) => setReservationAmount(e.target.value)} placeholder={claim.total_amount} />
              {claim.latest_balance_reservation && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCurrency(claim.latest_balance_reservation.amount)} shillings reserved
                </p>
              )}
              {!hasValidatedAuthorization && (
                <p className="mt-1 text-xs text-muted-foreground">Validate authorization token first.</p>
              )}
              {(session?.id || reserveBalance.isPending) && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleReserveBalance}
                    disabled={reserveBalance.isPending || !canReserveBalanceAction}
                  >
                    Reserve Balance
                  </Button>
                </div>
              )}
            </div>
            <div className="md:col-span-3 flex flex-col items-end gap-1">
              <Button size="sm" onClick={handleSubmitHealthcloudClaim} disabled={submitToHealthcloud.isPending || !canSubmitHealthcloudClaim}>
                Submit Claim to HealthCloud
              </Button>
              {!canSubmitHealthcloudClaim && (
                <p className="text-xs text-muted-foreground">Validate authorization and reserve balance before claim submission.</p>
              )}
            </div>
            <div className="md:col-span-3 rounded-md border p-3" ref={attachmentStepRef}>
              <p className="text-sm font-medium mb-2">Required claim attachments</p>
              <p className="text-xs text-muted-foreground mb-2">Submit claim first, then upload attachments.</p>
              <div className="space-y-2">
                {REQUIRED_ATTACHMENT_TYPES.map((type) => {
                  const selectedFile = attachmentFiles[type];
                  const uploadedForType = uploadedAttachments.some((item) => item.type === type || item.label.startsWith(type));
                  return (
                    <div key={type} className="rounded-md border p-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-medium">{type}</p>
                          <p className="text-xs text-muted-foreground">
                            {uploadedForType ? 'Uploaded in this session' : 'Pending upload'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            className="h-8 w-56"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setAttachmentFiles((prev) => ({ ...prev, [type]: file }));
                            }}
                            accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUploadAttachmentType(type)}
                            disabled={!canUploadAttachments || !selectedFile || uploadAttachmentFile.isPending || uploadingAttachmentType === type}
                          >
                            {uploadingAttachmentType === type && uploadAttachmentFile.isPending ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Uploading...
                              </>
                            ) : (
                              'Upload'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="md:col-span-3 rounded-md border p-2" ref={submitStepRef}>
              <p className="text-xs text-muted-foreground mb-1">Uploaded attachments</p>
              {uploadedAttachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attachments uploaded in this session yet.</p>
              ) : (
                <div className="space-y-1">
                  {uploadedAttachments.map((attachment, index) => (
                    <p key={`${attachment.ref}-${index}`} className="text-xs">
                      {attachment.label}: <span className="font-mono">{attachment.ref}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1" onClick={handleStartSession} disabled={startSession.isPending}>
              <Shield className="h-3 w-3" /> {startSession.isPending ? 'Running...' : '1. Run Eligibility'}
            </Button>
          </div>

          {eligibilityResult && (
            <HealthcloudEligibilityCards
              eligibility={eligibilityResult}
              patientName={claim.patient_name}
            />
          )}

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
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Line Items</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">Invoice Number</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" className="h-8 w-52" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<(typeof displayedLineItems)[number]>
            data={displayedLineItems}
            columns={[
              { key: 'service', header: 'Service', sortable: true, cell: (item) => (
                <div>
                  <p className="text-sm">{item.service}</p>
                  {item.code && <p className="text-xs text-muted-foreground font-mono">{item.code}</p>}
                </div>
              )},
              { key: 'quantity', header: 'Qty', sortable: true, sortType: 'number', cell: (item) => item.quantity },
              { key: 'unitPrice', header: 'Unit Price', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.unitPrice) },
              { key: 'claimed', header: 'Claimed', sortable: true, sortType: 'number', cell: (item) => formatCurrency(item.claimed) },
              { key: 'approved', header: 'Approved', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.approved) },
              { key: 'status', header: 'Status', cell: (item) => <Badge variant="secondary" className="text-xs">{item.status}</Badge> },
            ]}
            keyExtractor={(item) => item.id}
            emptyMessage="No line items from claim or linked invoice."
          />
          <div className="mt-4 flex flex-wrap justify-end gap-2 px-6 pb-2 sm:px-0">
            <Button size="sm" variant="secondary" onClick={handleSubmitInvoice} disabled={submitInvoice.isPending || !canSubmitInvoiceAction}>
              Submit Invoice
            </Button>
            <Dialog open={creditNoteOpen} onOpenChange={setCreditNoteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" onClick={handleOpenCreditNoteDialog} disabled={!canSubmitCreditNoteAction}>
                  Create Credit Note
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Credit Note</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Credit Note Number</Label>
                      <Input
                        value={creditNoteNumber}
                        onChange={(e) => setCreditNoteNumber(e.target.value)}
                        placeholder="INV-20260810-0001-CRN"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Credit Note Date (ISO)</Label>
                      <Input value={creditNoteDate} onChange={(e) => setCreditNoteDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {creditNoteLines.map((line, idx) => (
                      <div key={`credit-note-line-${idx}`} className="rounded-md border p-2 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          <Input
                            value={line.item_code}
                            onChange={(e) => updateCreditNoteLine(idx, 'item_code', e.target.value)}
                            placeholder="Item code (optional)"
                          />
                          <Input
                            value={line.item_name}
                            onChange={(e) => updateCreditNoteLine(idx, 'item_name', e.target.value)}
                            placeholder="Item name"
                          />
                          <Input
                            value={line.charge_date}
                            onChange={(e) => updateCreditNoteLine(idx, 'charge_date', e.target.value)}
                            placeholder="Charge date (ISO)"
                          />
                          <Input
                            type="number"
                            value={line.unit_price}
                            onChange={(e) => updateCreditNoteLine(idx, 'unit_price', e.target.value)}
                            placeholder="Unit price"
                          />
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateCreditNoteLine(idx, 'quantity', e.target.value)}
                            placeholder="Quantity"
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeCreditNoteLine(idx)}
                            disabled={creditNoteLines.length === 1}
                          >
                            Remove Line
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={prefillCreditNoteFromInvoiceLines}
                        disabled={displayedLineItems.length === 0}
                      >
                        Prefill from Invoice Lines
                      </Button>
                      <Button size="sm" variant="outline" onClick={addCreditNoteLine}>
                        Add Line
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCreditNoteOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSubmitCreditNote} disabled={submitCreditNote.isPending || !canSubmitCreditNoteForm}>
                        {submitCreditNote.isPending ? 'Submitting...' : 'Submit Credit Note'}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {(!canSubmitInvoiceAction || !canSubmitCreditNoteAction) && (
            <p className="px-6 pb-2 text-xs text-muted-foreground sm:px-0">
              Invoice actions unlock after claim submission. Invoice submission also requires active balance reservation.
            </p>
          )}
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
