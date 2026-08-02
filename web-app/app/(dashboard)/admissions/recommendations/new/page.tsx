'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue, type DiagnosisCodeValue } from '@/components/shared';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
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
import { useFacility } from '@/lib/context/facility-context';
import { usePatient, usePatientEncounters } from '@/lib/hooks/use-patients';
import { useCreateAdmissionRecommendation } from '@/lib/hooks/use-inpatient';
import { AdmissionSuccessModal, type AdmissionSuccessData } from '@/components/inpatient';
import { getApiErrorMessage } from '@/lib/api/client';
import type { InpatientWardType } from '@/lib/types/inpatient';

const RECOMMENDATION_ELIGIBLE_ENCOUNTER_TYPES = new Set([
  'OPD',
  'SCHEDULED_OPD',
  'FOLLOW_UP',
  'CONSULTANT_REVIEW',
  'CHRONIC_STABLE',
  'SPECIALIST_CLINIC',
  'EMERGENCY',
]);

function parseRecommendationError(error: unknown): string {
  const rawMessage = getApiErrorMessage(error);

  if (rawMessage.toLowerCase().includes('encounter') &&
      (rawMessage.toLowerCase().includes('unique') ||
       rawMessage.toLowerCase().includes('already exists') ||
       rawMessage.toLowerCase().includes('admission recommendation with this encounter already exists'))) {
    return 'An admission recommendation already exists for this encounter. Please view the existing recommendation or create a new encounter.';
  }

  if (rawMessage.toLowerCase().includes('encounter') && rawMessage.toLowerCase().includes('invalid')) {
    return 'The encounter is no longer valid. It may have been finalized or deleted.';
  }

  if (rawMessage.toLowerCase().includes('permission') || rawMessage.toLowerCase().includes('forbidden')) {
    return 'You do not have permission to create admission recommendations.';
  }

  return rawMessage;
}

