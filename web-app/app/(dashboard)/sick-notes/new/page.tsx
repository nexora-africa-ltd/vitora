/**
 * New Sick Note Page
 * Creates a medical certificate/sick note for a patient encounter.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileText, Calendar, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/hooks/use-toast';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { sickNotesApi } from '@/lib/api/sick-notes';
import { encountersApi } from '@/lib/api/encounters';
import { getApiErrorMessage } from '@/lib/api/client';
import type { Patient } from '@/lib/types/patient';
import type { Encounter } from '@/lib/types/encounter';
import { format } from 'date-fns';

/** Extract display text from a DiagnosisCodeValue */
function diagnosisDisplayText(d: DiagnosisCodeValue): string {
  return (
    d.icd11Display?.split(' - ').slice(1).join(' - ') ||
    d.icd10Display?.split(' - ').slice(1).join(' - ') ||
    d.snomedDisplay ||
    ''
  );
}

/** Extract code string from a DiagnosisCodeValue */
function diagnosisCodeString(d: DiagnosisCodeValue): string {
  return d.icd11Code || d.icd10Display?.split(' - ')[0] || d.snomedCode || '';
}

export default function NewSickNotePage() {
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

  // Form fields
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisCodeValue[]>([emptyDiagnosisCodeValue()]);
  const [employerName, setEmployerName] = useState('');
  const [employerContact, setEmployerContact] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [notes, setNotes] = useState('');

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

  const handleDiagnosisChange = useCallback((index: number, value: DiagnosisCodeValue) => {
    setDiagnoses((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addDiagnosis = useCallback(() => {
    setDiagnoses((prev) => [...prev, emptyDiagnosisCodeValue()]);
  }, []);

  const removeDiagnosis = useCallback((index: number) => {
    setDiagnoses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Compute diagnosis text and code from selected diagnoses
  const filledDiagnoses = diagnoses.filter(
    (d) => d.icd10Code || d.icd11Code || d.snomedCode,
  );
  const hasDiagnosis = filledDiagnoses.length > 0;

  const buildDiagnosisFields = () => {
    if (filledDiagnoses.length === 0) return { diagnosis_text: '', diagnosis_code: '' };
    const texts = filledDiagnoses.map((d) => {
      const code = diagnosisCodeString(d);
      const text = diagnosisDisplayText(d);
      return code ? `${text} (${code})` : text;
    });
    return {
      diagnosis_text: texts.join('; '),
      diagnosis_code: diagnosisCodeString(filledDiagnoses[0]!),
    };
  };

  const { mutateAsync: createSickNote, isPending } = useMutation({
    mutationFn: () => {
      const { diagnosis_text, diagnosis_code } = buildDiagnosisFields();
      return sickNotesApi.create({
        encounter: encounterId!,
        patient: patientId!,
        leave_start_date: leaveStartDate,
        leave_end_date: leaveEndDate,
        diagnosis_text,
        diagnosis_code: diagnosis_code || undefined,
        employer_name: employerName || undefined,
        employer_contact: employerContact || undefined,
        recommendations: recommendations || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Sick note created',
        description: `${data.note_number} created as draft.`,
      });
      queryClient.invalidateQueries({ queryKey: ['sick-notes'] });
      router.push(`/sick-notes/${data.id}`);
    },
    onError: (err) => {
      toast({
        title: 'Failed to create sick note',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const canSubmit =
    patientId && encounterId && leaveStartDate && leaveEndDate && hasDiagnosis;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Sick Note"
        helpContent="Create a medical certificate / sick note for a patient. Select the patient and encounter, then fill in leave details and diagnosis."
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
                  <FileText className="h-4 w-4 text-primary shrink-0" />
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

        {/* Step 3: Leave Period */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Leave Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="leaveStart">Start Date *</Label>
                <Input
                  id="leaveStart"
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="leaveEnd">End Date *</Label>
                <Input
                  id="leaveEnd"
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                />
              </div>
            </div>
            {leaveStartDate && leaveEndDate && leaveEndDate >= leaveStartDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {Math.ceil(
                    (new Date(leaveEndDate).getTime() - new Date(leaveStartDate).getTime()) /
                      (1000 * 60 * 60 * 24),
                  ) + 1}{' '}
                  day(s) of leave
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Diagnosis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Diagnosis & Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {diagnoses.map((diag, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {diagnoses.length > 1 ? `Diagnosis ${index + 1}` : 'Diagnosis *'}
                  </span>
                  {diagnoses.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeDiagnosis(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <DiagnosisCodeInput
                  value={diag}
                  onChange={(v) => handleDiagnosisChange(index, v)}
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
              onClick={addDiagnosis}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Another Diagnosis
            </Button>
            <div>
              <Label htmlFor="recommendations">Recommendations</Label>
              <Textarea
                id="recommendations"
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="e.g., Bed rest, avoid strenuous activity..."
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional clinical notes..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Step 5: Employer (optional) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Employer Details (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="employerName">Employer Name</Label>
                <Input
                  id="employerName"
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                  placeholder="Company / Organisation name"
                />
              </div>
              <div>
                <Label htmlFor="employerContact">Employer Contact</Label>
                <Input
                  id="employerContact"
                  value={employerContact}
                  onChange={(e) => setEmployerContact(e.target.value)}
                  placeholder="Phone or email"
                />
              </div>
            </div>
          </CardContent>
        </Card>

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
          <Button onClick={() => createSickNote()} disabled={!canSubmit || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPending ? 'Creating...' : 'Create Sick Note'}
          </Button>
        </div>
      </div>
    </div>
  );
}
