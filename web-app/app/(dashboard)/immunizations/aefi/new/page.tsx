'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/lib/hooks/use-toast';
import { aefiApi } from '@/lib/api/immunizations';
import type {
  AEFIEventType,
  AEFISeverity,
  AEFIOutcome,
  AEFICreateData,
  VaccinationServiceType,
} from '@/lib/types/immunizations';

// MOH AEFI Reporting Form event type checkboxes
const EVENT_TYPE_OPTIONS: { value: AEFIEventType; label: string; description: string }[] = [
  { value: 'BCG_LYMPHADENITIS', label: 'BCG Lymphadenitis', description: 'Enlarged lymph node from BCG vaccine' },
  { value: 'INJECTION_SITE_ABSCESS', label: 'Injection Site Abscess', description: 'Abscess at injection site (sterile or septic)' },
  { value: 'CONVULSION', label: 'Convulsion / Seizure', description: 'Febrile or afebrile convulsions' },
  { value: 'HIGH_FEVER', label: 'High Fever (≥38.5°C)', description: 'Temperature ≥38.5°C within 48h of vaccination' },
  { value: 'SEVERE_LOCAL_REACTION', label: 'Severe Local Reaction', description: 'Redness/swelling >3cm or lasting >3 days' },
  { value: 'GENERALIZED_URTICARIA', label: 'Generalized Urticaria', description: 'Widespread hives/rash' },
  { value: 'ANAPHYLAXIS', label: 'Anaphylaxis', description: 'Acute severe allergic reaction — EMERGENCY' },
  { value: 'ENCEPHALOPATHY', label: 'Encephalopathy', description: 'Acute onset of brain dysfunction' },
  { value: 'PARALYSIS', label: 'Paralysis', description: 'Acute flaccid paralysis (AFP)' },
  { value: 'TOXIC_SHOCK', label: 'Toxic Shock Syndrome', description: 'Acute onset of shock' },
  { value: 'OTHER', label: 'Other', description: 'Specify below' },
];

const SEVERITY_OPTIONS: { value: AEFISeverity; label: string }[] = [
  { value: 'MILD', label: 'Mild — No treatment needed' },
  { value: 'MODERATE', label: 'Moderate — Treatment required' },
  { value: 'SEVERE', label: 'Severe — Hospitalization / Life-threatening' },
];

