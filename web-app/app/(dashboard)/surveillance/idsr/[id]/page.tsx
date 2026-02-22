'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDate } from '@/lib/utils/format';
import { IDSRStatusBadge } from '@/components/surveillance/idsr-status-badge';
import { DHIS2PreviewDialog } from '@/components/surveillance/dhis2-preview-dialog';
import { toast } from '@/lib/hooks/use-toast';

export default function IDSRReportDetailPage() {
  const params = useParams();
  const reportId = Number(params?.id);
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['idsr-report', reportId],
    queryFn: () => surveillanceApi.getIDSRReport(reportId),
    enabled: Number.isFinite(reportId),
  });

  const { mutateAsync: approveReport, isPending: approving } = useMutation({
    mutationFn: () => surveillanceApi.approveIDSRReport(reportId),
    onSuccess: () => {
      toast({
        title: 'Report approved',
        description: 'The report is ready for DHIS2 submission.',
      });
      queryClient.invalidateQueries({ queryKey: ['idsr-report', reportId] });
    },
    onError: () => {
      toast({
        title: 'Approval failed',
        description: 'Unable to approve the report.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: submitReport, isPending: submitting } = useMutation({
    mutationFn: () => surveillanceApi.submitIDSRReport(reportId),
    onSuccess: () => {
      toast({
        title: 'Submitted to DHIS2',
        description: 'The report has been submitted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['idsr-report', reportId] });
    },
    onError: () => {
      toast({
        title: 'Submission failed',
        description: 'Unable to submit the report to DHIS2.',
        variant: 'destructive',
      });
    },
  });

  const summaryStats = useMemo(() => {
    if (!report) return [];
    return [
      { label: 'Total Cases', value: report.total_cases },
      { label: 'Deaths', value: report.total_deaths },
      { label: 'Lab Confirmed', value: report.lab_confirmed_cases },
      { label: 'Immediate Cases', value: report.immediate_cases },
    ];
  }, [report]);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <Card className="p-6 text-center text-destructive">
        <p>Failed to load report</p>
      </Card>
    );
  }

  const canApprove = report.status === 'DRAFT' || report.status === 'PENDING_REVIEW';
  const canSubmit = report.status === 'APPROVED';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`IDSR Report ${report.week_label}`}
        helpContent="Review disease summaries, approve, and submit weekly IDSR reports to DHIS2/KHIS."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {report.facility_name || 'Facility'}
            <span className="text-muted-foreground"> • {report.county_name || 'County'}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {formatDate(report.week_start_date)} - {formatDate(report.week_end_date)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {report.outbreak_declared && (
            <Badge variant="destructive" className="shrink-0 w-fit self-start sm:self-auto">
              Outbreak
            </Badge>
          )}
          <IDSRStatusBadge status={report.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {summaryStats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-xl font-semibold mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Disease Summary</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Disease</TableHead>
                  <TableHead className="text-right">Cases &lt;5</TableHead>
                  <TableHead className="text-right">Cases 5+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Deaths</TableHead>
                  <TableHead className="text-right">CFR</TableHead>
                  <TableHead>Outbreak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.disease_summaries.map((summary) => (
                  <TableRow key={summary.id}>
                    <TableCell className="font-medium">{summary.disease_name}</TableCell>
                    <TableCell className="text-right">{summary.cases_under_5}</TableCell>
                    <TableCell className="text-right">{summary.cases_5_and_above}</TableCell>
                    <TableCell className="text-right font-medium">{summary.total_cases}</TableCell>
                    <TableCell className="text-right">{summary.total_deaths}</TableCell>
                    <TableCell className="text-right">
                      {summary.case_fatality_rate ? `${summary.case_fatality_rate}%` : '-'}
                    </TableCell>
                    <TableCell>
                      {summary.is_outbreak && (
                        <Badge variant="destructive" className="w-fit">
                          Yes
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {report.notes?.trim() ? report.notes : 'No notes available for this report.'}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          Preview DHIS2 Payload
        </Button>
        {canApprove && (
          <Button onClick={() => approveReport()} disabled={approving}>
            {approving ? 'Approving...' : 'Approve Report'}
          </Button>
        )}
        {canSubmit && (
          <Button onClick={() => submitReport()} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit to DHIS2'}
          </Button>
        )}
      </div>

      <DHIS2PreviewDialog
        reportId={reportId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
