'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Printer,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SignatureBadge } from '@/components/shared/signature-badge';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useRadiologyReport } from '@/lib/hooks/use-imaging';
import { REPORT_STATUS_LABELS } from '@/lib/types/imaging';
import { formatDateTime } from '@/lib/utils/format';
import { printRadiologyReport } from '@/lib/documents';
import { useToast } from '@/lib/hooks';

interface PageProps {
  params: Promise<{ reportNumber: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PRELIMINARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  AMENDED: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
};

export default function ImagingReportDetailPage({ params }: PageProps) {
  const { reportNumber } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facilityDetail } = useFacility();
  const { data: report, isLoading, error } = useRadiologyReport(reportNumber);

  const handlePrint = async () => {
    if (!report) return;

    try {
      await printRadiologyReport({
        report,
        patient: {
          full_name: report.patient_name,
          mrn: report.patient_mrn,
          age: '',
          sex: '',
        },
        order: {
          order_number: report.order_number,
          ordered_by_name: report.reported_by_name || '',
          ordered_at: report.created_at,
          clinical_indication: '',
        },
        facility: facilityDetail
          ? {
              name: facilityDetail.name,
              address: `${facilityDetail.county_name ?? ''}, ${facilityDetail.sub_county_name ?? ''}`.replace(/^, |, $/g, ''),
              phone: '',
              license: facilityDetail.mfl_code || '',
            }
          : undefined,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to print report',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
        <p className="text-muted-foreground mb-4">
          {error?.message || 'Unable to load imaging report.'}
        </p>
        <Button variant="outline" onClick={() => router.push('/imaging/reports')}>
          Go to Reports
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title={report.report_number}
          helpContent="View imaging report details. Sign finalized reports and print for records."
          actions={
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Link href={`/imaging/orders/${report.order_number}/report`}>
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Edit Report
                </Button>
              </Link>
            </>
          }
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {report.patient_name}
              <span className="text-muted-foreground">
                {' '}•{' '}
                <Link
                  href={`/imaging/orders/${report.order_number}`}
                  className="hover:underline"
                >
                  {report.order_number}
                </Link>
              </span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Created {formatDateTime(report.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge className={STATUS_COLORS[report.status] || ''}>
              {REPORT_STATUS_LABELS[report.status] || report.status}
            </Badge>
            {report.is_critical && (
              <Badge variant="destructive">Critical</Badge>
            )}
            <SignatureBadge
              documentType="RadiologyReport"
              documentId={report.id}
              canSign={report.status === 'FINAL' || report.status === 'AMENDED'}
            />
          </div>
        </div>

        {/* Critical Finding Alert */}
        {report.is_critical && (
          <Card className="border-red-500 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Critical Finding</span>
              </div>
              {report.critical_finding_description && (
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                  {report.critical_finding_description}
                </p>
              )}
              {report.critical_communicated && (
                <p className="text-xs text-muted-foreground mt-2">
                  <CheckCircle2 className="h-3 w-3 inline mr-1 text-green-600 dark:text-green-400" />
                  Communicated to {report.critical_communicated_to} via {report.critical_communicated_method}
                  {report.critical_communicated_at && ` on ${formatDateTime(report.critical_communicated_at)}`}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Report Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Findings</CardTitle>
            </CardHeader>
            <CardContent>
              {report.findings ? (
                <p className="text-sm whitespace-pre-wrap">{report.findings}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No findings recorded.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Impression</CardTitle>
            </CardHeader>
            <CardContent>
              {report.impression ? (
                <p className="text-sm whitespace-pre-wrap">{report.impression}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No impression recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Additional sections */}
        {(report.technique || report.comparison || report.recommendations) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.technique && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Technique</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{report.technique}</p>
                </div>
              )}
              {report.comparison && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Comparison</p>
                    <p className="text-sm whitespace-pre-wrap mt-1">{report.comparison}</p>
                  </div>
                </>
              )}
              {report.recommendations && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Recommendations</p>
                    <p className="text-sm whitespace-pre-wrap mt-1">{report.recommendations}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Report Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Report Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Modality</p>
                <p className="font-medium">{report.modality || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Reported By</p>
                <p className="font-medium">{report.reported_by_name || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Signed At</p>
                <p className="font-medium">
                  {report.signed_at ? formatDateTime(report.signed_at) : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Order</p>
                <Link
                  href={`/imaging/orders/${report.order_number}`}
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  {report.order_number}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Amendment Info */}
            {report.last_amended_by_name && (
              <>
                <Separator className="my-4" />
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                    Last Amendment
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Amended By</p>
                      <p className="font-medium">{report.last_amended_by_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reason</p>
                      <p className="font-medium">{report.last_amendment_reason || '—'}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Amendment History */}
        {report.amendments && report.amendments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amendment History ({report.amendments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.amendments.map((amendment) => (
                  <div
                    key={amendment.id}
                    className="border-l-2 border-amber-500 pl-3 py-2 bg-amber-50/50 dark:bg-amber-950/20 rounded-r"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Amendment #{amendment.amendment_number}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(amendment.amended_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      By {amendment.amended_by_name}: {amendment.reason}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
