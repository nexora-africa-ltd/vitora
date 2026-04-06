'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Loader2,
  Printer,
  RefreshCw,
  Send,
  TestTube,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  useUpdateATRLabInvestigation,
  useRequestATRLabInvestigation,
  useSyncATRLabResults,
} from '@/lib/hooks/use-inpatient';
import { printATRForm } from '@/lib/documents/print-atr-form';
import type { ATRStatus, ATRLabInvestigation } from '@/lib/types/inpatient';

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
  const labMutation = useUpdateATRLabInvestigation();
  const requestLabMutation = useRequestATRLabInvestigation();
  const syncLabMutation = useSyncATRLabResults();

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

  // Lab investigation dialog state
  const [showLabDialog, setShowLabDialog] = useState(false);
  const [labData, setLabData] = useState<ATRLabInvestigation>({});

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

  function openLabDialog() {
    if (!atr) return;
    // Pre-populate with existing values
    setLabData({
      recipient_supernatant_hemolysis: (atr.recipient_supernatant_hemolysis || '') as ATRLabInvestigation['recipient_supernatant_hemolysis'],
      recipient_hemolysis_severity: (atr.recipient_hemolysis_severity || '') as ATRLabInvestigation['recipient_hemolysis_severity'],
      recipient_agglutination: (atr.recipient_agglutination || '') as ATRLabInvestigation['recipient_agglutination'],
      haematological_results: atr.haematological_results ?? {},
      blood_film_rbc: atr.blood_film_rbc || '',
      blood_film_wbc: atr.blood_film_wbc || '',
      blood_film_plt: atr.blood_film_plt || '',
      donor_supernatant_hemolysis: (atr.donor_supernatant_hemolysis || '') as ATRLabInvestigation['donor_supernatant_hemolysis'],
      donor_pack_age: atr.donor_pack_age || '',
      culture_donor_pack_results: atr.culture_donor_pack_results || '',
      culture_recipient_blood_results: atr.culture_recipient_blood_results || '',
      compatibility_saline_rt: (atr.compatibility_saline_rt || '') as ATRLabInvestigation['compatibility_saline_rt'],
      compatibility_saline_37: (atr.compatibility_saline_37 || '') as ATRLabInvestigation['compatibility_saline_37'],
      compatibility_ahg: (atr.compatibility_ahg || '') as ATRLabInvestigation['compatibility_ahg'],
      compatibility_albumin_37: (atr.compatibility_albumin_37 || '') as ATRLabInvestigation['compatibility_albumin_37'],
      enzyme_treated_cells_result: atr.enzyme_treated_cells_result || '',
      anti_a_titres: atr.anti_a_titres || '',
      anti_b_titres: atr.anti_b_titres || '',
      urinalysis: atr.urinalysis || '',
      evaluation_diagnosis: atr.evaluation_diagnosis || '',
      reaction_related_to_transfusion: (atr.reaction_related_to_transfusion || '') as ATRLabInvestigation['reaction_related_to_transfusion'],
    });
    setShowLabDialog(true);
  }

  function updateLabField(field: keyof ATRLabInvestigation, value: string) {
    setLabData((prev) => ({ ...prev, [field]: value } as ATRLabInvestigation));
  }

  function updateHaemResult(field: string, value: string) {
    setLabData((prev) => ({
      ...prev,
      haematological_results: { ...(prev.haematological_results ?? {}), [field]: value },
    }));
  }

  function handleSaveLabInvestigation() {
    if (!atr) return;
    labMutation.mutate(
      { id: atr.id, data: labData },
      {
        onSuccess: () => {
          toast({ title: 'Lab Investigation Saved', description: 'Lab results have been recorded.' });
          setShowLabDialog(false);
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to save lab investigation.', variant: 'destructive' });
        },
      }
    );
  }

  function handleRequestLabInvestigation() {
    if (!atr) return;
    requestLabMutation.mutate(atr.id, {
      onSuccess: () => {
        toast({ title: 'Lab Order Created', description: 'A STAT lab order has been submitted for CBC, Blood Culture, and Urinalysis.' });
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to create lab order.', variant: 'destructive' });
      },
    });
  }

  function handleSyncLabResults() {
    if (!atr) return;
    syncLabMutation.mutate(atr.id, {
      onSuccess: () => {
        toast({ title: 'Results Synced', description: 'Verified lab results have been pulled into this report.' });
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to sync lab results.', variant: 'destructive' });
      },
    });
  }

  const hasLabOrder = !!atr.lab_order_number;
  const labOrderCompleted = atr.lab_order_status === 'COMPLETED';
  const canRequestLab = !hasLabOrder && (atr.status === 'DRAFT' || atr.status === 'PENDING_REVIEW');

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
            {canRequestLab && (
              <Button variant="outline" size="sm" onClick={handleRequestLabInvestigation} disabled={requestLabMutation.isPending}>
                {requestLabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                <span className="hidden sm:inline">Request Lab Investigation</span>
                <span className="sm:hidden">Order Lab</span>
              </Button>
            )}
            {hasLabOrder && labOrderCompleted && (
              <Button variant="outline" size="sm" onClick={handleSyncLabResults} disabled={syncLabMutation.isPending}>
                {syncLabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                <span className="hidden sm:inline">Sync Lab Results</span>
                <span className="sm:hidden">Sync</span>
              </Button>
            )}
            {(atr.status === 'DRAFT' || atr.status === 'PENDING_REVIEW') && (
              <Button variant="outline" size="sm" onClick={openLabDialog}>
                <FlaskConical className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{hasLabOrder ? 'Complete Remaining Fields' : atr.has_lab_investigation ? 'Edit Lab Investigation' : 'Enter Manually'}</span>
                <span className="sm:hidden">Manual</span>
              </Button>
            )}
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

      {/* Lab Order Status Banner */}
      {hasLabOrder && (
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${
          labOrderCompleted
            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
            : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
        }`}>
          <TestTube className={`h-5 w-5 shrink-0 ${labOrderCompleted ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
          <div className="flex-1 min-w-0">
            <div className={`text-sm ${labOrderCompleted ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300'}`}>
              Lab Order <a href={`/laboratory/orders/${atr.lab_order_number}`} className="font-medium underline underline-offset-2">{atr.lab_order_number}</a>
              {' — '}
              <Badge variant="outline" className="text-xs ml-1">{atr.lab_order_status?.replace(/_/g, ' ')}</Badge>
            </div>
            {labOrderCompleted && !atr.has_lab_investigation && (
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                Lab order is complete. Click &ldquo;Sync Lab Results&rdquo; to pull results into this report.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Alert for missing lab investigation */}
      {atr.status === 'DRAFT' && !atr.has_lab_investigation && !hasLabOrder && (
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
        <CardContent className="space-y-4 text-sm">
          {!atr.has_lab_investigation ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-3">
                Lab investigation has not been completed yet.
              </p>
              {(atr.status === 'DRAFT' || atr.status === 'PENDING_REVIEW') && !hasLabOrder && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <Button size="sm" onClick={handleRequestLabInvestigation} disabled={requestLabMutation.isPending}>
                    {requestLabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                    Request Lab Investigation
                  </Button>
                  <span className="text-xs text-muted-foreground">or</span>
                  <Button variant="outline" size="sm" onClick={openLabDialog}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Enter Manually
                  </Button>
                </div>
              )}
              {hasLabOrder && !labOrderCompleted && (
                <p className="text-sm text-muted-foreground">
                  Awaiting results from lab order {atr.lab_order_number}.
                </p>
              )}
              {hasLabOrder && labOrderCompleted && (
                <Button size="sm" onClick={handleSyncLabResults} disabled={syncLabMutation.isPending}>
                  {syncLabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sync Lab Results
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* 1. Recipient's blood supernatant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {atr.recipient_supernatant_hemolysis && (
                  <p><span className="font-medium">Recipient Hemolysis:</span> {atr.recipient_supernatant_hemolysis}
                    {atr.recipient_hemolysis_severity && ` (${atr.recipient_hemolysis_severity})`}
                  </p>
                )}
                {atr.recipient_agglutination && (
                  <p><span className="font-medium">Agglutination:</span> {atr.recipient_agglutination}</p>
                )}
              </div>

              {/* 3. Haematological results */}
              {atr.haematological_results && Object.keys(atr.haematological_results).length > 0 && (
                <div>
                  <p className="font-medium mb-1">Haematological Results:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/50 rounded-md p-2">
                    {(['wbc', 'hb', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'plt'] as const).map((key) => (
                      atr.haematological_results?.[key] ? (
                        <span key={key}><span className="font-medium uppercase">{key}:</span> {atr.haematological_results[key]}</span>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              {/* Blood film */}
              {(atr.blood_film_rbc || atr.blood_film_wbc || atr.blood_film_plt) && (
                <div>
                  <p className="font-medium mb-1">Blood Film:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-muted/50 rounded-md p-2">
                    {atr.blood_film_rbc && <span><span className="font-medium">RBC:</span> {atr.blood_film_rbc}</span>}
                    {atr.blood_film_wbc && <span><span className="font-medium">WBC:</span> {atr.blood_film_wbc}</span>}
                    {atr.blood_film_plt && <span><span className="font-medium">PLT:</span> {atr.blood_film_plt}</span>}
                  </div>
                </div>
              )}

              {/* 4-7: Donor investigations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {atr.donor_supernatant_hemolysis && (
                  <p><span className="font-medium">Donor Hemolysis:</span> {atr.donor_supernatant_hemolysis}</p>
                )}
                {atr.donor_pack_age && (
                  <p><span className="font-medium">Donor Pack Age:</span> {atr.donor_pack_age}</p>
                )}
                {atr.culture_donor_pack_results && (
                  <p><span className="font-medium">Culture (Donor Pack):</span> {atr.culture_donor_pack_results}</p>
                )}
                {atr.culture_recipient_blood_results && (
                  <p><span className="font-medium">Culture (Recipient Blood):</span> {atr.culture_recipient_blood_results}</p>
                )}
              </div>

              {/* 8. Compatibility testing */}
              {(atr.compatibility_saline_rt || atr.compatibility_saline_37 || atr.compatibility_ahg || atr.compatibility_albumin_37) && (
                <div>
                  <p className="font-medium mb-1">Compatibility Testing:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {atr.compatibility_saline_rt && <span><span className="font-medium">Saline RT:</span> {atr.compatibility_saline_rt}</span>}
                    {atr.compatibility_saline_37 && <span><span className="font-medium">Saline 37°C:</span> {atr.compatibility_saline_37}</span>}
                    {atr.compatibility_ahg && <span><span className="font-medium">AHG:</span> {atr.compatibility_ahg}</span>}
                    {atr.compatibility_albumin_37 && <span><span className="font-medium">Albumin 37°C:</span> {atr.compatibility_albumin_37}</span>}
                  </div>
                </div>
              )}

              {/* 9-13: Extended investigation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {atr.enzyme_treated_cells_result && (
                  <p><span className="font-medium">Enzyme-treated Cells:</span> {atr.enzyme_treated_cells_result}</p>
                )}
                {(atr.anti_a_titres || atr.anti_b_titres) && (
                  <p><span className="font-medium">Titres:</span> Anti-A: {atr.anti_a_titres || '—'}, Anti-B: {atr.anti_b_titres || '—'}</p>
                )}
                {atr.urinalysis && (
                  <p><span className="font-medium">Urinalysis:</span> {atr.urinalysis}</p>
                )}
                {atr.evaluation_diagnosis && (
                  <p className="sm:col-span-2"><span className="font-medium">Evaluation Diagnosis:</span> {atr.evaluation_diagnosis}</p>
                )}
                {atr.reaction_related_to_transfusion && (
                  <p><span className="font-medium">Reaction Related to Transfusion:</span> {atr.reaction_related_to_transfusion}</p>
                )}
              </div>
            </>
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

      {/* Lab Investigation Dialog */}
      <Dialog open={showLabDialog} onOpenChange={setShowLabDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lab Investigation — Transfusion Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* 1. Recipient's blood supernatant */}
            <div>
              <h4 className="text-sm font-semibold mb-3">1. Recipient&apos;s Blood Supernatant</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hemolysis</Label>
                  <Select value={labData.recipient_supernatant_hemolysis || ''} onValueChange={(v) => updateLabField('recipient_supernatant_hemolysis', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESENT">Present</SelectItem>
                      <SelectItem value="ABSENT">Absent</SelectItem>
                      <SelectItem value="EQUIVOCAL">Equivocal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {labData.recipient_supernatant_hemolysis === 'PRESENT' && (
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select value={labData.recipient_hemolysis_severity || ''} onValueChange={(v) => updateLabField('recipient_hemolysis_severity', v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MILD">Mild</SelectItem>
                        <SelectItem value="MODERATE">Moderate</SelectItem>
                        <SelectItem value="MARKED">Marked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Recipient agglutination */}
            <div>
              <h4 className="text-sm font-semibold mb-3">2. Recipient&apos;s Blood Agglutination</h4>
              <Select value={labData.recipient_agglutination || ''} onValueChange={(v) => updateLabField('recipient_agglutination', v)}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 3. Haematological results */}
            <div>
              <h4 className="text-sm font-semibold mb-3">3. Haematological Results</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['wbc', 'hb', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'plt'] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs uppercase">{key}</Label>
                    <Input
                      placeholder="—"
                      value={labData.haematological_results?.[key] || ''}
                      onChange={(e) => updateHaemResult(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Film RBC</Label>
                  <Input value={labData.blood_film_rbc || ''} onChange={(e) => updateLabField('blood_film_rbc', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Film WBC</Label>
                  <Input value={labData.blood_film_wbc || ''} onChange={(e) => updateLabField('blood_film_wbc', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Film PLT</Label>
                  <Input value={labData.blood_film_plt || ''} onChange={(e) => updateLabField('blood_film_plt', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 4-7: Donor investigations */}
            <div>
              <h4 className="text-sm font-semibold mb-3">4-7. Donor Investigations</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Donor Supernatant Hemolysis</Label>
                  <Select value={labData.donor_supernatant_hemolysis || ''} onValueChange={(v) => updateLabField('donor_supernatant_hemolysis', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRESENT">Present</SelectItem>
                      <SelectItem value="ABSENT">Absent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Age of Donor Pack</Label>
                  <Input value={labData.donor_pack_age || ''} onChange={(e) => updateLabField('donor_pack_age', e.target.value)} placeholder="e.g. 14 days" />
                </div>
                <div className="space-y-2">
                  <Label>Culture: Donor Pack Results</Label>
                  <Textarea rows={2} value={labData.culture_donor_pack_results || ''} onChange={(e) => updateLabField('culture_donor_pack_results', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Culture: Recipient Blood Results</Label>
                  <Textarea rows={2} value={labData.culture_recipient_blood_results || ''} onChange={(e) => updateLabField('culture_recipient_blood_results', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 8. Compatibility testing */}
            <div>
              <h4 className="text-sm font-semibold mb-3">8. Compatibility Testing</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['compatibility_saline_rt', 'Saline RT'],
                  ['compatibility_saline_37', 'Saline 37°C'],
                  ['compatibility_ahg', 'AHG'],
                  ['compatibility_albumin_37', 'Albumin 37°C'],
                ] as [keyof ATRLabInvestigation, string][]).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Select value={(labData[field] as string) || ''} onValueChange={(v) => updateLabField(field, v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMPATIBLE">Compatible</SelectItem>
                        <SelectItem value="INCOMPATIBLE">Incompatible</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* 9. Enzyme-treated cells */}
            <div className="space-y-2">
              <Label>9. Enzyme-treated Cells Result</Label>
              <Textarea rows={2} value={labData.enzyme_treated_cells_result || ''} onChange={(e) => updateLabField('enzyme_treated_cells_result', e.target.value)} />
            </div>

            {/* 10. Anti-A / Anti-B titres */}
            <div>
              <h4 className="text-sm font-semibold mb-3">10. Anti-A / Anti-B Titres (Group O → A/B/AB)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Anti-A Titres</Label>
                  <Input value={labData.anti_a_titres || ''} onChange={(e) => updateLabField('anti_a_titres', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Anti-B Titres</Label>
                  <Input value={labData.anti_b_titres || ''} onChange={(e) => updateLabField('anti_b_titres', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 11. Urinalysis */}
            <div className="space-y-2">
              <Label>11. Urinalysis</Label>
              <Textarea rows={2} value={labData.urinalysis || ''} onChange={(e) => updateLabField('urinalysis', e.target.value)} />
            </div>

            {/* 12. Evaluation diagnosis */}
            <div className="space-y-2">
              <Label>12. Evaluation: Diagnosis</Label>
              <Textarea rows={2} value={labData.evaluation_diagnosis || ''} onChange={(e) => updateLabField('evaluation_diagnosis', e.target.value)} placeholder="e.g. Febrile non-hemolytic transfusion reaction" />
            </div>

            {/* 13. Causality */}
            <div className="space-y-2">
              <Label>13. Was the adverse reaction related to transfusion?</Label>
              <Select value={labData.reaction_related_to_transfusion || ''} onValueChange={(v) => updateLabField('reaction_related_to_transfusion', v)}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                  <SelectItem value="INCONCLUSIVE">Inconclusive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveLabInvestigation} disabled={labMutation.isPending}>
              {labMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Lab Investigation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
