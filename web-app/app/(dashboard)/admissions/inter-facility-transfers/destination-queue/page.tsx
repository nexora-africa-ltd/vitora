'use client';

import { useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { PermissionGate } from '@/components/shared/permission-gate';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAcceptInterFacilityTransfer,
  useArriveAndAdmitInterFacilityTransfer,
  useInterFacilityDestinationQueue,
  useInterFacilityTransfers,
  useInpatientWards,
  useRejectInterFacilityTransfer,
  useWardBeds,
} from '@/lib/hooks/use-inpatient';
import type { InterFacilityTransfer } from '@/lib/types/inpatient';
import { useFacility } from '@/lib/context/facility-context';
import { useToast } from '@/lib/hooks/use-toast';

const OPEN_QUEUE_STATUSES = new Set(['PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_TRANSIT']);

function DestinationQueueCard({ transfer }: { transfer: InterFacilityTransfer }) {
  const { toast } = useToast();
  const acceptTransfer = useAcceptInterFacilityTransfer();
  const rejectTransfer = useRejectInterFacilityTransfer();
  const arriveAndAdmit = useArriveAndAdmitInterFacilityTransfer();
  const { data: wardsData } = useInpatientWards();

  const [rejectReason, setRejectReason] = useState('');
  const [destinationWard, setDestinationWard] = useState<string>('');
  const [destinationBed, setDestinationBed] = useState<string>('');
  const [admittingDiagnosisText, setAdmittingDiagnosisText] = useState('');

  const selectedWardId = destinationWard ? Number(destinationWard) : undefined;
  const { data: bedsData } = useWardBeds(selectedWardId, { status: 'AVAILABLE' });
  const wards = wardsData?.results ?? [];
  const beds = Array.isArray(bedsData) ? bedsData : bedsData?.results ?? [];

  const busy =
    acceptTransfer.isPending ||
    rejectTransfer.isPending ||
    arriveAndAdmit.isPending;

  const onAccept = async () => {
    if (!destinationWard) return;
    await acceptTransfer.mutateAsync({
      transferId: transfer.id,
      data: {
        destination_ward: Number(destinationWard),
        destination_bed: destinationBed ? Number(destinationBed) : undefined,
        auto_assign_bed: !destinationBed,
        admitting_diagnosis_text: admittingDiagnosisText || undefined,
      },
    });
    toast({ title: 'Accepted', description: `${transfer.transfer_number} accepted.` });
  };

  const onReject = async () => {
    if (!rejectReason.trim()) return;
    await rejectTransfer.mutateAsync({ transferId: transfer.id, reason: rejectReason.trim() });
    setRejectReason('');
    toast({ title: 'Rejected', description: `${transfer.transfer_number} rejected.` });
  };


  const onArriveAndAdmit = async () => {
    if (!destinationWard) return;
    await arriveAndAdmit.mutateAsync({
      transferId: transfer.id,
      data: {
        destination_ward: Number(destinationWard),
        destination_bed: destinationBed ? Number(destinationBed) : undefined,
        auto_assign_bed: !destinationBed,
        admitting_diagnosis_text: admittingDiagnosisText || undefined,
      },
    });
    setDestinationWard('');
    setDestinationBed('');
    setAdmittingDiagnosisText('');
    toast({ title: 'Arrived and admitted', description: `${transfer.transfer_number} completed.` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            {transfer.transfer_number}
          </span>
          <Badge variant="outline">{transfer.status_display ?? transfer.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2 text-sm">
          <p><span className="text-muted-foreground">Patient:</span> {transfer.patient_name}</p>
          <p><span className="text-muted-foreground">Admission:</span> {transfer.source_admission_number}</p>
          <p><span className="text-muted-foreground">Priority:</span> {transfer.priority_display ?? transfer.priority}</p>
          <p><span className="text-muted-foreground">Reason:</span> {transfer.reason_code_display ?? transfer.reason_code}</p>
        </div>
        <p className="text-sm text-muted-foreground">{transfer.clinical_summary}</p>

        {transfer.status === 'PENDING_ACCEPTANCE' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Destination Ward *</Label>
                <Select value={destinationWard} onValueChange={setDestinationWard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards.map((ward) => (
                      <SelectItem key={ward.id} value={String(ward.id)}>{ward.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Destination Bed (optional)</Label>
                <Select value={destinationBed} onValueChange={setDestinationBed}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-assign if empty" />
                  </SelectTrigger>
                  <SelectContent>
                    {beds.map((bed) => (
                      <SelectItem key={bed.id} value={String(bed.id)}>{bed.bed_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input
              placeholder="Optional destination admitting diagnosis text"
              value={admittingDiagnosisText}
              onChange={(e) => setAdmittingDiagnosisText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={onAccept} disabled={busy || !destinationWard}>Accept & Create Admission</Button>
              <Button variant="destructive" onClick={onReject} disabled={busy || !rejectReason.trim()}>
                Reject
              </Button>
            </div>
            <Input
              placeholder="Rejection reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        )}

        {transfer.status === 'ACCEPTED' && (
          <p className="text-sm text-muted-foreground">Awaiting source facility dispatch.</p>
        )}

        {transfer.status === 'IN_TRANSIT' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Destination Ward *</Label>
                <Select value={destinationWard} onValueChange={setDestinationWard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards.map((ward) => (
                      <SelectItem key={ward.id} value={String(ward.id)}>{ward.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Destination Bed (optional)</Label>
                <Select value={destinationBed} onValueChange={setDestinationBed}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-assign if empty" />
                  </SelectTrigger>
                  <SelectContent>
                    {beds.map((bed) => (
                      <SelectItem key={bed.id} value={String(bed.id)}>{bed.bed_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input
              placeholder="Optional destination admitting diagnosis text"
              value={admittingDiagnosisText}
              onChange={(e) => setAdmittingDiagnosisText(e.target.value)}
            />
            <Button onClick={onArriveAndAdmit} disabled={busy || !destinationWard}>
              Arrive and Admit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransferHistoryCard({ transfer, direction }: { transfer: InterFacilityTransfer; direction: 'INBOUND' | 'OUTBOUND' }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            {transfer.transfer_number}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{direction}</Badge>
            <Badge variant="outline">{transfer.status_display ?? transfer.status}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="text-muted-foreground">Patient:</span> {transfer.patient_name}</p>
        <p><span className="text-muted-foreground">Admission:</span> {transfer.source_admission_number}</p>
        <p><span className="text-muted-foreground">Destination:</span> {transfer.destination_facility_label ?? transfer.destination_facility_name}</p>
        <p><span className="text-muted-foreground">Reason:</span> {transfer.reason_code_display ?? transfer.reason_code}</p>
      </CardContent>
    </Card>
  );
}

export default function InterFacilityDestinationQueuePage() {
  const { facility } = useFacility();
  const { data, isLoading } = useInterFacilityDestinationQueue();
  const { data: transfersResponse, isLoading: isHistoryLoading } = useInterFacilityTransfers({
    ordering: '-updated_at',
    page_size: 200,
  });
  const queue = data ?? [];
  const history = useMemo(() => {
    const allTransfers = transfersResponse?.results ?? [];
    const openQueueIds = new Set(queue.map((item) => item.id));
    return allTransfers.filter((item) => !openQueueIds.has(item.id));
  }, [queue, transfersResponse?.results]);
  const inboundHistory = history.filter((item) => item.destination_facility === facility?.id);
  const outboundHistory = history.filter((item) => item.source_facility === facility?.id);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Destination Transfer Queue"
        helpContent="Accept, reject, and complete inter-facility transfers arriving to your facility."
      />

      <PermissionGate action="inpatient.accept_interfacility_transfer">
        {isLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading queue...</CardContent>
          </Card>
        ) : queue.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">No incoming transfers in queue.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {queue.map((transfer) => (
              <DestinationQueueCard key={transfer.id} transfer={transfer} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Transfer History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isHistoryLoading ? (
              <p className="text-sm text-muted-foreground">Loading history...</p>
            ) : (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Inbound (Past)</h3>
                  {inboundHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No inbound transfer history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {inboundHistory.map((transfer) => {
                        if (OPEN_QUEUE_STATUSES.has(transfer.status)) {
                          return <DestinationQueueCard key={`in-open-${transfer.id}`} transfer={transfer} />;
                        }
                        return (
                          <TransferHistoryCard
                            key={`in-closed-${transfer.id}`}
                            transfer={transfer}
                            direction="INBOUND"
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Outbound (Past)</h3>
                  {outboundHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No outbound transfer history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {outboundHistory.map((transfer) => (
                        <TransferHistoryCard key={`out-${transfer.id}`} transfer={transfer} direction="OUTBOUND" />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </PermissionGate>
    </div>
  );
}
