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
import { standaloneLisApi } from '@/lib/api/standalone-lis';
import type { ExternalOrderRequest, ExternalOrderStatus } from '@/lib/types/standalone-lis';
import { toast } from 'sonner';

const statusColors: Record<ExternalOrderStatus, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PROCESSING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export default function ExternalOrdersPage() {
  const [rejectDialog, setRejectDialog] = useState<ExternalOrderRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['external-orders'],
    queryFn: () => standaloneLisApi.listExternalOrders(),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: number) => standaloneLisApi.acceptExternalOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-orders'] });
      toast.success('External order accepted and lab order created');
    },
    onError: () => toast.error('Failed to accept order'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      standaloneLisApi.rejectExternalOrder(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-orders'] });
      setRejectDialog(null);
      setRejectReason('');
      toast.success('External order rejected');
    },
    onError: () => toast.error('Failed to reject order'),
  });

  const columns = [
    {
      key: 'placer_order_number',
      header: 'Order #',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
        <span className="font-mono text-sm">{item.placer_order_number}</span>
      ),
    },
    {
      key: 'sending_facility',
      header: 'From',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
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
      cell: (item: ExternalOrderRequest) => item.patient_name,
    },
    {
      key: 'tests',
      header: 'Tests',
      cell: (item: ExternalOrderRequest) => (
        <span className="text-sm text-muted-foreground">
          {item.requested_tests.length} test(s)
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ExternalOrderRequest) => (
        <Badge className={statusColors[item.status]}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Received',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ExternalOrderRequest) => new Date(item.created_at).toLocaleString(),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ExternalOrderRequest) =>
        item.status === 'RECEIVED' ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-green-600"
              onClick={(e) => { e.stopPropagation(); acceptMutation.mutate(item.id); }}
              disabled={acceptMutation.isPending}
            >
              <Check className="h-3 w-3 mr-1" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-red-600"
              onClick={(e) => { e.stopPropagation(); setRejectDialog(item); }}
            >
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const pendingCount = data?.results.filter((o) => o.status === 'RECEIVED').length || 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="External Orders"
          helpContent="Inbound lab orders from external systems via HL7. Accept to create a lab order, or reject with a reason."
        />

        {pendingCount > 0 && (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">
                {pendingCount} pending order{pendingCount > 1 ? 's' : ''} awaiting review
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-5 w-5" />
              Inbound Orders
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
              emptyMessage="No external orders received yet."
            />
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rejecting order <span className="font-mono">{rejectDialog?.placer_order_number}</span> from {rejectDialog?.sending_facility}
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
                  onClick={() => rejectDialog && rejectMutation.mutate({ id: rejectDialog.id, reason: rejectReason })}
                >
                  Reject Order
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
