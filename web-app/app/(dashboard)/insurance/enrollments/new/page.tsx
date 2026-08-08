'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  buildHealthcloudEligibilityView,
  HealthcloudEligibilityCards,
} from '@/components/insurance/healthcloud-eligibility-cards';
import {
  useCreateEnrollment,
  useInsurancePlans,
  useInsuranceProviders,
  useProviderConfigs,
  useVerifyEnrollmentViaHealthcloudPreview,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';
import { patientsApi } from '@/lib/api/patients';
import type { Patient } from '@/lib/types/patient';
import { useFacility } from '@/lib/context/facility-context';

type MatchConfidence = 'high' | 'medium' | 'low';

type SuggestedPatient = {
  patient: Patient;
  score: number;
  confidence: MatchConfidence;
};

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
  const [suggestedPatients, setSuggestedPatients] = useState<SuggestedPatient[]>([]);
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [patientMatchingLoading, setPatientMatchingLoading] = useState(false);
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
  const selectedProvider = providerOptions.find((provider) => String(provider.id) === providerId);
  const isEligibilityChecked = Boolean(eligibilityResult);
  const selectedProviderConfig = (providerConfigsData?.results ?? []).find(
    (cfg) => cfg.provider === Number(providerId)
  );
  const eligibilityView = buildHealthcloudEligibilityView(eligibilityResult);
  const resolvePlanFromEligibility = (result: VerifyViaHealthcloudResult | null) => {
    if (!result || !providerId) return undefined;
    const requestedPlanName = (result.plan_name || '').trim().toLowerCase();
    const providerPlans = (plansData?.results ?? []).filter((plan) => plan.provider === Number(providerId));
    if (providerPlans.length === 0) return undefined;
    const exactPlan = providerPlans.find((plan) => plan.name.trim().toLowerCase() === requestedPlanName);
    const fuzzyPlan = providerPlans.find((plan) => plan.name.trim().toLowerCase().includes(requestedPlanName));
    return exactPlan || fuzzyPlan || providerPlans[0];
  };

  const derivedResolvedPlan = resolvePlanFromEligibility(eligibilityResult);
  const effectivePlanId = planId || (derivedResolvedPlan ? String(derivedResolvedPlan.id) : '');
  const resolvedPlan = (plansData?.results ?? []).find((plan) => String(plan.id) === effectivePlanId);
  const resolvedPlanLabel = resolvedPlan
    ? `${resolvedPlan.provider_name} - ${resolvedPlan.name}`
    : String((eligibilityView?.cover?.schemeName ?? eligibilityResult?.plan_name) || 'N/A');

  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const digitsOnly = (value: string) => value.replace(/\D+/g, '');
  const patientLabel = (patient: Patient) => patient.full_name || `${patient.first_name} ${patient.last_name}`;

  const pickUniquePatients = (items: Patient[]) => {
    const map = new Map<number, Patient>();
    items.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };

  const scoreToConfidence = (score: number): MatchConfidence => {
    if (score >= 80) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  };

  const confidenceClasses: Record<MatchConfidence, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-slate-100 text-slate-700',
  };
  const missingRequirements: string[] = [];
  if (!isEligibilityChecked) missingRequirements.push('run eligibility precheck');
  if (!patientId) missingRequirements.push('select a matched patient');
  if (!effectivePlanId) missingRequirements.push('resolve plan from eligibility');

  useEffect(() => {
    if (!eligibilityResult || planId) return;
    if (derivedResolvedPlan) {
      setPlanId(String(derivedResolvedPlan.id));
    }
  }, [derivedResolvedPlan, eligibilityResult, planId]);

  const scorePatientCandidate = (
    patient: Patient,
    expectedName: string,
    expectedFirst: string,
    expectedLast: string,
    expectedIdLast4: string
  ) => {
    let score = 0;
    const label = normalize(patientLabel(patient));
    const first = normalize(patient.first_name || '');
    const last = normalize(patient.last_name || '');
    const fullExpected = normalize(expectedName);
    const firstExpected = normalize(expectedFirst);
    const lastExpected = normalize(expectedLast);

    if (fullExpected && label === fullExpected) score += 60;
    if (firstExpected && first === firstExpected) score += 20;
    if (lastExpected && last === lastExpected) score += 25;
    if (fullExpected && label.includes(fullExpected)) score += 10;

    const patientIds = [patient.identification_number || '', patient.national_id || ''];
    const patientDigits = patientIds.map(digitsOnly).filter(Boolean);
    if (expectedIdLast4) {
      if (patientDigits.some((v) => v.endsWith(expectedIdLast4))) score += 35;
      else if (patientDigits.some((v) => v.includes(expectedIdLast4))) score += 15;
    }

    return score;
  };

  const runPatientMatching = async (result: VerifyViaHealthcloudResult) => {
    const view = buildHealthcloudEligibilityView(result);
    const member = view?.member ?? {};
    const fullName = String(member.names || '').trim();
    const firstName = String(member.firstName || member.first_name || '').trim();
    const lastName = String(member.lastName || member.last_name || '').trim();
    const idCandidate = String(
      member.identification_number ||
      member.identificationNumber ||
      member.idNumber ||
      member.id_number ||
      member.national_id ||
      member.nationalId ||
      ''
    ).trim();
    const idLast4 = digitsOnly(idCandidate).slice(-4);
    const query = [fullName || [firstName, lastName].filter(Boolean).join(' ')].filter(Boolean).join(' ').trim();

    setPatientMatchingLoading(true);
    try {
      const matchedByName = query
        ? await patientsApi.getPatients({ search: query, page_size: 30 })
        : { results: [] };
      const ranked = (matchedByName.results ?? [])
        .map((patient) => ({
          patient,
          score: scorePatientCandidate(patient, fullName, firstName, lastName, idLast4),
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => ({
          patient: row.patient,
          score: row.score,
          confidence: scoreToConfidence(row.score),
        }));

      setSuggestedPatients(ranked.slice(0, 6));
      setSearchPatients([]);
      if (query) setPatientSearchTerm(query);
    } catch {
      setSuggestedPatients([]);
      setSearchPatients([]);
    } finally {
      setPatientMatchingLoading(false);
    }
  };

  const handleSearchPatients = async () => {
    if (patientSearchTerm.trim().length < 2) {
      toast({
        title: 'Search term too short',
        description: 'Enter at least 2 characters to search local patients.',
        variant: 'destructive',
      });
      return;
    }
    setPatientMatchingLoading(true);
    try {
      const response = await patientsApi.getPatients({ search: patientSearchTerm.trim(), page_size: 20 });
      setSearchPatients(response.results ?? []);
    } catch {
      toast({
        title: 'Patient search failed',
        description: 'Could not search local patients right now.',
        variant: 'destructive',
      });
      setSearchPatients([]);
    } finally {
      setPatientMatchingLoading(false);
    }
  };

  const handleVerifyEligibility = async () => {
    if (!providerId || !memberNumber) {
      toast({ title: 'Missing fields', description: 'Provider and member number are required for eligibility check.', variant: 'destructive' });
      return;
    }
    try {
      const result = await verifyPreview.mutateAsync({
        provider: Number(providerId),
        member_number: memberNumber,
        policy_number: policyNumber || undefined,
      });
      setEligibilityResult(result);

      if (typeof result.resolved_plan_id === 'number' && result.resolved_plan_id > 0) {
        setPlanId(String(result.resolved_plan_id));
      } else {
        const resolvedPlan = resolvePlanFromEligibility(result);
        if (resolvedPlan) {
          setPlanId(String(resolvedPlan.id));
        }
      }

      const nextEligibilityView = buildHealthcloudEligibilityView(result);
      const policyNumberFromEligibility = nextEligibilityView?.cover?.policyNumber;
      if (typeof policyNumberFromEligibility === 'string' && policyNumberFromEligibility) {
        setPolicyNumber(policyNumberFromEligibility);
      }
      const validFromFromEligibility = nextEligibilityView?.cover?.validFrom;
      if (typeof validFromFromEligibility === 'string' && validFromFromEligibility) {
        setValidFrom(validFromFromEligibility.slice(0, 10));
      }
      const validToFromEligibility = nextEligibilityView?.cover?.validTo;
      if (typeof validToFromEligibility === 'string' && validToFromEligibility) {
        setValidTo(validToFromEligibility.slice(0, 10));
      }
      if (result.member_number) {
        setMemberNumber(result.member_number);
      }

      await runPatientMatching(result);

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
    if (!isEligibilityChecked) {
      toast({
        title: 'Eligibility required',
        description: 'Run HealthCloud eligibility first. Enrollment details are populated from that response.',
        variant: 'destructive',
      });
      return;
    }
    if (!patientId || !effectivePlanId || !memberNumber || !providerId) {
      toast({
        title: 'Missing fields',
        description: 'Patient, payer, plan, and member number are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createEnrollment.mutateAsync({
        patient: patientId,
        plan: Number(effectivePlanId),
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
            <Label>{isEligibilityChecked ? 'Payer (from eligibility)' : 'Payer to check eligibility'}</Label>
            {isEligibilityChecked ? (
              <Input value={selectedProvider?.name || 'Unknown payer'} readOnly />
            ) : (
              <Select
                value={providerId}
                onValueChange={(value) => {
                  setProviderId(value);
                  setPlanId('');
                  setPatientId(null);
                  setSuggestedPatients([]);
                  setSearchPatients([]);
                  setEligibilityResult(null);
                  setPolicyNumber('');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select payer" /></SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.id} value={String(provider.id)}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {providerId && (
              <p className="text-xs text-muted-foreground mt-1">
                Payer Slade Code: {selectedProviderConfig?.payer_slade_code ?? 'Not configured'}
              </p>
            )}
          </div>
          <div>
            <Label>Member Number</Label>
            <Input
              value={memberNumber}
              onChange={(e) => {
                setMemberNumber(e.target.value);
                setEligibilityResult(null);
                setPlanId('');
                setPatientId(null);
                setSuggestedPatients([]);
                setSearchPatients([]);
              }}
            />
          </div>

          {isEligibilityChecked && (
            <>
              <div className="md:col-span-2 rounded-md border p-3 space-y-3">
                <div>
                  <Label>2. Match Local Patient</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggestions are ranked using HealthCloud names plus partial ID-number comparison where available.
                  </p>
                </div>

                {patientMatchingLoading && (
                  <p className="text-sm text-muted-foreground">Finding matching patients...</p>
                )}

                {!patientMatchingLoading && suggestedPatients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Suggested matches</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPatients.map((candidate) => (
                        <Button
                          key={candidate.patient.id}
                          type="button"
                          variant={patientId === candidate.patient.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPatientId(candidate.patient.id)}
                          className="gap-2"
                        >
                          <span>{patientLabel(candidate.patient)} ({candidate.patient.mrn})</span>
                          {patientId === candidate.patient.id && (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          )}
                          <Badge className={confidenceClasses[candidate.confidence]}>
                            {candidate.confidence}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                  <Input
                    value={patientSearchTerm}
                    onChange={(e) => setPatientSearchTerm(e.target.value)}
                    placeholder="Search patient by name or MRN"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSearchPatients()}
                    disabled={patientMatchingLoading}
                  >
                    Search Patients
                  </Button>
                </div>

                {!patientMatchingLoading && searchPatients.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Search results</p>
                    <div className="flex flex-wrap gap-2">
                      {pickUniquePatients(searchPatients).map((candidate) => (
                        <Button
                          key={`search-${candidate.id}`}
                          type="button"
                          variant={patientId === candidate.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPatientId(candidate.id)}
                        >
                          {patientLabel(candidate)} ({candidate.mrn})
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {patientId && (
                  <Badge variant="secondary">
                    Selected patient ID: {patientId}
                  </Badge>
                )}
              </div>

              <div>
                <Label>Plan (from eligibility)</Label>
                <Input value={resolvedPlanLabel} readOnly />
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
            </>
          )}
          {eligibilityResult && (
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Eligibility loaded</Badge>
                {eligibilityResult.eligible ? (
                  <Badge className="bg-green-100 text-green-800">Eligible</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">Not eligible</Badge>
                )}
                <Badge variant="outline">Member: {eligibilityResult.member_number || 'N/A'}</Badge>
              </div>

              <HealthcloudEligibilityCards
                eligibility={eligibilityResult}
                patientName={undefined}
              />

              <p className="text-xs text-muted-foreground">
                Session step starts after enrollment creation. Use "Start Session" on the enrollments page to launch OTP and visit authorization.
              </p>
            </div>
          )}
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleVerifyEligibility()}
              disabled={verifyPreview.isPending}
            >
              {verifyPreview.isPending ? 'Checking...' : '1. Run Eligibility Precheck'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/insurance/enrollments')}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createEnrollment.isPending || !isEligibilityChecked || !patientId || !effectivePlanId}>
              {createEnrollment.isPending ? 'Creating...' : 'Create Enrollment'}
            </Button>
          </div>
          <div className="md:col-span-2">
            {createEnrollment.isPending ? (
              <p className="text-xs text-muted-foreground">Creating enrollment...</p>
            ) : missingRequirements.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                To enable Create Enrollment: {missingRequirements.join(', ')}.
              </p>
            ) : (
              <p className="text-xs text-green-700">Ready to create enrollment.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
