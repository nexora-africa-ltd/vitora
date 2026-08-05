'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useCreateEnrollment,
  useInsurancePlans,
  useInsuranceProviders,
  useProviderConfigs,
  useVerifyEnrollmentViaHealthcloudPreview,
} from '@/lib/hooks/use-insurance';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { useToast } from '@/lib/hooks/use-toast';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';
import { useFacility } from '@/lib/context/facility-context';

export default function NewInsuranceEnrollmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { facility, organization } = useFacility();
  const createEnrollment = useCreateEnrollment();
  const verifyPreview = useVerifyEnrollmentViaHealthcloudPreview();
  const { data: plansData } = useInsurancePlans(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const { data: providersData } = useInsuranceProviders(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const { data: providerConfigsData } = useProviderConfigs(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );

  const [patientId, setPatientId] = useState<number | null>(null);
  const [providerId, setProviderId] = useState('');
  const [planId, setPlanId] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10));
  const [eligibilityResult, setEligibilityResult] = useState<VerifyViaHealthcloudResult | null>(null);

  const filteredPlans = (plansData?.results ?? []).filter((p) =>
    providerId ? p.provider === Number(providerId) : true
  );
  const providerOptions = ((providersData?.results ?? []).length > 0
    ? providersData?.results
    : Array.from(
        new Map((plansData?.results ?? []).map((p) => [p.provider, { id: p.provider, name: p.provider_name }])).values()
      )) ?? [];
  const selectedProviderConfig = (providerConfigsData?.results ?? []).find(
    (cfg) => cfg.provider === Number(providerId)
  );

  const handleVerifyEligibility = async () => {
    if (!providerId || !memberNumber) {
      toast({ title: 'Missing fields', description: 'Provider and member number are required for eligibility check.', variant: 'destructive' });
      return;
    }
    try {
      const result = await verifyPreview.mutateAsync({
        provider: Number(providerId),
        plan: planId ? Number(planId) : undefined,
        member_number: memberNumber,
        policy_number: policyNumber || undefined,
      });
      setEligibilityResult(result);
      toast({
        title: result.eligible ? 'Eligible' : 'Not eligible',
        description: result.message,
        variant: result.eligible ? 'default' : 'destructive',
      });
    } catch {
      toast({ title: 'Error', description: 'Eligibility check failed.', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!patientId || !planId || !memberNumber) {
      toast({ title: 'Missing fields', description: 'Patient, plan, and member number are required.', variant: 'destructive' });
      return;
    }
    try {
      await createEnrollment.mutateAsync({
        patient: patientId,
        plan: Number(planId),
        member_number: memberNumber,
        policy_number: policyNumber || undefined,
        status: eligibilityResult ? (eligibilityResult.eligible ? 'active' : 'pending_verification') : undefined,
        annual_balance: eligibilityResult?.annual_balance ?? undefined,
        valid_from: validFrom,
        valid_to: validTo,
      });
      toast({ title: 'Enrollment created' });
      router.push('/insurance/enrollments');
    } catch {
      toast({ title: 'Error', description: 'Failed to create enrollment.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="New Insurance Enrollment" helpContent="Link a patient to an insurance plan." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Patient</Label>
            <PatientSearchInput
              value={patientId}
              onChange={setPatientId}
              placeholder="Search patient by name or MRN"
            />
          </div>
          <div>
            <Label>Provider</Label>
            <Select
              value={providerId}
              onValueChange={(value) => {
                setProviderId(value);
                setPlanId('');
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {providerOptions.map((provider) => (
                  <SelectItem key={provider.id} value={String(provider.id)}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {providerId && (
              <p className="text-xs text-muted-foreground mt-1">
                Payer Slade Code: {selectedProviderConfig?.payer_slade_code ?? 'Not configured'}
              </p>
            )}
          </div>
          <div>
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>
                {filteredPlans.map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>{plan.provider_name} - {plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Member Number</Label>
            <Input value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} />
          </div>
          <div>
            <Label>Policy Number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </div>
          <div>
            <Label>Valid From</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label>Valid To</Label>
            <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleVerifyEligibility()}
              disabled={verifyPreview.isPending}
            >
              {verifyPreview.isPending ? 'Verifying...' : 'Verify Eligibility'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createEnrollment.isPending}>
              {createEnrollment.isPending ? 'Creating...' : 'Create Enrollment'}
            </Button>
          </div>
          {eligibilityResult && (
            <div className="md:col-span-2 rounded-md border p-3 text-sm">
              <p className="font-medium">Eligibility: {eligibilityResult.eligible ? 'Eligible' : 'Not eligible'}</p>
              <p className="text-muted-foreground">Status: {eligibilityResult.status || 'N/A'}</p>
              <p className="text-muted-foreground">Plan: {eligibilityResult.plan_name || 'N/A'}</p>
              <p className="text-muted-foreground">Member: {eligibilityResult.member_number || 'N/A'}</p>
              {eligibilityResult.annual_balance && (
                <p className="text-muted-foreground">Annual Balance: {eligibilityResult.annual_balance}</p>
              )}
              {eligibilityResult.copay_percent && (
                <p className="text-muted-foreground">Copay %: {eligibilityResult.copay_percent}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
