/**
 * Edit Subscription Plan Page
 */
'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from 'sonner';
import type { SubscriptionPlanUpdateData } from '@/lib/types/subscription';
import { FEATURE_LABELS } from '@/lib/types/subscription';

export default function EditSubscriptionPlanPage({
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

  const [form, setForm] = useState<SubscriptionPlanUpdateData>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        annual_price: plan.annual_price,
        max_facilities: plan.max_facilities,
        max_users: plan.max_users,
        max_patients: plan.max_patients,
        is_active: plan.is_active,
        sort_order: plan.sort_order,
        trial_period_days: plan.trial_period_days,
      });
      setFeatures({ ...plan.features });
    }
  }, [plan]);

  const updateMutation = useMutation({
    mutationFn: (data: SubscriptionPlanUpdateData) =>
      subscriptionPlansApi.update(planId, data),
    onSuccess: () => {
      toast.success('Plan updated');
      queryClient.invalidateQueries({ queryKey: ['subscription-plan', planId] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      router.push(`/admin/subscription-plans/${planId}`);
    },
    onError: () => {
      toast.error('Failed to update plan');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ ...form, features });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!plan) {
    return <p className="text-muted-foreground">Plan not found.</p>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${plan.name}`}
        helpContent="Update plan name, pricing, limits, and features. Changes to limits will sync to all linked organizations."
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="code">Tier Code</Label>
                <Input id="code" value={plan.code} disabled className="mt-1" />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={form.is_active ?? true}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={form.sort_order ?? 0}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing (KES)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="monthly_price">Monthly Price</Label>
                <Input
                  id="monthly_price"
                  type="number"
                  step="0.01"
                  value={form.monthly_price ?? '0'}
                  onChange={(e) => setForm({ ...form, monthly_price: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="annual_price">Annual Price</Label>
                <Input
                  id="annual_price"
                  type="number"
                  step="0.01"
                  value={form.annual_price ?? '0'}
                  onChange={(e) => setForm({ ...form, annual_price: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="trial_period_days">Trial Period (days)</Label>
                <Input
                  id="trial_period_days"
                  type="number"
                  value={form.trial_period_days ?? 0}
                  onChange={(e) =>
                    setForm({ ...form, trial_period_days: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Leave blank for unlimited. Changes sync to all linked organizations.
              </p>
              <div>
                <Label htmlFor="max_facilities">Max Facilities</Label>
                <Input
                  id="max_facilities"
                  type="number"
                  value={form.max_facilities ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_facilities: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="max_users">Max Users</Label>
                <Input
                  id="max_users"
                  type="number"
                  value={form.max_users ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_users: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="max_patients">Max Patients</Label>
                <Input
                  id="max_patients"
                  type="number"
                  value={form.max_patients ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_patients: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Unlimited"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Feature Flags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(features).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`feature-${key}`}>
                    {FEATURE_LABELS[key] || key.replace(/_/g, ' ')}
                  </Label>
                  <Switch
                    id={`feature-${key}`}
                    checked={enabled}
                    onCheckedChange={(v) => setFeatures({ ...features, [key]: v })}
                  />
                </div>
              ))}
              {Object.keys(features).length === 0 && (
                <p className="text-sm text-muted-foreground">No features configured.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/admin/subscription-plans/${planId}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
