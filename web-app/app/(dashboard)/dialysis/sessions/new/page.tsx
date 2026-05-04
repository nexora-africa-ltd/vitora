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
import { useCreateDialysisSession } from '@/lib/hooks/use-dialysis';
import { getApiErrorMessage } from '@/lib/api/client';
import type { DialysisSessionCreateData } from '@/lib/types/dialysis';

export default function NewDialysisSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateDialysisSession();

  const patientParam = searchParams.get('patient');
  const orderParam = searchParams.get('order');

  const [patientId, setPatientId] = useState<number | null>(
    patientParam ? Number(patientParam) : null
  );
  const [orderId, setOrderId] = useState(orderParam || '');
  const [dialysisType, setDialysisType] = useState<string>('HEMODIALYSIS');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [bloodFlowRate, setBloodFlowRate] = useState('');
  const [dialysateFlowRate, setDialysateFlowRate] = useState('');
  const [ufGoalMl, setUfGoalMl] = useState('');
  const [preWeightKg, setPreWeightKg] = useState('');
  const [preBp, setPreBp] = useState('');
  const [prePulse, setPrePulse] = useState('');
  const [preTemperature, setPreTemperature] = useState('');
  const [machineNumber, setMachineNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!patientId) {
      setError('Patient is required');
      return;
    }
    if (!scheduledDate) {
      setError('Scheduled date is required');
      return;
    }

    const data: DialysisSessionCreateData = {
      patient: patientId,
      dialysis_type: dialysisType as DialysisSessionCreateData['dialysis_type'],
      scheduled_date: scheduledDate,
    };
    if (orderId) data.order = Number(orderId);
    if (bloodFlowRate) data.blood_flow_rate = Number(bloodFlowRate);
    if (dialysateFlowRate) data.dialysate_flow_rate = Number(dialysateFlowRate);
    if (ufGoalMl) data.uf_goal_ml = Number(ufGoalMl);
    if (preWeightKg) data.pre_weight_kg = Number(preWeightKg);
    if (preBp.trim()) data.pre_bp = preBp.trim();
    if (prePulse) data.pre_pulse = Number(prePulse);
    if (preTemperature) data.pre_temperature = Number(preTemperature);
    if (machineNumber.trim()) data.machine_number = machineNumber.trim();
    if (notes.trim()) data.notes = notes.trim();

    try {
      await createMutation.mutateAsync(data);
      toast.success('Dialysis session created');
      router.push('/dialysis/sessions');
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [patientId, orderId, dialysisType, scheduledDate, bloodFlowRate, dialysateFlowRate, ufGoalMl, preWeightKg, preBp, prePulse, preTemperature, machineNumber, notes, createMutation, router]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="New Dialysis Session"
        helpContent="Schedule a new dialysis session. Pre-dialysis vitals can be recorded now or when the session starts."
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
            <CardTitle className="text-base sm:text-lg">Session Details</CardTitle>
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
                <Label htmlFor="scheduled-date">Scheduled Date *</Label>
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="blood-flow">Blood Flow Rate (ml/min)</Label>
                <Input
                  id="blood-flow"
                  type="number"
                  value={bloodFlowRate}
                  onChange={(e) => setBloodFlowRate(e.target.value)}
                  placeholder="e.g., 300"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="dialysate-flow">Dialysate Flow Rate (ml/min)</Label>
                <Input
                  id="dialysate-flow"
                  type="number"
                  value={dialysateFlowRate}
                  onChange={(e) => setDialysateFlowRate(e.target.value)}
                  placeholder="e.g., 500"
                  min="0"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="uf-goal">UF Goal (ml)</Label>
                <Input
                  id="uf-goal"
                  type="number"
                  value={ufGoalMl}
                  onChange={(e) => setUfGoalMl(e.target.value)}
                  placeholder="e.g., 2000"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="machine">Machine Number</Label>
                <Input
                  id="machine"
                  value={machineNumber}
                  onChange={(e) => setMachineNumber(e.target.value)}
                  placeholder="e.g., HD-003"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Pre-Dialysis Vitals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pre-weight">Pre-Weight (kg)</Label>
              <Input
                id="pre-weight"
                type="number"
                value={preWeightKg}
                onChange={(e) => setPreWeightKg(e.target.value)}
                placeholder="e.g., 72.5"
                step="0.1"
                min="0"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pre-bp">Blood Pressure</Label>
                <Input
                  id="pre-bp"
                  value={preBp}
                  onChange={(e) => setPreBp(e.target.value)}
                  placeholder="e.g., 140/90"
                />
              </div>
              <div>
                <Label htmlFor="pre-pulse">Pulse (BPM)</Label>
                <Input
                  id="pre-pulse"
                  type="number"
                  value={prePulse}
                  onChange={(e) => setPrePulse(e.target.value)}
                  placeholder="e.g., 78"
                  min="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pre-temp">Temperature (°C)</Label>
              <Input
                id="pre-temp"
                type="number"
                value={preTemperature}
                onChange={(e) => setPreTemperature(e.target.value)}
                placeholder="e.g., 36.8"
                step="0.1"
                min="34"
                max="42"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Session notes, patient complaints, special considerations..."
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
          {createMutation.isPending ? 'Saving...' : 'Create Session'}
        </Button>
      </div>
    </div>
  );
}
