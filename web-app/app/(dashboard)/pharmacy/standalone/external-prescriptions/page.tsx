'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Check, X, ExternalLink, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { standalonePharmacyApi } from '@/lib/api/standalone-pharmacy';
import type {
  ExternalPrescriptionRequest,
  ExternalPrescriptionStatus,
} from '@/lib/types/standalone-pharmacy';
import { toast } from 'sonner';

const statusColors: Record<ExternalPrescriptionStatus, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PROCESSING:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  COMPLETED:
    'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function ExternalPrescriptionsPage() {
  const [rejectDialog, setRejectDialog] =
    useState<ExternalPrescriptionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['external-prescriptions'],
    queryFn: () => standalonePharmacyApi.listExternalPrescriptions(),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: number) =>
      standalonePharmacyApi.acceptExternalPrescription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-prescriptions'] });
      toast.success('External prescription accepted');
    },
    onError: () => toast.error('Failed to accept prescription'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      standalonePharmacyApi.rejectExternalPrescription(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-prescriptions'] });
      setRejectDialog(null);
      setRejectReason('');
      toast.success('External prescription rejected');
    },
    onError: () => toast.error('Failed to reject prescription'),
  });

  const columns = [
    {
      key: 'external_prescription_number',
      header: 'Rx #',
      sortable: true,
      cell: (item: ExternalPrescriptionRequest) => (
        <span className="font-mono text-sm">
          {item.external_prescription_number || item.message_control_id}
        </span>
      ),
    },
    {
      key: 'sending_facility',
      header: 'From',
      sortable: true,
      cell: (item: ExternalPrescriptionRequest) => (
        <div className="flex items-center gap-1">
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
          <span className="truncate max-w-[150px]">{item.sending_facility}</span>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: ExternalPrescriptionRequest) => item.patient_name,
    },
    {
      key: 'items',
      header: 'Items',
      cell: (item: ExternalPrescriptionRequest) => (
        <span className="text-sm text-muted-foreground">
          {item.requested_items.length} item(s)
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ExternalPrescriptionRequest) => (
        <Badge className={statusColors[item.status]}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Received',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ExternalPrescriptionRequest) =>
        new Date(item.created_at).toLocaleString(),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ExternalPrescriptionRequest) =>
        item.status === 'RECEIVED' ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                acceptMutation.mutate(item.id);
              }}
              disabled={acceptMutation.isPending}
            >
              <Check className="h-3 w-3 mr-1" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                setRejectDialog(item);
              }}
            >
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const pendingCount =
    data?.results.filter((o) => o.status === 'RECEIVED').length || 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="External Prescriptions"
          helpContent="Inbound prescriptions from external systems via HL7. Accept to create a dispensable prescription, or reject with a reason."
        />

        {pendingCount > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">
                {pendingCount} pending prescription{pendingCount > 1 ? 's' : ''}{' '}
                awaiting review
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-5 w-5" />
              Inbound Prescriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={data?.results || []}
              keyExtractor={(item) => item.id}
              columns={columns}
              defaultSortColumn="created_at"
              defaultSortDirection="desc"
              isLoading={isLoading}
              emptyMessage="No external prescriptions received yet."
            />
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog
          open={!!rejectDialog}
          onOpenChange={() => setRejectDialog(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Prescription</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rejecting prescription{' '}
                <span className="font-mono">
                  {rejectDialog?.external_prescription_number ||
                    rejectDialog?.message_control_id}
                </span>{' '}
                from {rejectDialog?.sending_facility}
              </p>
              <div>
                <Label>Reason for rejection *</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  onClick={() =>
                    rejectDialog &&
                    rejectMutation.mutate({
                      id: rejectDialog.id,
                      reason: rejectReason,
                    })
                  }
                >
                  Reject Prescription
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
