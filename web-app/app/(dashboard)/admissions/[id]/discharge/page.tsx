'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Save, Plus, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue, type DiagnosisCodeValue } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdmission, useCreateDischarge } from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import type { DischargeType, DischargeMedication } from '@/lib/types/inpatient';

const DISCHARGE_TYPES: { value: DischargeType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal Discharge' },
  { value: 'ROUTINE', label: 'Routine Discharge' },
  { value: 'AGAINST_ADVICE', label: 'Against Medical Advice' },
  { value: 'TRANSFERRED', label: 'Transfer to Another Facility' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'ABSCONDED', label: 'Absconded/Left Without Notice' },
];

export default function DischargePage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const createDischarge = useCreateDischarge();

  const [dischargeType, setDischargeType] = useState<DischargeType>('NORMAL');
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());
  const [patientInstructions, setPatientInstructions] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [medications, setMedications] = useState<DischargeMedication[]>([]);

  // Clearance states
  const [billingClearance, setBillingClearance] = useState(false);
  const [pharmacyClearance, setPharmacyClearance] = useState(false);
  const [nursingClearance, setNursingClearance] = useState(false);

  // Calculate length of stay
  const lengthOfStay = useMemo(() => {
    if (!admission?.admission_date) return 0;
    const admissionDate = new Date(admission.admission_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - admissionDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [admission?.admission_date]);

  // Check if all clearances are complete
  const allClearancesComplete = billingClearance && pharmacyClearance && nursingClearance;

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
    if (!admission || !dischargeSummary || !patientInstructions) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (!allClearancesComplete) {
      toast({
        title: 'Clearances Required',
        description: 'All department clearances must be completed before discharge',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createDischarge.mutateAsync({
        admission: admissionId,
        discharge_type: dischargeType,
        discharge_date: new Date().toISOString(),
        discharged_by: user?.id || 0,
        admission_diagnosis: admission.admitting_diagnosis || '',
        final_diagnosis: finalDiagnosis.icd11Code || finalDiagnosis.icd10Display?.split(' - ')[0] || admission.admitting_diagnosis || '',
        final_diagnosis_text: finalDiagnosis.icd11Display?.split(' - ').slice(1).join(' - ') || finalDiagnosis.icd10Display?.split(' - ').slice(1).join(' - ') || admission.admitting_diagnosis_text || '',
        treatment_summary: dischargeSummary,
        patient_instructions: patientInstructions,
        follow_up_date: followUpDate || undefined,
        follow_up_instructions: followUpInstructions || undefined,
        discharge_medications: medications.filter((m) => m.drug_name),
        billing_clearance: billingClearance,
        pharmacy_clearance: pharmacyClearance,
        nursing_clearance: nursingClearance,
      });
      toast({
        title: 'Success',
        description: 'Patient discharged successfully',
      });
      router.push('/admissions');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to discharge patient',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <DischargeSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot discharge a patient without an active admission.
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
        <p className="text-xl font-semibold">Patient Already Discharged</p>
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
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Discharge Patient"
        helpContent={`Discharging ${admission.patient_name} from ${admission.ward_name}. Complete the discharge summary, medications, and clearances.`}
      />

      {/* Patient Summary with LOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admission Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
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
            <div>
              <p className="text-sm text-muted-foreground">Length of Stay</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {lengthOfStay} days
              </p>
            </div>
          </div>
          {admission.mch_registration && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">Maternity Episode</p>
              <p className="mt-1 text-amber-900">
                Linked to {admission.mch_registration_number || `MCH #${admission.mch_registration}`}. Document a postpartum follow-up date before discharge.
              </p>
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-amber-900">
                <Link href={`/mch/${admission.mch_registration}`}>Open MCH registration</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Clearances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Department Clearances
          </CardTitle>
          <CardDescription>
            All clearances must be completed before discharge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="billing-clearance"
                checked={billingClearance}
                onCheckedChange={(checked) => setBillingClearance(checked === true)}
              />
              <Label htmlFor="billing-clearance" className="cursor-pointer">
                Billing Clearance
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="pharmacy-clearance"
                checked={pharmacyClearance}
                onCheckedChange={(checked) => setPharmacyClearance(checked === true)}
              />
              <Label htmlFor="pharmacy-clearance" className="cursor-pointer">
                Pharmacy Clearance
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="nursing-clearance"
                checked={nursingClearance}
                onCheckedChange={(checked) => setNursingClearance(checked === true)}
              />
              <Label htmlFor="nursing-clearance" className="cursor-pointer">
                Nursing Clearance
              </Label>
            </div>
          </div>
          {!allClearancesComplete && (
            <p className="text-sm text-amber-600 mt-4">
              ⚠️ All clearances must be checked before you can discharge the patient.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Discharge Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discharge Summary</CardTitle>
          <CardDescription>
            Complete the discharge summary and follow-up instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Discharge Type */}
          <div className="space-y-2">
            <Label htmlFor="discharge-type">Discharge Type *</Label>
            <Select value={dischargeType} onValueChange={(v) => setDischargeType(v as DischargeType)}>
              <SelectTrigger id="discharge-type" aria-label="Discharge Type">
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
          <DiagnosisCodeInput
            value={finalDiagnosis}
            onChange={setFinalDiagnosis}
            label="Final Diagnosis"
            placeholder="Search for diagnosis..."
          />

          {/* Discharge Summary (Treatment Summary) */}
          <div className="space-y-2">
            <Label htmlFor="discharge-summary">Discharge Summary *</Label>
            <Textarea
              id="discharge-summary"
              value={dischargeSummary}
              onChange={(e) => setDischargeSummary(e.target.value)}
              placeholder="Provide a comprehensive summary of the patient's hospital stay, treatment given, and outcomes..."
              rows={6}
            />
          </div>

          {/* Patient Instructions */}
          <div className="space-y-2">
            <Label htmlFor="patient-instructions">Patient Instructions *</Label>
            <Textarea
              id="patient-instructions"
              value={patientInstructions}
              onChange={(e) => setPatientInstructions(e.target.value)}
              placeholder="Discharge instructions for patient..."
              rows={3}
            />
          </div>

          {/* Follow-up */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="follow-up-date">Follow-up Date</Label>
              <DatePicker
                value={followUpDate ? parseISO(followUpDate) : undefined}
                onChange={(date) => setFollowUpDate(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder={admission.mch_registration ? 'Select postpartum follow-up date' : 'Select follow-up date'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow-up-instructions">Follow-up Instructions</Label>
              <Input
                id="follow-up-instructions"
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
          disabled={createDischarge.isPending || !dischargeSummary || !patientInstructions || !allClearancesComplete}
        >
          <Save className="h-4 w-4 mr-2" />
          {createDischarge.isPending ? 'Discharging...' : 'Confirm Discharge'}
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
