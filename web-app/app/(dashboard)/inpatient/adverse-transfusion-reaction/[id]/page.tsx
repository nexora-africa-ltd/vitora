'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Printer,
  Send,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/lib/hooks/use-toast';
import { useAuth } from '@/lib/auth/context';
import {
  useATRReport,
  useSubmitATRToPPB,
  useAcknowledgeATR,
} from '@/lib/hooks/use-inpatient';
import { printATRForm } from '@/lib/documents/print-atr-form';
import type { ATRStatus } from '@/lib/types/inpatient';

const STATUS_STYLES: Record<ATRStatus, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  SUBMITTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  ACKNOWLEDGED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

function VitalsRow({ label, bp, temp, pulse, rr }: {
  label: string;
  bp?: string;
  temp?: string | null;
  pulse?: number | null;
  rr?: number | null;
}) {
  if (!bp && !temp && !pulse && !rr) return null;
  return (
    <tr>
      <td className="font-medium py-1 pr-4">{label}</td>
      <td className="py-1 pr-4">{bp || '—'}</td>
      <td className="py-1 pr-4">{temp ? `${temp}°C` : '—'}</td>
      <td className="py-1 pr-4">{pulse ?? '—'}</td>
      <td className="py-1">{rr ?? '—'}</td>
    </tr>
  );
}

