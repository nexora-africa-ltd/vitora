/**
 * Radiology Report Page
 *
 * View and manage radiology reports for imaging orders.
 * Creates report if none exists, otherwise displays existing report.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileText,
  AlertTriangle,
  Loader2,
  Save,
  CheckCircle2,
  Download,
  Printer,
  Edit,
  Phone,
  History,
} from 'lucide-react';
import { toast } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils/format';
import {
  useImagingOrder,
  useRadiologyReportByOrder,
  useCreateRadiologyReport,
  useUpdateRadiologyReport,
  useSignRadiologyReport,
  useAmendRadiologyReport,
  useCommunicateCritical,
} from '@/lib/hooks/use-imaging';
import {
  RadiologyReport,
  RadiologyReportCreateData,
  RadiologyReportUpdateData,
  REPORT_STATUS_LABELS,
  CriticalCommMethod,
} from '@/lib/types/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { printRadiologyReport } from '@/lib/documents';

interface RadiologyReportPageProps {
  orderNumber: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PRELIMINARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  AMENDED: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
};

export function RadiologyReportPage({ orderNumber }: RadiologyReportPageProps) {
  const router = useRouter();
  
  // Form state
  const [technique, setTechnique] = useState('');
  const [comparison, setComparison] = useState('');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const [criticalDescription, setCriticalDescription] = useState('');
  
  // Dialog state
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [criticalDialogOpen, setCriticalDialogOpen] = useState(false);
  const [communicatedTo, setCommunicatedTo] = useState('');
  const [commMethod, setCommMethod] = useState<CriticalCommMethod>('phone');
  
  // Queries
  const { data: order, isLoading: orderLoading } = useImagingOrder(orderNumber);
  const { data: report, isLoading: reportLoading, refetch: refetchReport } = useRadiologyReportByOrder(orderNumber);
  
  // Mutations
  const createReport = useCreateRadiologyReport();
  const updateReport = useUpdateRadiologyReport();
  const signReport = useSignRadiologyReport();
  const amendReport = useAmendRadiologyReport();
  const communicateCritical = useCommunicateCritical();

  const isLoading = orderLoading || reportLoading;
  const isMutating = createReport.isPending || updateReport.isPending || signReport.isPending || amendReport.isPending || communicateCritical.isPending;

  // Populate form when report loads
  useEffect(() => {
    if (report) {
      setTechnique(report.technique || '');
      setComparison(report.comparison || '');
      setFindings(report.findings || '');
      setImpression(report.impression || '');
      setRecommendations(report.recommendations || '');
      setIsCritical(report.is_critical);
      setCriticalDescription(report.critical_finding_description || '');
    }
  }, [report]);

  const handleSaveDraft = async () => {
    if (!findings.trim() || !impression.trim()) {
      toast({ title: 'Findings and Impression are required', variant: 'destructive' });
      return;
    }

    try {
      if (report) {
        // Update existing
        await updateReport.mutateAsync({
          reportNumber: report.report_number,
          data: {
            technique,
            comparison,
            findings,
            impression,
            recommendations,
            is_critical: isCritical,
            critical_finding_description: isCritical ? criticalDescription : '',
          },
        });
        toast({ title: 'Report saved' });
      } else {
        // Create new
        await createReport.mutateAsync({
          imaging_order: order!.id,
          technique,
          comparison,
          findings,
          impression,
          recommendations,
          is_critical: isCritical,
          critical_finding_description: isCritical ? criticalDescription : '',
        });
        toast({ title: 'Report created' });
        refetchReport();
      }
    } catch (error) {
      toast({
        title: 'Error saving report',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleSign = async () => {
    if (!report) return;

    try {
      await signReport.mutateAsync(report.report_number);
      toast({ title: 'Report signed and finalized' });
      refetchReport();
    } catch (error) {
      toast({
        title: 'Error signing report',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleAmend = async () => {
    if (!report || !amendReason.trim()) {
      toast({ title: 'Amendment reason is required', variant: 'destructive' });
      return;
    }

    try {
      await amendReport.mutateAsync({
        reportNumber: report.report_number,
        data: {
          reason: amendReason,
          findings: findings !== report.findings ? findings : undefined,
          impression: impression !== report.impression ? impression : undefined,
        },
      });
      toast({ title: 'Report amended' });
      setAmendDialogOpen(false);
      setAmendReason('');
      refetchReport();
    } catch (error) {
      toast({
        title: 'Error amending report',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleCommunicateCritical = async () => {
    if (!report || !communicatedTo.trim()) {
      toast({ title: 'Recipient name is required', variant: 'destructive' });
      return;
    }

    try {
      await communicateCritical.mutateAsync({
        reportNumber: report.report_number,
        data: {
          communicated_to: communicatedTo,
          method: commMethod,
        },
      });
      toast({ title: 'Critical finding communication recorded' });
      setCriticalDialogOpen(false);
      setCommunicatedTo('');
      refetchReport();
    } catch (error) {
      toast({
        title: 'Error recording communication',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = async () => {
    if (!report || !order) return;

    try {
      await printRadiologyReport({
        report,
        patient: {
          full_name: report.patient_name,
          mrn: report.patient_mrn,
          age: '', // Would need to fetch from patient
          sex: '',
        },
        order: {
          order_number: order.order_number,
          ordered_by_name: order.ordered_by_name || '',
          ordered_at: order.ordered_at,
          clinical_indication: order.clinical_indication,
        },
      });
    } catch (error) {
      toast({
        title: 'Error printing report',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadPdf = () => {
    if (!report) return;
    const url = imagingApi.getReportPdfUrl(report.report_number);
    window.open(url, '_blank');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Order Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The imaging order could not be loaded.
        </p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const canEdit = !report || report.can_edit;
  const canSign = report?.can_sign;
  const canAmend = report?.can_amend;
  const showCriticalAlert = report?.is_critical && !report.critical_communicated;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">
              Radiology Report
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Order: {orderNumber}
              {report && ` | Report: ${report.report_number}`}
            </p>
          </div>
        </div>
        {report && (
          <div className="flex items-center gap-2 pl-10 sm:pl-0">
            <Badge className={STATUS_COLORS[report.status]}>
              {REPORT_STATUS_LABELS[report.status]}
            </Badge>
            {report.is_critical && (
              <Badge variant="destructive">Critical Finding</Badge>
            )}
          </div>
        )}
      </div>

      {/* Critical Finding Alert */}
      {showCriticalAlert && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Critical Finding - Communication Required
            </CardTitle>
            <CardDescription className="text-red-600 dark:text-red-300">
              {report?.critical_finding_description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setCriticalDialogOpen(true)}
            >
              <Phone className="h-4 w-4 mr-2" />
              Record Communication
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Critical Communication Recorded */}
      {report?.is_critical && report.critical_communicated && (
        <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">
                Critical finding communicated to <strong>{report.critical_communicated_to}</strong> via {report.critical_communicated_method} on {report.critical_communicated_at ? formatDateTime(report.critical_communicated_at) : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Patient & Order Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Patient & Order Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Patient:</span>
              <p className="font-medium">{report?.patient_name || order.patient_name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">MRN:</span>
              <p className="font-medium">{report?.patient_mrn || 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Modality:</span>
              <p className="font-medium">{report?.modality || order.items?.[0]?.modality || 'N/A'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Ordered:</span>
              <p className="font-medium">{formatDateTime(order.ordered_at)}</p>
            </div>
          </div>
          <Separator className="my-3" />
          <div>
            <span className="text-muted-foreground text-sm">Clinical Indication:</span>
            <p className="text-sm mt-1">{order.clinical_indication}</p>
          </div>
        </CardContent>
      </Card>

      {/* Report Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Report Content
          </CardTitle>
          {!canEdit && (
            <CardDescription>
              This report is finalized and cannot be edited directly. Use amendment to make changes.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Technique */}
          <div className="space-y-2">
            <Label htmlFor="technique">Technique</Label>
            <Textarea
              id="technique"
              placeholder="Describe the imaging technique/protocol used..."
              value={technique}
              onChange={(e) => setTechnique(e.target.value)}
              disabled={!canEdit}
              rows={2}
            />
          </div>

          {/* Comparison */}
          <div className="space-y-2">
            <Label htmlFor="comparison">Comparison</Label>
            <Textarea
              id="comparison"
              placeholder="Comparison with prior studies (if any)..."
              value={comparison}
              onChange={(e) => setComparison(e.target.value)}
              disabled={!canEdit}
              rows={2}
            />
          </div>

          {/* Findings */}
          <div className="space-y-2">
            <Label htmlFor="findings">Findings *</Label>
            <Textarea
              id="findings"
              placeholder="Detailed radiological findings..."
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              disabled={!canEdit && !canAmend}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {/* Impression */}
          <div className="space-y-2">
            <Label htmlFor="impression">Impression *</Label>
            <Textarea
              id="impression"
              placeholder="Summary impression/conclusion..."
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              disabled={!canEdit && !canAmend}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          {/* Recommendations */}
          <div className="space-y-2">
            <Label htmlFor="recommendations">Recommendations</Label>
            <Textarea
              id="recommendations"
              placeholder="Recommended follow-up or additional studies..."
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              disabled={!canEdit}
              rows={2}
            />
          </div>

          <Separator />

          {/* Critical Finding Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="critical">Critical Finding</Label>
              <p className="text-xs text-muted-foreground">
                Mark if this report contains a critical finding requiring urgent communication
              </p>
            </div>
            <Switch
              id="critical"
              checked={isCritical}
              onCheckedChange={setIsCritical}
              disabled={!canEdit}
            />
          </div>

          {isCritical && (
            <div className="space-y-2">
              <Label htmlFor="criticalDesc">Critical Finding Description</Label>
              <Textarea
                id="criticalDesc"
                placeholder="Describe the critical finding..."
                value={criticalDescription}
                onChange={(e) => setCriticalDescription(e.target.value)}
                disabled={!canEdit}
                rows={2}
                className="border-red-300"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amendment History */}
      {report && report.amendments && report.amendments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5" />
              Amendment History
            </CardTitle>
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

      {/* Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  onClick={handleSaveDraft}
                  disabled={isMutating}
                >
                  {isMutating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Draft
                </Button>
              )}

              {canSign && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="default" className="bg-green-600 hover:bg-green-700">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Sign & Finalize
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sign Report?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will finalize the report. Once signed, the report cannot be edited
                        directly—only amended. Are you sure you want to proceed?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSign}>
                        Sign Report
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {canAmend && (
                <Button
                  variant="outline"
                  onClick={() => setAmendDialogOpen(true)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Amend Report
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {report && (
                <>
                  <Button variant="outline" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Amendment Dialog */}
      <Dialog open={amendDialogOpen} onOpenChange={setAmendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amend Report</DialogTitle>
            <DialogDescription>
              Provide a reason for the amendment. You can also modify the findings
              and impression above before amending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amendReason">Amendment Reason *</Label>
              <Textarea
                id="amendReason"
                placeholder="Describe the reason for this amendment..."
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAmend} disabled={isMutating}>
              {isMutating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Edit className="h-4 w-4 mr-2" />
              )}
              Submit Amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Critical Communication Dialog */}
      <Dialog open={criticalDialogOpen} onOpenChange={setCriticalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Critical Finding Communication</DialogTitle>
            <DialogDescription>
              Document who was notified of the critical finding and how.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="communicatedTo">Communicated To *</Label>
              <Input
                id="communicatedTo"
                placeholder="Name of the person notified (e.g., Dr. Smith)"
                value={communicatedTo}
                onChange={(e) => setCommunicatedTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commMethod">Communication Method</Label>
              <Select value={commMethod} onValueChange={(v) => setCommMethod(v as CriticalCommMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="secure_message">Secure Message</SelectItem>
                  <SelectItem value="pager">Pager</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriticalDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCommunicateCritical} disabled={isMutating}>
              {isMutating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Confirm Communication
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RadiologyReportPage;
