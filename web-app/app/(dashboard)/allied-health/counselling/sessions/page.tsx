/**
 * Counselling Sessions List Page
 * View all counselling sessions with filtering and status management
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { SessionStatusBadge } from '@/components/allied-health';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Calendar,
  Search,
  MoreVertical,
  Play,
  CheckCircle,
  XCircle,
  UserX,
  ChevronLeft,
  ChevronRight,
  Clock,
  Activity,
  Filter,
  MessageCircle,
  Video,
  Phone,
  Users,
  User,
} from 'lucide-react';
import {
  useCounsellingSessions,
  useStartCounsellingSession,
  useCancelCounsellingSession,
  useMarkCounsellingSessionNoShow,
} from '@/lib/hooks/use-counselling';
import { useToast } from '@/lib/hooks/use-toast';
import type { CounsellingSessionListParams } from '@/lib/types/counselling';
import type { AlliedHealthSessionStatus } from '@/lib/types/allied-health';

const STATUS_OPTIONS: { value: AlliedHealthSessionStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
];


export default function CounsellingSessionsPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Filters
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [status, setStatus] = useState<AlliedHealthSessionStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Build query params
  const params: CounsellingSessionListParams = {
    page,
    page_size: 20,
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(status && { status }),
    ...(search && { search }),
  };

  const { data, isLoading, error } = useCounsellingSessions(params);
  const startMutation = useStartCounsellingSession();
  const cancelMutation = useCancelCounsellingSession();
  const noShowMutation = useMarkCounsellingSessionNoShow();

  const sessions = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Handlers
  const handleStart = async (sessionId: number) => {
    try {
      await startMutation.mutateAsync(sessionId);
      toast({ title: 'Session started' });
    } catch (err) {
      toast({
        title: 'Failed to start session',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (sessionId: number) => {
    try {
      await cancelMutation.mutateAsync({ id: sessionId });
      toast({ title: 'Session cancelled' });
    } catch (err) {
      toast({
        title: 'Failed to cancel session',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleNoShow = async (sessionId: number) => {
    try {
      await noShowMutation.mutateAsync(sessionId);
      toast({ title: 'Session marked as no-show' });
    } catch (err) {
      toast({
        title: 'Failed to mark no-show',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Quick date filters
  const setDateRange = (range: 'today' | 'week' | 'month') => {
    const today = new Date();
    switch (range) {
      case 'today':
        setDateFrom(format(today, 'yyyy-MM-dd'));
        setDateTo(format(today, 'yyyy-MM-dd'));
        break;
      case 'week':
        setDateFrom(format(subDays(today, 7), 'yyyy-MM-dd'));
        setDateTo(format(addDays(today, 7), 'yyyy-MM-dd'));
        break;
      case 'month':
        setDateFrom(format(subDays(today, 30), 'yyyy-MM-dd'));
        setDateTo(format(addDays(today, 30), 'yyyy-MM-dd'));
        break;
    }
    setPage(1);
  };

  // Stats
  const scheduledCount = sessions.filter((s) => s.status === 'SCHEDULED').length;
  const inProgressCount = sessions.filter((s) => s.status === 'IN_PROGRESS').length;
  const completedCount = sessions.filter((s) => s.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counselling Sessions"
        helpContent="View and manage all counselling sessions. Filter by date, status, modality, or search for specific patients."
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{scheduledCount}</div>
            <p className="text-xs text-muted-foreground">Upcoming sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground">Active sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <p className="text-xs text-muted-foreground">In this period</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDateRange('today')}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange('week')}>
                This Week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange('month')}>
                This Month
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v as AlliedHealthSessionStatus | '');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Patient name or MRN..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-destructive">
              Failed to load sessions. Please try again.
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No sessions found"
              description="No counselling sessions match your filters. Try adjusting the date range or status filter."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Counsellor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => {
                    const canStart = session.status === 'SCHEDULED';
                    const canCancel = session.status === 'SCHEDULED';
                    const canMarkNoShow = session.status === 'SCHEDULED';

                    return (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/allied-health/counselling/referrals/${session.referral}`)}
                      >
                        <TableCell className="font-mono text-sm">
                          {session.session_number}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{session.patient_name}</div>
                        </TableCell>
                        <TableCell>
                          {format(parseISO(session.scheduled_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>{session.scheduled_time || '-'}</TableCell>
                        <TableCell>{session.counsellor_name || 'Unassigned'}</TableCell>
                        <TableCell>
                          <SessionStatusBadge status={session.status} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canStart && (
                                <DropdownMenuItem onClick={() => handleStart(session.id)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Start Session
                                </DropdownMenuItem>
                              )}
                              {canMarkNoShow && (
                                <DropdownMenuItem onClick={() => handleNoShow(session.id)}>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Mark No-Show
                                </DropdownMenuItem>
                              )}
                              {canCancel && (
                                <DropdownMenuItem
                                  onClick={() => handleCancel(session.id)}
                                  className="text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel Session
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, totalCount)} of {totalCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
