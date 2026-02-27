/**
 * Social Work Case Detail
 * Shows full case information with notes and interventions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Calendar,
  User,
  Shield,
  AlertTriangle,
  FileText,
  CheckCircle,
  Pause,
  Play,
  XCircle,
  Edit,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import {
  useSWCase,
  useSWReferral,
  useCaseNotes,
  useInterventions,
  useUpdateSWCase,
  useCloseSWCase,
} from '@/lib/hooks/use-social-work';
import {
  REFERRAL_REASON_LABELS,
  CASE_STATUS_CONFIG,
  URGENCY_CONFIG,
  SENSITIVE_REASONS,
  type SWReferralReason,
} from '@/lib/types/social-work';
import { useToast } from '@/lib/hooks/use-toast';
import { SensitiveCaseBanner } from './sensitive-case-banner';

interface SWCaseDetailProps {
  caseId: number;
}

export function SWCaseDetail({ caseId }: SWCaseDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const { data: swCase, isLoading, error } = useSWCase(caseId);
  const { data: referral } = useSWReferral(swCase?.referral_id);
  const { data: notesData, isLoading: notesLoading } = useCaseNotes({ case_id: caseId });
  const { data: interventionsData, isLoading: interventionsLoading } = useInterventions({ case_id: caseId });

  const updateMutation = useUpdateSWCase();
  const closeMutation = useCloseSWCase();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !swCase) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load case details
      </div>
    );
  }

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'activate':
          await updateMutation.mutateAsync({ id: caseId, data: { status: 'IN_PROGRESS' } });
          toast({ title: 'Case activated' });
          break;
        case 'hold':
          await updateMutation.mutateAsync({ id: caseId, data: { status: 'ON_HOLD' } });
          toast({ title: 'Case placed on hold' });
          break;
        case 'close':
          await closeMutation.mutateAsync({ id: caseId, closureReason: 'RESOLVED' });
          toast({ title: 'Case closed' });
          break;
      }
    } catch (err) {
      toast({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
    setConfirmAction(null);
  };

  const statusConfig = CASE_STATUS_CONFIG[swCase.status as keyof typeof CASE_STATUS_CONFIG];
  const urgencyConfig = URGENCY_CONFIG[swCase.urgency as keyof typeof URGENCY_CONFIG];
  const referralReason = swCase.referral.referral_reason;
  const isSensitive =
    swCase.is_sensitive ||
    SENSITIVE_REASONS.includes(referralReason as SWReferralReason);

  const canActivate = ['OPEN', 'ON_HOLD'].includes(swCase.status);
  const canHold = ['OPEN', 'IN_PROGRESS'].includes(swCase.status);
  const canClose = !swCase.status.startsWith('CLOSED');
  const canEdit = !swCase.status.startsWith('CLOSED');

  const notes = notesData?.results || [];
  const interventions = interventionsData?.results || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Case ${swCase.case_number || `#${caseId}`}`}
        helpContent="View social work case details, notes, and interventions."
      />

      {/* Sensitive Case Warning */}
      <SensitiveCaseBanner
        referralReason={referralReason}
        isSensitive={swCase.is_sensitive}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Badge variant={statusConfig?.variant} className={statusConfig?.className}>
              {statusConfig?.label || swCase.status}
            </Badge>
            <Badge variant={urgencyConfig?.variant} className={urgencyConfig?.className}>
              {urgencyConfig?.label || swCase.urgency}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Opened {format(parseISO(swCase.opened_date), 'PPP')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => router.push(`/allied-health/social-work/cases/${caseId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canActivate && (
            <Button onClick={() => setConfirmAction('activate')}>
              <Play className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {canHold && (
            <Button variant="outline" onClick={() => setConfirmAction('hold')}>
              <Pause className="h-4 w-4 mr-2" />
              Hold
            </Button>
          )}
          {canClose && (
            <Button variant="ghost" onClick={() => setConfirmAction('close')}>
              <XCircle className="h-4 w-4 mr-2" />
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Worker */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient & Case Worker
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Patient</h4>
                <p className="font-medium">{swCase.referral.patient.full_name}</p>
                <p className="text-sm text-muted-foreground">{swCase.referral.patient.mrn}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Referral Reason</h4>
                <p className="font-medium flex items-center gap-2">
                  {isSensitive && <Shield className="h-4 w-4 text-muted-foreground" />}
                  {REFERRAL_REASON_LABELS[referralReason as SWReferralReason] || referralReason}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Referred By</h4>
                <p className="font-medium">{referral?.referred_by.full_name || 'N/A'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Assigned Worker</h4>
                <p className="font-medium">
                  {swCase.assigned_worker?.full_name || 'Not assigned'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Presenting Issues */}
          <Card>
            <CardHeader>
              <CardTitle>Presenting Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{referral?.presenting_problem || swCase.case_summary}</p>
            </CardContent>
          </Card>

          {/* Safety & Needs */}
          {referral?.immediate_needs && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Safety & Immediate Needs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Immediate Needs</h4>
                <p className="whitespace-pre-wrap">{referral.immediate_needs}</p>
              </CardContent>
            </Card>
          )}

          {/* Support & Planning */}
          {(swCase.assessment || swCase.goals || swCase.intervention_plan) && (
            <Card>
              <CardHeader>
                <CardTitle>Support & Planning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {swCase.assessment && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Assessment</h4>
                    <p className="whitespace-pre-wrap">{swCase.assessment}</p>
                  </div>
                )}
                {swCase.goals && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Goals</h4>
                    <p className="whitespace-pre-wrap">{swCase.goals}</p>
                  </div>
                )}
                {swCase.intervention_plan && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Intervention Plan</h4>
                    <p className="whitespace-pre-wrap">{swCase.intervention_plan}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Case Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Case Notes
                </span>
                {!swCase.status.startsWith('CLOSED') && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/allied-health/social-work/cases/${caseId}/notes/new`)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notesLoading ? (
                <LoadingSpinner />
              ) : notes.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No case notes yet</p>
              ) : (
                <div className="space-y-3">
                  {notes.slice(0, 5).map((note) => (
                    <div
                      key={note.id}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/allied-health/social-work/notes/${note.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">{note.author.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(note.created_at), 'PPp')}
                        </p>
                      </div>
                      <p className="text-sm line-clamp-2">{note.note_content}</p>
                    </div>
                  ))}
                  {notes.length > 5 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => router.push(`/allied-health/social-work/cases/${caseId}/notes`)}
                    >
                      View all {notes.length} notes
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interventions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Interventions
                </span>
                {!swCase.status.startsWith('CLOSED') && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/allied-health/social-work/cases/${caseId}/interventions/new`)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Intervention
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {interventionsLoading ? (
                <LoadingSpinner />
              ) : interventions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No interventions recorded</p>
              ) : (
                <div className="space-y-3">
                  {interventions.map((intervention) => (
                    <div
                      key={intervention.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/allied-health/social-work/interventions/${intervention.id}`)}
                    >
                      <div>
                        <p className="font-medium">{intervention.intervention_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(intervention.actual_date || intervention.planned_date), 'PPP')}
                        </p>
                      </div>
                      <Badge variant={intervention.status === 'COMPLETED' ? 'default' : 'outline'}>
                        {intervention.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Case Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Case Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusConfig?.variant} className={statusConfig?.className}>
                  {statusConfig?.label}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Urgency</span>
                <Badge variant={urgencyConfig?.variant} className={urgencyConfig?.className}>
                  {urgencyConfig?.label}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notes</span>
                <span className="font-medium">{notes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interventions</span>
                <span className="font-medium">{interventions.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* External Referrals */}
          {swCase.external_referral_status && (
            <Card>
              <CardHeader>
                <CardTitle>External Referrals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{swCase.external_referral_status}</p>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opened</span>
                <span className="text-sm">{format(parseISO(swCase.opened_date), 'PP')}</span>
              </div>
              {swCase.target_closure_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Close</span>
                  <span className="text-sm">
                    {format(parseISO(swCase.target_closure_date), 'PP')}
                  </span>
                </div>
              )}
              {swCase.actual_closure_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closed</span>
                  <span className="text-sm">
                    {format(parseISO(swCase.actual_closure_date), 'PP')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'activate' && 'Activate Case'}
              {confirmAction === 'hold' && 'Place Case on Hold'}
              {confirmAction === 'close' && 'Close Case'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'activate' &&
                'This will activate the case and mark it as in progress.'}
              {confirmAction === 'hold' &&
                'This will place the case on hold. You can reactivate it later.'}
              {confirmAction === 'close' &&
                'This will close the case. You can specify the resolution status.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
