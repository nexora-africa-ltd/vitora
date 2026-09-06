// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Bed assignment request workspace. Access at /inpatient/bed-assignment-requests. */
'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  useAssignBedAssignmentRequest,
  useBedAssignmentRequests,
  useBeds,
  useCancelBedAssignmentRequest,
  useCreateBedAssignmentRequest,
  useInpatientWards,
} from '@/lib/hooks/use-inpatient';
import { usePatients } from '@/lib/hooks/use-patients';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type {
  Bed,
  BedAssignmentRequest,
  BedAssignmentRequestPriority,
  BedAssignmentRequestStatus,
  InpatientWard,
} from '@/lib/types/inpatient';

const STATUS_OPTIONS: Array<{ value: BedAssignmentRequestStatus; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: Array<{ value: BedAssignmentRequestPriority; label: string }> = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

const statusVariant: Record<BedAssignmentRequestStatus, 'secondary' | 'default' | 'outline'> = {
  PENDING: 'secondary',
  ASSIGNED: 'default',
  CANCELLED: 'outline',
};

const priorityClass: Record<BedAssignmentRequestPriority, string> = {
  ROUTINE: 'bg-muted text-muted-foreground',
  URGENT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  EMERGENCY: 'bg-destructive text-destructive-foreground',
};

export default function BedAssignmentRequestsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { hasPermission, isAdmin, isSuperuser } = usePermissions();
  const { toast } = useToast();
  const [status, setStatus] = useState<BedAssignmentRequestStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [assigningRequest, setAssigningRequest] = useState<BedAssignmentRequest | null>(null);
  const [patientId, setPatientId] = useState('');
  const [wardId, setWardId] = useState('');
  const [priority, setPriority] = useState<BedAssignmentRequestPriority>('ROUTINE');
  const [reason, setReason] = useState('');
  const [bedId, setBedId] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const patientSearch = useDebounce(createOpen ? search : '', 300);

  const canCreate = isAdmin || isSuperuser || hasPermission('inpatient.add_bedassignmentrequest');
  const canChange = isAdmin || isSuperuser || hasPermission('inpatient.change_bedassignmentrequest');
  const { data: requestsData, isLoading } = useBedAssignmentRequests({
    status: status === 'ALL' ? undefined : status,
    search: debouncedSearch || undefined,
    ordering: '-created_at',
    page_size: 100,
  });
  const { data: wardsData } = useInpatientWards();
  const { data: patientsData } = usePatients({ search: patientSearch || undefined, page_size: 20 });
  const selectedWardId = assigningRequest?.requested_ward ?? (wardId ? Number(wardId) : undefined);
  const { data: bedsData } = useBeds({ ward: selectedWardId, status: 'AVAILABLE' });
  const createRequest = useCreateBedAssignmentRequest();
  const assignRequest = useAssignBedAssignmentRequest();
  const cancelRequest = useCancelBedAssignmentRequest();

  const requests = requestsData?.results ?? [];
  const wards = useMemo<InpatientWard[]>(() => wardsData?.results ?? [], [wardsData]);
  const patients = patientsData?.results ?? [];
  const availableBeds = useMemo<Bed[]>(() => bedsData?.results ?? [], [bedsData]);

  const resetCreate = () => {
    setPatientId('');
    setWardId('');
    setPriority('ROUTINE');
    setReason('');
  };

  const handleCreate = async () => {
    if (!patientId || !reason.trim()) {
      toast({ title: 'Patient and reason are required', variant: 'destructive' });
      return;
    }
    try {
      await createRequest.mutateAsync({
        patient: Number(patientId),
        requested_ward: wardId ? Number(wardId) : undefined,
        priority,
        reason: reason.trim(),
      });
      toast({ title: 'Bed request created' });
      resetCreate();
      setCreateOpen(false);
    } catch {
      toast({ title: 'Unable to create bed request', variant: 'destructive' });
    }
  };

  const handleAssign = async () => {
    if (!assigningRequest || !bedId) return;
    try {
      await assignRequest.mutateAsync({ requestId: assigningRequest.id, bed: Number(bedId) });
      toast({ title: 'Bed reserved for request' });
      setAssigningRequest(null);
      setBedId('');
    } catch {
      toast({ title: 'Unable to reserve bed', variant: 'destructive' });
    }
  };

  const handleCancel = async (request: BedAssignmentRequest) => {
    try {
      await cancelRequest.mutateAsync(request.id);
      toast({ title: 'Bed request cancelled' });
    } catch {
      toast({ title: 'Unable to cancel bed request', variant: 'destructive' });
    }
  };

  const columns = [
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: BedAssignmentRequest) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{item.patient_name || `Patient #${item.patient}`}</p>
          <p className="text-xs text-muted-foreground">{item.patient_mrn || 'MRN unavailable'}</p>
        </div>
      ),
    },
    {
      key: 'requested_ward_name',
      header: 'Requested ward',
      sortable: true,
      hideOnMobile: true,
      cell: (item: BedAssignmentRequest) => item.requested_ward_name || 'Any suitable ward',
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      cell: (item: BedAssignmentRequest) => (
        <Badge className={`${priorityClass[item.priority]} w-fit shrink-0`}>{item.priority_display || item.priority}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: BedAssignmentRequest) => (
        <Badge variant={statusVariant[item.status]} className="w-fit shrink-0">
          {item.status_display || item.status}
        </Badge>
      ),
    },
    {
      key: 'assigned_bed_number',
      header: 'Bed',
      hideOnMobile: true,
      cell: (item: BedAssignmentRequest) => item.assigned_bed_number || 'Not assigned',
    },
    {
      key: 'created_at',
      header: 'Requested',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: BedAssignmentRequest) =>
        item.created_at ? formatDateTime(item.created_at) : 'Time unavailable',
    },
    {
      key: 'actions',
      header: '',
      cell: (item: BedAssignmentRequest) =>
        item.status === 'PENDING' && canChange ? (
          <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
            <Button size="sm" onClick={() => setAssigningRequest(item)}>
              Assign bed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleCancel(item)} disabled={cancelRequest.isPending}>
              Cancel
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
        <PageHeader
          title="Bed Assignment Requests"
          helpContent="Create and manage bed reservations before an admission is recorded. Assigning a request reserves the selected available bed."
          actions={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New request</span>
                <span className="sm:hidden">New</span>
              </Button>
            ) : null
          }
        />

        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, MRN, or reason" className="pl-9" />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as BedAssignmentRequestStatus | 'ALL')}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <ResponsiveTable<BedAssignmentRequest>
          data={requests}
          columns={columns}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          emptyMessage="No bed assignment requests found."
          mobileCard={(item) => (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.patient_name || `Patient #${item.patient}`}</p>
                  <p className="text-xs text-muted-foreground">{item.patient_mrn || 'MRN unavailable'} · {item.requested_ward_name || 'Any suitable ward'}</p>
                </div>
                <Badge variant={statusVariant[item.status]} className="w-fit shrink-0">{item.status_display || item.status}</Badge>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{item.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={`${priorityClass[item.priority]} w-fit`}>{item.priority_display || item.priority}</Badge>
                {item.assigned_bed_number ? <span className="text-xs text-muted-foreground">Bed {item.assigned_bed_number}</span> : null}
              </div>
              {item.status === 'PENDING' && canChange ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button size="sm" onClick={() => setAssigningRequest(item)}>Assign bed</Button>
                  <Button size="sm" variant="outline" onClick={() => handleCancel(item)} disabled={cancelRequest.isPending}>Cancel request</Button>
                </div>
              ) : null}
            </Card>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreate(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New bed assignment request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="patient">Patient</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger id="patient"><SelectValue placeholder="Select patient" /></SelectTrigger><SelectContent>{patients.map((patient) => <SelectItem key={patient.id} value={String(patient.id)}>{patient.full_name || `${patient.first_name} ${patient.last_name}`} · {patient.mrn}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="ward">Requested ward</Label><Select value={wardId} onValueChange={setWardId}><SelectTrigger id="ward"><SelectValue placeholder="Any suitable ward" /></SelectTrigger><SelectContent><SelectItem value="">Any suitable ward</SelectItem>{wards.map((ward) => <SelectItem key={ward.id} value={String(ward.id)}>{ward.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="priority">Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as BedAssignmentRequestPriority)}><SelectTrigger id="priority"><SelectValue /></SelectTrigger><SelectContent>{PRIORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="reason">Reason</Label><Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Clinical or operational reason for the request" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={createRequest.isPending}>{createRequest.isPending ? 'Creating...' : 'Create request'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assigningRequest !== null} onOpenChange={(open) => { if (!open) { setAssigningRequest(null); setBedId(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign available bed</DialogTitle></DialogHeader>
          <div className="space-y-4"><p className="text-sm text-muted-foreground">Reserve an available bed for {assigningRequest?.patient_name || 'this patient'}.</p><div className="space-y-2"><Label htmlFor="bed">Available bed</Label><Select value={bedId} onValueChange={setBedId}><SelectTrigger id="bed"><SelectValue placeholder="Select available bed" /></SelectTrigger><SelectContent>{availableBeds.map((bed) => <SelectItem key={bed.id} value={String(bed.id)}>{bed.bed_number}{bed.ward_name ? ` · ${bed.ward_name}` : ''}</SelectItem>)}</SelectContent></Select>{availableBeds.length === 0 ? <p className="text-xs text-muted-foreground">No available beds match this request&apos;s ward.</p> : null}</div></div>
          <DialogFooter><Button variant="outline" onClick={() => setAssigningRequest(null)}>Cancel</Button><Button onClick={handleAssign} disabled={!bedId || assignRequest.isPending}>{assignRequest.isPending ? 'Assigning...' : 'Reserve bed'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
