'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Clock,
  CheckCircle2,
  PenLine,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useRadiologyReports } from '@/lib/hooks/use-imaging';
import type { RadiologyReport, RadiologyReportStatus } from '@/lib/types/imaging';
import { REPORT_STATUS_LABELS } from '@/lib/types/imaging';
import { formatDateTime } from '@/lib/utils/format';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PRELIMINARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  AMENDED: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
};

const STATUS_OPTIONS: { value: RadiologyReportStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PRELIMINARY', label: 'Preliminary' },
  { value: 'FINAL', label: 'Final' },
  { value: 'AMENDED', label: 'Amended' },
];

export default function ImagingReportsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { data: reportsData, isLoading } = useRadiologyReports();
  const reports = useMemo(() => reportsData?.results ?? [], [reportsData?.results]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RadiologyReportStatus | ''>('');

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter && report.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          report.report_number.toLowerCase().includes(query) ||
          report.patient_name.toLowerCase().includes(query) ||
          report.order_number.toLowerCase().includes(query) ||
          report.modality.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [reports, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = reports.length;
    const draft = reports.filter((r) => r.status === 'DRAFT').length;
    const final_ = reports.filter((r) => r.status === 'FINAL').length;
    const amended = reports.filter((r) => r.status === 'AMENDED').length;
    const critical = reports.filter((r) => r.is_critical).length;
    return { total, draft, final: final_, amended, critical };
  }, [reports]);

  return (
    <PullToRefresh
      onRefresh={refresh}
      isRefreshing={isRefreshing}
      className="min-h-full"
    >
      <div className="space-y-6">
        <PageHeader
          title="Imaging Reports"
          helpContent="View and manage radiology reports. Reports go through draft, sign/finalize, and optional amendment stages."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold">{stats.draft}</p>
                  <p className="text-xs text-muted-foreground">Draft</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-2xl font-bold">{stats.final}</p>
                  <p className="text-xs text-muted-foreground">Final</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-2xl font-bold">{stats.critical}</p>
                  <p className="text-xs text-muted-foreground">Critical</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by report #, patient, order, or modality..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v === 'all' ? '' : (v as RadiologyReportStatus))
                }
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <ResponsiveTable<RadiologyReport>
          data={filteredReports}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No imaging reports found"
          onRowClick={(r) => router.push(`/imaging/reports/${r.report_number}`)}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'report_number',
              header: 'Report #',
              sortable: true,
              cell: (r) => (
                <span className="font-medium text-primary">{r.report_number}</span>
              ),
            },
            {
              key: 'order_number',
              header: 'Order',
              sortable: true,
              cell: (r) => (
                <Badge variant="outline" className="text-xs">
                  {r.order_number}
                </Badge>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              cell: (r) => r.patient_name,
            },
            {
              key: 'modality',
              header: 'Modality',
              sortable: true,
              cell: (r) => (
                <Badge variant="secondary" className="text-xs">
                  {r.modality}
                </Badge>
              ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (r) => (
                <div className="flex items-center gap-1.5">
                  <Badge className={STATUS_COLORS[r.status] || ''}>
                    {REPORT_STATUS_LABELS[r.status] || r.status}
                  </Badge>
                  {r.is_critical && (
                    <Badge variant="destructive" className="text-xs">
                      Critical
                    </Badge>
                  )}
                </div>
              ),
            },
            {
              key: 'reported_by_name',
              header: 'Reported By',
              sortable: true,
              cell: (r) => r.reported_by_name,
              hideOnMobile: true,
            },
            {
              key: 'created_at',
              header: 'Created',
              sortable: true,
              sortType: 'date',
              cell: (r) => (
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </span>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(r) => (
            <div className="p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-primary">{r.report_number}</p>
                  <p className="text-sm text-muted-foreground">{r.patient_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={STATUS_COLORS[r.status] || ''}>
                    {REPORT_STATUS_LABELS[r.status] || r.status}
                  </Badge>
                  {r.is_critical && (
                    <Badge variant="destructive" className="text-xs">
                      Critical
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{r.modality} • {r.order_number}</span>
                <span>{formatDateTime(r.created_at)}</span>
              </div>
            </div>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
