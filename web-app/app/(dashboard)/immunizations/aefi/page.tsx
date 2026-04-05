'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import { aefiApi } from '@/lib/api/immunizations';
import type {
  AEFIEventType,
  AEFISeverity,
  AEFIReportType,
  AEFIListItem,
} from '@/lib/types/immunizations';

const severityColors: Record<AEFISeverity, string> = {
  MILD: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  SEVERE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const eventTypeLabels: Record<AEFIEventType, string> = {
  BCG_LYMPHADENITIS: 'BCG Lymphadenitis',
  INJECTION_SITE_ABSCESS: 'Injection Site Abscess',
  CONVULSION: 'Convulsion',
  HIGH_FEVER: 'High Fever (≥38.5°C)',
  SEVERE_LOCAL_REACTION: 'Severe Local Reaction',
  GENERALIZED_URTICARIA: 'Generalized Urticaria',
  ANAPHYLAXIS: 'Anaphylaxis',
  ENCEPHALOPATHY: 'Encephalopathy',
  PARALYSIS: 'Paralysis',
  TOXIC_SHOCK: 'Toxic Shock',
  OTHER: 'Other',
};

const reportTypeLabels: Record<AEFIReportType, string> = {
  INITIAL: 'Initial',
  FOLLOW_UP: 'Follow-up',
};

const SEVERITY_FILTER: { value: AEFISeverity | ''; label: string }[] = [
  { value: '', label: 'All Severities' },
  { value: 'MILD', label: 'Mild' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'SEVERE', label: 'Severe' },
];

const REPORT_TYPE_FILTER: { value: AEFIReportType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'INITIAL', label: 'Initial' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
];

function formatEventTypes(types: AEFIEventType[]): string {
  if (!types || types.length === 0) return '—';
  if (types.length === 1) return eventTypeLabels[types[0]!] || types[0]!;
  return `${eventTypeLabels[types[0]!] || types[0]!} +${types.length - 1}`;
}

export default function AEFIPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [severityFilter, setSeverityFilter] = useState<AEFISeverity | ''>('');
  const [reportTypeFilter, setReportTypeFilter] = useState<AEFIReportType | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['aefi', severityFilter, reportTypeFilter],
    queryFn: () =>
      aefiApi.list({
        severity: severityFilter || undefined,
        report_type: reportTypeFilter || undefined,
        ordering: '-event_date',
      }),
  });

  const reports = data?.results || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="AEFI Reports"
          helpContent="Adverse Event Following Immunization reports aligned with the Kenya MOH AEFI Reporting Form. Track, investigate, and report vaccine adverse events. Severe cases must be reported to national authorities within 24 hours."
          actions={
            <Button size="sm" onClick={() => router.push('/immunizations/aefi/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Report AEFI</span>
              <span className="sm:hidden">Report</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={severityFilter}
            onValueChange={(v) => setSeverityFilter(v === '_all' ? '' : (v as AEFISeverity))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_FILTER.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={reportTypeFilter}
            onValueChange={(v) => setReportTypeFilter(v === '_all' ? '' : (v as AEFIReportType))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Report Type" />
            </SelectTrigger>
            <SelectContent>
              {REPORT_TYPE_FILTER.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* AEFI Table */}
        <ResponsiveTable
          data={reports}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          onRowClick={(r) => router.push(`/immunizations/aefi/${r.id}`)}
          emptyMessage="No AEFI reports found."
          defaultSortColumn="event_date"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              cell: (r) => <span className="font-medium">{r.patient_name}</span>,
            },
            {
              key: 'vaccine_code',
              header: 'Vaccine',
              sortable: true,
              cell: (r) => <span className="text-sm">{r.vaccine_code}</span>,
            },
            {
              key: 'event_date',
              header: 'Event Date',
              sortable: true,
              sortType: 'date',
              cell: (r) => <span className="text-sm">{formatDate(r.event_date)}</span>,
              hideOnMobile: true,
            },
            {
              key: 'event_types',
              header: 'Type',
              cell: (r) => (
                <span className="text-sm">{formatEventTypes(r.event_types)}</span>
              ),
            },
            {
              key: 'severity',
              header: 'Severity',
              sortable: true,
              cell: (r) => (
                <Badge className={`${severityColors[r.severity]} shrink-0 w-fit`}>
                  {r.severity}
                </Badge>
              ),
            },
            {
              key: 'report_type',
              header: 'Type',
              cell: (r) => (
                <span className="text-xs text-muted-foreground">
                  {reportTypeLabels[r.report_type]}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'reported_to_authorities',
              header: 'Reported',
              cell: (r) => (
                <Badge variant={r.reported_to_authorities ? 'default' : 'outline'} className="shrink-0 w-fit">
                  {r.reported_to_authorities ? 'Yes' : 'No'}
                </Badge>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(r: AEFIListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium">{r.patient_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.vaccine_code} • {formatDate(r.event_date)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatEventTypes(r.event_types)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${severityColors[r.severity]} shrink-0 w-fit self-start`}>
                    {r.severity}
                  </Badge>
                  {r.reported_to_authorities && (
                    <Badge variant="default" className="text-xs shrink-0">Reported</Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
        />
      </div>
    </PullToRefresh>
  );
}
