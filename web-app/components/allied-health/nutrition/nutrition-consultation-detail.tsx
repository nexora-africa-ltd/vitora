/**
 * Nutrition Consultation Detail
 * Shows full consultation information with diet plans
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  Activity,
  Scale,
  Apple,
  CheckCircle,
  XCircle,
  Edit,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { OrderStatusBadge, PriorityBadge } from '@/components/allied-health';
import {
  useNutritionConsultation,
  useApproveNutritionConsultation,
  useCompleteNutritionConsultation,
  useCancelNutritionConsultation,
} from '@/lib/hooks/use-nutrition';
import {
  REFERRAL_REASON_LABELS,
  BMI_CLASSIFICATION_CONFIG,
  MALNUTRITION_STATUS_CONFIG,
} from '@/lib/types/nutrition';
import { useToast } from '@/lib/hooks/use-toast';

interface NutritionConsultationDetailProps {
  consultationId: number;
}

export function NutritionConsultationDetail({ consultationId }: NutritionConsultationDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const { data: consultation, isLoading, error } = useNutritionConsultation(consultationId);

  const approveMutation = useApproveNutritionConsultation();
  const completeMutation = useCompleteNutritionConsultation();
  const cancelMutation = useCancelNutritionConsultation();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !consultation) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load consultation details
      </div>
    );
  }

  const handleAction = async (action: string) => {
    try {
      switch (action) {
        case 'approve':
          await approveMutation.mutateAsync(consultationId);
          toast({ title: 'Consultation approved' });
          break;
        case 'complete':
          await completeMutation.mutateAsync(consultationId);
          toast({ title: 'Consultation completed' });
          break;
        case 'cancel':
          await cancelMutation.mutateAsync({ id: consultationId });
          toast({ title: 'Consultation cancelled' });
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

  const canApprove = consultation.status === 'PENDING';
  const canComplete = ['SCHEDULED', 'IN_PROGRESS'].includes(consultation.status);
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(consultation.status);
  const canEdit = !['COMPLETED', 'CANCELLED'].includes(consultation.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Consultation ${consultation.consultation_number || `#${consultationId}`}`}
        helpContent="View nutrition consultation details, anthropometric measurements, and diet plans."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={consultation.status} />
            <PriorityBadge priority={consultation.priority} showIcon />
          </div>
          <p className="text-muted-foreground mt-1">
            Created {format(parseISO(consultation.created_at), 'PPP')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => router.push(`/allied-health/nutrition/consultations/${consultationId}/edit`)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canApprove && (
            <Button onClick={() => setConfirmAction('approve')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          )}
          {canComplete && (
            <Button onClick={() => setConfirmAction('complete')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" onClick={() => setConfirmAction('cancel')}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Referral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Patient & Referral
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Patient</h4>
                <p className="font-medium">{consultation.patient_name}</p>
                <p className="text-sm text-muted-foreground">{consultation.patient_mrn}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Referral Reason</h4>
                <p className="font-medium">
                  {REFERRAL_REASON_LABELS[consultation.referral_reason as keyof typeof REFERRAL_REASON_LABELS] || consultation.referral_reason}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Referred By</h4>
                <p className="font-medium">{consultation.referred_by_name || 'N/A'}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Assigned Dietitian</h4>
                <p className="font-medium">
                  {consultation.dietitian_name || 'Not assigned'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Referral Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Referral Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{consultation.referral_notes || 'No referral notes'}</p>
            </CardContent>
          </Card>

          {/* Anthropometrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Anthropometrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {consultation.weight && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Weight</h4>
                    <p className="font-medium">{consultation.weight} kg</p>
                  </div>
                )}
                {consultation.height && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Height</h4>
                    <p className="font-medium">{consultation.height} cm</p>
                  </div>
                )}
                {consultation.bmi && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">BMI</h4>
                    <p className="font-medium">{consultation.bmi}</p>
                    {consultation.bmi_classification && (
                      <Badge
                        variant="outline"
                        className={BMI_CLASSIFICATION_CONFIG[consultation.bmi_classification]?.color}
                      >
                        {BMI_CLASSIFICATION_CONFIG[consultation.bmi_classification]?.label}
                      </Badge>
                    )}
                  </div>
                )}
                {consultation.waist_circumference && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Waist</h4>
                    <p className="font-medium">{consultation.waist_circumference} cm</p>
                  </div>
                )}
                {consultation.hip_circumference && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Hip</h4>
                    <p className="font-medium">{consultation.hip_circumference} cm</p>
                  </div>
                )}
                {consultation.mid_upper_arm_circumference && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">MUAC</h4>
                    <p className="font-medium">{consultation.mid_upper_arm_circumference} cm</p>
                    {consultation.muac_classification && (
                      <Badge variant="outline">
                        {consultation.muac_classification}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dietary Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Apple className="h-5 w-5" />
                Dietary Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {consultation.food_allergies && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Food Allergies</h4>
                  <p className="whitespace-pre-wrap">{consultation.food_allergies}</p>
                </div>
              )}
              {consultation.dietary_history && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Dietary History</h4>
                  <p className="whitespace-pre-wrap">{consultation.dietary_history}</p>
                </div>
              )}
              {consultation.current_diet && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Current Diet</h4>
                  <p className="whitespace-pre-wrap">{consultation.current_diet}</p>
                </div>
              )}
              {consultation.recommendations && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Recommendations</h4>
                  <p className="whitespace-pre-wrap">{consultation.recommendations}</p>
                </div>
              )}
              {!consultation.food_allergies &&
               !consultation.dietary_history &&
               !consultation.current_diet &&
               !consultation.recommendations && (
                <p className="text-muted-foreground">No dietary information recorded</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Calculated Values */}
          {(consultation.basal_metabolic_rate || consultation.total_daily_energy_expenditure) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Calculated Values
                  <HelpPopover content="BMR and TDEE are calculated based on weight, height, age, and activity level." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {consultation.basal_metabolic_rate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BMR</span>
                    <span className="font-medium">{Math.round(Number(consultation.basal_metabolic_rate))} kcal</span>
                  </div>
                )}
                {consultation.total_daily_energy_expenditure && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TDEE</span>
                    <span className="font-medium">{Math.round(Number(consultation.total_daily_energy_expenditure))} kcal</span>
                  </div>
                )}
                {consultation.ideal_body_weight && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ideal Weight</span>
                    <span className="font-medium">{Number(consultation.ideal_body_weight).toFixed(1)} kg</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Level */}
          {consultation.activity_level && (
            <Card>
              <CardHeader>
                <CardTitle>Activity Level</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="capitalize">
                  {consultation.activity_level.toLowerCase().replace('_', ' ')}
                </Badge>
              </CardContent>
            </Card>
          )}

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
                <span className="text-sm">{format(parseISO(consultation.created_at), 'PP')}</span>
              </div>
              {consultation.consultation_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consultation</span>
                  <span className="text-sm">{format(parseISO(consultation.consultation_date), 'PP')}</span>
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
              {confirmAction === 'approve' && 'Approve Consultation'}
              {confirmAction === 'complete' && 'Complete Consultation'}
              {confirmAction === 'cancel' && 'Cancel Consultation'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'approve' &&
                'This will approve the consultation and allow scheduling.'}
              {confirmAction === 'complete' &&
                'This will mark the consultation as completed.'}
              {confirmAction === 'cancel' &&
                'This will cancel the consultation. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
              className={confirmAction === 'cancel' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
