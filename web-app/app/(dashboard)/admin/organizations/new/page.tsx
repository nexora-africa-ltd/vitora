/**
 * New Organization Page
 * Multitenancy: Create a new organization (superuser only).
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Building2, Shield, MapPin, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { useCounties, useSubCounties } from '@/lib/hooks/use-locations';
import { organizationsApi } from '@/lib/api/organizations';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import type { OrganizationCreateData } from '@/lib/types/organization';
import { useQuery } from '@tanstack/react-query';

export default function NewOrganizationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => subscriptionPlansApi.list({ is_active: true, ordering: 'sort_order' }),
  });
  const plans = plansData?.results ?? [];

  const [formData, setFormData] = useState<OrganizationCreateData>({
    name: '',
    slug: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    subscription_plan: null,
    county: undefined,
    sub_county: undefined,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [countyId, setCountyId] = useState<number | undefined>();
  const { data: counties } = useCounties();
  const { data: subCounties } = useSubCounties(countyId);

  const createOrg = useMutation({
    mutationFn: (data: OrganizationCreateData) => organizationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast({ title: 'Organization created', description: `${formData.name} has been created.` });
      router.push('/admin/organizations');
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create organization',
      });
    },
  });

  const handleChange = (field: keyof OrganizationCreateData, value: string | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = 'Organization name is required';
    if (!formData.slug?.trim()) errors.slug = 'Slug is required';
    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      errors.contact_email = 'Invalid email format';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: OrganizationCreateData = {
      ...formData,
      county: countyId ?? undefined,
      sub_county: formData.sub_county ?? undefined,
    };
    createOrg.mutate(payload);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Organization"
        helpContent="Create a new healthcare organization. Facilities and staff can be added after creation."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Organization Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  handleChange('name', e.target.value);
                  if (!formData.slug || formData.slug === generateSlug(formData.name ?? '')) {
                    handleChange('slug', generateSlug(e.target.value));
                  }
                }}
                placeholder="e.g. Nairobi Hospital Group"
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                placeholder="e.g. nairobi-hospital-group"
              />
              {formErrors.slug && <p className="text-xs text-destructive">{formErrors.slug}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => handleChange('contact_email', e.target.value)}
                placeholder="admin@example.co.ke"
              />
              {formErrors.contact_email && (
                <p className="text-xs text-destructive">{formErrors.contact_email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone</Label>
              <Input
                id="contact_phone"
                value={formData.contact_phone}
                onChange={(e) => handleChange('contact_phone', e.target.value)}
                placeholder="+254 7xx xxx xxx"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Physical address"
              />
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              HQ Location
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>County</Label>
              <Select
                value={countyId?.toString() ?? ''}
                onValueChange={(v) => {
                  const id = parseInt(v);
                  setCountyId(id);
                  handleChange('county', id);
                  handleChange('sub_county', undefined);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select county" />
                </SelectTrigger>
                <SelectContent>
                  {(counties ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-County</Label>
              <Select
                value={formData.sub_county?.toString() ?? ''}
                onValueChange={(v) => handleChange('sub_county', parseInt(v))}
                disabled={!countyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={countyId ? 'Select sub-county' : 'Select county first'} />
                </SelectTrigger>
                <SelectContent>
                  {(subCounties ?? []).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id.toString()}>
                      {sc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Subscription & Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Subscription Plan</Label>
              <Select
                value={formData.subscription_plan?.toString() ?? ''}
                onValueChange={(v) => handleChange('subscription_plan', v ? parseInt(v) : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tier, limits, and AI tokens are automatically set from the selected plan.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/organizations')}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createOrg.isPending} className="w-full sm:w-auto">
            {createOrg.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Create Organization
          </Button>
        </div>
      </form>
    </div>
  );
}
