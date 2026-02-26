/**
 * Counselling Referral Detail
 * Shows full referral information with sessions
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
  Heart,
  Shield,
  CheckCircle,
  XCircle,
  Edit,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { OrderStatusBadge, PriorityBadge, SessionProgress } from '@/components/allied-health';
import {
  useCounsellingReferral,
  useCounsellingReferralSessions,
  useAcceptCounsellingReferral,
  useRejectCounsellingReferral,
  useStartCounsellingReferral,
  useCompleteCounsellingReferral,
} from '@/lib/hooks/use-counselling';
import {
  COUNSELLING_CATEGORY_LABELS,
  MODALITY_LABELS,
  RISK_LEVEL_CONFIG,
} from '@/lib/types/counselling';
import { useToast } from '@/lib/hooks/use-toast';

interface CounsellingReferralDetailProps {
  referralId: number;
}

export function CounsellingReferralDetail({ referralId }: CounsellingReferralDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const { data: referral, isLoading, error } = useCounsellingReferral(referralId);
  const { data: sessionsData, isLoading: sessionsLoading } = useCounsellingReferralSessions(referralId);

  const acceptMutation = useAcceptCounsellingReferral();
  const rejectMutation = useRejectCounsellingReferral();
  const startMutation = useStartCounsellingReferral();
  const completeMutation = useCompleteCounsellingReferral();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !referral) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load referral details
      </div>
    );
  }

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'accept':
          await acceptMutation.mutateAsync(referralId);
          toast({ title: 'Referral accepted' });
          break;
        case 'reject':
          await rejectMutation.mutateAsync({ id: referralId });
          toast({ title: 'Referral rejected' });
          break;
        case 'start':
          await startMutation.mutateAsync(referralId);
          toast({ title: 'Counselling started' });
          break;
        case 'complete':
          await completeMutation.mutateAsync(referralId);
          toast({ title: 'Counselling completed' });
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

  const canAccept = referral.status === 'PENDING';
  const canStart = referral.status === 'APPROVED';
  const canComplete = referral.status === 'IN_PROGRESS';
  const canEdit = !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(referral.status);

  const sessions = sessionsData?.results || [];
  const completedSessions = sessions.filter(s => s.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Referral ${referral.referral_number || `#${referralId}`}`}
        helpContent="View counselling referral details, risk assessment, and session history."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={referral.status} />
            <PriorityBadge priority={referral.priority} showIcon />
            {referral.risk_level && (
              <Badge
                variant={RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.variant}
                className={RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.className}
              >
                {RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.label}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Created {format(parseISO(referral.created_at), 'PPP')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => router.push(`/allied-health/counselling/referrals/${referralId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canAccept && (
            <>
              <Button onClick={() => setConfirmAction('accept')}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button variant="destructive" onClick={() => setConfirmAction('reject')}>
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          {canStart && (
            <Button onClick={() => setConfirmAction('start')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
          {canComplete && (
            <Button onClick={() => setConfirmAction('complete')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Type */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient & Counselling Type
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Patient</h4>
                <p className="font-medium">{referral.patient?.full_name}</p>
                <p className="text-sm text-muted-foreground">{referral.patient?.mrn}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Counselling Type</h4>
                <p className="font-medium">{referral.counselling_type?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {COUNSELLING_CATEGORY_LABELS[referral.counselling_type?.category as keyof typeof COUNSELLING_CATEGORY_LABELS] || 
                   referral.counselling_type?.category}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Referred By</h4>
                <p className="font-medium">{referral.referred_by?.full_name || 'N/A'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Assigned Counsellor</h4>
                <p className="font-medium">
                  {referral.assigned_counsellor?.full_name || 'Not assigned'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Presenting Concern */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Presenting Concern
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{referral.presenting_concern}</p>
              
              {referral.background_history && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Background History</h4>
                  <p className="whitespace-pre-wrap">{referral.background_history}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-muted-foreground">Risk Level:</span>
                {referral.risk_level && (
                  <Badge
                    variant={RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.variant}
                    className={RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.className}
                  >
                    {RISK_LEVEL_CONFIG[referral.risk_level as keyof typeof RISK_LEVEL_CONFIG]?.label}
                  </Badge>
                )}
              </div>
              
              {referral.risk_assessment ? (
                <p className="whitespace-pre-wrap">{referral.risk_assessment}</p>
              ) : (
                <p className="text-muted-foreground">No risk assessment notes</p>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Sessions
                </span>
                {referral.status === 'IN_PROGRESS' && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/allied-health/counselling/referrals/${referralId}/sessions/new`)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Session
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <LoadingSpinner />
              ) : sessions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No sessions recorded yet</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/allied-health/counselling/sessions/${session.id}`)}
                    >
                      <div>
                        <p className="font-medium">Session {session.session_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(session.scheduled_date), 'PPP')}
                        </p>
                      </div>
                      <Badge variant={session.status === 'COMPLETED' ? 'default' : 'outline'}>
                        {session.status}
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
          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionProgress
                completed={completedSessions}
                total={referral.recommended_sessions}
              />
            </CardContent>
          </Card>

          {/* Session Details */}
          <Card>
            <CardHeader>
              <CardTitle>Session Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recommended</span>
                <span className="font-medium">{referral.recommended_sessions} sessions</span>
              </div>
              {referral.preferred_modality && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modality</span>
                  <span className="font-medium">
                    {MODALITY_LABELS[referral.preferred_modality as keyof typeof MODALITY_LABELS]}
                  </span>
                </div>
              )}
              {referral.counselling_type?.default_duration_minutes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{referral.counselling_type.default_duration_minutes} min</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-sm">{format(parseISO(referral.created_at), 'PP')}</span>
              </div>
              {referral.accepted_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accepted</span>
                  <span className="text-sm">{format(parseISO(referral.accepted_date), 'PP')}</span>
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
              {confirmAction === 'accept' && 'Accept Referral'}
              {confirmAction === 'reject' && 'Reject Referral'}
              {confirmAction === 'start' && 'Start Counselling'}
              {confirmAction === 'complete' && 'Complete Counselling'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'accept' &&
                'This will accept the referral and assign it for counselling services.'}
              {confirmAction === 'reject' &&
                'This will reject the referral. This action cannot be undone.'}
              {confirmAction === 'start' &&
                'This will start the counselling process and enable session recording.'}
              {confirmAction === 'complete' &&
                'This will mark the counselling as completed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              className={confirmAction === 'reject' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
