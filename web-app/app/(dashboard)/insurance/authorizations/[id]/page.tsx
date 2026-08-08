'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  HealthcloudEligibilityCards,
} from '@/components/insurance/healthcloud-eligibility-cards';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useProviderConfig,
  useRequestHealthcloudSessionOtp,
  useStartHealthcloudSessionVisit,
  useValidateVisitAuthorization,
  useVisitAuthorization,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';

export default function AuthorizationSessionDetailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const sessionId = Number(params?.id);
  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useVisitAuthorization(Number.isFinite(sessionId) ? sessionId : undefined);
  const { data: providerConfig } = useProviderConfig(session?.provider_config);
  const requestOtp = useRequestHealthcloudSessionOtp();
  const startVisit = useStartHealthcloudSessionVisit();
  const validateToken = useValidateVisitAuthorization();

  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedBenefitCode, setSelectedBenefitCode] = useState('');
  const [otp, setOtp] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState('');
  const [authToken, setAuthToken] = useState('');

  const eligibilityPayload = useMemo(
    () => (session?.eligibility_payload && typeof session.eligibility_payload === 'object'
      ? (session.eligibility_payload as Record<string, unknown>)
      : {}),
    [session?.eligibility_payload]
  );

  const member = eligibilityPayload.member && typeof eligibilityPayload.member === 'object'
    ? (eligibilityPayload.member as Record<string, unknown>)
    : {};
  const cover = eligibilityPayload.cover && typeof eligibilityPayload.cover === 'object'
    ? (eligibilityPayload.cover as Record<string, unknown>)
    : {};
  const contacts = Array.isArray(member.contacts)
    ? member.contacts
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({ id: Number(row.id ?? 0), value: String(row.contactValue ?? '') }))
        .filter((row) => row.id > 0)
    : [];
  const benefits = Array.isArray(eligibilityPayload.benefits)
    ? eligibilityPayload.benefits
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          code: String(row.benefitCode ?? ''),
          type: String(row.benefitType ?? ''),
          name: String(row.benefitName ?? 'Unknown benefit'),
        }))
        .filter((row) => row.code)
    : [];

  const selectedBenefit = benefits.find((b) => b.code === selectedBenefitCode);
  const isValidated = session?.workflow_step === 'authorization_validated' || session?.status === 'validated';
  const hasEncounter = Boolean(session?.encounter);
  const requireBalanceReservation = Boolean(providerConfig?.require_balance_reservation);
  const openEncounterUrl = hasEncounter
    ? `/encounters/${session?.encounter}/edit`
    : `/encounters/new?patient=${session?.patient}&returnTo=${encodeURIComponent(`/insurance/authorizations/${sessionId}`)}`;
  const claimUrl = `/insurance/claims/new?enrollment=${session?.enrollment ?? ''}&patient=${session?.patient ?? ''}&authorization=${session?.id ?? ''}`;
  const canRequestOtp = session?.workflow_step === 'eligibility_verified' || session?.workflow_step === 'otp_requested';
  const canStartVisit = session?.status === 'otp_requested' || session?.workflow_step === 'otp_requested';
  const canValidate = session?.status === 'authorized' || session?.workflow_step === 'visit_authorized';

  const progressStep = (() => {
    if (!session) return 0;
    if (session.workflow_step === 'authorization_validated' || session.status === 'validated') return 3;
    if (session.workflow_step === 'visit_authorized' || session.status === 'authorized') return 2;
    if (session.workflow_step === 'otp_requested' || session.status === 'otp_requested') return 1;
    return 0;
  })();

  const stepBadge = (step: 1 | 2 | 3): { label: string; className: string } => {
    if (progressStep >= step) {
      return { label: 'Completed', className: 'bg-green-100 text-green-800' };
    }
    if (progressStep + 1 === step) {
      return { label: 'Ready', className: 'bg-blue-100 text-blue-800' };
    }
    return { label: 'Waiting', className: 'bg-slate-100 text-slate-700' };
  };

  const eligibilityCardModel: VerifyViaHealthcloudResult | null = session
    ? {
        eligible: true,
        status: session.auth_status || session.status,
        plan_name: String(cover.schemeName ?? ''),
        member_number: session.member_number,
        annual_balance: null,
        copay_percent: null,
        message: 'Snapshot captured for this session.',
        raw_response: eligibilityPayload,
      }
    : null;

  const firstName = (session?.patient_name || '').trim().split(/\s+/)[0] || session?.patient_name || '';
  const lastName = (session?.patient_name || '').trim().split(/\s+/).slice(1).join(' ') || session?.patient_name || '';

  useEffect(() => {
    if (!session) return;
    if (!selectedContactId && session.selected_beneficiary_contact_id) {
      setSelectedContactId(String(session.selected_beneficiary_contact_id));
    } else if (!selectedContactId && contacts[0]?.id) {
      setSelectedContactId(String(contacts[0].id));
    }
    if (!selectedBenefitCode && session.selected_benefit_code) {
      setSelectedBenefitCode(session.selected_benefit_code);
    } else if (!selectedBenefitCode && benefits[0]?.code) {
      setSelectedBenefitCode(benefits[0].code);
    }
    if (!policyNumber) {
      setPolicyNumber(String(cover.policyNumber ?? session.policy_number ?? ''));
    }
    if (!policyEffectiveDate) {
      const value = String(cover.validFrom ?? '').slice(0, 10);
      if (value) setPolicyEffectiveDate(value);
    }
    if (!authToken && session.auth_token) {
      setAuthToken(session.auth_token);
    }
  }, [
    authToken,
    benefits,
    contacts,
    cover.policyNumber,
    cover.validFrom,
    policyEffectiveDate,
    policyNumber,
    selectedBenefitCode,
    selectedContactId,
    session,
  ]);

  const handleRequestOtp = async () => {
    if (!session || !selectedContactId) return;
    try {
      const response = await requestOtp.mutateAsync({
        id: session.enrollment,
        data: { session_id: session.id, contact_id: Number(selectedContactId) },
      });
      const raw = response.raw_payload && typeof response.raw_payload === 'object'
        ? (response.raw_payload as Record<string, unknown>)
        : {};
      const otpMessage = typeof raw.success === 'string' ? raw.success : '';
      if (process.env.NODE_ENV !== 'production' && otpMessage) {
        const match = otpMessage.match(/\b(\d{4,8})\b/);
        if (match?.[1]) {
          setOtp(match[1]);
        }
      }
      toast({
        title: 'OTP requested',
        description: otpMessage || 'OTP request sent successfully.',
      });
      await refetch();
    } catch {
      toast({ title: 'OTP request failed', description: 'Could not request OTP.', variant: 'destructive' });
    }
  };

  const handleStartVisit = async () => {
    if (!session || !selectedContactId || !selectedBenefit || !otp || !policyNumber || !policyEffectiveDate) {
      toast({
        title: 'Missing fields',
        description: 'Contact, benefit, OTP, policy number, and policy effective date are required.',
        variant: 'destructive',
      });
      return;
    }
    const beneficiaryId = Number(member.id ?? session.beneficiary_id ?? 0);
    if (!beneficiaryId) {
      toast({ title: 'Missing beneficiary', description: 'No beneficiary ID found in session payload.', variant: 'destructive' });
      return;
    }

    try {
      await startVisit.mutateAsync({
        id: session.enrollment,
        data: {
          session_id: session.id,
          beneficiary_id: beneficiaryId,
          benefit_type: selectedBenefit.type,
          benefit_code: selectedBenefit.code,
          policy_number: policyNumber,
          policy_effective_date: policyEffectiveDate,
          otp,
          beneficiary_contact: Number(selectedContactId),
          scheme_name: String(cover.schemeName ?? ''),
          scheme_code: String(cover.schemeCode ?? ''),
        },
      });
      toast({ title: 'Visit authorization started' });
      await refetch();
    } catch {
      toast({ title: 'Start visit failed', description: 'Could not start visit authorization.', variant: 'destructive' });
    }
  };

  const handleValidate = async () => {
    if (!session || !authToken) {
      toast({ title: 'Missing token', description: 'Provide an auth token to validate.', variant: 'destructive' });
      return;
    }
    try {
      await validateToken.mutateAsync({
        id: session.id,
        data: {
          first_name: firstName,
          last_name: lastName,
          member_number: session.member_number,
          auth_token: authToken,
          scheme_code: String(cover.schemeCode ?? ''),
          scheme_name: String(cover.schemeName ?? ''),
          payer_code: session.payer_slade_code ? String(session.payer_slade_code) : undefined,
        },
      });
      toast({ title: 'Authorization validated' });
      await refetch();
    } catch {
      toast({ title: 'Validation failed', description: 'Could not validate authorization token.', variant: 'destructive' });
    }
  };

  if (!Number.isFinite(sessionId)) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Session" />
        <Card>
          <CardContent className="p-4">Invalid session ID.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`HealthCloud Session #${sessionId}`}
        helpContent="Review session state before OTP, visit authorization, and validation steps."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/insurance/authorizations')}>
              All Sessions
            </Button>
            <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>
              Enrollments
            </Button>
          </div>
        }
      />

      {isLoading && (
        <Card>
          <CardContent className="p-4">Loading session...</CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="p-4">Failed to load session details.</CardContent>
        </Card>
      )}

      {session && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Patient</p>
                <p className="font-medium">{session.patient_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member Number</p>
                <p className="font-medium">{session.member_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="secondary">{session.status.replace('_', ' ')}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Workflow Step</p>
                <p className="font-medium">{session.workflow_step || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Authorization GUID</p>
                <p className="font-medium">{session.authorization_guid || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Auth Token</p>
                <p className="font-medium">{session.auth_token || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Policy Number</p>
                <p className="font-medium">{policyNumber || session.policy_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Policy Effective Date</p>
                <p className="font-medium">{policyEffectiveDate || 'N/A'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Step 1</p>
                  <p className="font-medium">Request OTP</p>
                  <p className="text-xs text-muted-foreground">Send OTP to beneficiary contact.</p>
                  <Badge className={`mt-2 ${stepBadge(1).className}`}>
                    {stepBadge(1).label}
                  </Badge>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Step 2</p>
                  <p className="font-medium">Start Visit</p>
                  <p className="text-xs text-muted-foreground">Submit OTP + benefit selection.</p>
                  <Badge className={`mt-2 ${stepBadge(2).className}`}>
                    {stepBadge(2).label}
                  </Badge>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Step 3</p>
                  <p className="font-medium">Validate Token</p>
                  <p className="text-xs text-muted-foreground">Confirm authorization token.</p>
                  <Badge className={`mt-2 ${stepBadge(3).className}`}>
                    {stepBadge(3).label}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Benefit</Label>
                  <Select value={selectedBenefitCode || undefined} onValueChange={setSelectedBenefitCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select benefit" />
                    </SelectTrigger>
                    <SelectContent>
                      {benefits.map((benefit) => (
                        <SelectItem key={benefit.code} value={benefit.code}>
                          {benefit.name} ({benefit.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Beneficiary Contact + OTP + Authorization Token</Label>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_auto_150px_auto_190px_auto]">
                    <Select value={selectedContactId || undefined} onValueChange={setSelectedContactId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select contact" />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts.map((contact) => (
                          <SelectItem key={contact.id} value={String(contact.id)}>
                            {contact.id}: {contact.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      disabled={!canRequestOtp || requestOtp.isPending || !selectedContactId}
                      onClick={() => void handleRequestOtp()}
                    >
                      {requestOtp.isPending ? 'Requesting OTP...' : 'Send OTP'}
                    </Button>
                    <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter OTP" />
                    <Button
                      disabled={
                        !canStartVisit ||
                        startVisit.isPending ||
                        !selectedContactId ||
                        !selectedBenefit ||
                        !otp
                      }
                      onClick={() => void handleStartVisit()}
                    >
                      {startVisit.isPending ? 'Starting Visit...' : '1. Start Visit Authorization'}
                    </Button>
                    <Input value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="Authorization token" />
                    <Button
                      variant="secondary"
                      disabled={!canValidate || validateToken.isPending || !authToken}
                      onClick={() => void handleValidate()}
                    >
                      {validateToken.isPending ? 'Validating...' : '2. Validate Token'}
                    </Button>
                  </div>
                </div>
              </div>

              {isValidated && (
                <div className="rounded border p-3 space-y-3">
                  <p className="text-sm font-medium">After Validation</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => router.push(openEncounterUrl)}>
                      Open/Select Encounter
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!hasEncounter}
                      onClick={() => router.push(claimUrl)}
                    >
                      Proceed to Billing/Claim
                    </Button>
                    {requireBalanceReservation && (
                      <Button
                        variant="outline"
                        disabled={!hasEncounter}
                        onClick={() => router.push(claimUrl)}
                      >
                        Reserve Balance
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>
                      Back to Enrollments
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Proceed to Billing/Claim is enabled after an encounter is linked. Reserve Balance appears when provider config requires it and runs from the claim workflow.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {eligibilityCardModel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eligibility Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <HealthcloudEligibilityCards eligibility={eligibilityCardModel} patientName={session.patient_name} showRaw={false} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eligibility Payload</CardTitle>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Expand raw eligibility payload
                </summary>
                <pre className="mt-3 max-h-[480px] overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(session.eligibility_payload || {}, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