export default function NewAdmissionRecommendationPage() {
  const searchParams = useSearchParams();
  const user = useUser();
  const { hasModule } = useFacility();

  const initialPatientIdParam = searchParams.get('patient');
  const initialEncounterIdParam = searchParams.get('encounter');
  const initialPatientId = initialPatientIdParam ? Number(initialPatientIdParam) : null;
  const initialEncounterId = initialEncounterIdParam ? Number(initialEncounterIdParam) : null;

  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(initialPatientId);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(initialEncounterId);
  const [reason, setReason] = useState('');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());
  const [urgency, setUrgency] = useState<'ROUTINE' | 'URGENT' | 'EMERGENCY'>('URGENT');
  const [preferredWardType, setPreferredWardType] = useState<
    'MEDICAL' | 'SURGICAL' | 'PEDIATRIC' | 'MATERNITY' | 'HDU' | 'ICU' | 'NBU' | 'ISOLATION'
  >('MEDICAL');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<AdmissionSuccessData | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: patient } = usePatient(selectedPatientId || 0);
  const { data: patientEncounters, isLoading: encountersLoading } = usePatientEncounters(selectedPatientId || 0);
  const createRecommendation = useCreateAdmissionRecommendation();

  const eligibleEncounters = useMemo(
    () => (patientEncounters ?? []).filter((encounter) => RECOMMENDATION_ELIGIBLE_ENCOUNTER_TYPES.has(encounter.encounter_type)),
    [patientEncounters]
  );
  const selectedEncounter = useMemo(
    () => eligibleEncounters.find((encounter) => encounter.id === selectedEncounterId) ?? null,
    [eligibleEncounters, selectedEncounterId]
  );

  useEffect(() => {
    if (selectedEncounterId == null || eligibleEncounters.length === 0) {
      return;
    }
    const stillAvailable = eligibleEncounters.some((encounter) => encounter.id === selectedEncounterId);
    if (!stillAvailable) {
      setSelectedEncounterId(null);
    }
  }, [selectedEncounterId, eligibleEncounters]);

  useEffect(() => {
    if (selectedEncounter?.encounter_type === 'EMERGENCY' && urgency !== 'EMERGENCY') {
      setUrgency('EMERGENCY');
    }
  }, [selectedEncounter, urgency]);

  const preferredWardOptions = useMemo<Array<{ value: InpatientWardType; label: string }>>(() => {
    const options: Array<{ value: InpatientWardType; label: string }> = [
      { value: 'MEDICAL', label: 'Medical' },
      { value: 'SURGICAL', label: 'Surgical' },
      { value: 'PEDIATRIC', label: 'Pediatric' },
      { value: 'MATERNITY', label: 'Maternity' },
    ];

    if (hasModule('icu')) {
      options.push({ value: 'ICU', label: 'ICU' });
    }
    if (hasModule('hdu')) {
      options.push({ value: 'HDU', label: 'HDU' });
    }
    if (hasModule('nbu')) {
      options.push({ value: 'NBU', label: 'NBU' });
    }

    options.push({ value: 'ISOLATION', label: 'Isolation' });
    return options;
  }, [hasModule]);

  const preferredWardValues = useMemo(() => new Set(preferredWardOptions.map((option) => option.value)), [preferredWardOptions]);

  useEffect(() => {
    if (!preferredWardValues.has(preferredWardType)) {
      setPreferredWardType('MEDICAL');
    }
  }, [preferredWardType, preferredWardValues]);

  const hasValidDiagnosis = !!(provisionalDiagnosis.icd10Code || provisionalDiagnosis.icd11Code);
  const canSubmit = !!selectedEncounterId && !!reason && hasValidDiagnosis && !!user;

  const handleSubmit = async () => {
    if (!selectedEncounterId || !user) return;

    setSubmitError(null);

    try {
      const result = await createRecommendation.mutateAsync({
        encounter: selectedEncounterId,
        recommended_by: user.id,
        reason,
        provisional_diagnosis: provisionalDiagnosis.icd11Code || provisionalDiagnosis.icd10Display?.split(' - ')[0] || '',
        provisional_diagnosis_text: provisionalDiagnosis.icd11Display?.split(' - ').slice(1).join(' - ') || provisionalDiagnosis.icd10Display?.split(' - ').slice(1).join(' - ') || '',
        urgency,
        preferred_ward_type: preferredWardType,
      });

      const patientName = patient
        ? `${patient.first_name} ${patient.last_name}`.trim()
        : result.patient_name || 'Patient';

      setSuccessData({
        patientName,
        patientMrn: patient?.mrn || result.patient_mrn || '',
        urgency: result.urgency,
        preferredWardType: result.preferred_ward_type,
        provisionalDiagnosis: result.provisional_diagnosis_text,
        expiresAt: result.expires_at,
      });
      setShowSuccessModal(true);
    } catch (error) {
      setSubmitError(parseRecommendationError(error));
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Recommend for Admission"
        helpContent="Create an admission recommendation linked to a specific OPD or Emergency encounter."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recommendation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Patient</Label>
            <PatientSearchInput
              value={selectedPatientId}
              onChange={(patientId) => {
                setSelectedPatientId(patientId);
                setSelectedEncounterId(null);
              }}
              placeholder="Search by name or MRN"
            />
          </div>

          <div className="space-y-2">
            <Label>Encounter (OPD or Emergency)</Label>
            <Select
              value={selectedEncounterId ? String(selectedEncounterId) : ''}
              onValueChange={(value) => setSelectedEncounterId(Number(value))}
              disabled={!selectedPatientId || encountersLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedPatientId
                      ? 'Select patient first'
                      : encountersLoading
                        ? 'Loading encounters...'
                        : 'Select encounter'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleEncounters.map((encounter) => (
                  <SelectItem key={encounter.id} value={String(encounter.id)}>
                    #{encounter.id} • {encounter.encounter_date} • {encounter.chief_complaint || 'No chief complaint'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPatientId && !encountersLoading && eligibleEncounters.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No OPD or Emergency encounters found for this patient. Start an encounter first.
              </p>
            )}
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
              <Select value={urgency} onValueChange={(v) => setUrgency(v as 'ROUTINE' | 'URGENT' | 'EMERGENCY')}>
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
              <Select
                value={preferredWardType}
                onValueChange={(v) => setPreferredWardType(v as 'MEDICAL' | 'SURGICAL' | 'PEDIATRIC' | 'MATERNITY' | 'HDU' | 'ICU' | 'NBU' | 'ISOLATION')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {preferredWardOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
