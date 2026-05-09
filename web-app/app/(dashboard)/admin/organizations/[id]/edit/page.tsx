/**
 * Edit Organization Page
 * Multitenancy: Update organization details (admin only).
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { Save, Building2, Shield, MapPin, Loader2, Upload, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { API_BASE_URL } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useCounties, useSubCounties } from '@/lib/hooks/use-locations';
import { organizationsApi } from '@/lib/api/organizations';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import type { OrganizationUpdateData } from '@/lib/types/organization';

export default function EditOrganizationPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgId = parseInt(params.id as string);
  const { isSuperuser } = usePermissions();

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', orgId],
    queryFn: () => organizationsApi.get(orgId),
    enabled: !isNaN(orgId),
  });

  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => subscriptionPlansApi.list({ is_active: true, ordering: 'sort_order' }),
  });
  const plans = plansData?.results ?? [];

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    subscription_plan: null as number | null,
    data_retention_years: '7',
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [countyId, setCountyId] = useState<number | undefined>();
  const [subCountyId, setSubCountyId] = useState<number | undefined>();
  const { data: counties } = useCounties();
  const { data: subCounties } = useSubCounties(countyId);

  // Load org data into form
  useEffect(() => {
    if (org) {
      setFormData({
        name: org.name,
        slug: org.slug,
        contact_email: org.contact_email || '',
        contact_phone: org.contact_phone || '',
        address: org.address || '',
        subscription_plan: org.subscription_plan,
        data_retention_years: String(org.data_retention_years),
        is_active: org.is_active,
      });
      if (org.county) setCountyId(org.county);
      if (org.sub_county) setSubCountyId(org.sub_county);
    }
  }, [org]);

  const updateOrg = useMutation({
    mutationFn: (data: OrganizationUpdateData) => organizationsApi.update(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast({ title: 'Organization updated', description: `${formData.name} has been updated.` });
      router.push(`/admin/organizations/${orgId}`);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: Record<string, string[]> } };
      const fieldErrors = axiosErr?.response?.data;
      if (fieldErrors && typeof fieldErrors === 'object') {
        const mapped: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(fieldErrors)) {
          if (Array.isArray(msgs)) mapped[key] = msgs.join(', ');
        }
        if (Object.keys(mapped).length > 0) {
          setFormErrors((prev) => ({ ...prev, ...mapped }));
          toast({ variant: 'destructive', title: 'Validation error', description: 'Please fix the highlighted fields.' });
          return;
        }
      }
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : 'Failed to update organization' });
    },
  });

  const handleChange = (field: string, value: string | boolean | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    }
  };

  // Logo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    if (org?.logo) setLogoPreview(org.logo);
  }, [org?.logo]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Logo must be under 2 MB.' });
      return;
    }
    setIsUploadingLogo(true);
    try {
      const updated = await organizationsApi.uploadLogo(orgId, file);
      setLogoPreview(updated.logo);
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      toast({ title: 'Logo updated' });
    } catch {
      toast({ variant: 'destructive', title: 'Upload failed', description: 'Could not upload logo.' });
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    setIsUploadingLogo(true);
    try {
      await organizationsApi.removeLogo(orgId);
      setLogoPreview(null);
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      toast({ title: 'Logo removed' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not remove logo.' });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Organization name is required';
    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      errors.contact_email = 'Invalid email format';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: OrganizationUpdateData = {
      name: formData.name,
      contact_email: formData.contact_email || undefined,
      contact_phone: formData.contact_phone || undefined,
      address: formData.address || undefined,
      county: countyId ?? null,
      sub_county: subCountyId ?? null,
      subscription_plan: formData.subscription_plan,
      data_retention_years: formData.data_retention_years ? parseInt(formData.data_retention_years) : undefined,
      is_active: formData.is_active,
    };
    updateOrg.mutate(payload);
  };

  if (!isSuperuser) {
    return (
      <div className="space-y-4">
        <PageHeader title="Access Denied" />
        <Card><CardContent className="py-8 text-center text-muted-foreground">You do not have permission to edit organizations.</CardContent></Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${org?.name ?? 'Organization'}`}
        helpContent="Update organization details, subscription tier, and limits."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Logo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              Logo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative h-16 w-16 shrink-0 rounded-lg border overflow-hidden bg-muted">
                  <Image
                    src={logoPreview.startsWith('http') ? logoPreview : `${API_BASE_URL}${logoPreview}`}
                    alt="Organization logo"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingLogo ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-3.5 w-3.5" />
                  )}
                  {logoPreview ? 'Change' : 'Upload'}
                </Button>
                {logoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploadingLogo}
                    onClick={handleLogoRemove}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">PNG, JPG, or WebP. Max 2 MB.</p>
          </CardContent>
        </Card>

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
              <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" value={formData.slug} disabled className="opacity-60" />
              <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input id="contact_email" type="email" value={formData.contact_email} onChange={(e) => handleChange('contact_email', e.target.value)} />
              {formErrors.contact_email && <p className="text-xs text-destructive">{formErrors.contact_email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Phone</Label>
              <Input id="contact_phone" value={formData.contact_phone} onChange={(e) => handleChange('contact_phone', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
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
                onValueChange={(v) => { setCountyId(parseInt(v)); setSubCountyId(undefined); }}
              >
                <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                <SelectContent>
                  {(counties ?? []).map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-County</Label>
              <Select
                value={subCountyId?.toString() ?? ''}
                onValueChange={(v) => setSubCountyId(parseInt(v))}
                disabled={!countyId}
              >
                <SelectTrigger><SelectValue placeholder={countyId ? 'Select sub-county' : 'Select county first'} /></SelectTrigger>
                <SelectContent>
                  {(subCounties ?? []).map((sc) => <SelectItem key={sc.id} value={sc.id.toString()}>{sc.name}</SelectItem>)}
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
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={formData.subscription_plan != null ? String(formData.subscription_plan) : 'none'}
                onValueChange={(v) => {
                  const planId = v === 'none' ? null : parseInt(v);
                  setFormData((prev) => ({
                    ...prev,
                    subscription_plan: planId,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tier, limits, and AI tokens are automatically set from the selected plan.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_retention_years">Data Retention (years)</Label>
              <Input id="data_retention_years" type="number" min={1} value={formData.data_retention_years} onChange={(e) => handleChange('data_retention_years', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Switch checked={formData.is_active} onCheckedChange={(v) => handleChange('is_active', v)} />
              <Label>Organization is Active</Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.push(`/admin/organizations/${orgId}`)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" disabled={updateOrg.isPending} className="w-full sm:w-auto">
            {updateOrg.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
