'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DiagnosisCodeInput,
  emptyDiagnosisCodeValue,
  type DiagnosisCodeValue,
} from '@/components/shared/diagnosis-code-input';
import { buildHealthcloudEligibilityViewFromRaw } from '@/components/insurance/healthcloud-eligibility-cards';
import { useCreateClaim, useInsurancePlan, usePatientInsurances } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const claimTypeMatchesCopay = (claimType: 'outpatient' | 'inpatient', appliesTo: string[]) => {
  if (appliesTo.length === 0) return true;

  const outpatientKeywords = [
    'outpatient',
    'consultation',
    'opd',
    'clinic',
    'ambulatory',
    'generalconsultation',
  ];
  const inpatientKeywords = [
    'inpatient',
    'admission',
    'ward',
    'ipd',
    'hospitalization',
    'surgery',
  ];

  const normalized = appliesTo.map(normalizeToken).filter(Boolean);
  const bucket = claimType === 'outpatient' ? outpatientKeywords : inpatientKeywords;
  return normalized.some((token) => bucket.some((keyword) => token.includes(keyword)));
};

const resolveEligibilityRawPayload = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (obj.raw_response && typeof obj.raw_response === 'object') {
    return obj.raw_response as Record<string, unknown>;
  }
  if (obj.eligibility && typeof obj.eligibility === 'object') {
    const nested = resolveEligibilityRawPayload(obj.eligibility);
    if (nested) return nested;
  }
  if (obj.last_eligibility_payload && typeof obj.last_eligibility_payload === 'object') {
    const nested = resolveEligibilityRawPayload(obj.last_eligibility_payload);
    if (nested) return nested;
  }

  if (Array.isArray(obj.benefits) || (obj.cover && typeof obj.cover === 'object')) {
    return obj;
  }

  return null;
};

