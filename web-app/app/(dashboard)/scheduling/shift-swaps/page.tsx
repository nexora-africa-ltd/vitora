'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { shiftSwapsApi } from '@/lib/api/scheduling';
import type { ShiftSwapListItem, ShiftSwapStatus } from '@/lib/types/scheduling';
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

const statusIcons: Record<ShiftSwapStatus, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  ACCEPTED: <CheckCircle className="h-3 w-3" />,
  APPROVED: <CheckCircle className="h-3 w-3" />,
  COMPLETED: <CheckCircle className="h-3 w-3" />,
  REJECTED: <XCircle className="h-3 w-3" />,
  CANCELLED: <XCircle className="h-3 w-3" />,
  EXPIRED: <Timer className="h-3 w-3" />,
};

export default function ShiftSwapsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility: activeFacility } = useFacility();
  const [activeTab, setActiveTab] = useState('my-swaps');

  const { hasPermission } = usePermissions();
  const canManageSchedules = hasPermission('scheduling.manage_schedules');

  useSchedulingSocket(activeFacility?.id ?? null);

  // Fetch swaps pending manager approval (ACCEPTED status)
  const { data: pendingApprovalData, isLoading: approvalLoading } = useQuery({
    queryKey: ['shift-swaps', 'pending-approval', activeFacility?.id],
    queryFn: () => shiftSwapsApi.list({ status: 'ACCEPTED' }),
    enabled: !!activeFacility && canManageSchedules,
  });

  const pendingApprovalSwaps = pendingApprovalData?.results ?? [];

  // Fetch my swap requests
  const { data: mySwaps = [], isLoading: myLoading } = useQuery({
    queryKey: ['shift-swaps-my', activeFacility?.id],
    queryFn: () => shiftSwapsApi.myRequests(),
    enabled: !!activeFacility,
  });

  // Fetch available swaps
  const { data: availableSwaps = [], isLoading: availableLoading } = useQuery({
    queryKey: ['shift-swaps-available', activeFacility?.id],
    queryFn: () => shiftSwapsApi.available(),
    enabled: !!activeFacility,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => shiftSwapsApi.cancel(id),
    onSuccess: () => {
      toast.success('Swap request cancelled');
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
    },
    onError: () => toast.error('Failed to cancel swap request'),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: number) => shiftSwapsApi.accept(id),
    onSuccess: () => {
      toast.success('Swap request accepted');
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-available'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
    },
    onError: () => toast.error('Failed to accept swap request'),
  });

  const handleRowClick = useCallback(
    (item: ShiftSwapListItem) => router.push(`/scheduling/shift-swaps/${item.id}`),
    [router]
  );

  const formatDate = (d: string) => {
    try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
  };

  const mySwapColumns = [
    {
      key: 'requesting_shift_date',
      header: 'Shift Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ShiftSwapListItem) => formatDate(item.requesting_shift_date),
    },
    {
      key: 'requesting_shift_type',
      header: 'Type',
      sortable: true,
      cell: (item: ShiftSwapListItem) => (
        <Badge variant="outline" className="text-xs">
          {item.requesting_shift_type}
        </Badge>
      ),
    },
    {
      key: 'target_staff_name',
      header: 'Target',
      cell: (item: ShiftSwapListItem) => item.target_staff_name || (
        <span className="text-muted-foreground italic">Open</span>
      ),
    },
    {
      key: 'is_partial',
      header: 'Partial',
      cell: (item: ShiftSwapListItem) => item.is_partial ? (
        <Badge variant="secondary" className="text-xs">Partial</Badge>
      ) : null,
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ShiftSwapListItem) => (
        <Badge className={`${statusColors[item.status]} gap-1 shrink-0 w-fit`}>
          {statusIcons[item.status]}
          {item.status_display}
        </Badge>
      ),
    },
    {
      key: 'expires_at',
      header: 'Expires',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ShiftSwapListItem) => {
        const expired = isPast(parseISO(item.expires_at));
        return (
          <span className={expired ? 'text-destructive' : 'text-muted-foreground'}>
            {formatDate(item.expires_at)}
          </span>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ShiftSwapListItem) =>
        item.status === 'PENDING' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(item.id); }}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];

  const availableColumns = [
    {
      key: 'requesting_staff_name',
      header: 'Staff',
      sortable: true,
      cell: (item: ShiftSwapListItem) => item.requesting_staff_name,
    },
    {
      key: 'requesting_shift_date',
      header: 'Shift Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ShiftSwapListItem) => formatDate(item.requesting_shift_date),
    },
    {
      key: 'requesting_shift_type',
      header: 'Type',
      sortable: true,
      cell: (item: ShiftSwapListItem) => (
        <Badge variant="outline" className="text-xs">{item.requesting_shift_type}</Badge>
      ),
    },
    {
      key: 'is_partial',
      header: 'Partial',
      cell: (item: ShiftSwapListItem) => item.is_partial ? (
        <Badge variant="secondary" className="text-xs">Partial</Badge>
      ) : null,
      hideOnMobile: true,
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (item: ShiftSwapListItem) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {item.reason || '—'}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ShiftSwapListItem) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); acceptMutation.mutate(item.id); }}
          disabled={acceptMutation.isPending}
        >
          Accept
        </Button>
      ),
    },
  ];

  const approveMutation = useMutation({
    mutationFn: (id: number) => shiftSwapsApi.approve(id, {}),
    onSuccess: () => {
      toast.success('Swap approved and executed');
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-available'] });
      queryClient.invalidateQueries({ queryKey: ['scheduling-shifts'] });
    },
    onError: () => toast.error('Failed to approve swap'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => shiftSwapsApi.reject(id, {}),
    onSuccess: () => {
      toast.success('Swap rejected');
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['shift-swaps-my'] });
    },
    onError: () => toast.error('Failed to reject swap'),
  });

  const approvalColumns = [
    {
      key: 'requesting_staff_name',
      header: 'Requester',
      sortable: true,
      cell: (item: ShiftSwapListItem) => item.requesting_staff_name,
    },
    {
      key: 'requesting_shift_date',
      header: 'Shift Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ShiftSwapListItem) => formatDate(item.requesting_shift_date),
    },
    {
      key: 'requesting_shift_type',
      header: 'Type',
      sortable: true,
      cell: (item: ShiftSwapListItem) => (
        <Badge variant="outline" className="text-xs">{item.requesting_shift_type}</Badge>
      ),
    },
    {
      key: 'target_staff_name',
      header: 'Accepted By',
      cell: (item: ShiftSwapListItem) => item.target_staff_name || '—',
    },
    {
      key: 'is_partial',
      header: 'Partial',
      cell: (item: ShiftSwapListItem) => item.is_partial ? (
        <Badge variant="secondary" className="text-xs">Partial</Badge>
      ) : null,
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (item: ShiftSwapListItem) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); rejectMutation.mutate(item.id); }}
            disabled={rejectMutation.isPending}
          >
            Reject
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); approveMutation.mutate(item.id); }}
            disabled={approveMutation.isPending}
          >
            Approve
          </Button>
        </div>
      ),
    },
  ];

  const pendingCount = mySwaps.filter(s => s.status === 'PENDING').length;
  const acceptedCount = mySwaps.filter(s => s.status === 'ACCEPTED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Shift Swaps"
          helpContent="Request, accept, and manage shift swaps with colleagues. Open swaps are visible to all eligible staff."
          actions={
            <Button onClick={() => router.push('/scheduling/shift-swaps/new')}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Swap Request</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold mt-1">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Accepted</span>
              </div>
              <p className="text-2xl font-bold mt-1">{acceptedCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Available</span>
              </div>
              <p className="text-2xl font-bold mt-1">{availableSwaps.length}</p>
            </CardContent>
          </Card>
          {canManageSchedules && (
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Awaiting Approval</span>
                </div>
                <p className="text-2xl font-bold mt-1">{pendingApprovalSwaps.length}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-swaps" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              <span className="sm:hidden">Mine</span>
              <span className="hidden sm:inline">My Swaps</span>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="available" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="sm:hidden">Available</span>
              <span className="hidden sm:inline">Available Swaps</span>
              {availableSwaps.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{availableSwaps.length}</Badge>
              )}
            </TabsTrigger>
            {canManageSchedules && (
              <TabsTrigger value="approval" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="sm:hidden">Approval</span>
                <span className="hidden sm:inline">Pending Approval</span>
                {pendingApprovalSwaps.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{pendingApprovalSwaps.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my-swaps">
            <ResponsiveTable
              data={mySwaps}
              keyExtractor={(item) => item.id}
              columns={mySwapColumns}
              onRowClick={handleRowClick}
              defaultSortColumn="requesting_shift_date"
              defaultSortDirection="desc"
              isLoading={myLoading}
              emptyMessage="No swap requests yet. Create one to get started."
              mobileCard={(item: ShiftSwapListItem) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{formatDate(item.requesting_shift_date)}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.requesting_shift_type} shift
                        {item.target_staff_name ? ` → ${item.target_staff_name}` : ' (open)'}
                      </p>
                    </div>
                    <Badge className={`${statusColors[item.status]} gap-1 shrink-0 w-fit`}>
                      {statusIcons[item.status]}
                      {item.status_display}
                    </Badge>
                  </div>
                </Card>
              )}
            />
          </TabsContent>

          <TabsContent value="available">
            <ResponsiveTable
              data={availableSwaps}
              keyExtractor={(item) => item.id}
              columns={availableColumns}
              onRowClick={handleRowClick}
              defaultSortColumn="requesting_shift_date"
              defaultSortDirection="asc"
              isLoading={availableLoading}
              emptyMessage="No available swap requests at this time."
              mobileCard={(item: ShiftSwapListItem) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.requesting_staff_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(item.requesting_shift_date)} • {item.requesting_shift_type}
                      </p>
                      {item.reason && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{item.reason}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => { e.stopPropagation(); acceptMutation.mutate(item.id); }}
                    >
                      Accept
                    </Button>
                  </div>
                </Card>
              )}
            />
          </TabsContent>

          {canManageSchedules && (
            <TabsContent value="approval">
              <ResponsiveTable
                data={pendingApprovalSwaps}
                keyExtractor={(item) => item.id}
                columns={approvalColumns}
                onRowClick={handleRowClick}
                defaultSortColumn="requesting_shift_date"
                defaultSortDirection="asc"
                isLoading={approvalLoading}
                emptyMessage="No swaps awaiting approval."
                mobileCard={(item: ShiftSwapListItem) => (
                  <Card className="p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{item.requesting_staff_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(item.requesting_shift_date)} • {item.requesting_shift_type}
                        </p>
                        {item.target_staff_name && (
                          <p className="text-xs text-muted-foreground mt-1">Accepted by {item.target_staff_name}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); rejectMutation.mutate(item.id); }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); approveMutation.mutate(item.id); }}
                        >
                          Approve
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PullToRefresh>
  );
}
