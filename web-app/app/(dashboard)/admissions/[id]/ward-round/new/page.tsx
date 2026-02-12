'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Stethoscope, ThermometerSun } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdmission, useCreateWardRound } from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import type { ConditionStatus } from '@/lib/types/inpatient';

const CONDITION_STATUSES: { value: ConditionStatus; label: string; description: string }[] = [
  { value: 'STABLE', label: 'Stable', description: 'Patient condition is stable' },
  { value: 'IMPROVING', label: 'Improving', description: 'Patient showing signs of improvement' },
  { value: 'DETERIORATING', label: 'Deteriorating', description: 'Patient condition is worsening' },
  { value: 'CRITICAL', label: 'Critical', description: 'Patient requires immediate attention' },
];

export default function NewWardRoundPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const createWardRound = useCreateWardRound();

  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('STABLE');

  // Clinical Notes (for E2E test compatibility)
  const [clinicalNotes, setClinicalNotes] = useState('');

  // SOAP Notes
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  // Vitals
  const [temperature, setTemperature] = useState('');
  const [pulse, setPulse] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [spo2, setSpo2] = useState('');

  // Validate: Either clinical notes OR all SOAP fields must be filled (SHA/FHIR compliance)
  const hasSOAPNotes = subjective.trim() && objective.trim() && assessment.trim() && plan.trim();
  const hasClinicalNotes = clinicalNotes.trim();
  const isFormValid = Boolean(
    admission &&
    (hasSOAPNotes || hasClinicalNotes) &&
    user?.id != null
  );

  const handleSubmit = async () => {
    if (!isFormValid || !user?.id) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in Clinical Notes or all SOAP fields (Subjective, Objective, Assessment, Plan)',
        variant: 'destructive',
      });
      return;
    }

    const now = new Date();
    const roundDate = now.toISOString().split('T')[0] || '';
    const roundTime = now.toTimeString().slice(0, 5);

    try {
      await createWardRound.mutateAsync({
        admission: admissionId,
        round_date: roundDate,
        round_time: roundTime,
        conducted_by: user.id,
        condition_status: conditionStatus,
        // Use clinical notes as fallback for SOAP if not provided
        subjective: subjective.trim() || clinicalNotes.trim(),
        objective: objective.trim() || 'See clinical notes',
        assessment: assessment.trim() || 'See clinical notes',
        plan: plan.trim() || 'See clinical notes',
        temperature: temperature ? parseFloat(temperature) : undefined,
        pulse: pulse ? parseInt(pulse) : undefined,
        blood_pressure: bloodPressure || undefined,
        respiratory_rate: respiratoryRate ? parseInt(respiratoryRate) : undefined,
        spo2: spo2 ? parseFloat(spo2) : undefined,
      });
      toast({
        title: 'Success',
        description: 'Ward round saved successfully',
      });
      router.push(`/admissions/${admissionId}/ward-round`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save ward round',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <WardRoundFormSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot record a ward round without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (admission.admission_status !== 'ACTIVE') {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Cannot Record Ward Round</p>
        <p className="text-muted-foreground mt-2">
          Ward rounds can only be recorded for active admissions.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission Details
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Ward Round"
        helpContent={`Document ward round for ${admission.patient_name}. Record vitals, clinical notes in SOAP format, and update patient condition status.`}
      />

      {/* Patient Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-accent-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Days Admitted</p>
              <p className="font-medium">
                {Math.ceil(
                  (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
                )} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vitals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ThermometerSun className="h-5 w-5" />
            <CardTitle className="text-lg">Vital Signs</CardTitle>
          </div>
          <CardDescription>
            Record current vital signs (optional but recommended)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature (°C)</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="36.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse">Pulse (BPM)</Label>
              <Input
                id="pulse"
                type="number"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                placeholder="80"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="blood-pressure">Blood Pressure</Label>
              <Input
                id="blood-pressure"
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
                placeholder="120/80"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="respiratory-rate">Respiratory Rate</Label>
              <Input
                id="respiratory-rate"
                type="number"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spo2">SpO2 (%)</Label>
              <Input
                id="spo2"
                type="number"
                step="0.1"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                placeholder="98"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Notes (Quick Entry) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle className="text-lg">Clinical Notes</CardTitle>
          </div>
          <CardDescription>
            Quick notes entry. For detailed documentation, use SOAP format below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinicalNotes">Clinical Notes</Label>
            <Textarea
              id="clinicalNotes"
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Enter clinical observations, progress notes, and findings..."
              rows={4}
            />
          </div>

          {/* Condition Status */}
          <div className="space-y-2">
            <Label htmlFor="condition-status">Patient Condition</Label>
            <Select value={conditionStatus} onValueChange={(v) => setConditionStatus(v as ConditionStatus)}>
              <SelectTrigger id="condition-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    <div className="flex flex-col">
                      <span>{status.label}</span>
                      <span className="text-xs text-accent-foreground">{status.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* SOAP Format (Detailed) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle className="text-lg">SOAP Documentation (Optional)</CardTitle>
          </div>
          <CardDescription>
            Structured clinical documentation following SHA/FHIR compliance standards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subjective */}
          <div className="space-y-2">
            <Label htmlFor="subjective">Subjective (S)</Label>
            <Textarea
              id="subjective"
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Patient's symptoms, complaints, and history..."
              rows={3}
            />
          </div>

          {/* Objective */}
          <div className="space-y-2">
            <Label htmlFor="objective">Objective (O)</Label>
            <Textarea
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Physical examination findings, vital signs, lab results..."
              rows={3}
            />
          </div>

          {/* Assessment */}
          <div className="space-y-2">
            <Label htmlFor="assessment">Assessment (A)</Label>
            <Textarea
              id="assessment"
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Clinical assessment and diagnosis..."
              rows={3}
            />
          </div>

          {/* Plan */}
          <div className="space-y-2">
            <Label htmlFor="plan">Plan (P)</Label>
            <Textarea
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Treatment plan, orders, and follow-up actions..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createWardRound.isPending || !isFormValid}
        >
          <Stethoscope className="h-4 w-4 mr-2" />
          {createWardRound.isPending ? 'Saving...' : 'Save Ward Round'}
        </Button>
      </div>
    </div>
  );
}

function WardRoundFormSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}
