'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  SendHorizonal,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { ETIMSInvoice, ETIMSInvoiceStatus } from '@/lib/types/inventory';

const STATUS_CONFIG: Record<ETIMSInvoiceStatus, { label: string; color: string }> = {
  PENDING: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  SUBMITTED: {
    label: 'Submitted',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  FAILED: {
    label: 'Failed',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

function StatusBadge({ status }: { status: ETIMSInvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return <Badge className={`${cfg.color} shrink-0 w-fit self-start sm:self-auto`}>{cfg.label}</Badge>;
}

export default function ETIMSInvoicesPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const params = {
    page,
    ...(statusFilter !== 'all' ? { status: statusFilter as ETIMSInvoiceStatus } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['etims-invoices', params],
    queryFn: () => inventoryApi.listETIMSInvoices(params),
  });

  const invoices = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Stat counts (from full page — approximate from visible page for simplicity)
  const pendingCount = invoices.filter((i) => i.status === 'PENDING').length;
  const submittedCount = invoices.filter((i) => i.status === 'SUBMITTED').length;
  const confirmedCount = invoices.filter((i) => i.status === 'CONFIRMED').length;
  const failedCount = invoices.filter((i) => i.status === 'FAILED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="eTIMS Invoices"
          helpContent="eTIMS invoices are submitted to KRA for tax compliance. Track submission status and retry failed submissions."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <p className="text-xl font-bold mt-1">{isLoading ? '...' : totalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <p className="text-xl font-bold mt-1 text-amber-600">{isLoading ? '...' : pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <p className="text-xs text-muted-foreground">Confirmed</p>
              </div>
              <p className="text-xl font-bold mt-1 text-green-600">{isLoading ? '...' : confirmedCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <p className="text-xl font-bold mt-1 text-red-600">{isLoading ? '...' : failedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load eTIMS invoices.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={invoices}
              keyExtractor={(inv) => inv.id}
              onRowClick={(inv) => router.push(`/inventory/etims/invoices/${inv.id}`)}
              columns={[
                {
                  key: 'invoice_number',
                  header: 'Invoice #',
                  sortable: true,
                  cell: (inv) => (
                    <span className="font-medium">{inv.invoice_number}</span>
                  ),
                },
                {
                  key: 'patient_name',
                  header: 'Patient',
                  sortable: true,
                  cell: (inv) => inv.patient_name || '—',
                  hideOnMobile: true,
                },
                {
                  key: 'invoice_total',
                  header: 'Total',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (inv) => (
                    <span className="font-mono">
                      KES {Number(inv.invoice_total).toLocaleString()}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  cell: (inv) => <StatusBadge status={inv.status} />,
                },
                {
                  key: 'etims_receipt_number',
                  header: 'Receipt #',
                  sortable: true,
                  cell: (inv) => inv.etims_receipt_number || '—',
                  hideOnMobile: true,
                },
                {
                  key: 'submitted_at',
                  header: 'Submitted',
                  sortable: true,
                  sortType: 'date' as const,
                  cell: (inv) =>
                    inv.submitted_at
                      ? new Date(inv.submitted_at).toLocaleDateString()
                      : '—',
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(inv) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {inv.patient_name || 'No patient'}
                      </p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="font-mono">
                      KES {Number(inv.invoice_total).toLocaleString()}
                    </span>
                    {inv.etims_receipt_number && (
                      <span className="text-xs text-muted-foreground">
                        {inv.etims_receipt_number}
                      </span>
                    )}
                  </div>
                </Card>
              )}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} invoices)
                </p>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
