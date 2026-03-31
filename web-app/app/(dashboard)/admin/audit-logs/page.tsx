/**
 * Audit Logs Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Displays audit trail of role and permission changes for compliance.
 */
'use client';

import { useState } from 'react';
import { FileText, Search, Filter, Clock, User, Shield, PencilLine, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useAuditLogs, type AuditAction } from '@/lib/hooks/use-rbac';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { formatDistanceToNow } from 'date-fns';

const ACTION_TYPES = [
  { value: 'department_created', label: 'Department Created' },
  { value: 'department_updated', label: 'Department Updated' },
  { value: 'department_deleted', label: 'Department Deleted' },
  { value: 'role_created', label: 'Role Created' },
  { value: 'role_updated', label: 'Role Updated' },
  { value: 'role_deleted', label: 'Role Deleted' },
  { value: 'staff_created', label: 'Staff Created' },
  { value: 'staff_updated', label: 'Staff Updated' },
  { value: 'staff_deactivated', label: 'Staff Deactivated' },
];

function getActionBadgeVariant(action: string) {
  if (action.includes('create') || action.includes('assign')) {
    return 'default';
  }
  if (action.includes('change') || action.includes('update')) {
    return 'secondary';
  }
  if (action.includes('delete') || action.includes('deactivate')) {
    return 'destructive';
  }
  return 'outline';
}

function formatActionLabel(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const { refresh, isRefreshing } = usePageRefresh();

  const { data, isLoading, error, refetch } = useAuditLogs({
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    action: actionFilter !== 'all' ? (actionFilter as AuditAction) : undefined,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;

  const logs = data?.results ?? [];
  const createdCount = logs.filter((log) => log.action.includes('create')).length;
  const updatedCount = logs.filter((log) => log.action.includes('update')).length;
  const destructiveCount = logs.filter(
    (log) => log.action.includes('delete') || log.action.includes('deactivate')
  ).length;

  const handleRefresh = async () => {
    await refresh();
    await refetch();
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Logs"
          helpContent="Review administrative changes for departments, roles, and staff records. Use these logs for accountability and compliance checks."
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">Audit logs could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check the audit service response and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Audit Logs"
          helpContent="Review administrative changes for departments, roles, and staff records. Use these logs for accountability and compliance checks."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Visible Entries"
            value={data?.count ?? 0}
            description="Current results after filters"
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Created"
            value={createdCount}
            description="New records and assignments"
            icon={<PlusCircle className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Updated"
            value={updatedCount}
            description="Edits to existing records"
            icon={<PencilLine className="h-4 w-4 text-amber-600" />}
            valueClassName="text-2xl font-semibold text-amber-600"
          />
          <AdminStatCard
            title="Destructive"
            value={destructiveCount}
            description="Deletes and deactivations"
            icon={<Trash2 className="h-4 w-4 text-destructive" />}
            valueClassName="text-2xl font-semibold text-destructive"
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoComplete="off"
                  className="pl-9"
                  name="audit-log-search"
                  placeholder="Search by user, action, or resource…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger aria-label="Filter audit logs by action">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {ACTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Activity Stream
              <Badge variant="secondary" className="ml-1">
                {data?.count ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                data={logs}
                emptyMessage="No audit entries match the current filters."
                keyExtractor={(log) => log.id}
                mobileCard={(log) => <AuditLogMobileCard log={log} />}
                columns={[
                  {
                    key: 'timestamp',
                    header: 'Timestamp',
                    sortable: true,
                    sortType: 'date',
                    cell: (log) => (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'user',
                    header: 'User',
                    sortable: true,
                    sortFn: (a, b) => (a.user_name || a.username || '').localeCompare(b.user_name || b.username || ''),
                    cell: (log) => (
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{log.user_name || log.username || 'System'}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Action',
                    sortable: true,
                    cell: (log) => (
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {formatActionLabel(log.action)}
                      </Badge>
                    ),
                  },
                  {
                    key: 'resource',
                    header: 'Resource',
                    hideOnMobile: true,
                    sortable: true,
                    sortFn: (a, b) => (a.resource_type || '').localeCompare(b.resource_type || ''),
                    cell: (log) => (
                      <div className="min-w-0">
                        <p>{log.resource_name || log.resource_type}</p>
                        <p className="text-xs text-muted-foreground">ID: {log.resource_id ?? '—'}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'details',
                    header: 'Details',
                    hideOnMobile: true,
                    cell: (log) => (
                      <span className="block max-w-xs truncate text-sm text-muted-foreground">
                        {formatDetails(log.details)}
                      </span>
                    ),
                  },
                ]}
              />
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

function AuditLogMobileCard({ log }: { log: (typeof logsPlaceholder)[number] }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium truncate">{log.user_name || log.username || 'System'}</p>
          <p className="text-sm text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
        </div>
        <Badge variant={getActionBadgeVariant(log.action)}>
          {formatActionLabel(log.action)}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>{log.resource_name || log.resource_type}</p>
        <p>{formatDetails(log.details)}</p>
      </div>
    </Card>
  );
}

const logsPlaceholder = [] as Array<{
  id: number;
  user_name?: string;
  username: string;
  action: string;
  resource_name?: string;
  resource_type: string;
  details: Record<string, unknown>;
  timestamp: string;
}>;

function formatDetails(details: Record<string, unknown>) {
  const serialized = JSON.stringify(details);
  return serialized === '{}' ? 'No additional details' : serialized;
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
