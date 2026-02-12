'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Users, AlertTriangle, Clock, Pill } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInpatientWards, useCreateShiftHandover } from '@/lib/hooks/use-inpatient';
import { useToast } from '@/lib/hooks/use-toast';
import type { ShiftEndingType } from '@/lib/types/inpatient';

const SHIFT_OPTIONS: { value: ShiftEndingType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift (6:00 - 14:00)' },
  { value: 'EVENING', label: 'Evening Shift (14:00 - 22:00)' },
  { value: 'NIGHT', label: 'Night Shift (22:00 - 6:00)' },
];

export default function NewHandoverPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: wards } = useInpatientWards();
  const createHandover = useCreateShiftHandover();

  const [wardId, setWardId] = useState<string>('');
  const [outgoingShift, setOutgoingShift] = useState<ShiftEndingType | ''>('');
  const [incomingShift, setIncomingShift] = useState<ShiftEndingType | ''>('');
  const [summary, setSummary] = useState('');
  const [criticalPatients, setCriticalPatients] = useState('');
  const [pendingTasks, setPendingTasks] = useState('');
  const [medicationsDue, setMedicationsDue] = useState('');

  const handleSubmit = async () => {
    if (!wardId || !outgoingShift || !incomingShift || !summary) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Build general_notes from the text fields
      const notes = [
        summary,
        criticalPatients && `Critical Patients: ${criticalPatients}`,
        pendingTasks && `Pending Tasks: ${pendingTasks}`,
        medicationsDue && `Medications Due: ${medicationsDue}`,
      ].filter(Boolean).join('\n\n');

      await createHandover.mutateAsync({
        ward: Number(wardId),
        shift_date: new Date().toISOString().slice(0, 10),
        shift_ending: outgoingShift,
        outgoing_nurse: 0, // TODO: Get from authenticated user
        incoming_nurse: 0, // TODO: Get from form or user selection
        total_patients: 0, // TODO: Calculate from ward data
        general_notes: notes,
      });
      toast({
        title: 'Success',
        description: 'Handover submitted successfully',
      });
      router.push('/admissions/handover');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to submit handover',
        variant: 'destructive',
      });
    }
  };

  const isFormValid = wardId && outgoingShift && incomingShift && summary;

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Shift Handover"
        helpContent="Create a handover report for the incoming shift. Include patient status, critical information, and pending tasks."
      />

      {/* Ward and Shift Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shift Details
          </CardTitle>
          <CardDescription>
            Select the ward and shift information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ward">Ward *</Label>
              <Select value={wardId} onValueChange={setWardId}>
                <SelectTrigger id="ward" aria-label="Ward">
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wards?.results?.map((ward) => (
                    <SelectItem key={ward.id} value={String(ward.id)}>
                      {ward.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outgoing-shift">Outgoing Shift *</Label>
              <Select value={outgoingShift} onValueChange={(v) => setOutgoingShift(v as ShiftEndingType)}>
                <SelectTrigger id="outgoing-shift" aria-label="Outgoing Shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_OPTIONS.map((shift) => (
                    <SelectItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="incoming-shift">Incoming Shift *</Label>
              <Select value={incomingShift} onValueChange={(v) => setIncomingShift(v as ShiftEndingType)}>
                <SelectTrigger id="incoming-shift" aria-label="Incoming Shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_OPTIONS.map((shift) => (
                    <SelectItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Handover Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Handover Summary
          </CardTitle>
          <CardDescription>
            Provide a summary of the shift and key information for the incoming team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="summary">Summary *</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Provide an overview of the shift - patient status, key events, etc."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Critical Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Critical Information
          </CardTitle>
          <CardDescription>
            Highlight any critical patients or urgent matters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="critical-patients">Critical Patients</Label>
            <Textarea
              id="critical-patients"
              value={criticalPatients}
              onChange={(e) => setCriticalPatients(e.target.value)}
              placeholder="List patients requiring close monitoring or special attention"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-tasks">Pending Tasks</Label>
            <Textarea
              id="pending-tasks"
              value={pendingTasks}
              onChange={(e) => setPendingTasks(e.target.value)}
              placeholder="List any tasks that need to be completed by the incoming shift"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Medications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Medications Due
          </CardTitle>
          <CardDescription>
            List medications due during the incoming shift
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="medications-due">Medications Due</Label>
            <Textarea
              id="medications-due"
              value={medicationsDue}
              onChange={(e) => setMedicationsDue(e.target.value)}
              placeholder="List scheduled medications with times and bed numbers"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createHandover.isPending || !isFormValid}
        >
          <Save className="h-4 w-4 mr-2" />
          {createHandover.isPending ? 'Submitting...' : 'Submit Handover'}
        </Button>
      </div>
    </div>
  );
}
