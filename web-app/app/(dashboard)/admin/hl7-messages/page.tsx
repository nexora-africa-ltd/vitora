/**
 * HL7 Message Log Page
 *
 * Read-only admin page for monitoring HL7 v2 message traffic.
 * Displays message list with filters, stats, and retry action.
 */
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Clock,
  Network,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { hl7Api } from '@/lib/api/hl7';
import type { HL7MessageListItem, HL7Message } from '@/lib/types/hl7';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACK', label: 'Acknowledged' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'DEAD', label: 'Dead Letter' },
];

const DIRECTION_OPTIONS = [
  { value: 'OUT', label: 'Outbound' },
  { value: 'IN', label: 'Inbound' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACK':
      return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Acknowledged</Badge>;
    case 'SENT':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Sent</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
    case 'SENDING':
      return <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">Sending</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">Failed</Badge>;
    case 'DEAD':
      return <Badge className="bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-400">Dead Letter</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'OUT') {
    return <ArrowUpRight className="h-4 w-4 text-blue-500" />;
  }
  return <ArrowDownLeft className="h-4 w-4 text-emerald-500" />;
}

function formatTimestamp(ts: string | null) {
  if (!ts) return '—';
  return format(new Date(ts), 'MMM d, yyyy HH:mm:ss');
}

export default function HL7MessagesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [selectedMessage, setSelectedMessage] = useState<HL7Message | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { refresh, isRefreshing } = usePageRefresh();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hl7-messages', search, statusFilter, directionFilter],
    queryFn: () =>
      hl7Api.list({
        search: search || undefined,
        status: statusFilter !== 'all' ? (statusFilter as HL7MessageListItem['status']) : undefined,
        direction: directionFilter !== 'all' ? (directionFilter as HL7MessageListItem['direction']) : undefined,
      }),
  });

  const { data: stats } = useQuery({
    queryKey: ['hl7-stats'],
    queryFn: () => hl7Api.getStats(),
  });

  const messages = data?.results ?? [];

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  const handleRowClick = async (msg: HL7MessageListItem) => {
    try {
      const detail = await hl7Api.get(msg.id);
      setSelectedMessage(detail);
      setDetailOpen(true);
    } catch {
      toast({ title: 'Failed to load message detail', variant: 'destructive' });
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await hl7Api.retry(id);
      toast({ title: 'Message queued for retry' });
      await queryClient.invalidateQueries({ queryKey: ['hl7-messages'] });
      await queryClient.invalidateQueries({ queryKey: ['hl7-stats'] });
      setDetailOpen(false);
    } catch {
      toast({ title: 'Failed to retry message', variant: 'destructive' });
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="HL7 Messages"
          helpContent="Monitor HL7 v2 message traffic including ADT, ORM, and ORU messages. View message status, errors, and retry failed messages."
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">HL7 messages could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">Check the API and try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="HL7 Messages"
          helpContent="Monitor HL7 v2 message traffic including ADT (admit/discharge/transfer), ORM (orders), and ORU (results) messages. View message status, errors, and retry failed messages."
        />

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Total Messages"
            value={stats?.total ?? 0}
            description="All HL7 messages"
            icon={<Network className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Pending"
            value={stats?.pending ?? 0}
            description="Awaiting transmission"
            icon={<Clock className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Acknowledged"
            value={stats?.acknowledged ?? 0}
            description="Successfully delivered"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Failed"
            value={(stats?.failed ?? 0) + (stats?.dead_letter ?? 0)}
            description="Errors & dead letters"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            valueClassName="text-2xl font-semibold text-destructive"
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoComplete="off"
                  className="pl-9"
                  name="hl7-search"
                  placeholder="Search by control ID, type, or resource…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filter by status">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger aria-label="Filter by direction">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  {DIRECTION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Message Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Message Log
              <Badge variant="secondary" className="ml-1">{data?.count ?? 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={messages}
                emptyMessage="No HL7 messages match the current filters."
                keyExtractor={(msg) => msg.id}
                onRowClick={handleRowClick}
                mobileCard={(msg) => (
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <DirectionIcon direction={msg.direction} />
                        <span className="font-medium text-sm">{msg.message_type}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {msg.message_control_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="shrink-0">{getStatusBadge(msg.status)}</div>
                  </div>
                )}
                columns={[
                  {
                    key: 'direction',
                    header: '',
                    cell: (msg) => <DirectionIcon direction={msg.direction} />,
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    cell: (msg) => <span className="font-mono text-sm">{msg.message_type}</span>,
                  },
                  {
                    key: 'control_id',
                    header: 'Control ID',
                    cell: (msg) => <span className="font-mono text-sm">{msg.message_control_id}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (msg) => getStatusBadge(msg.status),
                  },
                  {
                    key: 'resource',
                    header: 'Resource',
                    hideOnMobile: true,
                    cell: (msg) => (
                      <span className="text-sm text-muted-foreground">
                        {msg.resource_type ? `${msg.resource_type} #${msg.resource_id}` : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'retries',
                    header: 'Retries',
                    hideOnMobile: true,
                    cell: (msg) => (
                      <span className={`text-sm ${msg.retry_count > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                        {msg.retry_count}
                      </span>
                    ),
                  },
                  {
                    key: 'created',
                    header: 'Created',
                    hideOnMobile: true,
                    cell: (msg) => (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Message Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DirectionIcon direction={selectedMessage?.direction ?? 'OUT'} />
                {selectedMessage?.message_type} — {selectedMessage?.message_control_id}
              </DialogTitle>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    {getStatusBadge(selectedMessage.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Direction</p>
                    <p className="text-sm font-medium">{selectedMessage.direction === 'OUT' ? 'Outbound' : 'Inbound'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Resource</p>
                    <p className="text-sm">
                      {selectedMessage.resource_type ? `${selectedMessage.resource_type} #${selectedMessage.resource_id}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Destination</p>
                    <p className="text-sm">
                      {selectedMessage.destination_host
                        ? `${selectedMessage.destination_host}:${selectedMessage.destination_port}`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Retries</p>
                    <p className="text-sm">{selectedMessage.retry_count} / {selectedMessage.max_retries}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ACK Code</p>
                    <p className="text-sm">{selectedMessage.ack_code || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{formatTimestamp(selectedMessage.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sent</p>
                    <p className="text-sm">{formatTimestamp(selectedMessage.sent_at)}</p>
                  </div>
                </div>

                {selectedMessage.last_error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-medium text-destructive">Last Error</p>
                    <p className="mt-1 text-sm">{selectedMessage.last_error}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Raw HL7 Message</p>
                  <pre className="rounded-md border bg-muted/30 p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all font-mono">
                    {selectedMessage.raw_message}
                  </pre>
                </div>

                {selectedMessage.is_retryable && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(selectedMessage.id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Retry Send
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
