/**
 * OTP Whitelist Requests Page
 * Lists all OTP whitelist requests submitted to DHA with status tracking.
 */
'use client';

import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { shaApi } from '@/lib/api/sha';
import type { SHAOtpWhitelistRow } from '@/lib/schemas/sha.schema';

// ============================================================================
// Helpers
// ============================================================================

function getStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Rejected
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

function formatReasonType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// ============================================================================
// Page
// ============================================================================

export default function WhitelistRequestsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sha', 'whitelist-requests', statusFilter],
    queryFn: () => shaApi.listLocalOtpWhitelists(statusFilter ? { status: statusFilter } : {}),
  });

  const rows = data?.results ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.beneficiary_cr_id.toLowerCase().includes(q) ||
        r.reason_type.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.dha_guid.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Stat counts
  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === 'requested').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows]);

  const handleRefreshAll = async () => {
    await refresh();
    queryClient.invalidateQueries({ queryKey: ['sha', 'whitelist-requests'] });
  };

  return (
    <PullToRefresh onRefresh={handleRefreshAll} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="OTP Whitelist Requests"
          helpContent="View and track OTP whitelist requests submitted to DHA. Approved requests allow OTP-based consent for patients whose biometrics cannot be captured."
          actions={
            <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isRefreshing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="cursor-pointer" onClick={() => setStatusFilter('')}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer" onClick={() => setStatusFilter('requested')}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-lg font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer" onClick={() => setStatusFilter('approved')}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-lg font-bold">{stats.approved}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer" onClick={() => setStatusFilter('rejected')}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-lg font-bold">{stats.rejected}</p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by CR ID, reason, or GUID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Table */}
        <ResponsiveTable<SHAOtpWhitelistRow>
          data={filtered}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No whitelist requests found"
          defaultSortColumn="requested_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'beneficiary_cr_id',
              header: 'Beneficiary',
              sortable: true,
              cell: (row) => (
                <span className="font-mono text-xs">{row.beneficiary_cr_id || '—'}</span>
              ),
            },
            {
              key: 'reason_type',
              header: 'Reason',
              sortable: true,
              cell: (row) => (
                <span className="text-sm">{formatReasonType(row.reason_type || 'Unknown')}</span>
              ),
            },
            {
              key: 'biometric_attempts',
              header: 'Attempts',
              sortable: true,
              sortType: 'number',
              cell: (row) => (
                <span className="text-sm">{row.biometric_attempts ?? '—'}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (row) => getStatusBadge(row.status),
            },
            {
              key: 'requested_at',
              header: 'Submitted',
              sortable: true,
              sortType: 'date',
              cell: (row) => (
                <span className="text-xs text-muted-foreground">
                  {row.requested_at ? format(parseISO(row.requested_at), 'dd MMM yyyy HH:mm') : '—'}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'dha_guid',
              header: 'DHA GUID',
              cell: (row) => (
                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[100px] inline-block">
                  {row.dha_guid || '—'}
                </span>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(row) => (
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono text-xs truncate">{row.beneficiary_cr_id}</p>
                <p className="text-xs text-muted-foreground">{formatReasonType(row.reason_type || 'Unknown')}</p>
                {row.requested_at && (
                  <p className="text-[10px] text-muted-foreground">
                    {format(parseISO(row.requested_at), 'dd MMM yyyy HH:mm')}
                  </p>
                )}
              </div>
              {getStatusBadge(row.status)}
            </div>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
