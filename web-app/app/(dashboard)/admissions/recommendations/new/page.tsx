'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue, type DiagnosisCodeValue } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/lib/auth';
import { useCreateAdmissionRecommendation } from '@/lib/hooks/use-inpatient';
import { AdmissionSuccessModal, type AdmissionSuccessData } from '@/components/inpatient';
import { getApiErrorMessage } from '@/lib/api/client';

/**
 * Parse DRF error response to extract user-friendly messages.
 * Handles specific cases like unique constraint on encounter.
 */
function parseRecommendationError(error: unknown): string {
  const rawMessage = getApiErrorMessage(error);

  // Check for unique constraint on encounter (OneToOneField)
  if (rawMessage.toLowerCase().includes('encounter') &&
      (rawMessage.toLowerCase().includes('unique') ||
       rawMessage.toLowerCase().includes('already exists') ||
       rawMessage.toLowerCase().includes('admission recommendation with this encounter already exists'))) {
    return 'An admission recommendation already exists for this encounter. Please view the existing recommendation or create a new encounter.';
  }

  // Check for expired/invalid encounter
  if (rawMessage.toLowerCase().includes('encounter') && rawMessage.toLowerCase().includes('invalid')) {
    return 'The encounter is no longer valid. It may have been finalized or deleted.';
  }

  // Check for permission errors
  if (rawMessage.toLowerCase().includes('permission') || rawMessage.toLowerCase().includes('forbidden')) {
    return 'You do not have permission to create admission recommendations.';
  }

  return rawMessage;
}

export default function NewAdmissionRecommendationPage() {
  const searchParams = useSearchParams();
  const user = useUser();

  const encounterIdParam = searchParams.get('encounter');
  const encounterId = encounterIdParam ? Number(encounterIdParam) : null;
  const patientName = searchParams.get('patient_name') || 'Patient';
  const patientMrn = searchParams.get('patient_mrn') || '';

  const [reason, setReason] = useState('');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());
  const [urgency, setUrgency] = useState<'ROUTINE' | 'URGENT' | 'EMERGENCY'>('URGENT');
  const [preferredWardType, setPreferredWardType] = useState<
    'MEDICAL' | 'SURGICAL' | 'PEDIATRIC' | 'MATERNITY' | 'ICU' | 'ISOLATION'
  >('MEDICAL');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<AdmissionSuccessData | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createRecommendation = useCreateAdmissionRecommendation();
  const hasValidDiagnosis = !!(provisionalDiagnosis.icd10Code || provisionalDiagnosis.icd11Code);
  const canSubmit = !!encounterId && !!reason && hasValidDiagnosis && !!user;

  const handleSubmit = async () => {
    if (!encounterId || !user) return;

    // Clear previous error
    setSubmitError(null);

    try {
      const result = await createRecommendation.mutateAsync({
        encounter: encounterId,
        recommended_by: user.id,
        reason,
        provisional_diagnosis: provisionalDiagnosis.icd11Code || provisionalDiagnosis.icd10Display?.split(' - ')[0] || '',
        provisional_diagnosis_text: provisionalDiagnosis.icd11Display?.split(' - ').slice(1).join(' - ') || provisionalDiagnosis.icd10Display?.split(' - ').slice(1).join(' - ') || '',
        urgency,
        preferred_ward_type: preferredWardType,
      });

      // Show success modal with recommendation data
      setSuccessData({
        patientName,
        patientMrn,
        urgency: result.urgency,
        preferredWardType: result.preferred_ward_type,
        provisionalDiagnosis: result.provisional_diagnosis_text,
        expiresAt: result.expires_at,
      });
      setShowSuccessModal(true);
    } catch (error) {
      // Parse and show user-friendly error
      const errorMessage = parseRecommendationError(error);
      setSubmitError(errorMessage);
    }
  };

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
            <Label>Patient</Label>
            <Input value={patientName ? `${patientName} (${patientMrn})` : `Encounter #${encounterId}`} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for admission recommendation"
            />
          </div>

          <DiagnosisCodeInput
            value={provisionalDiagnosis}
            onChange={setProvisionalDiagnosis}
            label="Provisional Diagnosis"
            placeholder="Search for diagnosis..."
          />

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

          {/* Error Alert */}
          {submitError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to Submit Recommendation</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-2">
            <Button
              disabled={!canSubmit || createRecommendation.isPending}
              onClick={handleSubmit}
            >
              <Save className="h-4 w-4 mr-2" />
              {createRecommendation.isPending ? 'Submitting...' : 'Submit Recommendation'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AdmissionSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        admissionData={successData}
      />
    </div>
  );
}
