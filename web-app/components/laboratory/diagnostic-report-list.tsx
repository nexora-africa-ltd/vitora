'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, FileText } from 'lucide-react';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { ReportStatusBadge } from './report-status-badge';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type { DiagnosticReport, DiagnosticReportStatus } from '@/lib/types/laboratory';

interface DiagnosticReportListProps {
  reports: DiagnosticReport[];
  isLoading?: boolean;
}

const STATUS_OPTIONS: { value: DiagnosticReportStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PRELIMINARY', label: 'Preliminary' },
  { value: 'FINAL', label: 'Final' },
  { value: 'AMENDED', label: 'Amended' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function DiagnosticReportList({
  reports,
  isLoading,
}: DiagnosticReportListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DiagnosticReportStatus | ''>('');

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (statusFilter && report.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          report.report_number.toLowerCase().includes(query) ||
          report.patient_name.toLowerCase().includes(query) ||
          report.lab_order_number.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [reports, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by report #, patient, or order #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as DiagnosticReportStatus | '')
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
      <ResponsiveTable<DiagnosticReport>
        data={filteredReports}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyMessage="No diagnostic reports found"
        onRowClick={(r) => router.push(`/laboratory/reports/${r.report_number}`)}
        columns={[
          {
            key: 'report_number',
            header: 'Report #',
            cell: (r) => (
              <span className="font-medium text-primary">{r.report_number}</span>
            ),
          },
          {
            key: 'lab_order_number',
            header: 'Lab Order',
            cell: (r) => (
              <Badge variant="outline" className="text-xs">
                {r.lab_order_number}
              </Badge>
            ),
          },
          {
            key: 'patient_name',
            header: 'Patient',
          },
          {
            key: 'status',
            header: 'Status',
            cell: (r) => <ReportStatusBadge status={r.status} />,
          },
          {
            key: 'issued_by_name',
            header: 'Issued By',
            hideOnMobile: true,
          },
          {
            key: 'issued_at',
            header: 'Issued',
            hideOnMobile: true,
            cell: (r) => (r.issued_at ? formatDate(r.issued_at) : '—'),
          },
          {
            key: 'created_at',
            header: 'Created',
            hideOnMobile: true,
            cell: (r) => formatDate(r.created_at),
          },
        ]}
        mobileCard={(report) => (
          <div className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-primary truncate">
                  {report.report_number}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {report.patient_name}
                </p>
              </div>
              <ReportStatusBadge
                status={report.status}
                className="self-start"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{report.lab_order_number}</span>
              <span>•</span>
              <span>{formatDate(report.created_at)}</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