export default function NewInsuranceClaimPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const createClaim = useCreateClaim();
  const enrollmentFromQuery = searchParams.get('enrollment') || '';
  const authorizationFromQuery = searchParams.get('authorization') || '';
  const { data: enrollmentsData, isLoading: enrollmentsLoading } = usePatientInsurances({
    page: 1,
    page_size: 200,
  });

  const enrollments = enrollmentsData?.results ?? [];

  const [patientInsuranceId, setPatientInsuranceId] = useState<string>(enrollmentFromQuery);
  const [claimType, setClaimType] = useState<'outpatient' | 'inpatient'>('outpatient');
  const [serviceDate, setServiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [copayAmount, setCopayAmount] = useState<string>('0.00');
  const [diagnosisCodes, setDiagnosisCodes] = useState<DiagnosisCodeValue[]>([emptyDiagnosisCodeValue()]);
  const [notes, setNotes] = useState<string>('');

  const selectedEnrollment = enrollments.find((e) => String(e.id) === patientInsuranceId);
  const { data: selectedPlan } = useInsurancePlan(selectedEnrollment?.plan);
  const eligibilityRawPayload = useMemo(
    () => resolveEligibilityRawPayload(selectedEnrollment?.last_eligibility_payload),
    [selectedEnrollment?.last_eligibility_payload]
  );
  const eligibilityView = useMemo(
    () => buildHealthcloudEligibilityViewFromRaw(eligibilityRawPayload),
    [eligibilityRawPayload]
  );

  const inferredClaimType = useMemo<'outpatient' | 'inpatient' | null>(() => {
    if (!selectedEnrollment) return null;

    if (selectedPlan?.coverage_type === 'inpatient') return 'inpatient';
    if (selectedPlan?.coverage_type === 'outpatient') return 'outpatient';

    const name = selectedEnrollment.plan_name.toLowerCase();
    if (name.includes('inpatient') && !name.includes('outpatient')) return 'inpatient';
    if (name.includes('outpatient') && !name.includes('inpatient')) return 'outpatient';

    return null;
  }, [selectedEnrollment, selectedPlan?.coverage_type]);

  useEffect(() => {
    if (inferredClaimType) {
      setClaimType(inferredClaimType);
    }
  }, [inferredClaimType]);

  const recommendedCopay = useMemo(() => {
    if (!eligibilityView) return null;

    const candidates: Array<{ amount: number; source: string; appliesTo: string[]; strictMatch: boolean }> = [];

    eligibilityView.benefits.forEach((benefit) => {
      if (typeof benefit.copayValue !== 'number' || benefit.copayValue < 0) return;
      const appliesTo = benefit.copayAppliesTo ?? [];
      const strictMatch = appliesTo.length > 0;
      if (!claimTypeMatchesCopay(claimType, appliesTo)) return;
      const source = benefit.benefitName || benefit.benefitCode || 'Benefit';
      candidates.push({ amount: benefit.copayValue, source, appliesTo, strictMatch });
    });

    if (candidates.length === 0 && typeof eligibilityView.coverCopay.value === 'number') {
      const appliesTo = eligibilityView.coverCopay.appliesTo;
      if (claimTypeMatchesCopay(claimType, appliesTo)) {
        candidates.push({
          amount: eligibilityView.coverCopay.value,
          source: 'Cover-level copay',
          appliesTo,
          strictMatch: appliesTo.length > 0,
        });
      }
    }

    if (candidates.length === 0) return null;

    const sorted = candidates.sort((a, b) => {
      if (a.strictMatch !== b.strictMatch) return a.strictMatch ? -1 : 1;
      return b.amount - a.amount;
    });
    return sorted[0] ?? null;
  }, [claimType, eligibilityView]);

  const copayMatchBadge = useMemo(() => {
    if (!recommendedCopay) return null;
    if (recommendedCopay.source === 'Cover-level copay') {
      return {
        label: 'Fallback cover-level copay',
        className: 'bg-amber-100 text-amber-900',
      };
    }
    return {
      label: `Copay matched ${claimType} rule`,
      className: 'bg-green-100 text-green-900',
    };
  }, [claimType, recommendedCopay]);

  useEffect(() => {
    if (!recommendedCopay) {
      setCopayAmount('0.00');
      return;
    }
    setCopayAmount(recommendedCopay.amount.toFixed(2));
  }, [recommendedCopay]);

  const extractDiagnosisCode = (value: DiagnosisCodeValue): string | null => {
    if (value.icd10Display) {
      return value.icd10Display.split(' - ')[0] || value.icd10Display;
    }
    if (value.icd11Code) return value.icd11Code;
    if (value.snomedCode) return value.snomedCode;
    return null;
  };

  const handleDiagnosisChange = (index: number, next: DiagnosisCodeValue) => {
    setDiagnosisCodes((prev) => prev.map((item, idx) => (idx === index ? next : item)));
  };

  const handleAddDiagnosis = () => {
    setDiagnosisCodes((prev) => [...prev, emptyDiagnosisCodeValue()]);
  };

  const handleRemoveDiagnosis = (index: number) => {
    setDiagnosisCodes((prev) => {
      if (prev.length <= 1) return [emptyDiagnosisCodeValue()];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleCreate = async () => {
    if (!selectedEnrollment) {
      toast({ title: 'Missing enrollment', description: 'Select an active patient insurance first.', variant: 'destructive' });
      return;
    }
    if (!totalAmount) {
      toast({ title: 'Missing amount', description: 'Enter total claim amount.', variant: 'destructive' });
      return;
    }

    try {
      const created = await createClaim.mutateAsync({
        patient_insurance: selectedEnrollment.id,
        patient: selectedEnrollment.patient,
        claim_type: claimType,
        service_date: serviceDate,
        total_amount: totalAmount,
        copay_amount: copayAmount || '0.00',
        diagnosis_codes: diagnosisCodes
          .map(extractDiagnosisCode)
          .filter((code): code is string => !!code),
        notes: notes || undefined,
      });

      toast({ title: 'Claim created', description: `Claim ${created.claim_number} created successfully.` });
      router.push(`/insurance/claims/${created.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create claim.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="New Insurance Claim" helpContent="Create a private insurance claim from an active enrollment." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authorizationFromQuery && (
            <p className="text-xs text-muted-foreground">
              Opened from authorization session #{authorizationFromQuery}. Complete claim details below.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Patient Insurance</Label>
              <Select value={patientInsuranceId} onValueChange={setPatientInsuranceId}>
                <SelectTrigger>
                  <SelectValue placeholder={enrollmentsLoading ? 'Loading enrollments...' : 'Select active enrollment'} />
                </SelectTrigger>
                <SelectContent>
                  {enrollments.map((enrollment) => (
                    <SelectItem key={enrollment.id} value={String(enrollment.id)}>
                      {enrollment.patient_name} - {enrollment.member_number} ({enrollment.provider_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Claim Type</Label>
              <Select value={claimType} onValueChange={(v) => setClaimType(v as 'outpatient' | 'inpatient')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outpatient">Outpatient</SelectItem>
                  <SelectItem value="inpatient">Inpatient</SelectItem>
                </SelectContent>
              </Select>
              {inferredClaimType && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-detected from enrollment: {inferredClaimType}
                </p>
              )}
            </div>

            <div>
              <Label>Service Date</Label>
              <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </div>

            <div>
              <Label>Total Amount</Label>
              <Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" />
            </div>

            <div>
              <Label>Co-pay Amount</Label>
              <Input value={copayAmount} onChange={(e) => setCopayAmount(e.target.value)} placeholder="0.00" />
              {copayMatchBadge && (
                <div className="mt-1">
                  <Badge className={copayMatchBadge.className}>{copayMatchBadge.label}</Badge>
                </div>
              )}
              {recommendedCopay ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-filled from eligibility ({recommendedCopay.source})
                  {recommendedCopay.appliesTo.length > 0
                    ? ` - applies to ${recommendedCopay.appliesTo.join(', ')}`
                    : ''}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  No copay rule matched the selected claim type from eligibility payload.
                </p>
              )}
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Diagnoses</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddDiagnosis}>
                  Add Diagnosis
                </Button>
              </div>

              {diagnosisCodes.map((diagnosisCode, index) => (
                <div key={`diagnosis-${index}`} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Diagnosis {index + 1}</p>
                    {diagnosisCodes.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDiagnosis(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <DiagnosisCodeInput
                    value={diagnosisCode}
                    onChange={(next) => handleDiagnosisChange(index, next)}
                    label=""
                    placeholder="Search diagnosis code"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => router.push('/insurance/claims')}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createClaim.isPending}>
              {createClaim.isPending ? 'Creating...' : 'Create Claim'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
