'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDeathRecord } from '@/lib/hooks/use-last-office';
import { getApiErrorMessage } from '@/lib/api/client';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DeathRecordCreateData, MannerOfDeath, PlaceOfDeath, NotificationSource } from '@/lib/types/last-office';

export default function NewDeathRecordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateDeathRecord();

  // Pre-fill patient from URL params
  const patientIdParam = searchParams.get('patient');
  const admissionIdParam = searchParams.get('admission');
  const encounterIdParam = searchParams.get('encounter');

  // Form state
  const [patientId, setPatientId] = useState<number | null>(
    patientIdParam ? Number(patientIdParam) : null
  );
  const [dateOfDeath, setDateOfDeath] = useState(new Date().toISOString().split('T')[0]);
  const [timeOfDeath, setTimeOfDeath] = useState('');
  const [mannerOfDeath, setMannerOfDeath] = useState<MannerOfDeath>('NATURAL');
  const [placeOfDeath, setPlaceOfDeath] = useState<PlaceOfDeath>('INPATIENT');
  const [placeOfDeathDetail, setPlaceOfDeathDetail] = useState('');
  const [notificationSource, setNotificationSource] = useState<NotificationSource>(
    admissionIdParam ? 'INPATIENT_DISCHARGE' : 'MANUAL_ENTRY'
  );

  // Cause of death (WHO Medical Certificate format)
  const [primaryCause, setPrimaryCause] = useState('');
  const [primaryCauseIcd, setPrimaryCauseIcd] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue);
  const [antecedentCause, setAntecedentCause] = useState('');
  const [antecedentCauseIcd, setAntecedentCauseIcd] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue);
  const [underlyingCause, setUnderlyingCause] = useState('');
  const [underlyingCauseIcd, setUnderlyingCauseIcd] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue);
  const [contributingConditions, setContributingConditions] = useState('');

  // Morgue
  const [morgueCompartment, setMorgueCompartment] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!patientId) {
      setError('Patient is required');
      return;
    }
    if (!primaryCause.trim()) {
      setError('Primary cause of death is required');
      return;
    }

    const data = {
      patient: patientId,
      date_of_death: dateOfDeath,
      manner_of_death: mannerOfDeath,
      place_of_death: placeOfDeath,
      notification_source: notificationSource,
      primary_cause: primaryCause,
      primary_cause_icd10: primaryCauseIcd.icd10Code ? Number(primaryCauseIcd.icd10Code) : null,
      antecedent_cause_icd10: antecedentCauseIcd.icd10Code ? Number(antecedentCauseIcd.icd10Code) : null,
      underlying_cause_icd10: underlyingCauseIcd.icd10Code ? Number(underlyingCauseIcd.icd10Code) : null,
    } as DeathRecordCreateData;
    if (timeOfDeath) data.time_of_death = timeOfDeath;
    if (placeOfDeathDetail) data.place_of_death_detail = placeOfDeathDetail;
    if (antecedentCause) data.antecedent_cause = antecedentCause;
    if (underlyingCause) data.underlying_cause = underlyingCause;
    if (contributingConditions) data.contributing_conditions = contributingConditions;
    if (admissionIdParam) data.admission = Number(admissionIdParam);
    if (encounterIdParam) data.encounter = Number(encounterIdParam);
    if (morgueCompartment) data.morgue_compartment = morgueCompartment;
    if (notes) data.notes = notes;

    try {
      const record = await createMutation.mutateAsync(data);
      toast.success('Death record created');
      router.push(`/last-office/${record.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [
    patientId, dateOfDeath, timeOfDeath, mannerOfDeath, placeOfDeath,
    placeOfDeathDetail, notificationSource, primaryCause, primaryCauseIcd,
    antecedentCause, antecedentCauseIcd, underlyingCause, underlyingCauseIcd,
    contributingConditions, admissionIdParam, encounterIdParam,
    morgueCompartment, notes, createMutation, router,
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Record Death"
        helpContent="Create a new death record. This will mark the patient as deceased. Follow the WHO International Medical Certificate of Cause of Death format."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Patient & Death Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Patient &amp; Death Details</CardTitle>
              <HelpPopover content="Select the patient and record the date, time, manner, and place of death." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Patient *</Label>
              <PatientSearchInput
                value={patientId}
                onChange={setPatientId}
                placeholder="Search by name or MRN..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="date-of-death">Date of Death *</Label>
                <Input
                  id="date-of-death"
                  type="date"
                  value={dateOfDeath}
                  onChange={(e) => setDateOfDeath(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label htmlFor="time-of-death">Time of Death</Label>
                <Input
                  id="time-of-death"
                  type="time"
                  value={timeOfDeath}
                  onChange={(e) => setTimeOfDeath(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Manner of Death</Label>
              <Select value={mannerOfDeath} onValueChange={(v) => setMannerOfDeath(v as MannerOfDeath)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NATURAL">Natural</SelectItem>
                  <SelectItem value="ACCIDENT">Accident</SelectItem>
                  <SelectItem value="SUICIDE">Suicide</SelectItem>
                  <SelectItem value="HOMICIDE">Homicide</SelectItem>
                  <SelectItem value="UNDETERMINED">Undetermined</SelectItem>
                  <SelectItem value="PENDING_INVESTIGATION">Pending Investigation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Place of Death</Label>
              <Select value={placeOfDeath} onValueChange={(v) => setPlaceOfDeath(v as PlaceOfDeath)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INPATIENT">Inpatient Ward</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency Department</SelectItem>
                  <SelectItem value="THEATRE">Operating Theatre</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="BROUGHT_IN_DEAD">Brought in Dead (BID)</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(placeOfDeath === 'OTHER' || placeOfDeath === 'INPATIENT') && (
              <div>
                <Label htmlFor="place-detail">Location Detail</Label>
                <Input
                  id="place-detail"
                  value={placeOfDeathDetail}
                  onChange={(e) => setPlaceOfDeathDetail(e.target.value)}
                  placeholder={placeOfDeath === 'INPATIENT' ? 'e.g., Medical Ward 2' : 'Specify location'}
                />
              </div>
            )}

            <div>
              <Label>Notification Source</Label>
              <Select value={notificationSource} onValueChange={(v) => setNotificationSource(v as NotificationSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INPATIENT_DISCHARGE">Inpatient Discharge</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency Department</SelectItem>
                  <SelectItem value="MANUAL_ENTRY">Manual Entry</SelectItem>
                  <SelectItem value="CLIENT_REGISTRY">Client Registry</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Cause of Death (WHO Format) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Cause of Death</CardTitle>
              <HelpPopover content="WHO International Medical Certificate format. Line (a) is the immediate cause, (b) the antecedent cause, (c) the underlying cause. Part II lists contributing conditions." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Line a — Immediate cause */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium">Line (a) — Immediate Cause *</Label>
              <Input
                value={primaryCause}
                onChange={(e) => setPrimaryCause(e.target.value)}
                placeholder="Disease or condition directly leading to death"
              />
              <DiagnosisCodeInput
                value={primaryCauseIcd}
                onChange={setPrimaryCauseIcd}
                label="ICD-10 Code"
                placeholder="Search ICD-10..."
                showVersionToggle={false}
                showSNOMED={false}
              />
            </div>

            {/* Line b — Antecedent cause */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium">Line (b) — Antecedent Cause</Label>
              <Input
                value={antecedentCause}
                onChange={(e) => setAntecedentCause(e.target.value)}
                placeholder="Due to (or as a consequence of)..."
              />
              <DiagnosisCodeInput
                value={antecedentCauseIcd}
                onChange={setAntecedentCauseIcd}
                label="ICD-10 Code"
                placeholder="Search ICD-10..."
                showVersionToggle={false}
                showSNOMED={false}
              />
            </div>

            {/* Line c — Underlying cause */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium">Line (c) — Underlying Cause</Label>
              <Input
                value={underlyingCause}
                onChange={(e) => setUnderlyingCause(e.target.value)}
                placeholder="Due to (or as a consequence of)..."
              />
              <DiagnosisCodeInput
                value={underlyingCauseIcd}
                onChange={setUnderlyingCauseIcd}
                label="ICD-10 Code"
                placeholder="Search ICD-10..."
                showVersionToggle={false}
                showSNOMED={false}
              />
            </div>

            {/* Part II — Contributing conditions */}
            <div>
              <Label className="text-xs text-muted-foreground font-medium">Part II — Contributing Conditions</Label>
              <Textarea
                value={contributingConditions}
                onChange={(e) => setContributingConditions(e.target.value)}
                placeholder="Other significant conditions contributing to death..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Morgue & Notes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Morgue &amp; Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="morgue-compartment">Morgue Compartment</Label>
                <Input
                  id="morgue-compartment"
                  value={morgueCompartment}
                  onChange={(e) => setMorgueCompartment(e.target.value)}
                  placeholder="e.g., Compartment A-3"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional observations..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Saving...' : 'Record Death'}
        </Button>
      </div>
    </div>
  );
}
