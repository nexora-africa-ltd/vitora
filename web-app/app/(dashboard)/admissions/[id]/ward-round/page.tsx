'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Stethoscope, ThermometerSun } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import type { ConditionStatus } from '@/lib/types/inpatient';

const CONDITION_STATUSES: { value: ConditionStatus; label: string; description: string }[] = [
  { value: 'STABLE', label: 'Stable', description: 'Patient condition is stable' },
  { value: 'IMPROVING', label: 'Improving', description: 'Patient showing signs of improvement' },
  { value: 'DETERIORATING', label: 'Deteriorating', description: 'Patient condition is worsening' },
  { value: 'CRITICAL', label: 'Critical', description: 'Patient requires immediate attention' },
];

export default function WardRoundPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const createWardRound = useCreateWardRound();

  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('STABLE');
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

  // Validate all required SOAP fields (SHA/FHIR compliance)
  const isFormValid = Boolean(
    admission && 
    subjective.trim() && 
    objective.trim() && 
    assessment.trim() && 
    plan.trim() &&
    user?.id != null
  );

  const handleSubmit = async () => {
    if (!isFormValid || !user?.id) {
      alert('Please fill in all required SOAP fields (Subjective, Objective, Assessment, Plan)');
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
        subjective: subjective.trim(),
        objective: objective.trim(),
        assessment: assessment.trim(),
        plan: plan.trim(),
        temperature: temperature ? parseFloat(temperature) : undefined,
        pulse: pulse ? parseInt(pulse) : undefined,
        blood_pressure: bloodPressure || undefined,
        respiratory_rate: respiratoryRate ? parseInt(respiratoryRate) : undefined,
        spo2: spo2 ? parseFloat(spo2) : undefined,
      });
      alert('Ward round documented successfully');
      router.push(`/admissions/${admissionId}`);
    } catch (error) {
      alert('Failed to save ward round');
      console.error(error);
    }
  };

  if (isLoading) {
    return <WardRoundSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Admission not found</h2>
        <p className="text-muted-foreground mt-2">
          Cannot record a ward round without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          Back to Admissions
        </Button>
      </div>
    );
  }

  if (admission.admission_status !== 'ACTIVE') {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Cannot Record Ward Round</h2>
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href={`/admissions/${admissionId}`} className="text-sm text-muted-foreground hover:text-primary">
          Back to Admission
        </Link>
      </div>

      <PageHeader 
        title="Ward Round" 
        description={`Document ward round for ${admission.patient_name}`} 
      />

      {/* Patient Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Days Admitted</p>
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
              <Label>Temperature (°C)</Label>
              <Input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="36.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Pulse (BPM)</Label>
              <Input
                type="number"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                placeholder="80"
              />
            </div>
            <div className="space-y-2">
              <Label>Blood Pressure</Label>
              <Input
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
                placeholder="120/80"
              />
            </div>
            <div className="space-y-2">
              <Label>Respiratory Rate</Label>
              <Input
                type="number"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="space-y-2">
              <Label>SpO2 (%)</Label>
              <Input
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

      {/* Clinical Assessment - SOAP Format */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            <CardTitle className="text-lg">Clinical Assessment (SOAP)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Condition Status */}
          <div className="space-y-2">
            <Label>Patient Condition *</Label>
            <Select value={conditionStatus} onValueChange={(v) => setConditionStatus(v as ConditionStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    <div className="flex flex-col">
                      <span>{status.label}</span>
                      <span className="text-xs text-muted-foreground">{status.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subjective - Required per SHA/FHIR */}
          <div className="space-y-2">
            <Label>Subjective (S) *</Label>
            <Textarea
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Patient's symptoms, complaints, and history..."
              rows={3}
              required
            />
          </div>

          {/* Objective - Required per SHA/FHIR */}
          <div className="space-y-2">
            <Label>Objective (O) *</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Physical examination findings, vital signs, lab results..."
              rows={3}
              required
            />
          </div>

          {/* Assessment - Required per SHA/FHIR */}
          <div className="space-y-2">
            <Label>Assessment (A) *</Label>
            <Textarea
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Clinical assessment and diagnosis..."
              rows={3}
              required
            />
          </div>

          {/* Plan - Required per SHA/FHIR */}
          <div className="space-y-2">
            <Label>Plan (P) *</Label>
            <Textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Treatment plan, orders, and follow-up actions..."
              rows={4}
              required
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

function WardRoundSkeleton() {
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
