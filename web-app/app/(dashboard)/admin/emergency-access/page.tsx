// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Emergency access (break-glass) admin workspace.
 * Access path: /admin/emergency-access.
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
import { coreApi } from '@/lib/api/core';
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
  const [patientMrn, setPatientMrn] = useState('');

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

  const createMutation = useMutation({
    mutationFn: coreApi.createEmergencyAccess,
    onSuccess: () => {
      toast({ title: 'Emergency access invoked' });
      queryClient.invalidateQueries({ queryKey: ['core', 'emergency-access'] });
      setInvokeOpen(false);
      setReasonDetails('');
      setPatientMrn('');
      setDurationMinutes('240');
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

  const records = useMemo(() => recordsData?.results ?? [], [recordsData]);
  const myActive = useMemo(() => activeMyData ?? [], [activeMyData]);

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
                <Label htmlFor="emergency-reason">Reason</Label>
                <Select value={reason} onValueChange={(value) => setReason(value as (typeof REASONS)[number])}>
                  <SelectTrigger id="emergency-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((value) => (
                      <SelectItem key={value} value={value}>{value.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="patient-mrn">Patient MRN (optional)</Label>
                <Input id="patient-mrn" value={patientMrn} onChange={(event) => setPatientMrn(event.target.value)} placeholder="MRN-YYYYMMDD-XXXX" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration-minutes">Duration (minutes)</Label>
                <Input id="duration-minutes" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason-details">Justification</Label>
                <Textarea id="reason-details" value={reasonDetails} onChange={(event) => setReasonDetails(event.target.value)} placeholder="Describe clinical urgency and why break-glass access is required." className="min-h-24" />
              </div>

              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                This action is audited and escalated for review. Use only for legitimate emergencies.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvokeOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  createMutation.mutate({
                    reason,
                    reason_details: reasonDetails,
                    duration_minutes: Number(durationMinutes) || 240,
                    patient_mrn: patientMrn.trim() || undefined,
                  })
                }
                disabled={createMutation.isPending || reasonDetails.trim().length < 10}
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
