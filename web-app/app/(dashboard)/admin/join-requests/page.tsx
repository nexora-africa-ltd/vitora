/**
 * Organization Join Requests Admin Page
 * Review and manage requests from users wanting to join the organization.
 */
'use client';

import { useState } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  UserPlus,
  Mail,
  Building2,
  Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useToast } from '@/lib/hooks/use-toast';
import { joinRequestsApi } from '@/lib/api/join-requests';
import { rolesApi } from '@/lib/api/rbac';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrgJoinRequest, JoinRequestStatus } from '@/lib/types/membership';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 20;

const statusConfig: Record<JoinRequestStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pending', variant: 'default', icon: Clock },
  APPROVED: { label: 'Approved', variant: 'secondary', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  CANCELLED: { label: 'Cancelled', variant: 'outline', icon: Ban },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
}

export default function JoinRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JoinRequestStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const { refresh, isRefreshing } = usePageRefresh();

  const [approveTarget, setApproveTarget] = useState<OrgJoinRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrgJoinRequest | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isActioning, setIsActioning] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['join-requests', { page, status: statusFilter }],
    queryFn: () => joinRequestsApi.list({
      page,
      page_size: PAGE_SIZE,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
  });

  // Fetch roles for the approve dialog
  const { data: rolesData } = useQuery({
    queryKey: ['roles-list'],
    queryFn: () => rolesApi.list({ page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const requests = data?.results ?? [];
  const filteredRequests = search
    ? requests.filter(r =>
        r.user_name.toLowerCase().includes(search.toLowerCase()) ||
        r.user_email.toLowerCase().includes(search.toLowerCase())
      )
    : requests;
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  const handleApprove = async () => {
    if (!approveTarget || !selectedRole) return;
    setIsActioning(approveTarget.id);
    try {
      await joinRequestsApi.approve(approveTarget.id, {
        role: Number(selectedRole),
        review_notes: reviewNotes || undefined,
      });
      toast({
        title: 'Request approved',
        description: `${approveTarget.user_name} has been added to the organization`,
      });
      await queryClient.invalidateQueries({ queryKey: ['join-requests'] });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to approve',
        description: error instanceof Error ? error.message : 'Could not approve request',
      });
    } finally {
      setIsActioning(null);
      setApproveTarget(null);
      setSelectedRole('');
      setReviewNotes('');
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setIsActioning(rejectTarget.id);
    try {
      await joinRequestsApi.reject(rejectTarget.id, {
        review_notes: reviewNotes || undefined,
      });
      toast({
        title: 'Request rejected',
        description: `Join request from ${rejectTarget.user_name} has been rejected`,
      });
      await queryClient.invalidateQueries({ queryKey: ['join-requests'] });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to reject',
        description: error instanceof Error ? error.message : 'Could not reject request',
      });
    } finally {
      setIsActioning(null);
      setRejectTarget(null);
      setReviewNotes('');
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Join Requests"
          helpContent="Review requests from existing users who want to join your organization. Approve requests to grant them access with a specific role."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Total Requests"
            value={data?.count ?? 0}
            description="All join requests"
            icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Pending"
            value={pendingCount}
            description="Awaiting review"
            icon={<Clock className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Approved"
            value={approvedCount}
            description="Membership granted"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Rejected"
            value={rejectedCount}
            description="Access denied"
            icon={<XCircle className="h-4 w-4 text-destructive" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px] sm:items-center mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as JoinRequestStatus | 'all'); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ResponsiveTable
              data={filteredRequests}
              keyExtractor={(item) => item.id}
              isLoading={isLoading}
              emptyMessage="No join requests found"
              columns={[
                {
                  key: 'user_name',
                  header: 'User',
                  sortable: true,
                  cell: (item) => (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.user_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {item.user_email}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'organization_name',
                  header: 'Organization',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (item) => (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{item.organization_name}</span>
                    </div>
                  ),
                },
                {
                  key: 'requested_role_name',
                  header: 'Requested Role',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (item) => item.requested_role_name ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {item.requested_role_name}
                    </div>
                  ) : <span className="text-muted-foreground text-sm">Not specified</span>,
                },
                {
                  key: 'message',
                  header: 'Message',
                  hideOnMobile: true,
                  cell: (item) => item.message ? (
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">{item.message}</p>
                  ) : <span className="text-muted-foreground text-sm">—</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (item) => {
                    const config = statusConfig[item.status];
                    const StatusIcon = config.icon;
                    return (
                      <Badge variant={config.variant} className="gap-1 shrink-0 w-fit">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    );
                  },
                },
                {
                  key: 'created_at',
                  header: 'Requested',
                  sortable: true,
                  sortType: 'date' as const,
                  hideOnMobile: true,
                  cell: (item) => (
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item) => (
                    <div className="flex gap-1 justify-end">
                      {item.status === 'PENDING' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={(e) => { e.stopPropagation(); setApproveTarget(item); }}
                            disabled={isActioning === item.id}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden sm:inline">Approve</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setRejectTarget(item); }}
                            disabled={isActioning === item.id}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden sm:inline">Reject</span>
                          </Button>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(item) => {
                const config = statusConfig[item.status];
                const StatusIcon = config.icon;
                return (
                  <Card className="p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.user_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.user_email}
                        </p>
                        {item.requested_role_name && (
                          <p className="text-xs text-muted-foreground">
                            Role: {item.requested_role_name}
                          </p>
                        )}
                        {item.message && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            &ldquo;{item.message}&rdquo;
                          </p>
                        )}
                      </div>
                      <Badge variant={config.variant} className="gap-1 shrink-0">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    {item.status === 'PENDING' && (
                      <div className="flex gap-2 mt-3 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-emerald-600 hover:text-emerald-700"
                          onClick={() => setApproveTarget(item)}
                          disabled={isActioning === item.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-destructive hover:text-destructive"
                          onClick={() => setRejectTarget(item)}
                          disabled={isActioning === item.id}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              }}
            />

            {/* Pagination */}
            {data && data.count > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {Math.ceil(data.count / PAGE_SIZE)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.next}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve dialog — requires role selection */}
      <Dialog open={!!approveTarget} onOpenChange={() => { setApproveTarget(null); setSelectedRole(''); setReviewNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Join Request</DialogTitle>
            <DialogDescription>
              Approve <strong>{approveTarget?.user_name}</strong>&apos;s request to join the organization.
              Select a role to assign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="approve-role">Role *</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="approve-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {rolesData?.results?.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-notes">Notes (optional)</Label>
              <Textarea
                id="approve-notes"
                placeholder="Optional notes about approval..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveTarget(null); setSelectedRole(''); setReviewNotes(''); }}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={!selectedRole || isActioning === approveTarget?.id}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setReviewNotes(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Join Request</AlertDialogTitle>
            <AlertDialogDescription>
              Reject <strong>{rejectTarget?.user_name}</strong>&apos;s request to join the organization.
              They can submit a new request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="reject-notes">Reason (optional)</Label>
            <Textarea
              id="reject-notes"
              placeholder="Optional reason for rejection..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={2}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRejectTarget(null); setReviewNotes(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
}