export default function ATRDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: atr, isLoading, error } = useATRReport(parseInt(id, 10));
  const submitMutation = useSubmitATRToPPB();
  const acknowledgeMutation = useAcknowledgeATR();

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitterName, setSubmitterName] = useState(() =>
    user ? `${user.first_name} ${user.last_name}`.trim() : ''
  );
  const [submitterCadre, setSubmitterCadre] = useState(() => user?.role_display || '');
  const [submitterMobile, setSubmitterMobile] = useState(() => user?.phone_number || '');
  const [submitterEmail, setSubmitterEmail] = useState(() => user?.email || '');

  // Fill empty submitter fields when user profile syncs (handles stale localStorage)
  useEffect(() => {
    if (user) {
      const fullName = `${user.first_name} ${user.last_name}`.trim();
      if (fullName) setSubmitterName((prev) => prev || fullName);
      if (user.role_display) setSubmitterCadre((prev) => prev || user.role_display!);
      if (user.phone_number) setSubmitterMobile((prev) => prev || user.phone_number!);
      if (user.email) setSubmitterEmail((prev) => prev || user.email);
    }
  }, [user]);

  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [adrNumber, setAdrNumber] = useState('');
  const [vigiflowNumber, setVigiflowNumber] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !atr) {
    return (
      <div className="p-6">
        <PageHeader title="ATR Report" />
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            ATR report not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleSubmitToPPB() {
    if (!atr) return;
    submitMutation.mutate(
      {
        id: atr.id,
        data: {
          ppb_submitter_name: submitterName || undefined,
          ppb_submitter_cadre: submitterCadre || undefined,
          ppb_submitter_mobile: submitterMobile || undefined,
          ppb_submitter_email: submitterEmail || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Submitted to PPB', description: 'ATR report has been submitted.' });
          setShowSubmitDialog(false);
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to submit.', variant: 'destructive' });
        },
      }
    );
  }

  function handleAcknowledge() {
    if (!atr || !adrNumber) return;
    acknowledgeMutation.mutate(
      {
        id: atr.id,
        data: {
          adr_report_number: adrNumber,
          vigiflow_entry_number: vigiflowNumber || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Acknowledged', description: 'PPB acknowledgment recorded.' });
          setShowAcknowledgeDialog(false);
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to record acknowledgment.', variant: 'destructive' });
        },
      }
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`ATR Report #${atr.id}`}
        helpContent="View adverse transfusion reaction details and manage PPB submission. Print the MOH/PPB form for physical submission."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => printATRForm(atr)}>
              <Printer className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Print MOH Form</span>
              <span className="sm:hidden">Print</span>
            </Button>
            {atr.status === 'DRAFT' && (
              <Button size="sm" onClick={() => setShowSubmitDialog(true)}>
                <Send className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Submit to PPB</span>
                <span className="sm:hidden">Submit</span>
              </Button>
            )}
            {atr.status === 'SUBMITTED' && (
              <Button size="sm" variant="outline" onClick={() => setShowAcknowledgeDialog(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Record Acknowledgment
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {atr.patient_name}
            <span className="text-muted-foreground"> &bull; {atr.patient_mrn}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {atr.blood_product_display} &bull; Unit: {atr.blood_unit_number} &bull; {atr.amount_ml}ml
          </p>
        </div>
        <Badge className={`shrink-0 w-fit self-start sm:self-auto ${STATUS_STYLES[atr.status]}`}>
          {atr.status_display || atr.status}
        </Badge>
      </div>

      {/* Alert for missing lab investigation */}
      {atr.status === 'DRAFT' && !atr.has_lab_investigation && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            Lab investigation is not yet complete. The transfusion manager should complete section 4 before submission to PPB.
          </p>
        </div>
      )}

      {/* Reaction Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reaction Information</CardTitle>
        </CardHeader>
        <CardContent>
          {atr.reaction_categories_display && atr.reaction_categories_display.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {atr.reaction_categories_display.map((label) => (
                <Badge key={label} variant="secondary">{label}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No reactions recorded.</p>
          )}
          {atr.other_reactions && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Others:</span> {atr.other_reactions}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vital Signs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vital Signs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[400px] text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-1 pr-4">Timing</th>
                <th className="text-left py-1 pr-4">BP</th>
                <th className="text-left py-1 pr-4">Temp</th>
                <th className="text-left py-1 pr-4">Pulse</th>
                <th className="text-left py-1">RR</th>
              </tr>
            </thead>
            <tbody>
              <VitalsRow
                label="At Start"
                bp={atr.vitals_at_start_bp}
                temp={atr.vitals_at_start_temp}
                pulse={atr.vitals_at_start_pulse}
                rr={atr.vitals_at_start_rr}
              />
              <VitalsRow
                label="During (15 min)"
                bp={atr.vitals_during_bp}
                temp={atr.vitals_during_temp}
                pulse={atr.vitals_during_pulse}
                rr={atr.vitals_during_rr}
              />
              <VitalsRow
                label="At Stop"
                bp={atr.vitals_at_stop_bp}
                temp={atr.vitals_at_stop_temp}
                pulse={atr.vitals_at_stop_pulse}
                rr={atr.vitals_at_stop_rr}
              />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Patient History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Patient History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {atr.pre_transfusion_hb && (
            <p><span className="font-medium">Pre-Transfusion Hb:</span> {atr.pre_transfusion_hb} g/dL</p>
          )}
          <p><span className="font-medium">Obstetric Status:</span> {atr.obstetric_status === 'NA' ? 'N/A' : atr.obstetric_status}
            {atr.gravida != null && ` G${atr.gravida}`}
            {atr.para != null && ` P${atr.para}`}
          </p>
          <p><span className="font-medium">Previous Transfusion:</span> {atr.previous_transfusion ? 'Yes' : 'No'}
            {atr.previous_transfusion_comment && ` — ${atr.previous_transfusion_comment}`}
          </p>
          <p><span className="font-medium">Previous Reactions:</span> {atr.previous_reactions ? 'Yes' : 'No'}
            {atr.previous_reactions_comment && ` — ${atr.previous_reactions_comment}`}
          </p>
          {atr.current_medications && (
            <p><span className="font-medium">Current Medications:</span> {atr.current_medications}</p>
          )}
        </CardContent>
      </Card>

      {/* Lab Investigation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Lab Investigation
            {atr.has_lab_investigation ? (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 h-3 w-3" /> Pending
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!atr.has_lab_investigation ? (
            <p className="text-muted-foreground">
              Lab investigation has not been completed yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {atr.recipient_supernatant_hemolysis && (
                <p><span className="font-medium">Recipient Hemolysis:</span> {atr.recipient_supernatant_hemolysis}
                  {atr.recipient_hemolysis_severity && ` (${atr.recipient_hemolysis_severity})`}
                </p>
              )}
              {atr.recipient_agglutination && (
                <p><span className="font-medium">Agglutination:</span> {atr.recipient_agglutination}</p>
              )}
              {atr.donor_supernatant_hemolysis && (
                <p><span className="font-medium">Donor Hemolysis:</span> {atr.donor_supernatant_hemolysis}</p>
              )}
              {atr.compatibility_saline_rt && (
                <p><span className="font-medium">Saline RT:</span> {atr.compatibility_saline_rt}</p>
              )}
              {atr.compatibility_ahg && (
                <p><span className="font-medium">AHG:</span> {atr.compatibility_ahg}</p>
              )}
              {atr.evaluation_diagnosis && (
                <p className="sm:col-span-2"><span className="font-medium">Evaluation Diagnosis:</span> {atr.evaluation_diagnosis}</p>
              )}
              {atr.reaction_related_to_transfusion && (
                <p><span className="font-medium">Reaction Related:</span> {atr.reaction_related_to_transfusion}</p>
              )}
              {atr.urinalysis && (
                <p><span className="font-medium">Urinalysis:</span> {atr.urinalysis}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PPB Tracking */}
      {(atr.status === 'SUBMITTED' || atr.status === 'ACKNOWLEDGED') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> PPB Submission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {atr.ppb_submitter_name && <p><span className="font-medium">Submitted by:</span> {atr.ppb_submitter_name}</p>}
            {atr.submission_date && <p><span className="font-medium">Submission Date:</span> {atr.submission_date}</p>}
            {atr.adr_report_number && <p><span className="font-medium">ADR Report #:</span> {atr.adr_report_number}</p>}
            {atr.vigiflow_entry_number && <p><span className="font-medium">Vigiflow #:</span> {atr.vigiflow_entry_number}</p>}
            {atr.ppb_date_received && <p><span className="font-medium">PPB Received:</span> {atr.ppb_date_received}</p>}
          </CardContent>
        </Card>
      )}

      {/* Submit to PPB Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit ATR Report to PPB</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ppb-name">Submitter Name</Label>
              <Input id="ppb-name" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ppb-cadre">Cadre</Label>
              <Input id="ppb-cadre" value={submitterCadre} onChange={(e) => setSubmitterCadre(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ppb-mobile">Mobile</Label>
                <Input id="ppb-mobile" value={submitterMobile} onChange={(e) => setSubmitterMobile(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ppb-email">Email</Label>
                <Input id="ppb-email" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitToPPB} disabled={submitMutation.isPending}>
              {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record PPB Acknowledgment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adr-number">ADR Report Number *</Label>
              <Input
                id="adr-number"
                placeholder="e.g. ADR/2026/0451"
                value={adrNumber}
                onChange={(e) => setAdrNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vigiflow-number">Vigiflow Entry Number</Label>
              <Input
                id="vigiflow-number"
                placeholder="e.g. VF-KE-2026-00123"
                value={vigiflowNumber}
                onChange={(e) => setVigiflowNumber(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcknowledgeDialog(false)}>Cancel</Button>
            <Button onClick={handleAcknowledge} disabled={!adrNumber || acknowledgeMutation.isPending}>
              {acknowledgeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Acknowledgment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
