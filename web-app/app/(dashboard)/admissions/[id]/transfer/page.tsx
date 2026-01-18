'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, MoveRight, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdmission,
  useBeds,
  useCreateTransfer,
  useInpatientWards,
  useTransfers
} from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type { TransferReason } from '@/lib/types/inpatient';

const TRANSFER_REASONS: { value: TransferReason; label: string }[] = [
  { value: 'STEP_UP', label: 'Step Up Care (e.g., to ICU)' },
  { value: 'STEP_DOWN', label: 'Step Down Care' },
  { value: 'SPECIALTY', label: 'Specialty Care Required' },
  { value: 'BED_MANAGEMENT', label: 'Bed Management/Capacity' },
  { value: 'PATIENT_REQUEST', label: 'Patient Request' },
  { value: 'OTHER', label: 'Other' },
];

export default function TransferPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const { data: wards } = useInpatientWards();
  const { data: transfersData } = useTransfers({ admission: admissionId });
  const createTransfer = useCreateTransfer();

  const [targetWardId, setTargetWardId] = useState<string>('');
  const [targetBedId, setTargetBedId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<TransferReason>('SPECIALTY');
  const [clinicalJustification, setClinicalJustification] = useState('');

  const selectedWardId = useMemo(() => (targetWardId ? Number(targetWardId) : undefined), [targetWardId]);
  const { data: beds } = useBeds({ ward: selectedWardId, status: 'AVAILABLE' });

  // Get transfers list from paginated response
  const transfers = Array.isArray(transfersData) ? transfersData : transfersData?.results ?? [];

  const handleSubmit = async () => {
    if (!admission || !targetWardId || !targetBedId || !clinicalJustification) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createTransfer.mutateAsync({
        admission: admissionId,
        from_ward: admission.ward,
        from_bed: admission.bed,
        to_ward: Number(targetWardId),
        to_bed: Number(targetBedId),
        transfer_reason: transferReason,
        clinical_justification: clinicalJustification,
        transferred_by: user?.id,
      });
      toast({
        title: 'Success',
        description: 'Transfer completed successfully',
      });
      router.push(`/admissions/${admissionId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to transfer patient',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  if (isLoading) {
    return <TransferSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Admission not found</h2>
        <p className="text-muted-foreground mt-2">
          Cannot transfer a patient without an active admission.
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
        <h2 className="text-xl font-semibold">Cannot Transfer</h2>
        <p className="text-muted-foreground mt-2">
          Only active admissions can be transferred.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission Details
        </Button>
      </div>
    );
  }

  const availableWards = ((wards as any)?.results ?? wards ?? []).filter(
    (w: any) => w.id !== admission.ward
  );

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
        title="Transfer Patient"
        description={`Transfer ${admission.patient_name} to a different ward/bed`}
      />

      {/* Current Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Location</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Ward</p>
              <p className="font-medium">{admission.ward_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Bed</p>
              <p className="font-medium">{admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admission Date</p>
              <p className="font-medium">{new Date(admission.admission_date).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transfer To</CardTitle>
          <CardDescription>
            Select the destination ward and bed for the patient
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Ward and Bed */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Target Ward *</Label>
              <Select
                value={targetWardId}
                onValueChange={(v) => {
                  setTargetWardId(v);
                  setTargetBedId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {availableWards.map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name} ({w.available_beds ?? '?'} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target Bed *</Label>
              <Select
                value={targetBedId}
                onValueChange={setTargetBedId}
                disabled={!targetWardId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={targetWardId ? 'Select bed' : 'Select a ward first'} />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(beds) ? beds : beds?.results ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.bed_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transfer Reason */}
          <div className="space-y-2">
            <Label>Transfer Reason *</Label>
            <Select value={transferReason} onValueChange={(v) => setTransferReason(v as TransferReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clinical Justification */}
          <div className="space-y-2">
            <Label htmlFor="clinical-justification">Clinical Justification *</Label>
            <Textarea
              id="clinical-justification"
              value={clinicalJustification}
              onChange={(e) => setClinicalJustification(e.target.value)}
              placeholder="Provide the clinical justification for this transfer..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Transfer History
            </CardTitle>
            <CardDescription>Previous transfers for this admission</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transfers.map((transfer: any) => (
                <div
                  key={transfer.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{transfer.source_ward_name || transfer.from_ward_name}</span>
                      <MoveRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{transfer.destination_ward_name || transfer.to_ward_name}</span>
                      <Badge variant="outline">
                        {transfer.reason_display || transfer.reason}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {transfer.clinical_handover_notes || transfer.clinical_notes || transfer.reason_details}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {transfer.transferred_by_username || transfer.transferred_by_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(transfer.transfer_date)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createTransfer.isPending || !targetWardId || !targetBedId || !clinicalJustification}
        >
          <MoveRight className="h-4 w-4 mr-2" />
          {createTransfer.isPending ? 'Transferring...' : 'Confirm Transfer'}
        </Button>
      </div>
    </div>
  );
}

function TransferSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-64" />
    </div>
  );
}
