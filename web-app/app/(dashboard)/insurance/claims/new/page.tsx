'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
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
import { useCreateClaim, useInsurancePlan, usePatientInsurances } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';

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
  const [diagnosisCode, setDiagnosisCode] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());
  const [notes, setNotes] = useState<string>('');

  const selectedEnrollment = enrollments.find((e) => String(e.id) === patientInsuranceId);
  const { data: selectedPlan } = useInsurancePlan(selectedEnrollment?.plan);

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
        diagnosis_codes: diagnosisCode.icd10Display
          ? [diagnosisCode.icd10Display.split(' - ')[0] || diagnosisCode.icd10Display]
          : diagnosisCode.icd11Code
          ? [diagnosisCode.icd11Code]
          : diagnosisCode.snomedCode
          ? [diagnosisCode.snomedCode]
          : [],
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
            </div>

            <DiagnosisCodeInput
              value={diagnosisCode}
              onChange={setDiagnosisCode}
              label="Diagnosis"
              placeholder="Search diagnosis code"
            />
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
