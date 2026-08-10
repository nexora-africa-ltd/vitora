'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, X } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { proceduresApi } from '@/lib/api/procedures';
import type { ExternalProcedureOrderRequest } from '@/lib/types/procedure';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function ExternalProcedureRequestsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [rejectDialog, setRejectDialog] = useState<ExternalProcedureOrderRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['procedure-external-requests'],
    queryFn: () => proceduresApi.listExternalRequests(),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: number) => proceduresApi.acceptExternalRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure-external-requests'] });
      queryClient.invalidateQueries({ queryKey: ['procedure-orders'] });
      toast.success('External request accepted and procedure order created');
    },
    onError: () => toast.error('Failed to accept request'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      proceduresApi.rejectExternalRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procedure-external-requests'] });
      setRejectDialog(null);
      setRejectReason('');
      toast.success('External request rejected');
    },
    onError: () => toast.error('Failed to reject request'),
  });

  const columns = [
    {
      key: 'request_number',
      header: 'Request #',
      sortable: true,
      cell: (item: ExternalProcedureOrderRequest) => (
        <span className="font-mono text-sm">{item.request_number}</span>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: ExternalProcedureOrderRequest) => item.patient_name,
    },
    {
      key: 'procedure_name',
      header: 'Procedure',
      sortable: true,
      cell: (item: ExternalProcedureOrderRequest) => item.procedure_name,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ExternalProcedureOrderRequest) => (
        <Badge className={statusColors[item.status] || ''}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Requested',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ExternalProcedureOrderRequest) => new Date(item.created_at).toLocaleString(),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ExternalProcedureOrderRequest) =>
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

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="External Procedure Requests"
          helpContent="Review encounter-originated procedure referrals. Accept to create an internal procedure order, or reject with a reason."
        />

        <ResponsiveTable
          data={data?.results || []}
          keyExtractor={(item) => item.id}
          columns={columns}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          isLoading={isLoading}
          emptyMessage="No external procedure requests yet."
        />

        <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rejecting request <span className="font-mono">{rejectDialog?.request_number}</span>
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
                <Button variant="outline" onClick={() => setRejectDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  onClick={() =>
                    rejectDialog &&
                    rejectMutation.mutate({ id: rejectDialog.id, reason: rejectReason })
                  }
                >
                  Reject Request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
