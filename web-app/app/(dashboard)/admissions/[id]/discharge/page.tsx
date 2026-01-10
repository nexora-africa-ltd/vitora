'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
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
import { useAdmission, useCreateDischarge } from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import type { DischargeType, DischargeMedication } from '@/lib/types/inpatient';

const DISCHARGE_TYPES: { value: DischargeType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal Discharge' },
  { value: 'AGAINST_ADVICE', label: 'Against Medical Advice' },
  { value: 'TRANSFERRED', label: 'Transfer to Another Facility' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'ABSCONDED', label: 'Absconded/Left Without Notice' },
];

export default function DischargePage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const createDischarge = useCreateDischarge();

  const [dischargeType, setDischargeType] = useState<DischargeType>('NORMAL');
  const [treatmentSummary, setTreatmentSummary] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [finalDiagnosisText, setFinalDiagnosisText] = useState('');
  const [patientInstructions, setPatientInstructions] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [medications, setMedications] = useState<DischargeMedication[]>([]);

  const addMedication = () => {
    const newMed: DischargeMedication = { 
      drug_name: '', 
      dosage: '', 
      frequency: '', 
      duration: '', 
      instructions: '' 
    };
    setMedications([...medications, newMed]);
  };

  const updateMedication = (index: number, field: keyof DischargeMedication, value: string) => {
    const updated: DischargeMedication[] = medications.map((med, i) => {
      if (i === index) {
        return { ...med, [field]: value };
      }
      return med;
    });
    setMedications(updated);
  };

  const removeMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!admission || !treatmentSummary || !patientInstructions) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await createDischarge.mutateAsync({
        admission: admissionId,
        discharge_type: dischargeType,
        discharge_date: new Date().toISOString(),
        discharged_by: user?.id || 0,
        admission_diagnosis: admission.admitting_diagnosis || '',
        final_diagnosis: finalDiagnosis || admission.admitting_diagnosis || '',
        final_diagnosis_text: finalDiagnosisText || admission.admitting_diagnosis_text || '',
        treatment_summary: treatmentSummary,
        patient_instructions: patientInstructions,
        follow_up_date: followUpDate || undefined,
        follow_up_instructions: followUpInstructions || undefined,
        discharge_medications: medications.filter((m) => m.drug_name),
      });
      alert('Patient discharged successfully');
      router.push('/admissions');
    } catch (error) {
      alert('Failed to discharge patient');
      console.error(error);
    }
  };

  if (isLoading) {
    return <DischargeSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Admission not found</h2>
        <p className="text-muted-foreground mt-2">
          Cannot discharge a patient without an active admission.
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
        <h2 className="text-xl font-semibold">Patient Already Discharged</h2>
        <p className="text-muted-foreground mt-2">
          This admission has already been discharged or is inactive.
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
        title="Discharge Patient" 
        description={`Discharging ${admission.patient_name} from ${admission.ward_name}`} 
      />

      {/* Patient Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Admission Number</p>
              <p className="font-medium">{admission.admission_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admitting Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discharge Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discharge Details</CardTitle>
          <CardDescription>
            Complete the discharge summary and follow-up instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Discharge Type */}
          <div className="space-y-2">
            <Label>Discharge Type *</Label>
            <Select value={dischargeType} onValueChange={(v) => setDischargeType(v as DischargeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCHARGE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Final Diagnosis */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Final Diagnosis (ICD-10)</Label>
              <Input
                value={finalDiagnosis}
                onChange={(e) => setFinalDiagnosis(e.target.value)}
                placeholder="e.g., B50.0"
              />
            </div>
            <div className="space-y-2">
              <Label>Final Diagnosis Text</Label>
              <Input
                value={finalDiagnosisText}
                onChange={(e) => setFinalDiagnosisText(e.target.value)}
                placeholder="e.g., Severe falciparum malaria"
              />
            </div>
          </div>

          {/* Treatment Summary */}
          <div className="space-y-2">
            <Label>Treatment Summary *</Label>
            <Textarea
              value={treatmentSummary}
              onChange={(e) => setTreatmentSummary(e.target.value)}
              placeholder="Provide a comprehensive summary of the patient's hospital stay, treatment given, and outcomes..."
              rows={6}
            />
          </div>

          {/* Patient Instructions */}
          <div className="space-y-2">
            <Label>Patient Instructions *</Label>
            <Textarea
              value={patientInstructions}
              onChange={(e) => setPatientInstructions(e.target.value)}
              placeholder="Discharge instructions for patient..."
              rows={3}
            />
          </div>

          {/* Follow-up */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Follow-up Date</Label>
              <Input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>Follow-up Instructions</Label>
              <Input
                value={followUpInstructions}
                onChange={(e) => setFollowUpInstructions(e.target.value)}
                placeholder="e.g., Return to OPD in 2 weeks"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discharge Medications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Discharge Medications</CardTitle>
              <CardDescription>
                Medications to be taken at home after discharge
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addMedication}>
              <Plus className="h-4 w-4 mr-2" />
              Add Medication
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No discharge medications added. Click &quot;Add Medication&quot; to add.
            </p>
          ) : (
            <div className="space-y-4">
              {medications.map((med, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Medication {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedication(index)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Medication Name *</Label>
                      <Input
                        value={med.drug_name}
                        onChange={(e) => updateMedication(index, 'drug_name', e.target.value)}
                        placeholder="e.g., Amoxicillin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dosage *</Label>
                      <Input
                        value={med.dosage}
                        onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                        placeholder="e.g., 500mg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency *</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                        placeholder="e.g., 8 hourly"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Instructions</Label>
                      <Input
                        value={med.instructions || ''}
                        onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                        placeholder="e.g., Take after meals"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={createDischarge.isPending || !treatmentSummary || !patientInstructions}
        >
          <Save className="h-4 w-4 mr-2" />
          {createDischarge.isPending ? 'Discharging...' : 'Discharge Patient'}
        </Button>
      </div>
    </div>
  );
}

function DischargeSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-96" />
    </div>
  );
}