const OUTCOME_OPTIONS: { value: AEFIOutcome; label: string }[] = [
  { value: 'RECOVERED', label: 'Recovered' },
  { value: 'RECOVERING', label: 'Recovering' },
  { value: 'NOT_RECOVERED', label: 'Not Recovered' },
  { value: 'SEQUELAE', label: 'Recovered with Sequelae' },
  { value: 'DEATH', label: 'Died' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const SERVICE_TYPE_OPTIONS: { value: VaccinationServiceType; label: string }[] = [
  { value: 'STATIC', label: 'Static (Facility)' },
  { value: 'MASS', label: 'Mass Campaign' },
  { value: 'OUTREACH', label: 'Outreach' },
];

export default function AEFICreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [immunizationRecordId, setImmunizationRecordId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [vaccinationServiceType, setVaccinationServiceType] = useState<VaccinationServiceType | ''>('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]!);
  const [onsetTime, setOnsetTime] = useState('');
  const [eventTypes, setEventTypes] = useState<AEFIEventType[]>([]);
  const [otherEventTypeDetail, setOtherEventTypeDetail] = useState('');
  const [severity, setSeverity] = useState<AEFISeverity | ''>('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState<AEFIOutcome | ''>('');
  const [pastMedicalHistory, setPastMedicalHistory] = useState('');
  const [treatmentGiven, setTreatmentGiven] = useState(false);
  const [treatmentDetails, setTreatmentDetails] = useState('');
  const [specimenCollected, setSpecimenCollected] = useState(false);
  const [specimenType, setSpecimenType] = useState('');
  const [reporterDesignation, setReporterDesignation] = useState('');

  const toggleEventType = (type: AEFIEventType) => {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: AEFICreateData) => aefiApi.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['aefi'] });
      toast({ title: 'AEFI Reported', description: 'Adverse event has been recorded successfully.' });
      router.push(`/immunizations/aefi/${result.id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit AEFI report.', variant: 'destructive' });
    },
  });

  const canSubmit =
    immunizationRecordId &&
    eventDate &&
    eventTypes.length > 0 &&
    severity &&
    description &&
    !(eventTypes.includes('OTHER') && !otherEventTypeDetail);

  function handleSubmit() {
    if (!canSubmit || !severity) return;
    createMutation.mutate({
      immunization_record: parseInt(immunizationRecordId, 10),
      event_date: eventDate,
      onset_time: onsetTime || undefined,
      event_types: eventTypes,
      other_event_type_detail: otherEventTypeDetail || undefined,
      severity,
      description,
      outcome: outcome || undefined,
      guardian_name: guardianName || undefined,
      vaccination_service_type: vaccinationServiceType || undefined,
      past_medical_history_notes: pastMedicalHistory || undefined,
      treatment_given: treatmentGiven,
      treatment_details: treatmentDetails || undefined,
      specimen_collected: specimenCollected,
      specimen_type: specimenType || undefined,
      reported_by_designation: reporterDesignation || undefined,
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Report AEFI"
        helpContent="Report an Adverse Event Following Immunization using the Kenya MOH AEFI Reporting Form. All sections are aligned with the official form. Fields marked with * are required."
      />

      {/* Section 1: Patient & Record Context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">1. Patient & Immunization Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Immunization Record ID <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={immunizationRecordId}
                onChange={(e) => setImmunizationRecordId(e.target.value)}
                placeholder="Enter the immunization record ID"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Patient details, vaccine info, and facility data are auto-populated from this record.
              </p>
            </div>
            <div>
              <Label>Guardian Name</Label>
              <Input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="Required if patient is a child"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Vaccination Centre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">2. Vaccination Centre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Centre name, MFL code, and county are auto-populated from the facility record.
          </p>
          <div>
            <Label>Service Type</Label>
            <Select
              value={vaccinationServiceType}
              onValueChange={(v) => setVaccinationServiceType(v as VaccinationServiceType)}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Type of AEFI (MOH checkboxes) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            3. Type of AEFI <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select all that apply (as per MOH AEFI Reporting Form).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  eventTypes.includes(opt.value)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={eventTypes.includes(opt.value)}
                  onCheckedChange={() => toggleEventType(opt.value)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
          {eventTypes.includes('OTHER') && (
            <div className="mt-2">
              <Label>Specify Other Event Type <span className="text-destructive">*</span></Label>
              <Input
                value={otherEventTypeDetail}
                onChange={(e) => setOtherEventTypeDetail(e.target.value)}
                placeholder="Describe the adverse event type"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Event Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">4. Event Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Event Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Onset Time</Label>
              <Input
                type="time"
                value={onsetTime}
                onChange={(e) => setOnsetTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Severity <span className="text-destructive">*</span></Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as AEFISeverity)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description / Timeline <span className="text-destructive">*</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the adverse event, onset, and progression..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Suspected Vaccine (auto-populated) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">5. Suspected Vaccine</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vaccine name, dose number, date, time, route, site, batch number, manufacturer, expiry,
            and diluent details are auto-populated from the immunization record after submission.
          </p>
        </CardContent>
      </Card>

      {/* Section 6: Past Medical History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">6. Past Medical History</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={pastMedicalHistory}
            onChange={(e) => setPastMedicalHistory(e.target.value)}
            placeholder="Allergies, concomitant medications, pregnancy status, history of similar reactions..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Section 7: Action Taken */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">7. Action Taken</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={treatmentGiven} onCheckedChange={setTreatmentGiven} />
            <Label>Treatment given</Label>
          </div>
          {treatmentGiven && (
            <div>
              <Label>Treatment Details</Label>
              <Textarea
                value={treatmentDetails}
                onChange={(e) => setTreatmentDetails(e.target.value)}
                placeholder="Describe treatment provided..."
                rows={2}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={specimenCollected} onCheckedChange={setSpecimenCollected} />
            <Label>Specimen collected for investigation</Label>
          </div>
          {specimenCollected && (
            <div>
              <Label>Specimen Type</Label>
              <Input
                value={specimenType}
                onChange={(e) => setSpecimenType(e.target.value)}
                placeholder="e.g., Blood, CSF, Injection site swab"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 8: Outcome */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">8. Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as AEFIOutcome)}>
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue placeholder="Select outcome (if known)" />
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Section 9: Reporter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">9. Reporter</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Your name is auto-recorded. Enter your designation below.
          </p>
          <div>
            <Label>Designation</Label>
            <Input
              value={reporterDesignation}
              onChange={(e) => setReporterDesignation(e.target.value)}
              placeholder="e.g., Nurse, Clinical Officer, Medical Officer"
            />
          </div>
        </CardContent>
      </Card>

      {/* Validation Summary */}
      {severity === 'SEVERE' && (
        <Badge variant="destructive" className="text-sm px-3 py-1.5">
          Severe AEFI — must be reported to national authorities within 24 hours
        </Badge>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pb-6">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || createMutation.isPending}
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Submit AEFI Report
        </Button>
      </div>
    </div>
  );
}
