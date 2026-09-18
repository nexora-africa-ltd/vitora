// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Emergency access (break-glass) workspace.
 * Access paths: /admin/emergency-access and /safety/emergency-access.
 */
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import { coreApi } from '@/lib/api/core';
import { patientsApi } from '@/lib/api/patients';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

const REASONS = [
  'LIFE_THREATENING',
  'UNCONSCIOUS_PATIENT',
  'MASS_CASUALTY',
  'CRITICAL_LAB_RESULT',
  'MEDICATION_EMERGENCY',
  'DISASTER_RESPONSE',
  'OTHER',
] as const;

const CLINICAL_URGENCY = [
  'Immediate intervention required',
  'Critical decision pending',
  'Medication safety verification',
  'Disaster coordination',
  'Other urgent clinical action',
] as const;

const SYSTEM_SCOPE_REASONS = new Set(['DISASTER_RESPONSE', 'MASS_CASUALTY']);

function formatMinutesRemaining(minutes: number): string {
  if (minutes <= 0) return 'Expired';
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m remaining` : `${hours}h remaining`;
}

export default function EmergencyAccessPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission, isAdmin, isSuperuser } = usePermissions();

  const canReview =
    isAdmin || isSuperuser || hasPermission('core.approve_emergency_access');

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [invokeOpen, setInvokeOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  const [reason, setReason] = useState<(typeof REASONS)[number]>('LIFE_THREATENING');
  const [reasonDetails, setReasonDetails] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('240');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [scopeType, setScopeType] = useState<'PATIENT' | 'SYSTEM'>('PATIENT');
  const [accessMode, setAccessMode] = useState<'READ_ONLY' | 'LIMITED_WRITE'>('READ_ONLY');
  const [clinicalUrgency, setClinicalUrgency] = useState<(typeof CLINICAL_URGENCY)[number]>(
    'Immediate intervention required'
  );
  const [intendedAction, setIntendedAction] = useState('');
  const [supervisingClinician, setSupervisingClinician] = useState('');
  const [supervisingClinicianUserId, setSupervisingClinicianUserId] = useState<number | undefined>(
    undefined
  );
  const [acknowledged, setAcknowledged] = useState(false);

  const systemScopeAllowed = SYSTEM_SCOPE_REASONS.has(reason);

  const { data: statsData } = useQuery({
    queryKey: ['core', 'emergency-access', 'stats'],
    queryFn: () => coreApi.emergencyAccessDashboardStats(),
  });

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['core', 'emergency-access', statusFilter],
    queryFn: () =>
      coreApi.listEmergencyAccess({
        status: statusFilter || undefined,
        page_size: 100,
      }),
  });

  const { data: activeMyData } = useQuery({
    queryKey: ['core', 'emergency-access', 'my-active'],
    queryFn: () => coreApi.myActiveEmergencyAccess(),
  });

  const { data: selectedPatient } = useQuery({
    queryKey: ['core', 'emergency-access', 'selected-patient', selectedPatientId],
    queryFn: () => (selectedPatientId ? patientsApi.getPatient(selectedPatientId) : null),
    enabled: !!selectedPatientId,
  });

  const createMutation = useMutation({
    mutationFn: coreApi.createEmergencyAccess,
    onSuccess: () => {
      toast({ title: 'Emergency access invoked' });
      queryClient.invalidateQueries({ queryKey: ['core', 'emergency-access'] });
      setInvokeOpen(false);
      setReasonDetails('');
      setSelectedPatientId(null);
      setDurationMinutes('240');
      setScopeType('PATIENT');
      setAccessMode('READ_ONLY');
      setClinicalUrgency('Immediate intervention required');
      setIntendedAction('');
      setSupervisingClinician('');
      setSupervisingClinicianUserId(undefined);
      setAcknowledged(false);
    },
    onError: () => {
      toast({ title: 'Unable to invoke emergency access', variant: 'destructive' });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'revoke' }) =>
      coreApi.reviewEmergencyAccess(id, {
        action,
        notes: action === 'approve' ? 'Reviewed and approved by admin' : 'Revoked by admin',
      }),
    onSuccess: () => {
      toast({ title: 'Emergency access record updated' });
      queryClient.invalidateQueries({ queryKey: ['core', 'emergency-access'] });
      setSelectedRecordId(null);
    },
    onError: () => {
      toast({ title: 'Unable to review emergency access', variant: 'destructive' });
    },
  });

  const closeMutation = useMutation({
    mutationFn: coreApi.closeEmergencyAccess,
    onSuccess: () => {
      toast({ title: 'Emergency access session ended' });
      queryClient.invalidateQueries({ queryKey: ['core', 'emergency-access'] });
      setSelectedRecordId(null);
    },
    onError: () => {
      toast({ title: 'Unable to end session', variant: 'destructive' });
    },
  });

  const records = useMemo(() => recordsData?.results ?? [], [recordsData]);
  const myActive = useMemo(() => activeMyData ?? [], [activeMyData]);
  const requiresPatientMrn = scopeType === 'PATIENT';

  const canInvoke =
    acknowledged &&
    reasonDetails.trim().length >= 10 &&
    intendedAction.trim().length >= 5 &&
    (!requiresPatientMrn || !!selectedPatient?.mrn);

  const composeJustification = () => {
    const parts = [
      `Clinical urgency: ${clinicalUrgency}`,
      `Intended action: ${intendedAction.trim()}`,
      `Supervising clinician: ${supervisingClinician.trim() || 'Not specified'}`,
      `User notes: ${reasonDetails.trim()}`,
    ];
    return parts.join('\n');
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Emergency Access"
          helpContent="Invoke and review break-glass access events. All access is time-bound, audited, and subject to mandatory post-hoc review."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setInvokeOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Invoke
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3">
              <p className="text-xl font-semibold">{statsData?.total_active ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active now</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xl font-semibold">{statsData?.total_pending_review ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xl font-semibold">{statsData?.total_today ?? 0}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xl font-semibold">{myActive.length}</p>
              <p className="text-xs text-muted-foreground">My active sessions</p>
            </CardContent>
          </Card>
        </div>

        <Card className="p-3 sm:p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              My active break-glass sessions
            </div>
            {myActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active emergency-access sessions.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {myActive.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-md border border-amber-200 bg-amber-50/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-amber-900">
                          {session.patient_mrn
                            ? `${session.patient_name || 'Patient'} - ${session.patient_mrn}`
                            : 'System-wide session'}
                        </p>
                        <p className="text-xs text-amber-800/90">
                          {session.scope_type_display} - {session.access_mode_display}
                        </p>
                        <p className="text-xs text-amber-800/90">
                          {formatMinutesRemaining(session.remaining_minutes)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                        onClick={() => {
                          setSelectedRecordId(session.id);
                          closeMutation.mutate(session.id);
                        }}
                        disabled={closeMutation.isPending && selectedRecordId === session.id}
                      >
                        End now
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              Break-glass records are permanent audit artifacts.
            </div>
            <Select value={statusFilter || 'ALL'} onValueChange={(value) => setStatusFilter(value === 'ALL' ? '' : value)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="REVOKED">Revoked</SelectItem>
                <SelectItem value="REVIEWED">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <ResponsiveTable
          data={records}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage="No emergency access records found."
          defaultSortColumn="requested_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'user',
              header: 'Requester',
              sortable: true,
              cell: (item) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.user_full_name}</p>
                  <p className="text-xs text-muted-foreground">{item.user_username}</p>
                </div>
              ),
            },
            {
              key: 'patient',
              header: 'Patient',
              cell: (item) =>
                item.patient_mrn ? `${item.patient_name || 'Patient'} · ${item.patient_mrn}` : 'System-wide',
            },
            {
              key: 'scope_type',
              header: 'Scope',
              sortable: true,
              cell: (item) => item.scope_type_display,
            },
            {
              key: 'access_mode',
              header: 'Mode',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => item.access_mode_display,
            },
            { key: 'reason_display', header: 'Reason', sortable: true, cell: (item) => item.reason_display },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <Badge variant={item.status === 'ACTIVE' ? 'destructive' : 'outline'}>
                  {item.status_display}
                </Badge>
              ),
            },
            {
              key: 'requested_at',
              header: 'Requested',
              sortable: true,
              sortType: 'date',
              cell: (item) => formatDateTime(item.requested_at),
            },
            {
              key: 'expires_at',
              header: 'Expires',
              sortable: true,
              sortType: 'date',
              hideOnMobile: true,
              cell: (item) => formatDateTime(item.expires_at),
            },
            {
              key: 'actions',
              header: '',
              cell: (item) =>
                canReview && (item.status === 'ACTIVE' || item.status === 'EXPIRED') ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedRecordId(item.id);
                        reviewMutation.mutate({ id: item.id, action: 'approve' });
                      }}
                      disabled={reviewMutation.isPending && selectedRecordId === item.id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedRecordId(item.id);
                        reviewMutation.mutate({ id: item.id, action: 'revoke' });
                      }}
                      disabled={reviewMutation.isPending && selectedRecordId === item.id}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />

        <Dialog open={invokeOpen} onOpenChange={setInvokeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invoke Emergency Access</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="emergency-reason">Reason <span className="text-destructive">*</span></Label>
                <Select
                  value={reason}
                  onValueChange={(value) => {
                    const nextReason = value as (typeof REASONS)[number];
                    setReason(nextReason);
                    if (!SYSTEM_SCOPE_REASONS.has(nextReason)) {
                      setScopeType('PATIENT');
                    }
                  }}
                >
                  <SelectTrigger id="emergency-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((value) => (
                      <SelectItem key={value} value={value}>{value.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scope-type">Scope <span className="text-destructive">*</span></Label>
                <Select
                  value={scopeType}
                  onValueChange={(value) => setScopeType(value as 'PATIENT' | 'SYSTEM')}
                  disabled={!systemScopeAllowed}
                >
                  <SelectTrigger id="scope-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PATIENT">Patient specific</SelectItem>
                    <SelectItem value="SYSTEM">System wide</SelectItem>
                  </SelectContent>
                </Select>
                {!systemScopeAllowed && (
                  <p className="text-xs text-muted-foreground">
                    System-wide scope is only available for mass-casualty or disaster response.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-mode">Access mode <span className="text-destructive">*</span></Label>
                <Select
                  value={accessMode}
                  onValueChange={(value) => setAccessMode(value as 'READ_ONLY' | 'LIMITED_WRITE')}
                >
                  <SelectTrigger id="access-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ_ONLY">Read only (recommended)</SelectItem>
                    <SelectItem value="LIMITED_WRITE">Limited write</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patient-mrn">
                  Patient MRN {requiresPatientMrn ? <span className="text-destructive">*</span> : '(optional)'}
                </Label>
                <PatientSearchInput
                  value={selectedPatientId}
                  onChange={(patientId) => setSelectedPatientId(patientId)}
                  placeholder="Search by patient name or MRN"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clinical-urgency">Clinical urgency <span className="text-destructive">*</span></Label>
                <Select
                  value={clinicalUrgency}
                  onValueChange={(value) =>
                    setClinicalUrgency(value as (typeof CLINICAL_URGENCY)[number])
                  }
                >
                  <SelectTrigger id="clinical-urgency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLINICAL_URGENCY.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="intended-action">Intended immediate action <span className="text-destructive">*</span></Label>
                <Input
                  id="intended-action"
                  value={intendedAction}
                  onChange={(event) => setIntendedAction(event.target.value)}
                  placeholder="e.g. Verify allergies before emergency treatment"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supervising-clinician">Supervising clinician (optional)</Label>
                <StaffSearchCombobox
                  value={supervisingClinicianUserId}
                  onSelect={(_, staff) => {
                    setSupervisingClinicianUserId(staff.user);
                    setSupervisingClinician(staff.full_name || staff.user_email || 'Selected clinician');
                  }}
                  placeholder="Select supervising clinician"
                  searchPlaceholder="Search clinician by name, email, or employee ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration-minutes">Duration (minutes) <span className="text-destructive">*</span></Label>
                <Input
                  id="duration-minutes"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason-details">Justification <span className="text-destructive">*</span></Label>
                <Textarea
                  id="reason-details"
                  value={reasonDetails}
                  onChange={(event) => setReasonDetails(event.target.value)}
                  placeholder="Describe clinical urgency and why break-glass access is required."
                  className="min-h-24"
                />
              </div>

              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                This action is audited and escalated for review. Use only for legitimate emergencies.
              </div>

              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <Checkbox
                  id="legal-ack"
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(checked === true)}
                />
                <Label htmlFor="legal-ack" className="text-xs leading-relaxed">
                  <span className="text-destructive">*</span> I confirm this emergency access request is necessary to prevent patient harm, and I
                  understand all activity is audited and reviewed post-hoc.
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvokeOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  createMutation.mutate({
                    reason,
                    reason_details: composeJustification(),
                    duration_minutes: Number(durationMinutes) || 240,
                    patient_mrn: selectedPatient?.mrn || undefined,
                    scope_type: scopeType,
                    access_mode: accessMode,
                  })
                }
                disabled={createMutation.isPending || !canInvoke}
              >
                {createMutation.isPending ? 'Invoking...' : 'Invoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
