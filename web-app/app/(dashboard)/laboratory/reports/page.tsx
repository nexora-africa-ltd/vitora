'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Clock, CheckCircle2, PenLine } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDiagnosticReports } from '@/lib/hooks/use-laboratory';
import { DiagnosticReportList } from '@/components/laboratory/diagnostic-report-list';

export default function DiagnosticReportsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { data: reports = [], isLoading } = useDiagnosticReports();

  const stats = useMemo(() => {
    const total = reports.length;
    const draft = reports.filter((r) => r.status === 'DRAFT').length;
    const final_ = reports.filter((r) => r.status === 'FINAL').length;
    const amended = reports.filter((r) => r.status === 'AMENDED').length;
    return { total, draft, final: final_, amended };
  }, [reports]);

  return (
    <PullToRefresh
      onRefresh={refresh}
      isRefreshing={isRefreshing}
      className="min-h-full"
    >
      <div className="space-y-6">
        <PageHeader
          title="Diagnostic Reports"
          helpContent="View and manage laboratory diagnostic reports. Reports are generated from completed lab orders and go through draft, finalize, and optional amendment stages."
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
                <Clock className="h-5 w-5 text-yellow-600" />
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
                <CheckCircle2 className="h-5 w-5 text-green-600" />
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
                <PenLine className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{stats.amended}</p>
                  <p className="text-xs text-muted-foreground">Amended</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DiagnosticReportList reports={reports} isLoading={isLoading} />
      </div>
    </PullToRefresh>
  );
}
