'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save } from 'lucide-react';
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
import { useCreateAdmissionRecommendation } from '@/lib/hooks/use-inpatient';

export default function NewAdmissionRecommendationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();

  const encounterIdParam = searchParams.get('encounter');
  const encounterId = encounterIdParam ? Number(encounterIdParam) : null;

  const [reason, setReason] = useState('');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState('');
  const [provisionalDiagnosisText, setProvisionalDiagnosisText] = useState('');
  const [urgency, setUrgency] = useState<'ROUTINE' | 'URGENT' | 'EMERGENCY'>('URGENT');
  const [preferredWardType, setPreferredWardType] = useState<
    'MEDICAL' | 'SURGICAL' | 'PEDIATRIC' | 'MATERNITY' | 'ICU' | 'ISOLATION'
  >('MEDICAL');

  const createRecommendation = useCreateAdmissionRecommendation();
  const canSubmit = !!encounterId && !!reason && !!provisionalDiagnosis && !!provisionalDiagnosisText && !!user;

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Recommend for Admission"
        helpContent="Create an OPD → IPD admission recommendation for a patient who requires inpatient care."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recommendation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Encounter ID</Label>
            <Input value={encounterId ?? ''} readOnly placeholder="Select an encounter" />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for admission recommendation"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provisional Diagnosis (ICD-10)</Label>
              <Input
                value={provisionalDiagnosis}
                onChange={(e) => setProvisionalDiagnosis(e.target.value)}
                placeholder="e.g., B50.0"
              />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis Text</Label>
              <Input
                value={provisionalDiagnosisText}
                onChange={(e) => setProvisionalDiagnosisText(e.target.value)}
                placeholder="e.g., Severe falciparum malaria"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Urgency</Label>
              <Select value={urgency} onValueChange={(v) => setUrgency(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Preferred Ward Type</Label>
              <Select value={preferredWardType} onValueChange={(v) => setPreferredWardType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEDICAL">Medical</SelectItem>
                  <SelectItem value="SURGICAL">Surgical</SelectItem>
                  <SelectItem value="PEDIATRIC">Pediatric</SelectItem>
                  <SelectItem value="MATERNITY">Maternity</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="ISOLATION">Isolation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={!canSubmit || createRecommendation.isPending}
              onClick={async () => {
                if (!encounterId || !user) return;
                await createRecommendation.mutateAsync({
                  encounter: encounterId,
                  recommended_by: user.id,
                  reason,
                  provisional_diagnosis: provisionalDiagnosis,
                  provisional_diagnosis_text: provisionalDiagnosisText,
                  urgency,
                  preferred_ward_type: preferredWardType,
                });
                router.push('/admissions');
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Submit Recommendation
            </Button>
            {createRecommendation.error && (
              <p className="text-sm text-destructive">Failed to submit recommendation</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
