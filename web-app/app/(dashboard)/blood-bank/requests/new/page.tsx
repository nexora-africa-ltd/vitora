'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateBloodRequest } from '@/lib/hooks/use-blood-bank';
import { getApiErrorMessage } from '@/lib/api/client';
import type { BloodRequestCreateData, BloodGroup, BloodComponent, RequestUrgency } from '@/lib/types/blood-bank';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS: { value: BloodComponent; label: string }[] = [
  { value: 'WHOLE_BLOOD', label: 'Whole Blood' },
  { value: 'PACKED_RBC', label: 'Packed RBCs' },
  { value: 'PLATELETS', label: 'Platelets' },
  { value: 'FFP', label: 'Fresh Frozen Plasma' },
  { value: 'CRYOPRECIPITATE', label: 'Cryoprecipitate' },
];

export default function NewBloodRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateBloodRequest();

  const patientParam = searchParams.get('patient');
  const encounterParam = searchParams.get('encounter');

  const [patientId, setPatientId] = useState<number | null>(
    patientParam ? Number(patientParam) : null
  );
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [component, setComponent] = useState<BloodComponent>('PACKED_RBC');
  const [unitsRequested, setUnitsRequested] = useState('1');
  const [urgency, setUrgency] = useState<RequestUrgency>('ROUTINE');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [patientHemoglobin, setPatientHemoglobin] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!patientId) {
      setError('Patient is required');
      return;
    }
    if (!clinicalIndication.trim()) {
      setError('Clinical indication is required');
      return;
    }

    const data: BloodRequestCreateData = {
      patient: patientId,
      blood_group: bloodGroup,
      component,
      units_requested: Number(unitsRequested) || 1,
      urgency,
      clinical_indication: clinicalIndication.trim(),
    };
    if (encounterParam) data.encounter = Number(encounterParam);
    if (patientHemoglobin) data.patient_hemoglobin = Number(patientHemoglobin);
    if (notes.trim()) data.notes = notes.trim();

    try {
      await createMutation.mutateAsync(data);
      toast.success('Blood request created');
      router.push('/blood-bank/requests');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [patientId, bloodGroup, component, unitsRequested, urgency, clinicalIndication, encounterParam, patientHemoglobin, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="New Blood Request"
        helpContent="Request blood products for a patient. Specify urgency to prioritize processing. Emergency requests are flagged immediately."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Patient &amp; Blood Product</CardTitle>
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
                <Label>Blood Group *</Label>
                <Select value={bloodGroup} onValueChange={(v) => setBloodGroup(v as BloodGroup)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Component *</Label>
                <Select value={component} onValueChange={(v) => setComponent(v as BloodComponent)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPONENTS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="units">Units Requested *</Label>
                <Input
                  id="units"
                  type="number"
                  value={unitsRequested}
                  onChange={(e) => setUnitsRequested(e.target.value)}
                  min="1"
                  max="20"
                />
              </div>
              <div>
                <Label>Urgency *</Label>
                <Select value={urgency} onValueChange={(v) => setUrgency(v as RequestUrgency)}>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Clinical Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="indication">Clinical Indication *</Label>
              <Textarea
                id="indication"
                value={clinicalIndication}
                onChange={(e) => setClinicalIndication(e.target.value)}
                placeholder="e.g., Acute blood loss from surgery, severe anemia..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="hemoglobin">Patient Hemoglobin (g/dL)</Label>
              <Input
                id="hemoglobin"
                type="number"
                value={patientHemoglobin}
                onChange={(e) => setPatientHemoglobin(e.target.value)}
                placeholder="e.g., 7.5"
                step="0.1"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requirements or notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </div>
  );
}
