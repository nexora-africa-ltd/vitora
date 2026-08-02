'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Badge } from '@/components/ui/badge';
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
import { facilitiesApi } from '@/lib/api/facilities';
import { organizationsApi } from '@/lib/api/organizations';
import { useUser } from '@/lib/auth';
import { useFacility } from '@/lib/context/facility-context';
import { useToast } from '@/lib/hooks/use-toast';
import { useInterfacilityTransfersEnabled } from '@/lib/hooks/use-interfacility-transfers-enabled';
import { getApiErrorMessage } from '@/lib/api/client';
import {
  useAdmission,
  useCreateInterFacilityTransfer,
  useInterFacilityTransfers,
  useShareInterFacilityDischargeSummary,
  useSubmitInterFacilityTransfer,
} from '@/lib/hooks/use-inpatient';
import type {
  InterFacilityTransfer,
  InterFacilityTransferPriority,
  InterFacilityTransferReason,
} from '@/lib/types/inpatient';

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

const OPEN_TRANSFER_STATUSES = new Set(['DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_TRANSIT']);

export default function CreateInterFacilityTransferPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const interfacilityTransfersEnabled = useInterfacilityTransfersEnabled();

  const admissionId = params.id;
  const { data: admission } = useAdmission(admissionId);
  const user = useUser();
  const { organization, facility } = useFacility();
  const { data: currentFacilityDetail } = useQuery({
    queryKey: ['facilities', facility?.id, 'inter-facility-transfer'],
    enabled: typeof facility?.id === 'number' && typeof organization?.id !== 'number',
    queryFn: () => facilitiesApi.get(facility!.id),
  });
  const organizationId =
    organization?.id ??
    (typeof currentFacilityDetail?.organization === 'number' ? currentFacilityDetail.organization : undefined) ??
    user?.memberships?.find((membership) => membership.is_primary)?.organization_id ??
    user?.memberships?.[0]?.organization_id;
  const { data: organizationFacilities = [] } = useQuery({
    queryKey: ['organizations', organizationId, 'facilities', 'inter-facility-transfer'],
    enabled: typeof organizationId === 'number',
    queryFn: () => organizationsApi.listFacilities(organizationId as number, { is_active: true }),
  });
  const { data: facilityListResults = [] } = useQuery({
    queryKey: ['facilities', 'organization-list', organizationId, 'inter-facility-transfer'],
    enabled: typeof organizationId === 'number',
    queryFn: async () => {
      const response = await facilitiesApi.list({
        organization: organizationId as number,
        is_active: true,
        page_size: 200,
      });
      return response.results;
    },
  });
  const createTransfer = useCreateInterFacilityTransfer();
  const submitTransfer = useSubmitInterFacilityTransfer();
  const shareDischargeSummary = useShareInterFacilityDischargeSummary();
  const { data: transferList } = useInterFacilityTransfers({
    source_admission: admissionId,
    ordering: '-updated_at',
    page_size: 50,
  });

  const [selectedDestinationFacility, setSelectedDestinationFacility] = useState<string>('OTHER');
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

  if (!interfacilityTransfersEnabled) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Inter-facility transfers are disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This workflow is currently hidden behind the inter-facility transfers feature toggle.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPending = createTransfer.isPending || submitTransfer.isPending;
  const transfers = transferList?.results ?? [];
  const activeTransfer =
    transfers.find((transfer) => OPEN_TRANSFER_STATUSES.has(transfer.status)) ?? null;
  const pendingSummaryRequests = transfers.filter(
    (transfer) => transfer.discharge_summary_requested && !transfer.discharge_summary_snapshot
  );
  const membershipFacilities = useMemo(() => {
    const map = new Map<number, { id: number; name: string; mfl_code: string }>();
    (user?.memberships ?? []).forEach((membership) => {
      membership.facilities.forEach((facilityItem) => {
        map.set(facilityItem.id, {
          id: facilityItem.id,
          name: facilityItem.name,
          mfl_code: facilityItem.mfl_code,
        });
      });
    });
    return [...map.values()];
  }, [user?.memberships]);
  const destinationFacilityOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; mfl_code: string }>();
    organizationFacilities.forEach((item) => {
      map.set(item.id, { id: item.id, name: item.name, mfl_code: item.mfl_code });
    });
    facilityListResults.forEach((item) => {
      map.set(item.id, { id: item.id, name: item.name, mfl_code: item.mfl_code });
    });
    membershipFacilities.forEach((item) => {
      map.set(item.id, { id: item.id, name: item.name, mfl_code: item.mfl_code });
    });
    return [...map.values()];
  }, [facilityListResults, membershipFacilities, organizationFacilities]);
  const selectableFacilities = destinationFacilityOptions.filter((item) => item.id !== facility?.id);
  const selectedDestinationFacilityId =
    selectedDestinationFacility !== 'OTHER' && selectedDestinationFacility
      ? Number(selectedDestinationFacility)
      : undefined;
  const needsManualDestinationName = selectedDestinationFacility === 'OTHER';

  const handleCreate = async () => {
    if (!admission) return;
    if (
      (!selectedDestinationFacilityId && !destinationFacilityName.trim()) ||
      !clinicalSummary.trim() ||
      !handoverNotes.trim()
    ) {
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
        destination_facility: selectedDestinationFacilityId,
        destination_facility_name: selectedDestinationFacilityId
          ? undefined
          : destinationFacilityName.trim(),
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
    } catch (error) {
      toast({
        title: 'Failed to create transfer',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleShareDischargeSummary = async (transfer: InterFacilityTransfer) => {
    try {
      await shareDischargeSummary.mutateAsync(transfer.id);
      toast({
        title: 'Discharge summary shared',
        description: `${transfer.transfer_number} summary shared with destination team.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to share summary',
        description: getApiErrorMessage(error),
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

        {activeTransfer ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Request Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{activeTransfer.transfer_number}</Badge>
                <Badge variant="outline">{activeTransfer.status_display ?? activeTransfer.status}</Badge>
              </div>
              <p>
                <span className="text-muted-foreground">Destination:</span>{' '}
                {activeTransfer.destination_facility_label ?? activeTransfer.destination_facility_name}
              </p>
              <p>
                <span className="text-muted-foreground">Reason:</span>{' '}
                {activeTransfer.reason_code_display ?? activeTransfer.reason_code}
              </p>
              <p>
                <span className="text-muted-foreground">Clinical summary:</span> {activeTransfer.clinical_summary}
              </p>
              <p>
                <span className="text-muted-foreground">Handover notes:</span> {activeTransfer.handover_notes}
              </p>
              <p className="text-muted-foreground">
                An open transfer already exists for this admission. This page is now in management mode
                for destination requests and source sharing.
              </p>
            </CardContent>
          </Card>
        ) : (
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
                  <Label>Destination Facility *</Label>
                  <Select
                    value={selectedDestinationFacility}
                    onValueChange={setSelectedDestinationFacility}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableFacilities.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="OTHER">Other (Manual Entry)</SelectItem>
                    </SelectContent>
                  </Select>
                  {needsManualDestinationName && (
                    <Input
                      value={destinationFacilityName}
                      onChange={(e) => setDestinationFacilityName(e.target.value)}
                      placeholder="e.g., External Referral Hospital"
                    />
                  )}
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
        )}

        {pendingSummaryRequests.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Destination Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingSummaryRequests.map((transfer) => (
                <div
                  key={transfer.id}
                  className="rounded-md border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{transfer.transfer_number}</p>
                    <p>
                      <span className="text-muted-foreground">Patient:</span> {transfer.patient_name}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Destination:</span>{' '}
                      {transfer.destination_facility_label ?? transfer.destination_facility_name}
                    </p>
                    {transfer.discharge_summary_request_note ? (
                      <p>
                        <span className="text-muted-foreground">Request note:</span>{' '}
                        {transfer.discharge_summary_request_note}
                      </p>
                    ) : null}
                    <Badge variant="secondary">Summary requested</Badge>
                  </div>
                  <Button
                    onClick={() => handleShareDischargeSummary(transfer)}
                    disabled={shareDischargeSummary.isPending}
                  >
                    Share Discharge Summary
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PermissionGate>
  );
}
