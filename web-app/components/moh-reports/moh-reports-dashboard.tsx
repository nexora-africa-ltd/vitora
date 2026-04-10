'use client';

/**
 * MOH Reports Dashboard — lists MOH 705, 711, 717 reports with status badges,
 * generate actions, and links to detail views.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useMOH705List, useMOH711List, useMOH717List, useGenerateMOH705, useGenerateMOH711, useGenerateMOH717 } from '@/lib/hooks/use-moh-reports';
import type { MOHReportStatus, MOH705ReportListItem, MOH711ReportListItem, MOH717ReportListItem } from '@/lib/types/moh-reporting';
import { useToast } from '@/lib/hooks/use-toast';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusConfig: Record<MOHReportStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default' },
  SUBMITTED: { label: 'Submitted', variant: 'default' },
  FAILED: { label: 'Failed', variant: 'destructive' },
};

function StatusBadge({ status }: { status: MOHReportStatus }) {
  const cfg = statusConfig[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function StatusIcon({ status }: { status: MOHReportStatus }) {
  switch (status) {
    case 'SUBMITTED':
      return <Send className="h-4 w-4 text-primary" />;
    case 'APPROVED':
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case 'FAILED':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ReportTab = '705' | '711' | '717';

export function MOHReportsDashboard() {
  const [tab, setTab] = useState<ReportTab>('705');
  const router = useRouter();
  const { toast } = useToast();

  const { data: data705, isLoading: loading705 } = useMOH705List();
  const { data: data711, isLoading: loading711 } = useMOH711List();
  const { data: data717, isLoading: loading717 } = useMOH717List();

  const gen705 = useGenerateMOH705();
  const gen711 = useGenerateMOH711();
  const gen717 = useGenerateMOH717();

  const handleGenerate = (type: ReportTab) => {
    const mutation = type === '705' ? gen705 : type === '711' ? gen711 : gen717;
    mutation.mutate(undefined, {
      onSuccess: (report) => {
        toast({ title: `MOH ${type} generated`, description: report.period_label });
      },
      onError: () => {
        toast({ title: `Failed to generate MOH ${type}`, variant: 'destructive' });
      },
    });
  };

  const isGenerating = gen705.isPending || gen711.isPending || gen717.isPending;

  // Stats
  const stats705 = data705?.results ?? [];
  const stats711 = data711?.results ?? [];
  const stats717 = data717?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setTab('705')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MOH 705</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats705.length}</p>
            <p className="text-xs text-muted-foreground">Outpatient Morbidity Reports</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setTab('711')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MOH 711</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats711.length}</p>
            <p className="text-xs text-muted-foreground">Integrated RH/HIV/Malaria Reports</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setTab('717')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MOH 717</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats717.length}</p>
            <p className="text-xs text-muted-foreground">Workload Summary Reports</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Report Lists */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="705" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">705</span>
              <span className="hidden sm:inline">MOH 705</span>
            </TabsTrigger>
            <TabsTrigger value="711" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">711</span>
              <span className="hidden sm:inline">MOH 711</span>
            </TabsTrigger>
            <TabsTrigger value="717" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">717</span>
              <span className="hidden sm:inline">MOH 717</span>
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            onClick={() => handleGenerate(tab)}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Generate MOH {tab}
          </Button>
        </div>

        {/* MOH 705 Tab */}
        <TabsContent value="705">
          {loading705 ? (
            <LoadingSkeleton />
          ) : (
            <ResponsiveTable
              data={stats705}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/reports/moh/705/${item.id}`)}
              columns={[
                { key: 'period_label', header: 'Period', sortable: true, cell: (r) => r.period_label },
                { key: 'status', header: 'Status', sortable: true, cell: (r) => (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={r.status} />
                    <StatusBadge status={r.status} />
                  </div>
                )},
                { key: 'total_visits', header: 'Visits', sortable: true, sortType: 'number', cell: (r) => r.total_visits.toLocaleString() },
                { key: 'total_under_5', header: '<5 yrs', sortable: true, sortType: 'number', cell: (r) => r.total_under_5.toLocaleString(), hideOnMobile: true },
                { key: 'total_5_and_above', header: '≥5 yrs', sortable: true, sortType: 'number', cell: (r) => r.total_5_and_above.toLocaleString(), hideOnMobile: true },
                { key: 'disease_row_count', header: 'Diseases', sortable: true, sortType: 'number', cell: (r) => r.disease_row_count, hideOnMobile: true },
              ]}
              mobileCard={(r: MOH705ReportListItem) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.period_label}</p>
                      <p className="text-xs text-muted-foreground">{r.total_visits} visits</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </Card>
              )}
            />
          )}
        </TabsContent>

        {/* MOH 711 Tab */}
        <TabsContent value="711">
          {loading711 ? (
            <LoadingSkeleton />
          ) : (
            <ResponsiveTable
              data={stats711}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/reports/moh/711/${item.id}`)}
              columns={[
                { key: 'period_label', header: 'Period', sortable: true, cell: (r) => r.period_label },
                { key: 'status', header: 'Status', sortable: true, cell: (r) => (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={r.status} />
                    <StatusBadge status={r.status} />
                  </div>
                )},
                { key: 'deliveries_total', header: 'Deliveries', sortable: true, sortType: 'number', cell: (r) => r.deliveries_total.toLocaleString() },
                { key: 'malaria_cases_under_5', header: 'Malaria <5', sortable: true, sortType: 'number', cell: (r) => r.malaria_cases_under_5, hideOnMobile: true },
                { key: 'malaria_cases_5_and_above', header: 'Malaria ≥5', sortable: true, sortType: 'number', cell: (r) => r.malaria_cases_5_and_above, hideOnMobile: true },
              ]}
              mobileCard={(r: MOH711ReportListItem) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.period_label}</p>
                      <p className="text-xs text-muted-foreground">{r.deliveries_total} deliveries</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </Card>
              )}
            />
          )}
        </TabsContent>

        {/* MOH 717 Tab */}
        <TabsContent value="717">
          {loading717 ? (
            <LoadingSkeleton />
          ) : (
            <ResponsiveTable
              data={stats717}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/reports/moh/717/${item.id}`)}
              columns={[
                { key: 'period_label', header: 'Period', sortable: true, cell: (r) => r.period_label },
                { key: 'status', header: 'Status', sortable: true, cell: (r) => (
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={r.status} />
                    <StatusBadge status={r.status} />
                  </div>
                )},
                { key: 'opd_total', header: 'OPD', sortable: true, sortType: 'number', cell: (r) => r.opd_total.toLocaleString() },
                { key: 'admissions_total', header: 'Admissions', sortable: true, sortType: 'number', cell: (r) => r.admissions_total.toLocaleString(), hideOnMobile: true },
                { key: 'emergency_visits', header: 'Emergency', sortable: true, sortType: 'number', cell: (r) => r.emergency_visits.toLocaleString(), hideOnMobile: true },
              ]}
              mobileCard={(r: MOH717ReportListItem) => (
                <Card className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.period_label}</p>
                      <p className="text-xs text-muted-foreground">{r.opd_total} OPD visits</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                </Card>
              )}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
