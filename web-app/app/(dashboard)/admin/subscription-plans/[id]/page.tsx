/**
 * Subscription Plan Detail Page
 */
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, CreditCard, Check, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from 'sonner';
import type { TierCode } from '@/lib/types/subscription';
import { FEATURE_LABELS } from '@/lib/types/subscription';

const tierColors: Record<TierCode, string> = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  BASIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  PROFESSIONAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  ENTERPRISE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (num === 0) return 'Free';
  return `KES ${num.toLocaleString()}`;
}

function formatLimit(value: number | null): string {
  return value === null ? 'Unlimited' : value.toLocaleString();
}

export default function SubscriptionPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const planId = parseInt(id, 10);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSuperuser } = usePermissions();

  if (!isSuperuser) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">Only Nexora superusers can manage subscription plans.</CardContent></Card>
      </div>
    );
  }

  const { data: plan, isLoading } = useQuery({
    queryKey: ['subscription-plan', planId],
    queryFn: () => subscriptionPlansApi.get(planId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => subscriptionPlansApi.delete(planId),
    onSuccess: () => {
      toast.success('Plan deleted');
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      router.push('/admin/subscription-plans');
    },
    onError: () => {
      toast.error('Failed to delete plan');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!plan) {
    return <p className="text-muted-foreground">Plan not found.</p>;
  }

  const featureEntries = Object.entries(plan.features);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={plan.name}
        helpContent="View subscription plan details including pricing, limits, and feature flags."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/subscription-plans/${planId}/edit`}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the &quot;{plan.name}&quot; plan.
                    Organizations linked to this plan will lose their subscription reference.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{plan.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatPrice(plan.monthly_price)}/mo · {formatPrice(plan.annual_price)}/yr
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={tierColors[plan.code]}>{plan.code}</Badge>
          <Badge variant={plan.is_active ? 'default' : 'secondary'}>
            {plan.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing (KES)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly</span>
              <span className="font-medium">{formatPrice(plan.monthly_price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Annual</span>
              <span className="font-medium">{formatPrice(plan.annual_price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Annual Savings</span>
              <span className="font-medium text-green-600">
                {formatPrice(plan.annual_savings)}
              </span>
            </div>
            {plan.has_trial && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trial Period</span>
                <span className="font-medium">{plan.trial_period_days} days</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Facilities</span>
              <span className="font-medium">{formatLimit(plan.max_facilities)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Users</span>
              <span className="font-medium">{formatLimit(plan.max_users)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Patients</span>
              <span className="font-medium">{formatLimit(plan.max_patients)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly AI Tokens</span>
              <span className="font-medium">{formatLimit(plan.monthly_ai_tokens)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        {featureEntries.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Feature Flags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {featureEntries.map(([key, enabled]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/30"
                  >
                    {enabled ? (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={enabled ? '' : 'text-muted-foreground'}>
                      {FEATURE_LABELS[key] || key.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {plan.description && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
