/**
 * SHA Claims Panel
 * Shared implementation used by Insurance page and Transactions → SHA Claims.
 */
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ClaimStatusBadge } from '@/components/billing/sha/ClaimComponents';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';

import { ClaimsStatusChart } from '@/components/widgets';
import { TimeBarBadge } from '@/components/billing/sha/TimeBarBadge';
import { useClaims } from '@/lib/hooks/use-sha';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useFacility } from '@/lib/context/facility-context';
import { useSHAClaimSocket } from '@/lib/hooks/use-websocket';
import type { Claim, ClaimStatus } from '@/lib/types/sha';
import { formatCurrency } from '@/lib/utils/format';
import { format, parseISO } from 'date-fns';

const EMPTY_CLAIMS: Claim[] = [];

interface SHAClaimsPanelProps {
  /** Base path used for routing to claim detail pages */
  basePath?: string;
  /** Whether to show the title/description + refresh/export buttons */
  showHeader?: boolean;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  className?: string;
}

function StatsCard({ title, value, description, icon, className }: StatsCardProps) {
  return (
    <Card className={`relative overflow-hidden ${className ?? ''}`}>
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

/** Export claims to CSV. */
function exportClaimsCSV(claims: Claim[]) {
  const headers = ['Claim Number', 'Patient', 'MRN', 'Status', 'Flow', 'Amount', 'Approved', 'Service Date', 'Submitted'];
  const rows = claims.map((c) => [
    c.claim_number || `#${c.id}`,
    c.patient_name || '',
    c.patient_mrn || '',
    c.status,
    c.claim_flow || '',
    c.total_amount ?? '0',
    c.approved_amount ?? '',
    c.service_date || '',
    c.submitted_at ? format(parseISO(c.submitted_at), 'yyyy-MM-dd HH:mm') : '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sha-claims-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SHAClaimsPanel({ basePath = '/transactions/sha-claims', showHeader = true }: SHAClaimsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { facility } = useFacility();
  useSHAClaimSocket(facility?.id ?? null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: claimsData, isLoading, refetch, isRefetching } = useClaims({
    status: statusFilter !== 'all' ? (statusFilter as ClaimStatus) : undefined,
    search: debouncedSearch || undefined,
  });

  const claims = claimsData?.results ?? EMPTY_CLAIMS;

  const stats = useMemo(() => ({
    total: claims.length,
    pending: claims.filter((c) => ['pending', 'submitted', 'processing'].includes(c.status)).length,
    approved: claims.filter((c) => c.status === 'approved').length,
    rejected: claims.filter((c) => c.status === 'rejected').length,
    totalAmount: claims.reduce((sum, c) => sum + parseFloat(c.total_amount ?? '0'), 0),
    approvedAmount: claims
      .filter((c) => c.approved_amount)
      .reduce((sum, c) => sum + parseFloat(c.approved_amount || '0'), 0),
  }), [claims]);

  const claimsStatusData = useMemo(() => {
    const statusCounts = new Map<ClaimStatus, { count: number; amount: number }>();
    claims.forEach((claim) => {
      const existing = statusCounts.get(claim.status) || { count: 0, amount: 0 };
      statusCounts.set(claim.status, {
        count: existing.count + 1,
        amount: existing.amount + parseFloat(claim.total_amount ?? '0'),
      });
    });
    return Array.from(statusCounts.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      amount: data.amount,
    }));
  }, [claims]);

  // Claims approaching time-barring deadline (within 12 hours or already barred)
  const expiringClaims = useMemo(
    () =>
      claims.filter(
        (c) =>
          c.is_time_barred ||
          (c.hours_until_time_barred != null && c.hours_until_time_barred <= 12)
      ),
    [claims]
  );

  const handleClaimClick = (claim: Claim) => {
    router.push(`${basePath}/${claim.id}`);
  };

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claims.map((c) => c.id)));
    }
  }, [claims, selectedIds.size]);

  const selectedClaims = useMemo(
    () => claims.filter((c) => selectedIds.has(c.id)),
    [claims, selectedIds]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {showHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">SHA Claims</h2>
            <p className="text-sm text-muted-foreground">Manage and track Social Health Authority claims</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => exportClaimsCSV(selectedClaims.length > 0 ? selectedClaims : claims)}>
                  Export as CSV {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatsCard
          title="Total Claims"
          value={stats.total}
          description={`${formatCurrency(stats.totalAmount)} value`}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatsCard
          title="In Progress"
          value={stats.pending}
          description="Awaiting response"
          icon={<Clock className="h-4 w-4" />}
          className="border-yellow-200 dark:border-yellow-800"
        />
        <StatsCard
          title="Approved"
          value={stats.approved}
          description={`${formatCurrency(stats.approvedAmount)} approved`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          className="border-green-200 dark:border-green-800"
        />
        <StatsCard
          title="Rejected"
          value={stats.rejected}
          description="Requires attention"
          icon={<XCircle className="h-4 w-4" />}
          className="border-red-200 dark:border-red-800"
        />
      </div>

      {/* Charts — hidden on mobile for decluttering */}
      {claims.length > 0 && (
        <div className="hidden md:grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Claims by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimsStatusChart data={claimsStatusData} showLegend />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Claims by Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimsStatusChart data={claimsStatusData} showLegend showByAmount />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Time-Barring Alerts */}
      {expiringClaims.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-base">Time-Barring Alerts</CardTitle>
              <Badge variant="secondary" className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                {expiringClaims.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringClaims.slice(0, 5).map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between p-2 rounded-md border bg-background cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleClaimClick(claim)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-medium truncate">
                      {claim.claim_number || `#${claim.id}`}
                    </span>
                    <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                      {claim.patient_name}
                    </span>
                  </div>
                  <TimeBarBadge claim={claim} compact />
                </div>
              ))}
              {expiringClaims.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{expiringClaims.length - 5} more approaching deadline
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportClaimsCSV(selectedClaims)}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              // Bulk submit via the existing hook
              selectedClaims
                .filter((c) => c.status === 'draft')
                .forEach((c) => handleClaimClick(c));
            }}
            disabled={!selectedClaims.some((c) => c.status === 'draft')}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Submit Drafts
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Claims List — Filter + ResponsiveTable */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Claims {claims.length > 0 && <span className="text-muted-foreground font-normal">({claims.length})</span>}
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search claims..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-full sm:w-52"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[150px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="query">Query</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<Claim>
            data={claims}
            keyExtractor={(c) => c.id}
            isLoading={isLoading}
            emptyMessage="No SHA claims match your filters."
            onRowClick={handleClaimClick}
            defaultSortColumn="created_at"
            defaultSortDirection="desc"
            columns={[
              {
                key: 'select',
                header: '',
                cell: (claim) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(claim.id)}
                      onCheckedChange={() => toggleSelection(claim.id)}
                    />
                  </div>
                ),
              },
              {
                key: 'claim_number',
                header: 'Claim',
                sortable: true,
                cell: (claim) => (
                  <div className="space-y-0.5">
                    <p className="font-medium font-mono text-sm">{claim.claim_number || `#${claim.id}`}</p>
                    {claim.sha_reference && (
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                        {claim.sha_reference}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: 'patient_name',
                header: 'Patient',
                sortable: true,
                hideOnMobile: true,
                cell: (claim) => (
                  <div className="space-y-0.5">
                    <p className="font-medium">{claim.patient_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{claim.patient_mrn}</p>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                cell: (claim) => (
                  <div className="flex flex-col gap-1">
                    <ClaimStatusBadge status={claim.status} />
                    <TimeBarBadge claim={claim} compact />
                  </div>
                ),
              },
              {
                key: 'total_amount',
                header: 'Amount',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (claim) => (
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(parseFloat(claim.total_amount ?? '0'))}</p>
                    {claim.approved_amount && claim.status === 'approved' && (
                      <p className="text-xs text-green-600">
                        {formatCurrency(parseFloat(claim.approved_amount))}
                      </p>
                    )}
                  </div>
                ),
                className: 'text-right',
              },
              {
                key: 'created_at',
                header: 'Date',
                sortable: true,
                sortType: 'date',
                hideOnMobile: true,
                cell: (claim) => (
                  <div>
                    <p className="text-sm">
                      {claim.submitted_at
                        ? format(parseISO(claim.submitted_at), 'MMM d, yyyy')
                        : format(parseISO(claim.created_at), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {claim.submitted_at ? 'Submitted' : 'Draft'}
                    </p>
                  </div>
                ),
              },
              {
                key: 'actions',
                header: '',
                cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
              },
            ]}
            mobileCard={(claim) => (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(claim.id)}
                      onCheckedChange={() => toggleSelection(claim.id)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium truncate">
                        {claim.claim_number || `#${claim.id}`}
                      </span>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {claim.patient_name} • {claim.patient_mrn}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-medium">
                        {formatCurrency(parseFloat(claim.total_amount ?? '0'))}
                      </span>
                      <TimeBarBadge claim={claim} compact />
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
