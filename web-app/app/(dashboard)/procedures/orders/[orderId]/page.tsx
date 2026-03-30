'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  PlayCircle,
  Plus,
  Syringe,
  User,
  XCircle,
  Pill,
  ClipboardCheck,
  Stethoscope,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { HelpPopover } from '@/components/shared/help-popover';
import { toast } from '@/lib/hooks/use-toast';
import { proceduresApi } from '@/lib/api/procedures';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime, formatTime, formatCurrency } from '@/lib/utils/format';
import type {
  ProcedureOrder,
  ProcedureConsent,
  ProcedureLog,
  ProcedureConsumable,
  ProcedureOutcome,
  ProcedureOrderStatus,
} from '@/lib/types/procedure';
import {
  PROCEDURE_STATUS_COLORS,
  PROCEDURE_STATUS_LABELS,
  PROCEDURE_PRIORITY_COLORS,
} from '@/lib/types/procedure';

export default function ProcedureOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderId = Number(params.orderId);

  // Data fetching
  const {
    data: order,
    isLoading,
    error,
  } = useQuery<ProcedureOrder>({
    queryKey: ['procedure-order', orderId],
    queryFn: () => proceduresApi.getOrder(orderId),
    enabled: Number.isFinite(orderId),
  });

  // Dialog states
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [createConsentOpen, setCreateConsentOpen] = useState(false);

  // Consent create form
  const [consentType, setConsentType] = useState('WRITTEN');
  const [procedureExplained, setProcedureExplained] = useState(false);
  const [risksExplained, setRisksExplained] = useState(false);
  const [alternativesExplained, setAlternativesExplained] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(false);
  const [signedByPatient, setSignedByPatient] = useState(false);
  const [signedByGuardian, setSignedByGuardian] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [witnessRequired, setWitnessRequired] = useState(false);
  const [witnessName, setWitnessName] = useState('');

  // Schedule form
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');

  // Cancel form
  const [cancelReason, setCancelReason] = useState('');

  // Complete form
  const [completeStatus, setCompleteStatus] = useState('COMPLETED');
  const [completeOutcome, setCompleteOutcome] = useState('');
  const [complications, setComplications] = useState(false);
  const [complicationDetails, setComplicationDetails] = useState('');

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: ['procedure-order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['procedure-orders'] });
    queryClient.invalidateQueries({ queryKey: ['procedures-dashboard'] });
  };

  // Mutations
  const { mutateAsync: scheduleOrder, isPending: scheduling } = useMutation({
    mutationFn: () =>
      proceduresApi.scheduleOrder(orderId, {
        scheduled_date: scheduleDate,
        ...(scheduleTime ? { scheduled_time: scheduleTime } : {}),
        ...(scheduleLocation ? { scheduled_location: scheduleLocation } : {}),
      }),
    onSuccess: () => {
      toast({ title: 'Procedure scheduled', description: 'The procedure has been scheduled.' });
      invalidateOrder();
      setScheduleOpen(false);
    },
    onError: (err) => {
      toast({ title: 'Schedule failed', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const { mutateAsync: startProcedure, isPending: starting } = useMutation({
    mutationFn: () => proceduresApi.startProcedure(orderId),
    onSuccess: () => {
      toast({ title: 'Procedure started', description: 'The procedure is now in progress.' });
      invalidateOrder();
    },
    onError: (err) => {
      toast({ title: 'Failed to start', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const { mutateAsync: completeProcedure, isPending: completing } = useMutation({
    mutationFn: () =>
      proceduresApi.completeProcedure(orderId, {
        status: completeStatus,
        ...(completeOutcome ? { immediate_outcome: completeOutcome } : {}),
        complications_occurred: complications,
        ...(complications && complicationDetails ? { complication_details: complicationDetails } : {}),
      }),
    onSuccess: () => {
      toast({ title: 'Procedure completed', description: 'The procedure has been recorded.' });
      invalidateOrder();
      setCompleteOpen(false);
    },
    onError: (err) => {
      toast({ title: 'Completion failed', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const { mutateAsync: cancelOrder, isPending: cancelling } = useMutation({
    mutationFn: () => proceduresApi.cancelOrder(orderId, cancelReason),
    onSuccess: () => {
      toast({ title: 'Order cancelled' });
      invalidateOrder();
      setCancelOpen(false);
    },
    onError: (err) => {
      toast({ title: 'Cancellation failed', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const { mutateAsync: signConsent, isPending: signing } = useMutation({
    mutationFn: () => proceduresApi.signConsent(orderId),
    onSuccess: () => {
      toast({ title: 'Consent signed' });
      invalidateOrder();
    },
    onError: (err) => {
      toast({ title: 'Failed to sign consent', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const { mutateAsync: createConsent, isPending: creatingConsent } = useMutation({
    mutationFn: () =>
      proceduresApi.createConsent(orderId, {
        consent_type: consentType,
        consent_text: `I consent to the procedure: ${order?.procedure?.name || ''}. The procedure, risks, alternatives, and expected outcomes have been explained to me.`,
        procedure_explained: procedureExplained,
        risks_explained: risksExplained,
        alternatives_explained: alternativesExplained,
        questions_answered: questionsAnswered,
        signed_by_patient: signedByPatient,
        signed_by_guardian: signedByGuardian,
        guardian_name: guardianName,
        guardian_relationship: guardianRelationship,
        witness_required: witnessRequired,
        witness_name: witnessName,
      }),
    onSuccess: () => {
      toast({ title: 'Consent created', description: 'Consent record has been created. It can now be signed.' });
      invalidateOrder();
      setCreateConsentOpen(false);
    },
    onError: (err) => {
      toast({ title: 'Failed to create consent', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  // Loading / error states
  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <PageHeader title="Procedure Order" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Order not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSchedule = ['ORDERED', 'CONSENT_PENDING'].includes(order.status) &&
    (!order.procedure.consent_required || order.consent?.status === 'SIGNED');
  const canStart = ['SCHEDULED', 'READY'].includes(order.status) &&
    (!order.procedure.consent_required || order.consent?.status === 'SIGNED');
  const canComplete = order.status === 'IN_PROGRESS' && order.log;
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(order.status);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Order ${order.order_number}`}
        helpContent="View procedure order details, manage consent, track performance, and record outcomes."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-base sm:text-lg font-semibold truncate">
            {order.procedure.name}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            Patient ID: {order.patient}
            {order.body_site && <> &bull; Site: {order.body_site}</>}
            {order.laterality !== 'NA' && <> ({order.laterality})</>}
          </p>
          <p className="text-xs text-muted-foreground">
            Ordered {formatDateTime(order.ordered_at)}
            {order.scheduled_date && (
              <> &bull; Scheduled {formatDate(order.scheduled_date)}
                {order.scheduled_time && ` at ${formatTime(order.scheduled_time)}`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Badge className={`${PROCEDURE_STATUS_COLORS[order.status]} w-fit`}>
            {PROCEDURE_STATUS_LABELS[order.status]}
          </Badge>
          <Badge className={`${PROCEDURE_PRIORITY_COLORS[order.priority]} w-fit`}>
            {order.priority}
          </Badge>
          {order.is_overdue && (
            <Badge variant="destructive" className="w-fit">Overdue</Badge>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {canSchedule && (
          <Button variant="outline" onClick={() => setScheduleOpen(true)}>
            <Calendar className="h-4 w-4 mr-2" />
            Schedule
          </Button>
        )}
        {canStart && (
          <Button onClick={() => startProcedure()} disabled={starting}>
            <PlayCircle className="h-4 w-4 mr-2" />
            {starting ? 'Starting...' : 'Start Procedure'}
          </Button>
        )}
        {canComplete && (
          <Button onClick={() => setCompleteOpen(true)}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete
          </Button>
        )}
        {canCancel && (
          <Button variant="destructive" onClick={() => setCancelOpen(true)}>
            <XCircle className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4 h-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="consent" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Consent</span>
          </TabsTrigger>
          <TabsTrigger value="perform" className="gap-1.5">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Perform</span>
          </TabsTrigger>
          <TabsTrigger value="outcomes" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Outcomes</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Procedure Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Procedure</span>
                  <span className="font-medium">{order.procedure.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-mono">{order.procedure.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span>{order.procedure.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk Level</span>
                  <span>{order.procedure.risk_level}</span>
                </div>
                {order.procedure.base_fee && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fee</span>
                    <span>{formatCurrency(order.procedure.base_fee)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Duration</span>
                  <span>{order.procedure.typical_duration_minutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consent Required</span>
                  <span>{order.procedure.consent_required ? 'Yes' : 'No'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={`${PROCEDURE_PRIORITY_COLORS[order.priority]} w-fit`}>
                    {order.priority}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indication</span>
                  <span className="text-right max-w-[60%]">{order.indication}</span>
                </div>
                {order.clinical_notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clinical Notes</span>
                    <span className="text-right max-w-[60%]">{order.clinical_notes}</span>
                  </div>
                )}
                {order.body_site && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Body Site</span>
                    <span>{order.body_site} {order.laterality !== 'NA' ? `(${order.laterality})` : ''}</span>
                  </div>
                )}
                {order.scheduled_location && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{order.scheduled_location}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cancellation card */}
          {order.status === 'CANCELLED' && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Cancelled</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>{order.cancellation_reason}</p>
                {order.cancelled_at && (
                  <p className="text-muted-foreground">
                    Cancelled on {formatDateTime(order.cancelled_at)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Consent Tab */}
        <TabsContent value="consent" className="space-y-4">
          {!order.procedure.consent_required ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Consent is not required for this procedure.</p>
              </CardContent>
            </Card>
          ) : order.consent ? (
            <ConsentCard consent={order.consent} onSign={() => signConsent()} signing={signing} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Consent has not been created yet.</p>
                <p className="text-xs mt-1">
                  Consent must be obtained before the procedure can begin.
                </p>
                {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
                  <Button className="mt-4" onClick={() => setCreateConsentOpen(true)}>
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Obtain Consent
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Perform Tab */}
        <TabsContent value="perform" className="space-y-4">
          {order.log ? (
            <PerformanceCard log={order.log} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Procedure has not started yet.</p>
                {canStart && (
                  <Button
                    className="mt-4"
                    onClick={() => startProcedure()}
                    disabled={starting}
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    {starting ? 'Starting...' : 'Start Procedure'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Outcomes Tab */}
        <TabsContent value="outcomes" className="space-y-4">
          <OutcomesTab orderId={orderId} orderStatus={order.status} />
        </TabsContent>
      </Tabs>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Schedule Procedure</DialogTitle>
              <HelpPopover content="Set the date, time, and location for this procedure." />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="scheduled_date">Date *</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scheduled_time">Time</Label>
              <Input
                id="scheduled_time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scheduled_location">Location</Label>
              <Input
                id="scheduled_location"
                placeholder="e.g., Procedure Room 1"
                value={scheduleLocation}
                onChange={(e) => setScheduleLocation(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => scheduleOrder()} disabled={scheduling || !scheduleDate}>
              {scheduling ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Procedure Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="cancel_reason">Reason for cancellation *</Label>
              <Textarea
                id="cancel_reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Provide the reason for cancelling this procedure..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelOrder()}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Complete Procedure</DialogTitle>
              <HelpPopover content="Record the outcome of this procedure. Mark any complications that occurred." />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="complete_status">Outcome Status</Label>
              <Select value={completeStatus} onValueChange={setCompleteStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completed Successfully</SelectItem>
                  <SelectItem value="PARTIAL">Partially Completed</SelectItem>
                  <SelectItem value="COMPLICATED">Completed with Complications</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="complete_outcome">Immediate Outcome</Label>
              <Textarea
                id="complete_outcome"
                value={completeOutcome}
                onChange={(e) => setCompleteOutcome(e.target.value)}
                placeholder="Describe the immediate post-procedure outcome..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="complications"
                checked={complications}
                onChange={(e) => setComplications(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="complications">Complications occurred</Label>
            </div>
            {complications && (
              <div>
                <Label htmlFor="complication_details">Complication Details</Label>
                <Textarea
                  id="complication_details"
                  value={complicationDetails}
                  onChange={(e) => setComplicationDetails(e.target.value)}
                  placeholder="Describe the complications..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => completeProcedure()} disabled={completing}>
              {completing ? 'Completing...' : 'Complete Procedure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Consent Dialog */}
      <Dialog open={createConsentOpen} onOpenChange={setCreateConsentOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Obtain Consent</DialogTitle>
              <HelpPopover content="Record informed consent. Ensure the patient understands the procedure, risks, and alternatives before signing." />
            </div>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Consent Type */}
            <div>
              <Label>Consent Type</Label>
              <Select value={consentType} onValueChange={setConsentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WRITTEN">Written Consent</SelectItem>
                  <SelectItem value="VERBAL">Verbal Consent (documented)</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency (implied consent)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Informed Consent Checklist */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Informed Consent Checklist</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Confirm each item was discussed with the patient.
              </p>
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="proc_explained"
                    checked={procedureExplained}
                    onCheckedChange={(v) => setProcedureExplained(!!v)}
                  />
                  <Label htmlFor="proc_explained" className="text-sm !mt-0">
                    Procedure explained to patient
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="risks_explained"
                    checked={risksExplained}
                    onCheckedChange={(v) => setRisksExplained(!!v)}
                  />
                  <Label htmlFor="risks_explained" className="text-sm !mt-0">
                    Risks and complications explained
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="alts_explained"
                    checked={alternativesExplained}
                    onCheckedChange={(v) => setAlternativesExplained(!!v)}
                  />
                  <Label htmlFor="alts_explained" className="text-sm !mt-0">
                    Alternative treatments discussed
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="questions_answered"
                    checked={questionsAnswered}
                    onCheckedChange={(v) => setQuestionsAnswered(!!v)}
                  />
                  <Label htmlFor="questions_answered" className="text-sm !mt-0">
                    Patient&apos;s questions answered
                  </Label>
                </div>
              </div>
            </div>

            {/* Patient Signature */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="signed_patient"
                  checked={signedByPatient}
                  onCheckedChange={(v) => setSignedByPatient(!!v)}
                />
                <Label htmlFor="signed_patient" className="text-sm !mt-0 font-medium">
                  Patient signed consent form
                </Label>
              </div>

              {/* Guardian (for minors / incapacitated) */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="signed_guardian"
                  checked={signedByGuardian}
                  onCheckedChange={(v) => setSignedByGuardian(!!v)}
                />
                <Label htmlFor="signed_guardian" className="text-sm !mt-0">
                  Guardian signed (for minors)
                </Label>
              </div>
              {signedByGuardian && (
                <div className="grid gap-3 sm:grid-cols-2 pl-6">
                  <div>
                    <Label htmlFor="guardian_name" className="text-xs">Guardian Name</Label>
                    <Input
                      id="guardian_name"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="guardian_rel" className="text-xs">Relationship</Label>
                    <Input
                      id="guardian_rel"
                      value={guardianRelationship}
                      onChange={(e) => setGuardianRelationship(e.target.value)}
                      placeholder="e.g., Parent, Spouse"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Witness */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="witness_req"
                  checked={witnessRequired}
                  onCheckedChange={(v) => setWitnessRequired(!!v)}
                />
                <Label htmlFor="witness_req" className="text-sm !mt-0">
                  Witness present
                </Label>
              </div>
              {witnessRequired && (
                <div className="pl-6">
                  <Label htmlFor="witness_name" className="text-xs">Witness Name</Label>
                  <Input
                    id="witness_name"
                    value={witnessName}
                    onChange={(e) => setWitnessName(e.target.value)}
                    placeholder="Witness full name"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateConsentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createConsent()}
              disabled={
                creatingConsent ||
                !procedureExplained ||
                !risksExplained ||
                (!signedByPatient && !signedByGuardian)
              }
            >
              {creatingConsent ? 'Creating...' : 'Create Consent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function ConsentCard({
  consent,
  onSign,
  signing,
}: {
  consent: ProcedureConsent;
  onSign: () => void;
  signing: boolean;
}) {
  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    SIGNED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    DECLINED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    WITHDRAWN: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Consent Record</CardTitle>
          <Badge className={`${statusColor[consent.status] || ''} w-fit`}>
            {consent.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            {consent.procedure_explained ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Procedure explained</span>
          </div>
          <div className="flex items-center gap-2">
            {consent.risks_explained ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Risks explained</span>
          </div>
          <div className="flex items-center gap-2">
            {consent.alternatives_explained ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Alternatives discussed</span>
          </div>
          <div className="flex items-center gap-2">
            {consent.questions_answered ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Questions answered</span>
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t">
          <span className="text-muted-foreground">Type</span>
          <span>{consent.consent_type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Patient signed</span>
          <span>{consent.signed_by_patient ? 'Yes' : 'No'}</span>
        </div>
        {consent.signed_by_guardian && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Guardian</span>
            <span>{consent.guardian_name}</span>
          </div>
        )}
        {consent.obtained_at && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Obtained at</span>
            <span>{formatDateTime(consent.obtained_at)}</span>
          </div>
        )}

        {consent.status === 'PENDING' && (
          <div className="pt-3 border-t">
            <Button onClick={onSign} disabled={signing} className="w-full sm:w-auto">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {signing ? 'Signing...' : 'Sign Consent'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceCard({ log }: { log: ProcedureLog }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Performance Record</CardTitle>
            <Badge className="w-fit">{log.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>{formatDateTime(log.started_at)}</span>
            </div>
            {log.ended_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ended</span>
                <span>{formatDateTime(log.ended_at)}</span>
              </div>
            )}
            {log.actual_duration_minutes != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>{log.actual_duration_minutes} min</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Location</span>
              <span>{log.location || '—'}</span>
            </div>
          </div>

          {log.anesthesia_used && (
            <div className="pt-2 border-t space-y-1">
              <p className="font-medium">Anesthesia</p>
              <p>{log.anesthesia_type} {log.anesthesia_type && '—'} used</p>
            </div>
          )}

          {log.immediate_outcome && (
            <div className="pt-2 border-t space-y-1">
              <p className="font-medium">Immediate Outcome</p>
              <p>{log.immediate_outcome}</p>
            </div>
          )}

          {log.complications_occurred && (
            <div className="pt-2 border-t space-y-1 text-destructive">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Complications
              </p>
              <p>{log.complication_details}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consumables */}
      {log.consumables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumables Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Item</th>
                    <th className="text-right py-2 px-4">Qty</th>
                    <th className="text-right py-2 px-4">Unit Cost</th>
                    <th className="text-right py-2 pl-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {log.consumables.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{c.drug_name}</td>
                      <td className="py-2 px-4 text-right">{c.quantity}</td>
                      <td className="py-2 px-4 text-right">
                        {c.unit_cost != null ? formatCurrency(c.unit_cost) : '—'}
                      </td>
                      <td className="py-2 pl-4 text-right font-medium">
                        {c.total_cost != null ? formatCurrency(c.total_cost) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OutcomesTab({ orderId, orderStatus }: { orderId: number; orderStatus: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [outcome, setOutcome] = useState('SUCCESSFUL');
  const [findings, setFindings] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  const { data: outcomes, isLoading } = useQuery<ProcedureOutcome[]>({
    queryKey: ['procedure-outcomes', orderId],
    queryFn: () => proceduresApi.listOutcomes(orderId),
  });

  const { mutateAsync: addOutcome, isPending: adding } = useMutation({
    mutationFn: () =>
      proceduresApi.addOutcome(orderId, {
        assessment_date: assessmentDate,
        outcome,
        findings,
        ...(notes ? { notes } : {}),
        ...(nextFollowUp ? { next_follow_up: nextFollowUp } : {}),
        ...(followUpNotes ? { follow_up_notes: followUpNotes } : {}),
      }),
    onSuccess: () => {
      toast({ title: 'Outcome recorded' });
      queryClient.invalidateQueries({ queryKey: ['procedure-outcomes', orderId] });
      setShowForm(false);
      setFindings('');
      setNotes('');
      setNextFollowUp('');
      setFollowUpNotes('');
    },
    onError: (err) => {
      toast({ title: 'Failed to record outcome', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const canAddOutcome = orderStatus === 'COMPLETED';

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Add Outcome button */}
      {canAddOutcome && !showForm && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Add Outcome Assessment</span>
            <span className="sm:hidden">Add Outcome</span>
          </Button>
        </div>
      )}

      {/* Add Outcome Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Record Outcome</CardTitle>
              <HelpPopover content="Record a follow-up assessment. Track healing progress, complications, or schedule the next follow-up." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="assessment_date">Assessment Date *</Label>
                <Input
                  id="assessment_date"
                  type="date"
                  value={assessmentDate}
                  onChange={(e) => setAssessmentDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="outcome_status">Outcome *</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger id="outcome_status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUCCESSFUL">Successful — Full recovery</SelectItem>
                    <SelectItem value="PARTIAL_SUCCESS">Partial Success</SelectItem>
                    <SelectItem value="HEALING">Healing as expected</SelectItem>
                    <SelectItem value="DELAYED_HEALING">Delayed Healing</SelectItem>
                    <SelectItem value="INFECTION">Infection</SelectItem>
                    <SelectItem value="COMPLICATION">Post-procedure Complication</SelectItem>
                    <SelectItem value="RE_PROCEDURE_NEEDED">Re-procedure Needed</SelectItem>
                    <SelectItem value="REFERRED">Referred for Further Care</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="findings">Clinical Findings *</Label>
              <Textarea
                id="findings"
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                placeholder="Describe the clinical findings at follow-up (e.g., wound healing well, no signs of infection)..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="outcome_notes">Notes</Label>
              <Textarea
                id="outcome_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="next_follow_up">Next Follow-up Date</Label>
                <Input
                  id="next_follow_up"
                  type="date"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="follow_up_notes">Follow-up Instructions</Label>
                <Input
                  id="follow_up_notes"
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  placeholder="e.g., Return for suture removal"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={adding}>
                Cancel
              </Button>
              <Button
                onClick={() => addOutcome()}
                disabled={adding || !assessmentDate || !findings.trim()}
              >
                {adding ? 'Saving...' : 'Save Outcome'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {(!outcomes || outcomes.length === 0) && !showForm && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No outcomes recorded yet.</p>
            <p className="text-xs mt-1">
              {canAddOutcome
                ? 'Click "Add Outcome Assessment" to record a follow-up.'
                : 'Outcomes can be added after the procedure is completed.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Outcome cards */}
      {outcomes && outcomes.length > 0 && (
        <div className="space-y-3">
          {outcomes.map((outcomeItem) => (
            <Card key={outcomeItem.id}>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{formatDate(outcomeItem.assessment_date)}</span>
                  <Badge variant="outline" className="w-fit shrink-0">{outcomeItem.outcome}</Badge>
                </div>
                <p>{outcomeItem.findings}</p>
                {outcomeItem.notes && (
                  <p className="text-muted-foreground">{outcomeItem.notes}</p>
                )}
                {outcomeItem.next_follow_up && (
                  <p className="text-xs text-muted-foreground">
                    Next follow-up: {formatDate(outcomeItem.next_follow_up)}
                    {outcomeItem.follow_up_notes && ` — ${outcomeItem.follow_up_notes}`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
