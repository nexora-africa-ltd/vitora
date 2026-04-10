'use client';

/**
 * MOH Report Detail page — shows report data, actions (approve, submit to DHIS2),
 * and a DHIS2 payload preview.
 */

import { useParams } from 'next/navigation';
import { useMOH705Detail, useMOH711Detail, useMOH717Detail, useApproveMOH705 } from '@/lib/hooks/use-moh-reports';
import { mohReportsApi } from '@/lib/api/moh-reports';
import { useState } from 'react';
import {
  CheckCircle2,
  Send,
  Eye,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { useToast } from '@/lib/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { MOH_REPORT_KEYS } from '@/lib/hooks/use-moh-reports';
import type { MOHReportStatus } from '@/lib/types/moh-reporting';

const statusColors: Record<MOHReportStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  APPROVED: 'bg-primary/10 text-primary',
  SUBMITTED: 'bg-success/10 text-success',
  FAILED: 'bg-destructive/10 text-destructive',
};

export default function MOHReportDetailPage() {
  const params = useParams<{ type: string; id: string }>();
  const reportType = params.type;
  const reportId = Number(params.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Select the right hook based on the report type
  const is705 = reportType === '705';
  const is711 = reportType === '711';
  const is717 = reportType === '717';

  const { data: report705, isLoading: loading705 } = useMOH705Detail(is705 ? reportId : 0);
  const { data: report711, isLoading: loading711 } = useMOH711Detail(is711 ? reportId : 0);
  const { data: report717, isLoading: loading717 } = useMOH717Detail(is717 ? reportId : 0);

  const report = is705 ? report705 : is711 ? report711 : report717;
  const isLoading = is705 ? loading705 : is711 ? loading711 : loading717;

  const approveMutation = useApproveMOH705();

  const handleApprove = async () => {
    if (!report) return;
    try {
      if (is705) {
        await mohReportsApi.approveMOH705(reportId);
      } else if (is711) {
        await mohReportsApi.approveMOH711(reportId);
      } else {
        await mohReportsApi.approveMOH717(reportId);
      }
      qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.all });
      toast({ title: 'Report approved' });
    } catch {
      toast({ title: 'Approval failed', variant: 'destructive' });
    }
  };

  const handleSubmitDHIS2 = async () => {
    if (!report) return;
    setSubmitting(true);
    try {
      if (is705) {
        await mohReportsApi.submitMOH705ToDHIS2(reportId);
      } else if (is711) {
        await mohReportsApi.submitMOH711ToDHIS2(reportId);
      } else {
        await mohReportsApi.submitMOH717ToDHIS2(reportId);
      }
      qc.invalidateQueries({ queryKey: MOH_REPORT_KEYS.all });
      toast({ title: 'Submitted to DHIS2' });
    } catch {
      toast({ title: 'DHIS2 submission failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreview = async () => {
    try {
      let payload;
      if (is705) payload = await mohReportsApi.previewMOH705DHIS2(reportId);
      else payload = null; // Only 705 has preview implemented in API client
      if (payload) setPreviewPayload(payload as unknown as Record<string, unknown>);
    } catch {
      toast({ title: 'Failed to load preview', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-muted-foreground">Report not found.</p>
      </div>
    );
  }

  const title = `MOH ${reportType} — ${report.period_label}`;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title={title}
        helpContent={`View and manage this MOH ${reportType} report. Approve the report, preview the DHIS2 payload, then submit to KHIS.`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {report.can_edit && (
              <Button variant="outline" onClick={handleApprove} disabled={approveMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {is705 && (
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="h-4 w-4 mr-2" />
                DHIS2 Preview
              </Button>
            )}
            {report.status === 'APPROVED' && (
              <Button onClick={handleSubmitDHIS2} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit to DHIS2
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {report.facility_name}
          </p>
          <p className="text-xs text-muted-foreground">
            Period: {report.period_start} — {report.period_end}
          </p>
        </div>
        <Badge className={`${statusColors[report.status]} shrink-0 w-fit self-start sm:self-auto`}>
          {report.status}
        </Badge>
      </div>

      {/* Report-specific data */}
      {is705 && report705 && <MOH705Detail report={report705} />}
      {is711 && report711 && <MOH711Detail report={report711} />}
      {is717 && report717 && <MOH717Detail report={report717} />}

      {/* DHIS2 Preview */}
      {previewPayload && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">DHIS2 Payload Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[400px]">
              {JSON.stringify(previewPayload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report-specific detail sections
// ---------------------------------------------------------------------------

import type { MOH705Report, MOH711Report, MOH717Report } from '@/lib/types/moh-reporting';

function MOH705Detail({ report }: { report: MOH705Report }) {
  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4">
        <StatCard label="Total Visits" value={report.total_visits} />
        <StatCard label="Under 5" value={report.total_under_5} />
        <StatCard label="5 and Above" value={report.total_5_and_above} />
        <StatCard label="New Cases" value={report.new_cases} />
      </div>
      {report.disease_rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Disease Breakdown by ICD-10 Chapter</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Chapter</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium text-right">&lt;5</th>
                    <th className="pb-2 pr-4 font-medium text-right">≥5</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.disease_rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 tabular-nums">{row.icd10_chapter}</td>
                      <td className="py-2 pr-4 truncate max-w-[200px]">{row.category_name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.cases_under_5}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.cases_5_and_above}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{row.total_cases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MOH711Detail({ report }: { report: MOH711Report }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Reproductive Health</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="ANC Visits" value={report.anc_visits} />
          <StatCard label="Deliveries" value={report.deliveries_total} />
          <StatCard label="Normal" value={report.deliveries_normal} />
          <StatCard label="C-Section" value={report.deliveries_caesarean} />
          <StatCard label="Live Births" value={report.live_births} />
          <StatCard label="Stillbirths" value={report.still_births} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Malaria</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="Under 5" value={report.malaria_cases_under_5} />
          <StatCard label="5 and Above" value={report.malaria_cases_5_and_above} />
          <StatCard label="In Pregnancy" value={report.malaria_in_pregnancy} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Immunisation</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="BCG" value={report.bcg_given} />
          <StatCard label="OPV" value={report.opv_given} />
          <StatCard label="Penta" value={report.penta_given} />
          <StatCard label="Measles" value={report.measles_given} />
          <StatCard label="Fully Immunised" value={report.fully_immunised} />
        </CardContent>
      </Card>
    </div>
  );
}

function MOH717Detail({ report }: { report: MOH717Report }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">OPD</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="New Visits" value={report.opd_new_visits} />
          <StatCard label="Revisits" value={report.opd_revisits} />
          <StatCard label="Total" value={report.opd_total} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Inpatient</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="Admissions" value={report.admissions_total} />
          <StatCard label="Discharges" value={report.discharges_total} />
          <StatCard label="Deaths" value={report.deaths_total} />
          <StatCard label="Bed Days" value={report.inpatient_days} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Other</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <StatCard label="Deliveries" value={report.deliveries_total} />
          <StatCard label="C-Section" value={report.deliveries_caesarean} />
          <StatCard label="Major Surgery" value={report.surgeries_major} />
          <StatCard label="Minor Surgery" value={report.surgeries_minor} />
          <StatCard label="Referrals In" value={report.referrals_in} />
          <StatCard label="Referrals Out" value={report.referrals_out} />
          <StatCard label="Lab Tests" value={report.lab_tests_total} />
          <StatCard label="Emergency" value={report.emergency_visits} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
