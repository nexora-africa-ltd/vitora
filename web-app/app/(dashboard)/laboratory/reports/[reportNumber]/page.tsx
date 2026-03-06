'use client';

import { use } from 'react';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { DiagnosticReportDetail } from '@/components/laboratory/diagnostic-report-detail';

interface ReportDetailPageProps {
  params: Promise<{ reportNumber: string }>;
}

export default function ReportDetailPage({ params }: ReportDetailPageProps) {
  const { reportNumber } = use(params);
  const { refresh, isRefreshing } = usePageRefresh();

  return (
    <PullToRefresh
      onRefresh={refresh}
      isRefreshing={isRefreshing}
      className="min-h-full"
    >
      <DiagnosticReportDetail reportNumber={reportNumber} />
    </PullToRefresh>
  );
}
