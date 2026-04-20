'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  AlertTriangle,
  User,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { shiftSwapsApi } from '@/lib/api/scheduling';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { ShiftSwapRequest, ShiftSummary, ShiftSwapStatus } from '@/lib/types/scheduling';
import { toast } from 'sonner';
import { format, parseISO, isPast } from 'date-fns';

const statusColors: Record<ShiftSwapStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACCEPTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

function ShiftCard({ title, summary, icon }: { title: string; summary: ShiftSummary; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div><span className="text-muted-foreground">Staff:</span> {summary.staff_name || '—'}</div>
        <div><span className="text-muted-foreground">Date:</span> {format(parseISO(summary.shift_date), 'MMM d, yyyy')}</div>
        <div><span className="text-muted-foreground">Time:</span> {summary.start_time} – {summary.end_time}</div>
        <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline" className="text-xs">{summary.shift_type}</Badge></div>
        <div><span className="text-muted-foreground">Status:</span> {summary.status}</div>
      </CardContent>
    </Card>
  );
}

export default function ShiftSwapDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const id = Number(params.id);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNotes, setApproveNotes] = useState('');

  const canManageSchedules = hasPermission('scheduling.manage_schedules');

  const { data: swap, isLoading, error } = useQuery({
    queryKey: ['shift-swaps', id],
    queryFn: () => shiftSwapsApi.get(id),
    enabled: !!id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
    queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
    queryClient.invalidateQueries({ queryKey: ['shift-swaps-available'] });
  };

  const acceptMutation = useMutation({
    mutationFn: () => shiftSwapsApi.accept(id),
    onSuccess: () => { toast.success('Swap accepted'); invalidateAll(); },
    onError: () => toast.error('Failed to accept'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => shiftSwapsApi.reject(id, { reason }),
    onSuccess: () => { toast.success('Swap rejected'); setRejectDialogOpen(false); invalidateAll(); },
    onError: () => toast.error('Failed to reject'),
  });

  const approveMutation = useMutation({
    mutationFn: (notes: string) => shiftSwapsApi.approve(id, { notes }),
    onSuccess: () => { toast.success('Swap approved'); setApproveDialogOpen(false); invalidateAll(); },
    onError: () => toast.error('Failed to approve'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => shiftSwapsApi.cancel(id),
    onSuccess: () => { toast.success('Swap cancelled'); invalidateAll(); },
    onError: () => toast.error('Failed to cancel'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !swap) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium">Swap request not found</p>
        <Button variant="outline" onClick={() => router.push('/scheduling/shift-swaps')}>
          Back to Shift Swaps
        </Button>
      </div>
    );
  }

  const expired = isPast(parseISO(swap.expires_at));

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Shift Swap #${swap.id}`}
        helpContent="View swap request details, constraint warnings, and take actions."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {swap.requester_name}
            {swap.target_staff_name && (
              <span className="text-muted-foreground"> → {swap.target_staff_name}</span>
            )}
            {!swap.target_staff_name && (
              <span className="text-muted-foreground"> (open swap)</span>
            )}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {format(parseISO(swap.created_at), 'MMM d, yyyy HH:mm')}
            {swap.is_partial && ' • Partial swap'}
          </p>
        </div>
        <Badge className={`${statusColors[swap.status]} gap-1 shrink-0 w-fit self-start sm:self-auto`}>
          {swap.status_display}
        </Badge>
      </div>

      {/* Constraint Warnings */}
      {swap.constraint_warnings.length > 0 && (
        <Card className="border-yellow-300 dark:border-yellow-800">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-300">Constraint Warnings</p>
                <ul className="mt-1 space-y-1 text-sm text-yellow-700 dark:text-yellow-400">
                  {swap.constraint_warnings.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shift Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShiftCard
          title="Requesting Shift"
          summary={swap.requesting_shift_summary}
          icon={<Calendar className="h-4 w-4 text-blue-500" />}
        />
        {swap.accepted_shift_summary ? (
          <ShiftCard
            title="Offered Shift"
            summary={swap.accepted_shift_summary}
            icon={<ArrowLeftRight className="h-4 w-4 text-green-500" />}
          />
        ) : swap.target_shift_summary ? (
          <ShiftCard
            title="Target Shift"
            summary={swap.target_shift_summary}
            icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />}
          />
        ) : (
          <Card className="flex items-center justify-center border-dashed min-h-[180px]">
            <p className="text-sm text-muted-foreground">Open swap — no specific target</p>
          </Card>
        )}
      </div>

      {/* Partial Swap Details */}
      {swap.is_partial && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-purple-500" />
              Partial Swap Details
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Start:</span> {swap.partial_start_time || '—'}</p>
            <p><span className="text-muted-foreground">End:</span> {swap.partial_end_time || '—'}</p>
          </CardContent>
        </Card>
      )}

      {/* Details Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {swap.reason && (
            <p><span className="text-muted-foreground">Reason:</span> {swap.reason}</p>
          )}
          {swap.rejection_reason && (
            <p><span className="text-muted-foreground">Rejection reason:</span> {swap.rejection_reason}</p>
          )}
          <p>
            <span className="text-muted-foreground">Expires:</span>{' '}
            <span className={expired ? 'text-destructive font-medium' : ''}>
              {format(parseISO(swap.expires_at), 'MMM d, yyyy HH:mm')}
              {expired && ' (expired)'}
            </span>
          </p>
          {swap.accepted_by_name && (
            <p><span className="text-muted-foreground">Accepted by:</span> {swap.accepted_by_name} — {swap.accepted_at ? format(parseISO(swap.accepted_at), 'MMM d, yyyy HH:mm') : ''}</p>
          )}
          {swap.reviewed_by_name && (
            <p><span className="text-muted-foreground">Reviewed by:</span> {swap.reviewed_by_name} — {swap.reviewed_at ? format(parseISO(swap.reviewed_at), 'MMM d, yyyy HH:mm') : ''}</p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {swap.status === 'PENDING' && (
          <>
            <Button
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Request
            </Button>
            <Button
              variant="default"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Accept
            </Button>
          </>
        )}
        {swap.status === 'ACCEPTED' && canManageSchedules && (
          <>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              variant="default"
              onClick={() => setApproveDialogOpen(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Swap Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this swap request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Optional reason for rejection..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectReason)}
              disabled={rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Swap Request</DialogTitle>
            <DialogDescription>Review and approve this shift swap.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="approve-notes">Notes</Label>
            <Textarea
              id="approve-notes"
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => approveMutation.mutate(approveNotes)}
              disabled={approveMutation.isPending}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
