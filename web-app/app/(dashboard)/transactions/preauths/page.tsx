/**
 * Pre-authorizations List Page
 * Shows all SHA pre-authorization requests with status filtering.
 */
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileCheck,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Search,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { shaApi } from '@/lib/api/sha';
import type { SHAPreauth } from '@/lib/schemas/sha.schema';

// ============================================================================
// Status helpers
// ============================================================================

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    case 'submitted':
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Submitted
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Ban className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    case 'draft':
    default:
      return (
        <Badge variant="outline">
          <FileCheck className="mr-1 h-3 w-3" />
          Draft
        </Badge>
      );
  }
}

function getDoctorConsentBadge(state: string) {
  if (!state) return null;
  switch (state.toUpperCase()) {
    case 'APPROVED':
      return <Badge className="bg-green-100 text-green-800 text-xs">Dr. Approved</Badge>;
    case 'REJECTED':
    case 'FAILED':
      return <Badge variant="destructive" className="text-xs">Dr. Rejected</Badge>;
    case 'REQUESTED':
      return <Badge variant="secondary" className="text-xs">Awaiting Dr.</Badge>;
    default:
      return null;
  }
}

// ============================================================================
// Component
// ============================================================================

export default function PreauthsListPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['preauths-list'],
    queryFn: () => shaApi.listLocalPreauths({}),
  });

  const preauths: SHAPreauth[] = data?.results || [];

  const filtered = useMemo(() => {
    let result = preauths;
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status.toLowerCase() === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.intervention_code.toLowerCase().includes(q) ||
          p.consent_token.toLowerCase().includes(q) ||
          (p.dha_external_id || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [preauths, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const all = preauths;
    return {
      total: all.length,
      pending: all.filter((p) => p.status.toLowerCase() === 'submitted').length,
      approved: all.filter((p) => p.status.toLowerCase() === 'approved').length,
      denied: all.filter((p) => p.status.toLowerCase() === 'denied').length,
    };
  }, [preauths]);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Pre-authorizations"
          helpContent="Pre-authorization requests submitted to SHA for restricted services. Track approval status and manage pending requests."
          actions={
            <Button onClick={() => router.push('/transactions/preauths/new')} size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New Preauth
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden cursor-pointer" onClick={() => setStatusFilter('all')}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden cursor-pointer" onClick={() => setStatusFilter('submitted')}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden cursor-pointer" onClick={() => setStatusFilter('approved')}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden cursor-pointer" onClick={() => setStatusFilter('denied')}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3">
              <p className="text-xs text-muted-foreground">Denied</p>
              <p className="text-2xl font-bold text-destructive">{stats.denied}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by intervention code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={filtered}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          onRowClick={(p) => router.push(`/transactions/preauths/${p.id}`)}
          emptyMessage="No pre-authorization requests found."
          columns={[
            {
              key: 'intervention_code',
              header: 'Intervention',
              sortable: true,
              cell: (p) => (
                <div>
                  <p className="font-mono text-sm">{p.intervention_code}</p>
                  {p.dha_external_id && (
                    <p className="text-xs text-muted-foreground">{p.dha_external_id}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (p) => (
                <div className="flex flex-col gap-1">
                  {getStatusBadge(p.status)}
                  {getDoctorConsentBadge(p.doctor_consent_state || '')}
                </div>
              ),
            },
            {
              key: 'created_at',
              header: 'Submitted',
              sortable: true,
              sortType: 'date' as const,
              hideOnMobile: true,
              cell: (p) =>
                p.submitted_at
                  ? format(parseISO(p.submitted_at), 'dd MMM yyyy HH:mm')
                  : p.created_at
                    ? format(parseISO(p.created_at), 'dd MMM yyyy HH:mm')
                    : '—',
            },
            {
              key: 'decided_at',
              header: 'Decision',
              sortable: true,
              sortType: 'date' as const,
              hideOnMobile: true,
              cell: (p) =>
                p.decided_at ? format(parseISO(p.decided_at), 'dd MMM yyyy') : '—',
            },
          ]}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          mobileCard={(p) => (
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{p.intervention_code}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.created_at ? format(parseISO(p.created_at), 'dd MMM yyyy') : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getStatusBadge(p.status)}
                  {getDoctorConsentBadge(p.doctor_consent_state || '')}
                </div>
              </div>
            </Card>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
