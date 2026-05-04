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
import { useCreateDialysisOrder } from '@/lib/hooks/use-dialysis';
import { getApiErrorMessage } from '@/lib/api/client';
import type { DialysisOrderCreateData } from '@/lib/types/dialysis';

export default function NewDialysisOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateDialysisOrder();

  const patientParam = searchParams.get('patient');

  const [patientId, setPatientId] = useState<number | null>(
    patientParam ? Number(patientParam) : null
  );
  const [dialysisType, setDialysisType] = useState<string>('HEMODIALYSIS');
  const [frequency, setFrequency] = useState<string>('THREE_PER_WEEK');
  const [targetDuration, setTargetDuration] = useState('240');
  const [bloodFlowRate, setBloodFlowRate] = useState('300');
  const [dialysateFlowRate, setDialysateFlowRate] = useState('500');
  const [targetUfVolume, setTargetUfVolume] = useState('');
  const [dialysateComposition, setDialysateComposition] = useState('');
  const [anticoagulation, setAnticoagulation] = useState('');
  const [dryWeightKg, setDryWeightKg] = useState('');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
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
    if (!startDate) {
      setError('Start date is required');
      return;
    }

    const data: DialysisOrderCreateData = {
      patient: patientId,
      dialysis_type: dialysisType as DialysisOrderCreateData['dialysis_type'],
      frequency: frequency as DialysisOrderCreateData['frequency'],
      clinical_indication: clinicalIndication.trim(),
      start_date: startDate,
    };
    if (targetDuration) data.target_duration_minutes = Number(targetDuration);
    if (bloodFlowRate) data.blood_flow_rate = Number(bloodFlowRate);
    if (dialysateFlowRate) data.dialysate_flow_rate = Number(dialysateFlowRate);
    if (targetUfVolume) data.target_uf_volume = Number(targetUfVolume);
    if (dialysateComposition.trim()) data.dialysate_composition = dialysateComposition.trim();
    if (anticoagulation.trim()) data.anticoagulation = anticoagulation.trim();
    if (dryWeightKg) data.dry_weight_kg = Number(dryWeightKg);
    if (notes.trim()) data.notes = notes.trim();

    try {
      await createMutation.mutateAsync(data);
      toast.success('Dialysis order created');
      router.push('/dialysis/orders');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [patientId, dialysisType, frequency, targetDuration, bloodFlowRate, dialysateFlowRate, targetUfVolume, dialysateComposition, anticoagulation, dryWeightKg, clinicalIndication, startDate, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="New Dialysis Order"
        helpContent="Create a standing dialysis prescription for a patient. This defines the treatment parameters for recurring sessions."
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
            <CardTitle className="text-base sm:text-lg">Prescription Details</CardTitle>
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
                <Label>Dialysis Type *</Label>
                <Select value={dialysisType} onValueChange={setDialysisType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HEMODIALYSIS">Hemodialysis</SelectItem>
                    <SelectItem value="PERITONEAL">Peritoneal Dialysis</SelectItem>
                    <SelectItem value="CRRT">CRRT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency *</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="THREE_PER_WEEK">3x per Week</SelectItem>
                    <SelectItem value="TWO_PER_WEEK">2x per Week</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="AS_NEEDED">As Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="duration">Target Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(e.target.value)}
                  placeholder="240"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="start-date">Start Date *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="indication">Clinical Indication *</Label>
              <Textarea
                id="indication"
                value={clinicalIndication}
                onChange={(e) => setClinicalIndication(e.target.value)}
                placeholder="e.g., End-stage renal disease, Acute kidney injury..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Treatment Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="blood-flow">Blood Flow Rate (ml/min)</Label>
                <Input
                  id="blood-flow"
                  type="number"
                  value={bloodFlowRate}
                  onChange={(e) => setBloodFlowRate(e.target.value)}
                  placeholder="300"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="dialysate-flow">Dialysate Flow (ml/min)</Label>
                <Input
                  id="dialysate-flow"
                  type="number"
                  value={dialysateFlowRate}
                  onChange={(e) => setDialysateFlowRate(e.target.value)}
                  placeholder="500"
                  min="0"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="uf-volume">Target UF Volume (ml)</Label>
                <Input
                  id="uf-volume"
                  type="number"
                  value={targetUfVolume}
                  onChange={(e) => setTargetUfVolume(e.target.value)}
                  placeholder="e.g., 2000"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="dry-weight">Dry Weight (kg)</Label>
                <Input
                  id="dry-weight"
                  type="number"
                  value={dryWeightKg}
                  onChange={(e) => setDryWeightKg(e.target.value)}
                  placeholder="e.g., 68.0"
                  step="0.1"
                  min="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="dialysate-comp">Dialysate Composition</Label>
              <Input
                id="dialysate-comp"
                value={dialysateComposition}
                onChange={(e) => setDialysateComposition(e.target.value)}
                placeholder="e.g., Bicarbonate-based, K+ 2.0 mEq/L"
              />
            </div>

            <div>
              <Label htmlFor="anticoagulation">Anticoagulation</Label>
              <Input
                id="anticoagulation"
                value={anticoagulation}
                onChange={(e) => setAnticoagulation(e.target.value)}
                placeholder="e.g., Heparin 5000 IU bolus, 1000 IU/hr"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional prescription notes..."
                rows={2}
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
          {createMutation.isPending ? 'Saving...' : 'Create Order'}
        </Button>
      </div>
    </div>
  );
}
