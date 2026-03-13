'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { qualityApi } from '@/lib/api/quality';
import { formatDateTime } from '@/lib/utils/format';
import { toast } from '@/lib/hooks/use-toast';
import {
  Users,
  TrendingUp,
  Baby,
  Heart,
  DollarSign,
  Download,
} from 'lucide-react';

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-2">
      <p className="text-lg sm:text-xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function QuarterlyReportDetailPage() {
  const params = useParams();
  const reportId = Number(params?.id);
  const [exportingSdmx, setExportingSdmx] = useState(false);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['quarterly-report', reportId],
    queryFn: () => qualityApi.getQuarterlyReport(reportId),
    enabled: Number.isFinite(reportId),
  });

  const handleExportSdmx = async () => {
    setExportingSdmx(true);
    try {
      const blob = await qualityApi.exportQuarterlyReportSdmx(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quarterly-report-${reportId}.sdmx.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'SDMX export downloaded' });
    } catch {
      toast({ title: 'SDMX export failed', variant: 'destructive' });
    } finally {
      setExportingSdmx(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quarterly Report" />
        <Skeleton className="h-20" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Quarterly Report" />
        <Card className="p-6">
          <p className="text-destructive">Failed to load quarterly report.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`${report.clinic_name} — ${report.quarter_display}`}
        helpContent="Quarterly report aggregated from monthly clinic reports. Shows visits, demographics, chronic care, ANC, and revenue."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">{report.clinic_name}</p>
          <p className="text-xs text-muted-foreground">
            {report.quarter_display} • {report.monthly_report_ids.length} monthly reports aggregated
          </p>
        </div>
        <Badge
          variant={report.dhis2_submitted ? 'default' : 'secondary'}
          className="shrink-0 w-fit self-start sm:self-auto"
        >
          DHIS2: {report.dhis2_submitted ? 'Submitted' : 'Pending'}
        </Badge>
      </div>

      {/* Visit Statistics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Visit Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <StatBlock label="Total Visits" value={report.total_visits} />
            <StatBlock label="New Visits" value={report.new_visits} />
            <StatBlock label="Revisits" value={report.revisits} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Priority Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              Triage Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: 'Red (Emergency)', value: report.priority_red, color: 'bg-red-500' },
                { label: 'Orange (Very Urgent)', value: report.priority_orange, color: 'bg-orange-500' },
                { label: 'Yellow (Urgent)', value: report.priority_yellow, color: 'bg-yellow-500' },
                { label: 'Green (Standard)', value: report.priority_green, color: 'bg-green-500' },
                { label: 'Blue (Non-Urgent)', value: report.priority_blue, color: 'bg-blue-500' },
              ].map((p) => (
                <div key={p.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${p.color}`} />
                    <span>{p.label}</span>
                  </div>
                  <span className="font-medium">{p.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Demographics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              Demographics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Male" value={report.male_visits} />
              <StatBlock label="Female" value={report.female_visits} />
              <StatBlock label="Under 5" value={report.under_5_visits} />
              <StatBlock label="Under 18" value={report.under_18_visits} />
              <StatBlock label="Adult" value={report.adult_visits} />
              <StatBlock label="Over 60" value={report.over_60_visits} />
            </div>
          </CardContent>
        </Card>

        {/* Chronic Care */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-muted-foreground" />
              Chronic Care
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <StatBlock label="New Enrollments" value={report.new_enrollments} />
              <StatBlock label="Active" value={report.active_enrollments} />
              <StatBlock label="Defaulters" value={report.defaulters} />
            </div>
          </CardContent>
        </Card>

        {/* ANC */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Baby className="h-5 w-5 text-muted-foreground" />
              Maternal Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <StatBlock label="ANC First" value={report.anc_first_visits} />
              <StatBlock label="ANC Revisits" value={report.anc_revisits} />
              <StatBlock label="Deliveries" value={report.deliveries} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <StatBlock
              label="Total Revenue"
              value={`KES ${Number(report.total_revenue).toLocaleString()}`}
            />
            <StatBlock
              label="SHA Claims"
              value={`KES ${Number(report.sha_claims_amount).toLocaleString()}`}
            />
            <StatBlock
              label="Cash"
              value={`KES ${Number(report.cash_amount).toLocaleString()}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* DHIS2 & Metadata */}
      <Card>
        <CardContent className="p-4 space-y-2">
          {report.dhis2_submitted && report.dhis2_submitted_at && (
            <p className="text-xs text-muted-foreground">
              DHIS2 submitted: {formatDateTime(report.dhis2_submitted_at)}
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-between text-xs text-muted-foreground gap-1">
            <span>Created: {formatDateTime(report.created_at)}</span>
            <span>Updated: {formatDateTime(report.updated_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="outline" size="sm" onClick={handleExportSdmx} disabled={exportingSdmx}>
          <Download className="h-4 w-4 mr-2" />
          {exportingSdmx ? 'Exporting...' : 'Export SDMX'}
        </Button>
      </div>
    </div>
  );
}
