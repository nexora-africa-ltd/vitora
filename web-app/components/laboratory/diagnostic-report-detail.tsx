'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  PenLine,
  Printer,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { ReportStatusBadge } from './report-status-badge';
import {
  useDiagnosticReport,
  useFinalizeDiagnosticReport,
  useAmendDiagnosticReport,
  useCancelDiagnosticReport,
  useLabOrder,
} from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils/format';
import { SignatureBadge } from '@/components/shared/signature-badge';
import { useFacility } from '@/lib/context/facility-context';
import { printLabReport } from '@/lib/documents';
import { signaturesApi } from '@/lib/api/certificates';

interface DiagnosticReportDetailProps {
  reportNumber: string;
}

export function DiagnosticReportDetail({
  reportNumber,
}: DiagnosticReportDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [amendConclusion, setAmendConclusion] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const { data: report, isLoading, error } = useDiagnosticReport(reportNumber);
  const finalizeReport = useFinalizeDiagnosticReport();
  const amendReport = useAmendDiagnosticReport();
  const cancelReport = useCancelDiagnosticReport();
  const { facilityDetail } = useFacility();
  const labOrderNumber = report?.lab_order_number ?? '';
  const { data: labOrder } = useLabOrder(labOrderNumber);

  if (isLoading) {
    return <ReportDetailSkeleton />;
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
        <p className="text-muted-foreground mb-4">
          {error?.message || 'Unable to load diagnostic report.'}
        </p>
        <Button
          variant="outline"
          onClick={() => router.push('/laboratory/reports')}
        >
          Go to Reports
        </Button>
      </div>
    );
  }

  const canFinalize = report.status === 'DRAFT' || report.status === 'PRELIMINARY';
  const canAmend = report.is_finalized;
  const canCancel =
    report.status !== 'CANCELLED' && report.status !== 'FINAL' && report.status !== 'AMENDED';
  const canPrint = report.status !== 'CANCELLED';

  const handleFinalize = async () => {
    try {
      await finalizeReport.mutateAsync(report.report_number);
      toast({
        title: 'Report finalized',
        description: 'The diagnostic report has been finalized.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to finalize report',
        variant: 'destructive',
      });
    }
  };

  const handleAmend = async () => {
    if (!amendConclusion.trim()) {
      toast({
        title: 'Conclusion required',
        description: 'Please provide an updated conclusion.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await amendReport.mutateAsync({
        reportNumber: report.report_number,
        conclusion: amendConclusion,
      });
      toast({
        title: 'Report amended',
        description: 'The diagnostic report has been amended.',
      });
      setAmendConclusion('');
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to amend report',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a cancellation reason.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await cancelReport.mutateAsync({ reportNumber: report.report_number, reason: cancelReason });
      toast({
        title: 'Report cancelled',
        description: 'The diagnostic report has been cancelled.',
      });
      setCancelReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to cancel report',
        variant: 'destructive',
      });
    }
  };

  // Compute patient age from DOB
  const patientAge = report.patient_dob
    ? String(Math.floor((Date.now() - new Date(report.patient_dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
    : '';
  const patientSex = report.patient_gender === 'M' ? 'Male' : report.patient_gender === 'F' ? 'Female' : report.patient_gender || '';

  const handlePrint = async () => {
    if (!labOrder) {
      toast({
        title: 'Loading order data',
        description: 'Please wait for the lab order to load.',
        variant: 'destructive',
      });
      return;
    }
    try {
      // Fetch signature data for the report (if signed)
      let signatureData: { signer_full_name: string; signed_at: string; certificate_serial?: string; is_valid?: boolean } | undefined;
      try {
        const sigs = await signaturesApi.forDocument('DiagnosticReport', report.id);
        if (sigs.length > 0) {
          signatureData = {
            signer_full_name: sigs[0].signer_full_name,
            signed_at: sigs[0].signed_at,
            certificate_serial: sigs[0].certificate_serial,
            is_valid: sigs[0].is_valid,
          };
        }
      } catch {
        // Signature fetch failed — print without signature info
      }
      await printLabReport({
        order: labOrder,
        patient: {
          full_name: report.patient_name,
          mrn: report.patient_mrn || '',
          age: patientAge,
          sex: patientSex,
        },
        signature: signatureData,
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
        description:
          error instanceof Error ? error.message : 'Failed to print report',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={report.report_number}
        helpContent="View and manage this diagnostic report. Finalize when ready, amend if corrections are needed, or download as PDF."
        actions={
          <>
            {canPrint && (
              <Button
                variant="outline"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            )}

            {canFinalize && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Sign & Finalize
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <div className="flex items-center gap-2">
                      <AlertDialogTitle>Sign & Finalize Report</AlertDialogTitle>
                      <HelpPopover content="Signing and finalizing marks this report as the official result. After finalization, it can only be amended, not edited directly." />
                    </div>
                  </AlertDialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to sign and finalize this report? This action
                    marks it as the official diagnostic report.
                  </p>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFinalize}>
                      Sign & Finalize
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canAmend && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">
                    <PenLine className="h-4 w-4 mr-2" />
                    Amend
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <div className="flex items-center gap-2">
                      <AlertDialogTitle>Amend Report</AlertDialogTitle>
                      <HelpPopover content="Provide an updated conclusion. The amendment will be tracked with your name and timestamp." />
                    </div>
                  </AlertDialogHeader>
                  <div className="py-4">
                    <Textarea
                      placeholder="Updated conclusion..."
                      value={amendConclusion}
                      onChange={(e) => setAmendConclusion(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAmend}>
                      Submit Amendment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Report
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <div className="flex items-center gap-2">
                      <AlertDialogTitle>Cancel Report</AlertDialogTitle>
                      <HelpPopover content="Provide a reason for cancellation. Cancelled reports cannot be used." />
                    </div>
                  </AlertDialogHeader>
                  <div className="py-4">
                    <Textarea
                      placeholder="Cancellation reason..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Report</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Cancel Report
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {report.patient_name}
            <span className="text-muted-foreground">
              {' '}
              •{' '}
              <Link
                href={`/laboratory/orders/${report.lab_order_number}`}
                className="hover:underline"
              >
                {report.lab_order_number}
              </Link>
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {formatDateTime(report.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ReportStatusBadge
            status={report.status}
          />
          {report.is_finalized && (
            <SignatureBadge
              documentType="DiagnosticReport"
              documentId={report.id}
              canSign={true}
            />
          )}
        </div>
      </div>

      {/* Report Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Conclusion */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conclusion</CardTitle>
          </CardHeader>
          <CardContent>
            {report.conclusion ? (
              <p className="text-sm whitespace-pre-wrap">{report.conclusion}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No conclusion provided yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Clinical Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Information</CardTitle>
          </CardHeader>
          <CardContent>
            {report.clinical_info ? (
              <p className="text-sm whitespace-pre-wrap">
                {report.clinical_info}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No clinical information provided.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Issued By</p>
              <p className="font-medium">{report.issued_by_name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Issued At</p>
              <p className="font-medium">
                {report.issued_at ? formatDateTime(report.issued_at) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Lab Order</p>
              <Link
                href={`/laboratory/orders/${report.lab_order_number}`}
                className="font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                {report.lab_order_number}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div>
              <p className="text-muted-foreground">Report Number</p>
              <p className="font-medium">{report.report_number}</p>
            </div>
          </div>

          {/* Amendment Info */}
          {report.amended_by_name && (
            <>
              <Separator className="my-4" />
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Amendment Details
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Amended By</p>
                    <p className="font-medium">{report.amended_by_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Amended At</p>
                    <p className="font-medium">
                      {report.amended_at
                        ? formatDateTime(report.amended_at)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cancellation Info */}
          {report.cancellation_reason && (
            <>
              <Separator className="my-4" />
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                  Cancellation Reason
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {report.cancellation_reason}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
