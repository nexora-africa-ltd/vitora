/**
 * New Referral Page
 * Creates a clinical referral from an encounter.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowLeftRight, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/hooks/use-toast';
import { referralsApi } from '@/lib/api/referrals';
import { encountersApi } from '@/lib/api/encounters';
import { getApiErrorMessage } from '@/lib/api/client';
import type { Patient } from '@/lib/types/patient';
import type { Encounter } from '@/lib/types/encounter';
import {
  TARGET_SERVICE_GROUPS,
  ADMISSION_SERVICES,
  type ReferralTargetService,
  type ReferralPriority,
} from '@/lib/types/referral';
import { format } from 'date-fns';

export default function NewReferralPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Pre-fill from URL params
  const prePatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!)
    : null;
  const preEncounterId = searchParams.get('encounter')
    ? parseInt(searchParams.get('encounter')!)
    : null;

  // Patient selection
  const [patientId, setPatientId] = useState<number | null>(prePatientId);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Encounter selection
  const [encounterId, setEncounterId] = useState<number | null>(preEncounterId);

  // Referral fields
  const [targetService, setTargetService] = useState<ReferralTargetService | ''>('');
  const [priority, setPriority] = useState<ReferralPriority>('ROUTINE');
  const [reason, setReason] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSensitive, setIsSensitive] = useState(false);

  // Admission-specific fields
  const [admissionDiagnoses, setAdmissionDiagnoses] = useState<DiagnosisCodeValue[]>([emptyDiagnosisCodeValue()]);
  const [preferredWardType, setPreferredWardType] = useState('');

  // External-specific fields
  const [externalFacilityName, setExternalFacilityName] = useState('');
  const [externalFacilityCode, setExternalFacilityCode] = useState('');
  const [referralLetter, setReferralLetter] = useState('');

  // Derived state
  const isAdmission = useMemo(
    () => targetService && ADMISSION_SERVICES.includes(targetService as ReferralTargetService),
    [targetService],
  );
  const isExternal = targetService === 'OTHER';

  // Fetch recent encounters for selected patient
  const { data: encountersData, isLoading: encountersLoading } = useQuery({
    queryKey: ['patient-encounters', patientId],
    queryFn: () => encountersApi.list({ patient: patientId!, page_size: 10, ordering: '-encounter_date' }),
    enabled: !!patientId,
    staleTime: 30000,
  });

  const encounters = (encountersData?.results || []) as Encounter[];
  const selectedEncounter = encounters.find((e) => e.id === encounterId) || null;

  const handlePatientChange = useCallback(
    (id: number | null, patient: Patient | null) => {
      setPatientId(id);
      setSelectedPatient(patient);
      setEncounterId(null);
    },
    [],
  );

  const handleAdmDiagnosisChange = useCallback((index: number, value: DiagnosisCodeValue) => {
    setAdmissionDiagnoses((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addAdmDiagnosis = useCallback(() => {
    setAdmissionDiagnoses((prev) => [...prev, emptyDiagnosisCodeValue()]);
  }, []);

  const removeAdmDiagnosis = useCallback((index: number) => {
    setAdmissionDiagnoses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const buildAdmissionDiagnosisFields = () => {
    const filled = admissionDiagnoses.filter((d) => d.icd10Code || d.icd11Code || d.snomedCode);
    if (filled.length === 0) return {};
    const primary = filled[0]!;
    const code = primary.icd11Code || primary.icd10Display?.split(' - ')[0] || primary.snomedCode || '';
    const texts = filled.map((d) => {
      const c = d.icd11Code || d.icd10Display?.split(' - ')[0] || d.snomedCode || '';
      const t = d.icd11Display?.split(' - ').slice(1).join(' - ') ||
        d.icd10Display?.split(' - ').slice(1).join(' - ') ||
        d.snomedDisplay || '';
      return c ? `${t} (${c})` : t;
    });
    return {
      provisional_diagnosis: code,
      provisional_diagnosis_text: texts.join('; '),
    };
  };

  const { mutateAsync: createReferral, isPending } = useMutation({
    mutationFn: () =>
      referralsApi.create({
        encounter: encounterId!,
        target_service: targetService as ReferralTargetService,
        priority,
        reason,
        clinical_notes: clinicalNotes || undefined,
        is_sensitive: isSensitive || undefined,
        // Admission fields
        ...(isAdmission
          ? {
              ...buildAdmissionDiagnosisFields(),
              preferred_ward_type: preferredWardType || undefined,
            }
          : {}),
        // External fields
        ...(isExternal
          ? {
              external_facility_name: externalFacilityName || undefined,
              external_facility_code: externalFacilityCode || undefined,
              referral_letter: referralLetter || undefined,
            }
          : {}),
      }),
    onSuccess: (data) => {
      toast({
        title: 'Referral created',
        description: `Referral ${data.referral_number} created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      router.push(`/referrals/${data.id}`);
    },
    onError: (err) => {
      toast({
        title: 'Failed to create referral',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const canSubmit = patientId && encounterId && targetService && reason.trim();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Referral"
        helpContent="Create a clinical referral from a patient encounter. Select the target service, provide the reason and clinical context, then submit."
      />

      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {/* Step 1: Patient */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <PatientSelector
              value={patientId}
              selectedPatient={selectedPatient}
              onChange={handlePatientChange}
            />
          </CardContent>
        </Card>

        {/* Step 2: Encounter */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Select Encounter</CardTitle>
          </CardHeader>
          <CardContent>
            {!patientId ? (
              <p className="text-sm text-muted-foreground">Select a patient first.</p>
            ) : encountersLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading encounters...
              </div>
            ) : encounters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No encounters found for this patient.
              </p>
            ) : (
              <Select
                value={encounterId?.toString() || ''}
                onValueChange={(v) => setEncounterId(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an encounter..." />
                </SelectTrigger>
                <SelectContent>
                  {encounters.map((enc) => (
                    <SelectItem key={enc.id} value={enc.id.toString()}>
                      <span className="flex items-center gap-2">
                        <span>{format(new Date(enc.encounter_date), 'dd MMM yyyy')}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{enc.encounter_type}</span>
                        {enc.chief_complaint && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="truncate max-w-[200px]">{enc.chief_complaint}</span>
                          </>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedEncounter && (
              <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium">
                    {format(new Date(selectedEncounter.encounter_date), 'dd MMM yyyy')}
                  </span>
                  <Badge variant="outline" className="text-xs">{selectedEncounter.encounter_type}</Badge>
                </div>
                {selectedEncounter.chief_complaint && (
                  <p className="text-sm text-muted-foreground mt-1 ml-6">
                    {selectedEncounter.chief_complaint}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Referral Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Referral Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="targetService">Target Service *</Label>
                <Select
                  value={targetService}
                  onValueChange={(v) => setTargetService(v as ReferralTargetService)}
                >
                  <SelectTrigger id="targetService">
                    <SelectValue placeholder="Select target service..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_SERVICE_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as ReferralPriority)}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUTINE">Routine</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="EMERGENCY">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Reason for Referral *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this referral needed? Clinical justification..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="clinicalNotes">Clinical Notes</Label>
              <Textarea
                id="clinicalNotes"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Relevant clinical history, examination findings, investigations done..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sensitive"
                checked={isSensitive}
                onCheckedChange={(v) => setIsSensitive(v === true)}
              />
              <Label htmlFor="sensitive" className="text-sm font-normal">
                Mark as sensitive (restricts access to authorized staff)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Admission Details (conditional) */}
        {isAdmission && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Admission Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {admissionDiagnoses.map((diag, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {admissionDiagnoses.length > 1 ? `Provisional Diagnosis ${index + 1}` : 'Provisional Diagnosis'}
                    </span>
                    {admissionDiagnoses.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeAdmDiagnosis(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <DiagnosisCodeInput
                    value={diag}
                    onChange={(v) => handleAdmDiagnosisChange(index, v)}
                    label=""
                    showVersionToggle={true}
                    showSNOMED={true}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAdmDiagnosis}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Another Diagnosis
              </Button>
              <div>
                <Label htmlFor="preferredWardType">Preferred Ward Type</Label>
                <Select value={preferredWardType} onValueChange={setPreferredWardType}>
                  <SelectTrigger id="preferredWardType">
                    <SelectValue placeholder="Select ward type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="MEDICAL">Medical</SelectItem>
                    <SelectItem value="SURGICAL">Surgical</SelectItem>
                    <SelectItem value="MATERNITY">Maternity</SelectItem>
                    <SelectItem value="PEDIATRIC">Pediatric</SelectItem>
                    <SelectItem value="ICU">ICU</SelectItem>
                    <SelectItem value="HDU">HDU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4/5: External Facility Details (conditional) */}
        {isExternal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAdmission ? '5' : '4'}. External Facility Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="externalFacilityName">Facility Name</Label>
                  <Input
                    id="externalFacilityName"
                    value={externalFacilityName}
                    onChange={(e) => setExternalFacilityName(e.target.value)}
                    placeholder="e.g., Kenyatta National Hospital"
                  />
                </div>
                <div>
                  <Label htmlFor="externalFacilityCode">MFL Code</Label>
                  <Input
                    id="externalFacilityCode"
                    value={externalFacilityCode}
                    onChange={(e) => setExternalFacilityCode(e.target.value)}
                    placeholder="e.g., 13080"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="referralLetter">Referral Letter</Label>
                <Textarea
                  id="referralLetter"
                  value={referralLetter}
                  onChange={(e) => setReferralLetter(e.target.value)}
                  placeholder="Referral letter contents or summary..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => createReferral()} disabled={!canSubmit || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPending ? 'Creating...' : 'Create Referral'}
          </Button>
        </div>
      </div>
    </div>
  );
}
