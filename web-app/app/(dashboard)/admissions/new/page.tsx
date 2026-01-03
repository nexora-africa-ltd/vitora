'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/lib/auth';
import {
  useBeds,
  useCreateAdmission,
  useInpatientWards,
} from '@/lib/hooks/use-inpatient';

export default function NewAdmissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();

  const patientIdParam = searchParams.get('patient');
  const patientId = patientIdParam ? Number(patientIdParam) : null;

  const [wardId, setWardId] = useState<string>('');
  const [bedId, setBedId] = useState<string>('');
  const [payerType, setPayerType] = useState<'CASH' | 'SHA' | 'CORPORATE'>('CASH');
  const [admittingDiagnosis, setAdmittingDiagnosis] = useState('');
  const [admittingDiagnosisText, setAdmittingDiagnosisText] = useState('');

  const { data: wards } = useInpatientWards();
  const selectedWardId = useMemo(() => (wardId ? Number(wardId) : undefined), [wardId]);
  const { data: beds } = useBeds({ ward: selectedWardId, status: 'AVAILABLE' });
  const createAdmission = useCreateAdmission();

  const canSubmit = !!patientId && !!wardId && !!bedId && !!admittingDiagnosis && !!admittingDiagnosisText;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href="/admissions" className="text-sm text-muted-foreground hover:text-primary">
          Back to Admissions
        </Link>
      </div>

      <PageHeader title="New Admission" description="Create an inpatient admission record" />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Patient ID</Label>
            <Input value={patientId ?? ''} readOnly placeholder="Select a patient first" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ward</Label>
              <Select value={wardId} onValueChange={(v) => {
                setWardId(v);
                setBedId('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {(wards ?? []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bed</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!wardId}>
                <SelectTrigger>
                  <SelectValue placeholder={wardId ? 'Select bed' : 'Select a ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(beds) ? beds : beds?.results ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bed_number} ({b.status_display ?? b.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Admitting Diagnosis (ICD-10)</Label>
              <Input
                value={admittingDiagnosis}
                onChange={(e) => setAdmittingDiagnosis(e.target.value)}
                placeholder="e.g., B50.0"
              />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis Text</Label>
              <Input
                value={admittingDiagnosisText}
                onChange={(e) => setAdmittingDiagnosisText(e.target.value)}
                placeholder="e.g., Severe falciparum malaria"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payer Type</Label>
            <Select value={payerType} onValueChange={(v) => setPayerType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="SHA">SHA Insurance</SelectItem>
                <SelectItem value="CORPORATE">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={!canSubmit || createAdmission.isPending}
              onClick={async () => {
                if (!patientId) return;
                const admissionDate = new Date().toISOString();

                await createAdmission.mutateAsync({
                  patient: patientId,
                  ward: Number(wardId),
                  bed: Number(bedId),
                  payer_type: payerType,
                  admission_date: admissionDate,
                  admitting_diagnosis: admittingDiagnosis,
                  admitting_diagnosis_text: admittingDiagnosisText,
                  admitting_officer: user.id,
                });

                router.push('/admissions');
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Create Admission
            </Button>
            {createAdmission.error && (
              <p className="text-sm text-destructive">Failed to create admission</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
