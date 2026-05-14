/**
 * Create Subscription Plan Page
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from 'sonner';
import type { SubscriptionPlanCreateData, TierCode } from '@/lib/types/subscription';
import { FEATURE_LABELS } from '@/lib/types/subscription';

const TIER_CODES: TierCode[] = ['FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'];

const DEFAULT_FEATURES: Record<string, boolean> = {
  outpatient: false,
  inpatient: false,
  emergency: false,
  pharmacy: false,
  laboratory: false,
  imaging: false,
  theatre: false,
  dialysis: false,
  icu: false,
  maternity: false,
  mortuary: false,
  blood_bank: false,
  inventory: false,
  billing: false,
  scheduling: false,
  ai_assistant: false,
  sha_claims: false,
  dhis2_reporting: false,
  api_access: false,
  custom_reports: false,
  offline_sync: false,
  sms_notifications: false,
};

export default function NewSubscriptionPlanPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSuperuser } = usePermissions();

  const [form, setForm] = useState<SubscriptionPlanCreateData>({
    code: 'BASIC',
    name: '',
    description: '',
    monthly_price: '0',
    annual_price: '0',
    max_facilities: null,
    max_users: null,
    max_patients: null,
    is_active: true,
    sort_order: 0,
    trial_period_days: 0,
  });

  const [features, setFeatures] = useState<Record<string, boolean>>({ ...DEFAULT_FEATURES });

  const createMutation = useMutation({
    mutationFn: (data: SubscriptionPlanCreateData) => subscriptionPlansApi.create(data),
    onSuccess: (plan) => {
      toast.success('Plan created');
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      router.push(`/admin/subscription-plans/${plan.id}`);
    },
    onError: () => {
      toast.error('Failed to create plan');
    },
  });

  if (!isSuperuser) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">Only Nexora superusers can manage subscription plans.</CardContent></Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, features });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Subscription Plan"
        helpContent="Create a new subscription plan with pricing, limits, and feature flags."
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
                <Select
                  value={form.code}
                  onValueChange={(v) => setForm({ ...form, code: v as TierCode })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                  required
                  placeholder="e.g. Basic Plan"
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
                Leave blank for unlimited.
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
              <div>
                <Label htmlFor="monthly_ai_tokens">Monthly AI Tokens</Label>
                <Input
                  id="monthly_ai_tokens"
                  type="number"
                  value={form.monthly_ai_tokens ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      monthly_ai_tokens: e.target.value ? parseInt(e.target.value) : null,
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
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/subscription-plans')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Plan'}
          </Button>
        </div>
      </form>
    </div>
  );
}
