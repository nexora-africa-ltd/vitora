'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plus,
  Printer,
  Send,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { aefiApi } from '@/lib/api/immunizations';
import type {
  AEFIEventType,
  AEFISeverity,
  AEFIOutcome,
  AEFIReport,
  AEFIFollowUpData,
} from '@/lib/types/immunizations';

// ---------------------------------------------------------------------------
// Labels & Colors
// ---------------------------------------------------------------------------

const severityColors: Record<AEFISeverity, string> = {
  MILD: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  SEVERE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const outcomeColors: Record<AEFIOutcome, string> = {
  RECOVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  RECOVERING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  NOT_RECOVERED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  SEQUELAE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  DEATH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
};

const eventTypeLabels: Record<AEFIEventType, string> = {
  BCG_LYMPHADENITIS: 'BCG Lymphadenitis',
  INJECTION_SITE_ABSCESS: 'Injection Site Abscess',
  CONVULSION: 'Convulsion / Seizure',
  HIGH_FEVER: 'High Fever (≥38.5°C)',
  SEVERE_LOCAL_REACTION: 'Severe Local Reaction',
  GENERALIZED_URTICARIA: 'Generalized Urticaria (Hives)',
  ANAPHYLAXIS: 'Anaphylaxis',
  ENCEPHALOPATHY: 'Encephalopathy / Encephalitis / Meningitis',
  PARALYSIS: 'Paralysis',
  TOXIC_SHOCK: 'Toxic Shock Syndrome',
  OTHER: 'Other',
};

const outcomeLabels: Record<AEFIOutcome, string> = {
  RECOVERED: 'Recovered',
  RECOVERING: 'Recovering',
  NOT_RECOVERED: 'Not Recovered',
  SEQUELAE: 'Recovered with Sequelae',
  DEATH: 'Died',
  UNKNOWN: 'Unknown',
};

const SEVERITY_OPTIONS: { value: AEFISeverity; label: string }[] = [
  { value: 'MILD', label: 'Mild' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'SEVERE', label: 'Severe' },
];

const OUTCOME_OPTIONS: { value: AEFIOutcome; label: string }[] = [
  { value: 'RECOVERED', label: 'Recovered' },
  { value: 'RECOVERING', label: 'Recovering' },
  { value: 'NOT_RECOVERED', label: 'Not Recovered' },
  { value: 'SEQUELAE', label: 'Recovered with Sequelae' },
  { value: 'DEATH', label: 'Died' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

// ---------------------------------------------------------------------------
// Detail Field helper
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value || '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AEFIDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const id = Number(params.id);

  // Fetch detail
  const { data: report, isLoading } = useQuery({
    queryKey: ['aefi', id],
    queryFn: () => aefiApi.get(id),
    enabled: !!id,
  });

  // ----- Follow-up dialog -----
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuNotes, setFuNotes] = useState('');
  const [fuSeverity, setFuSeverity] = useState<AEFISeverity | ''>('');
  const [fuOutcome, setFuOutcome] = useState<AEFIOutcome | ''>('');
  const [fuTreatmentGiven, setFuTreatmentGiven] = useState(false);
  const [fuTreatmentDetails, setFuTreatmentDetails] = useState('');

  const followUpMutation = useMutation({
    mutationFn: (data: AEFIFollowUpData) => aefiApi.followUp(id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['aefi'] });
      toast({ title: 'Follow-up Created', description: 'Follow-up AEFI report recorded.' });
      setShowFollowUp(false);
      router.push(`/immunizations/aefi/${result.id}`);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create follow-up.', variant: 'destructive' });
    },
  });

  // ----- Submit to Authorities -----
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');

  const submitMutation = useMutation({
    mutationFn: () => aefiApi.submitToAuthorities(id, { notes: submitNotes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aefi', id] });
      toast({ title: 'Submitted', description: 'AEFI report submitted to authorities.' });
      setShowSubmit(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit to authorities.', variant: 'destructive' });
    },
  });

  // ----- Loading -----
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <PageHeader title="AEFI Report" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">Report not found.</CardContent></Card>
      </div>
    );
  }

  const vd = report.vaccination_details;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title={`AEFI Report #${report.id}`}
        helpContent="View all details of this Adverse Event Following Immunization report. Submit to authorities, create follow-up reports, or print the MOH form."
        actions={
          <div className="flex flex-wrap gap-2">
            {!report.reported_to_authorities && (
              <Button size="sm" variant="destructive" onClick={() => setShowSubmit(true)}>
                <Send className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Submit to Authorities</span>
                <span className="sm:hidden">Submit</span>
              </Button>
            )}
            {report.report_type === 'INITIAL' && (
              <Button size="sm" variant="outline" onClick={() => setShowFollowUp(true)}>
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Follow-up</span>
                <span className="sm:hidden">F/U</span>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Print MOH Form</span>
              <span className="sm:hidden">Print</span>
            </Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50 print:bg-white print:border">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {report.patient_name}
            <span className="text-muted-foreground"> • {report.patient_mrn}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {report.vaccine_name} • Dose {vd.dose_number} • Event: {formatDate(report.event_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${severityColors[report.severity]} shrink-0 w-fit`}>
            {report.severity}
          </Badge>
          <Badge className={`${outcomeColors[report.outcome]} shrink-0 w-fit`}>
            {outcomeLabels[report.outcome]}
          </Badge>
          <Badge variant={report.report_type === 'INITIAL' ? 'default' : 'secondary'} className="shrink-0 w-fit">
            {report.report_type === 'INITIAL' ? 'Initial' : 'Follow-up'}
          </Badge>
          {report.reported_to_authorities ? (
            <Badge variant="default" className="shrink-0 w-fit gap-1">
              <CheckCircle2 className="h-3 w-3" /> Reported
            </Badge>
          ) : report.severity === 'SEVERE' ? (
            <Badge variant="destructive" className="shrink-0 w-fit gap-1">
              <AlertTriangle className="h-3 w-3" /> Not Reported
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 w-fit gap-1">
              <Clock className="h-3 w-3" /> Pending
            </Badge>
          )}
        </div>
      </div>

      {/* Severe AEFI Alert */}
      {report.severity === 'SEVERE' && !report.reported_to_authorities && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Severe AEFI must be reported to national authorities within 24 hours of detection.</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* PRINTABLE MOH FORM CONTENT */}
      {/* ================================================================= */}
      <div className="print-aefi-form">

        {/* Section 1: Patient Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">1. Patient Details</CardTitle>
              <HelpPopover content="Patient information from the immunization record. Required by MOH AEFI Reporting Form Section 1." />
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="Name" value={report.patient_name} />
              <Field label="MRN" value={report.patient_mrn} />
              <Field label="Gender" value={report.patient_gender} />
              <Field label="Date of Birth" value={formatDate(report.patient_date_of_birth)} />
              {report.guardian_name && (
                <Field label="Guardian" value={report.guardian_name} />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Section 2: Vaccination Centre */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">2. Vaccination Centre</CardTitle>
              <HelpPopover content="Facility details auto-populated from the vaccination record. Required by MOH AEFI Reporting Form Section 2." />
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Centre Name" value={report.vaccination_centre_name} />
              <Field label="MFL Code" value={report.institution_mfl_code} />
              <Field
                label="Service Type"
                value={
                  report.vaccination_service_type === 'STATIC'
                    ? 'Static (Facility)'
                    : report.vaccination_service_type === 'MASS'
                      ? 'Mass Campaign'
                      : report.vaccination_service_type === 'OUTREACH'
                        ? 'Outreach'
                        : '—'
                }
              />
            </dl>
          </CardContent>
        </Card>

        {/* Section 3: Type of AEFI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">3. Type of AEFI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {report.event_types.map((t) => (
                <Badge key={t} variant="outline" className="text-sm">
                  {eventTypeLabels[t] || t}
                </Badge>
              ))}
            </div>
            {report.other_event_type_detail && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Other detail: </span>
                {report.other_event_type_detail}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Section 4: Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">4. Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
              <Field label="Event Date" value={formatDate(report.event_date)} />
              <Field label="Onset Time" value={report.onset_time || '—'} />
              <Field
                label="Severity"
                value={
                  <Badge className={`${severityColors[report.severity]} mt-0.5`}>
                    {report.severity}
                  </Badge>
                }
              />
            </dl>
            <div>
              <dt className="text-xs text-muted-foreground">Description / Timeline</dt>
              <dd className="text-sm mt-1 whitespace-pre-wrap">{report.description || '—'}</dd>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Suspected Vaccine */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">5. Suspected Vaccine</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="Vaccine" value={report.vaccine_name} />
              <Field label="Dose" value={`Dose ${vd.dose_number}`} />
              <Field label="Date Given" value={vd.administered_date ? formatDate(vd.administered_date) : '—'} />
              <Field label="Route / Site" value={`${vd.route || '—'} / ${vd.site || '—'}`} />
              <Field label="Batch Number" value={vd.batch_number} />
              <Field label="Manufacturer" value={vd.vaccine_manufacturer} />
              <Field label="Expiry Date" value={vd.expiry_date ? formatDate(vd.expiry_date) : '—'} />
            </dl>
            {(vd.diluent_batch_number || vd.diluent_manufacturer) && (
              <>
                <hr className="my-3" />
                <p className="text-xs text-muted-foreground mb-2 font-medium">Diluent Details</p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <Field label="Diluent Batch" value={vd.diluent_batch_number} />
                  <Field label="Diluent Manufacturer" value={vd.diluent_manufacturer} />
                  <Field label="Diluent Expiry" value={vd.diluent_expiry_date ? formatDate(vd.diluent_expiry_date) : '—'} />
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        {/* Section 6: Past Medical History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">6. Past Medical History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {report.past_medical_history_notes || 'None recorded.'}
            </p>
          </CardContent>
        </Card>

        {/* Section 7: Action Taken */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">7. Action Taken</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <Field
                label="Treatment Given"
                value={report.treatment_given ? 'Yes' : 'No'}
              />
              {report.treatment_given && (
                <Field label="Treatment Details" value={report.treatment_details} />
              )}
              <Field
                label="Specimen Collected"
                value={report.specimen_collected ? 'Yes' : 'No'}
              />
              {report.specimen_collected && (
                <Field label="Specimen Type" value={report.specimen_type} />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Section 8: Outcome */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">8. Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${outcomeColors[report.outcome]}`}>
              {outcomeLabels[report.outcome]}
            </Badge>
          </CardContent>
        </Card>

        {/* Section 9: Reporter & Reporting */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">9. Reporter</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Reported By" value={report.reported_by_name || '—'} />
              <Field label="Designation" value={report.reported_by_designation} />
              <Field label="Report Created" value={formatDateTime(report.created_at)} />
              {report.reported_to_authorities && (
                <Field label="Submitted to Authorities" value={formatDateTime(report.report_date || '')} />
              )}
              {report.dhis2_submitted_at && (
                <Field label="DHIS2 Submitted" value={formatDateTime(report.dhis2_submitted_at)} />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Investigation Notes (if any) */}
        {report.investigation_notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Investigation</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Investigated By" value={report.investigated_by_name || '—'} />
                <Field label="National Classification" value={report.national_classification} />
              </dl>
              <div className="mt-3">
                <dt className="text-xs text-muted-foreground">Investigation Notes</dt>
                <dd className="text-sm mt-1 whitespace-pre-wrap">{report.investigation_notes}</dd>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Follow-up chain */}
        {report.follow_up_count > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">
                Follow-up Reports ({report.follow_up_count})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This initial report has {report.follow_up_count} follow-up report(s).
                View them from the AEFI list filtered by this record.
              </p>
            </CardContent>
          </Card>
        )}

        {report.parent_report && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Parent Report</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={() => router.push(`/immunizations/aefi/${report.parent_report}`)}
              >
                <FileText className="h-4 w-4 mr-1" />
                View Initial Report #{report.parent_report}
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
      {/* END PRINTABLE FORM CONTENT */}

      {/* ================================================================= */}
      {/* DIALOGS */}
      {/* ================================================================= */}

      {/* Submit to Authorities Dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Submit to Authorities</DialogTitle>
              <HelpPopover content="Marks this AEFI report as submitted to national health authorities. This triggers DHIS2 AEFI Tracker submission. Once submitted, this action cannot be undone." />
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will mark the AEFI report as submitted and trigger a DHIS2 AEFI Tracker submission.
            </p>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                placeholder="Any additional notes for the submission..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSubmit(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirm Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Follow-up Dialog */}
      <Dialog open={showFollowUp} onOpenChange={setShowFollowUp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Create Follow-up Report</DialogTitle>
              <HelpPopover content="Create a follow-up AEFI report linked to this initial report. Used to update the patient's condition, treatment, and outcome over time." />
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Updated Severity</Label>
              <Select value={fuSeverity} onValueChange={(v) => setFuSeverity(v as AEFISeverity)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select severity (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Updated Outcome</Label>
              <Select value={fuOutcome} onValueChange={(v) => setFuOutcome(v as AEFIOutcome)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={fuTreatmentGiven} onCheckedChange={setFuTreatmentGiven} />
              <Label>Treatment given</Label>
            </div>
            {fuTreatmentGiven && (
              <div>
                <Label>Treatment Details</Label>
                <Textarea
                  value={fuTreatmentDetails}
                  onChange={(e) => setFuTreatmentDetails(e.target.value)}
                  placeholder="Describe treatment..."
                  rows={2}
                />
              </div>
            )}
            <div>
              <Label>Follow-up Notes</Label>
              <Textarea
                value={fuNotes}
                onChange={(e) => setFuNotes(e.target.value)}
                placeholder="Updates on patient condition, new findings..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFollowUp(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  followUpMutation.mutate({
                    notes: fuNotes || undefined,
                    severity: fuSeverity || undefined,
                    outcome: fuOutcome || undefined,
                    treatment_given: fuTreatmentGiven || undefined,
                    treatment_details: fuTreatmentDetails || undefined,
                  })
                }
                disabled={followUpMutation.isPending}
              >
                {followUpMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create Follow-up
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
