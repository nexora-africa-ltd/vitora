'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/lib/hooks/use-toast';
import { useAdmission, useCreateInterFacilityTransfer, useSubmitInterFacilityTransfer } from '@/lib/hooks/use-inpatient';
import type { InterFacilityTransferPriority, InterFacilityTransferReason } from '@/lib/types/inpatient';

const REASON_OPTIONS: Array<{ value: InterFacilityTransferReason; label: string }> = [
  { value: 'HIGHER_LEVEL_CARE', label: 'Higher-level care' },
  { value: 'SPECIALIST_INPUT', label: 'Specialist input' },
  { value: 'NO_CAPACITY', label: 'No capacity' },
  { value: 'EQUIPMENT_LIMITATION', label: 'Equipment limitation' },
  { value: 'PATIENT_REQUEST', label: 'Patient request' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITY_OPTIONS: Array<{ value: InterFacilityTransferPriority; label: string }> = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'STAT', label: 'STAT' },
];

export default function CreateInterFacilityTransferPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const admissionId = params.id;
  const { data: admission } = useAdmission(admissionId);
  const createTransfer = useCreateInterFacilityTransfer();
  const submitTransfer = useSubmitInterFacilityTransfer();

  const [destinationFacilityName, setDestinationFacilityName] = useState('');
  const [reasonCode, setReasonCode] = useState<InterFacilityTransferReason>('HIGHER_LEVEL_CARE');
  const [priority, setPriority] = useState<InterFacilityTransferPriority>('URGENT');
  const [reasonDetails, setReasonDetails] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [transportMode, setTransportMode] = useState<'AMBULANCE' | 'PRIVATE' | 'OTHER'>('AMBULANCE');
  const [escortRequired, setEscortRequired] = useState(false);
  const [escortName, setEscortName] = useState('');
  const [submitImmediately, setSubmitImmediately] = useState(true);

  const isPending = createTransfer.isPending || submitTransfer.isPending;

  const handleCreate = async () => {
    if (!admission) return;
    if (!destinationFacilityName.trim() || !clinicalSummary.trim() || !handoverNotes.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Destination facility, clinical summary, and handover notes are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const created = await createTransfer.mutateAsync({
        source_admission: admission.id,
        destination_facility_name: destinationFacilityName.trim(),
        reason_code: reasonCode,
        priority,
        reason_details: reasonDetails,
        clinical_summary: clinicalSummary,
        handover_notes: handoverNotes,
        transport_mode: transportMode,
        escort_required: escortRequired,
        escort_name: escortRequired ? escortName : '',
      });

      if (submitImmediately) {
        await submitTransfer.mutateAsync(created.id);
      }

      toast({
        title: submitImmediately ? 'Transfer submitted' : 'Transfer draft created',
        description: `${created.transfer_number} ${submitImmediately ? 'is pending destination acceptance.' : 'saved as draft.'}`,
      });
      router.push(`/admissions/${admission.id}`);
    } catch {
      toast({
        title: 'Failed to create transfer',
        description: 'Please review your entries and try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PermissionGate action="inpatient.submit_interfacility_transfer">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Inter-Facility Transfer"
          helpContent="Create and optionally submit an inter-facility transfer request for this admission."
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Request Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Destination Facility Name *</Label>
                <Input
                  value={destinationFacilityName}
                  onChange={(e) => setDestinationFacilityName(e.target.value)}
                  placeholder="e.g., County Referral Hospital"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as InterFacilityTransferReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as InterFacilityTransferPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transport</Label>
                <Select value={transportMode} onValueChange={(v) => setTransportMode(v as 'AMBULANCE' | 'PRIVATE' | 'OTHER')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AMBULANCE">Ambulance</SelectItem>
                    <SelectItem value="PRIVATE">Private Vehicle</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason Details</Label>
              <Textarea value={reasonDetails} onChange={(e) => setReasonDetails(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Clinical Summary *</Label>
              <Textarea value={clinicalSummary} onChange={(e) => setClinicalSummary(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Handover Notes *</Label>
              <Textarea value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} rows={4} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={escortRequired} onCheckedChange={(v) => setEscortRequired(Boolean(v))} />
              <Label>Escort required</Label>
            </div>
            {escortRequired && (
              <div className="space-y-2">
                <Label>Escort Name</Label>
                <Input value={escortName} onChange={(e) => setEscortName(e.target.value)} />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox checked={submitImmediately} onCheckedChange={(v) => setSubmitImmediately(Boolean(v))} />
              <Label>Submit immediately after save</Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" asChild>
                <Link href={`/admissions/${admissionId}`}>Cancel</Link>
              </Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {submitImmediately ? 'Create & Submit' : 'Create Draft'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}
