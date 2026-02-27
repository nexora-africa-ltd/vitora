/**
 * Diet Plan Detail Component
 * Full detail view with actions (activate, hold, complete, discontinue)
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  Edit,
  CheckCircle,
  XCircle,
  PauseCircle,
  PlayCircle,
  Flame,
  UtensilsCrossed,
  Apple,
  Ban,
  ThumbsUp,
  Pill,
  FileText,
  User,
  Link2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import {
  useDietPlan,
  useActivateDietPlan,
  useCompleteDietPlan,
  useDiscontinueDietPlan,
  usePutDietPlanOnHold,
} from '@/lib/hooks/use-nutrition';
import { DIET_PLAN_STATUS_CONFIG } from '@/lib/types/nutrition';
import { useToast } from '@/lib/hooks/use-toast';

interface DietPlanDetailProps {
  dietPlanId: number;
}

type ActionType = 'activate' | 'complete' | 'discontinue' | 'hold' | null;

export function DietPlanDetail({ dietPlanId }: DietPlanDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmAction, setConfirmAction] = useState<ActionType>(null);
  const [actionReason, setActionReason] = useState('');

  const { data: plan, isLoading, error } = useDietPlan(dietPlanId);

  const activateMutation = useActivateDietPlan();
  const completeMutation = useCompleteDietPlan();
  const discontinueMutation = useDiscontinueDietPlan();
  const holdMutation = usePutDietPlanOnHold();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load diet plan details
      </div>
    );
  }

  const handleAction = async (action: ActionType) => {
    if (!action) return;

    try {
      switch (action) {
        case 'activate':
          await activateMutation.mutateAsync(dietPlanId);
          toast({ title: 'Diet plan activated' });
          break;
        case 'complete':
          await completeMutation.mutateAsync(dietPlanId);
          toast({ title: 'Diet plan completed' });
          break;
        case 'discontinue':
          await discontinueMutation.mutateAsync({
            id: dietPlanId,
            reason: actionReason || undefined,
          });
          toast({ title: 'Diet plan discontinued' });
          break;
        case 'hold':
          await holdMutation.mutateAsync({
            id: dietPlanId,
            reason: actionReason || undefined,
          });
          toast({ title: 'Diet plan put on hold' });
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
    setActionReason('');
  };

  const statusConfig = DIET_PLAN_STATUS_CONFIG[plan.status];
  const canActivate = plan.status === 'DRAFT' || plan.status === 'ON_HOLD';
  const canComplete = plan.status === 'ACTIVE';
  const canHold = plan.status === 'ACTIVE';
  const canDiscontinue = !['COMPLETED', 'DISCONTINUED'].includes(plan.status);
  const canEdit = !['COMPLETED', 'DISCONTINUED'].includes(plan.status);

  const actionLabels: Record<string, string> = {
    activate: 'Activate Diet Plan',
    complete: 'Complete Diet Plan',
    discontinue: 'Discontinue Diet Plan',
    hold: 'Put Diet Plan on Hold',
  };

  const actionDescriptions: Record<string, string> = {
    activate:
      'This will activate the diet plan. The patient should start following this plan.',
    complete:
      'This will mark the diet plan as completed. Use this when the plan duration has ended or goals have been met.',
    discontinue:
      'This will discontinue the diet plan. Please provide a reason.',
    hold: 'This will temporarily pause the diet plan. Please provide a reason.',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Diet Plan ${plan.plan_number}`}
        helpContent="View and manage diet plan details including nutritional targets, meal plans, and food guidance."
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className={statusConfig?.className}>
            {statusConfig?.label || plan.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Created {format(parseISO(plan.created_at), 'PPP')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() =>
                router.push(
                  `/allied-health/nutrition/diet-plans/${dietPlanId}/edit`
                )
              }
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {canActivate && (
            <Button onClick={() => setConfirmAction('activate')}>
              <PlayCircle className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {canHold && (
            <Button
              variant="outline"
              onClick={() => setConfirmAction('hold')}
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Hold
            </Button>
          )}
          {canComplete && (
            <Button onClick={() => setConfirmAction('complete')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete
            </Button>
          )}
          {canDiscontinue && (
            <Button
              variant="ghost"
              onClick={() => setConfirmAction('discontinue')}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Discontinue
            </Button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {plan.patient_name}
            <span className="text-muted-foreground">
              {' '}
              &bull; {plan.patient_mrn}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Consultation {plan.consultation_number || 'N/A'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              {format(parseISO(plan.start_date), 'MMM d, yyyy')}
              {plan.end_date
                ? ` — ${format(parseISO(plan.end_date), 'MMM d, yyyy')}`
                : ' — Ongoing'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {plan.description && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{plan.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Meal Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UtensilsCrossed className="h-5 w-5" />
                Meal Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MealGrid plan={plan} />
            </CardContent>
          </Card>

          {/* Food Guidance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Apple className="h-5 w-5" />
                Food Guidance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.foods_to_avoid && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1 mb-1">
                    <Ban className="h-3.5 w-3.5 text-destructive" />
                    Foods to Avoid
                  </h4>
                  <p className="whitespace-pre-wrap text-sm">
                    {plan.foods_to_avoid}
                  </p>
                </div>
              )}
              {plan.foods_to_include && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1 mb-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                    Foods to Include
                  </h4>
                  <p className="whitespace-pre-wrap text-sm">
                    {plan.foods_to_include}
                  </p>
                </div>
              )}
              {plan.supplements && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1 mb-1">
                    <Pill className="h-3.5 w-3.5" />
                    Supplements
                  </h4>
                  <p className="whitespace-pre-wrap text-sm">
                    {plan.supplements}
                  </p>
                </div>
              )}
              {plan.special_instructions && (
                <div>
                  <h4 className="text-sm font-medium mb-1">
                    Special Instructions
                  </h4>
                  <p className="whitespace-pre-wrap text-sm">
                    {plan.special_instructions}
                  </p>
                </div>
              )}
              {!plan.foods_to_avoid &&
                !plan.foods_to_include &&
                !plan.supplements &&
                !plan.special_instructions && (
                  <p className="text-muted-foreground text-sm">
                    No food guidance recorded
                  </p>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Nutritional Targets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="h-5 w-5 text-orange-500" />
                Nutritional Targets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NutrientRow
                label="Calories"
                value={plan.target_calories}
                unit="kcal"
              />
              <NutrientRow
                label="Protein"
                value={plan.target_protein}
                unit="g"
              />
              <NutrientRow
                label="Carbohydrates"
                value={plan.target_carbs}
                unit="g"
              />
              <NutrientRow
                label="Fat"
                value={plan.target_fat}
                unit="g"
              />
              <NutrientRow
                label="Fiber"
                value={plan.target_fiber}
                unit="g"
              />
              <NutrientRow
                label="Sodium"
                value={plan.target_sodium}
                unit="mg"
              />
              {!plan.target_calories &&
                !plan.target_protein &&
                !plan.target_carbs &&
                !plan.target_fat && (
                  <p className="text-sm text-muted-foreground">
                    No targets set
                  </p>
                )}
            </CardContent>
          </Card>

          {/* Linked Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-5 w-5" />
                Linked Records
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Patient</p>
                <p className="font-medium">
                  {plan.patient_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {plan.patient_mrn}
                </p>
              </div>
              {plan.consultation && (
              <div>
                <p className="text-xs text-muted-foreground">Consultation</p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() =>
                    router.push(
                      `/allied-health/nutrition/consultations/${plan.consultation}`
                    )
                  }
                >
                  {plan.consultation_number}
                </Button>
              </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Created By</p>
                <p className="text-sm flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {plan.created_by_name || 'Unknown'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Start</span>
                <span>{format(parseISO(plan.start_date), 'PP')}</span>
              </div>
              {plan.end_date && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">End</span>
                  <span>{format(parseISO(plan.end_date), 'PP')}</span>
                </div>
              )}
              {plan.review_date && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Review</span>
                  <span>{format(parseISO(plan.review_date), 'PP')}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{format(parseISO(plan.created_at), 'PP')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Updated</span>
                <span>{format(parseISO(plan.updated_at), 'PP')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={() => {
          setConfirmAction(null);
          setActionReason('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction && actionLabels[confirmAction]}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction && actionDescriptions[confirmAction]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(confirmAction === 'discontinue' || confirmAction === 'hold') && (
            <div className="py-2">
              <Label htmlFor="action-reason">Reason</Label>
              <Input
                id="action-reason"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter reason..."
                className="mt-1"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction(confirmAction)}
              className={
                confirmAction === 'discontinue'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : ''
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function NutrientRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  if (value === null) return null;
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-sm">
        {value} {unit}
      </span>
    </div>
  );
}

function MealGrid({
  plan,
}: {
  plan: {
    breakfast_guidelines: string;
    lunch_guidelines: string;
    dinner_guidelines: string;
    snack_guidelines: string;
  };
}) {
  const meals = [
    { label: 'Breakfast', value: plan.breakfast_guidelines, icon: '🌅' },
    { label: 'Lunch', value: plan.lunch_guidelines, icon: '☀️' },
    { label: 'Dinner', value: plan.dinner_guidelines, icon: '🌙' },
    { label: 'Snacks', value: plan.snack_guidelines, icon: '🍎' },
  ];

  const hasMeals = meals.some((m) => m.value);

  if (!hasMeals) {
    return (
      <p className="text-sm text-muted-foreground">No meal plan specified</p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {meals.map(
        (meal) =>
          meal.value && (
            <div
              key={meal.label}
              className="p-3 rounded-lg border bg-muted/30"
            >
              <h4 className="text-sm font-medium mb-1">
                {meal.icon} {meal.label}
              </h4>
              <p className="text-sm whitespace-pre-wrap">{meal.value}</p>
            </div>
          )
      )}
    </div>
  );
}
