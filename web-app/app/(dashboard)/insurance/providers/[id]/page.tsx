'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  Globe,
  Key,
  Link2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  Settings,
  Shield,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useInsuranceProvider,
  useUpdateProvider,
  useInsurancePlans,
  useCreatePlan,
  useProviderConfigs,
  useCreateProviderConfig,
  useUpdateProviderConfig,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import { PROVIDER_TYPE_LABELS } from '@/lib/types/insurance';
import type {
  InsurancePlan,
  InsuranceProviderStatus,
  InsuranceProviderConfig,
  InsuranceProviderConfigCreateInput,
  InsuranceCoverageType,
  ApiAuthType,
  SubmissionFormat,
} from '@/lib/types/insurance';

const STATUS_COLORS: Record<InsuranceProviderStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

// ---------------------------------------------------------------------------
// Add Plan Dialog
// ---------------------------------------------------------------------------
function AddPlanDialog({ providerId, onSuccess }: { providerId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createPlan = useCreatePlan();
  const [form, setForm] = useState({
    name: '',
    code: '',
    plan_type: 'individual' as string,
    coverage_type: 'comprehensive' as string,
    default_copay_percent: '10',
    preauth_required: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPlan.mutateAsync({
        provider: providerId,
        name: form.name,
        code: form.code,
        plan_type: form.plan_type as 'individual' | 'family' | 'corporate' | 'group',
        coverage_type: form.coverage_type as InsuranceCoverageType,
        default_copay_percent: form.default_copay_percent,
        preauth_required: form.preauth_required,
      });
      toast({ title: 'Plan created' });
      setOpen(false);
      setForm({ name: '', code: '', plan_type: 'individual', coverage_type: 'comprehensive', default_copay_percent: '10', preauth_required: false });
      onSuccess();
    } catch {
      toast({ title: 'Error', description: 'Failed to create plan.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Add Plan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Insurance Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Plan Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Code *</Label>
            <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.plan_type} onValueChange={v => setForm(f => ({ ...f, plan_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Coverage</Label>
              <Select value={form.coverage_type} onValueChange={v => setForm(f => ({ ...f, coverage_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">Comprehensive</SelectItem>
                  <SelectItem value="outpatient">Outpatient</SelectItem>
                  <SelectItem value="inpatient">Inpatient</SelectItem>
                  <SelectItem value="dental">Dental</SelectItem>
                  <SelectItem value="optical">Optical</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Co-pay %</Label>
            <Input type="number" min="0" max="100" value={form.default_copay_percent} onChange={e => setForm(f => ({ ...f, default_copay_percent: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.preauth_required} onCheckedChange={v => setForm(f => ({ ...f, preauth_required: v }))} />
            <Label className="!mt-0">Pre-authorization required</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createPlan.isPending}>
              {createPlan.isPending ? 'Creating…' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Facility Config Card
// ---------------------------------------------------------------------------
function FacilityConfigCard({
  config,
  providerId,
  onSaved,
}: {
  config: InsuranceProviderConfig | null;
  providerId: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createConfig = useCreateProviderConfig();
  const updateConfig = useUpdateProviderConfig();
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState<Partial<InsuranceProviderConfigCreateInput>>({
    provider: providerId,
    api_base_url: config?.api_base_url ?? '',
    api_auth_type: config?.api_auth_type ?? 'none',
    api_enabled: config?.api_enabled ?? false,
    submission_format: config?.submission_format ?? 'manual',
    contract_number: config?.contract_number ?? '',
    accreditation_number: config?.accreditation_number ?? '',
    accreditation_status: config?.accreditation_status ?? 'not_accredited',
    max_claim_amount: config?.max_claim_amount ?? null,
    notes: config?.notes ?? '',
    // Credential fields are write-only — never populated from API
    api_key: '',
    api_secret: '',
    api_username: '',
    api_password: '',
    api_token: '',
  });

  const handleSave = async () => {
    try {
      // Only include credential fields if they have a value (don't overwrite with empty)
      const payload: Record<string, unknown> = { ...form };
      if (!payload.api_key) delete payload.api_key;
      if (!payload.api_secret) delete payload.api_secret;
      if (!payload.api_username) delete payload.api_username;
      if (!payload.api_password) delete payload.api_password;
      if (!payload.api_token) delete payload.api_token;

      if (config) {
        await updateConfig.mutateAsync({ id: config.id, data: payload as Partial<InsuranceProviderConfigCreateInput> });
      } else {
        await createConfig.mutateAsync(payload as unknown as InsuranceProviderConfigCreateInput);
      }
      toast({ title: config ? 'Config updated' : 'Config created' });
      setEditing(false);
      onSaved();
    } catch {
      toast({ title: 'Error', description: 'Failed to save config.', variant: 'destructive' });
    }
  };

  const isPending = createConfig.isPending || updateConfig.isPending;
  const authType = form.api_auth_type as ApiAuthType;

  if (!config && !editing) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
          <Settings className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No facility config for this provider.</p>
          <Button size="sm" onClick={() => setEditing(true)} className="gap-1">
            <Plus className="h-3 w-3" /> Configure
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Facility Integration</CardTitle>
            <HelpPopover content="Per-facility API configuration, credentials, and contract details for this provider. Credentials are encrypted at rest and never returned in API responses." />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1">
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">API Enabled</p>
              <Badge variant={config!.api_enabled ? 'default' : 'secondary'}>
                {config!.api_enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Submission Format</p>
              <p className="font-medium capitalize">{config!.submission_format}</p>
            </div>
            {config!.api_base_url && (
              <div className="col-span-full">
                <p className="text-muted-foreground text-xs">API Base URL</p>
                <p className="font-medium font-mono text-xs">{config!.api_base_url}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Auth Type</p>
              <p className="font-medium capitalize">{config!.api_auth_type.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Credentials</p>
              <div className="flex items-center gap-1">
                <Key className="h-3 w-3 text-muted-foreground" />
                <p className="text-muted-foreground italic text-xs">Write-only (encrypted at rest)</p>
              </div>
            </div>
            {config!.contract_number && (
              <div>
                <p className="text-muted-foreground text-xs">Contract #</p>
                <p className="font-medium">{config!.contract_number}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Accreditation</p>
              <Badge variant="secondary" className="capitalize">{config!.accreditation_status.replace('_', ' ')}</Badge>
            </div>
            {config!.max_claim_amount && (
              <div>
                <p className="text-muted-foreground text-xs">Max Claim Amount</p>
                <p className="font-medium">KES {Number(config!.max_claim_amount).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Contract Active</p>
              <Badge variant={config!.is_contract_active ? 'default' : 'secondary'}>
                {config!.is_contract_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Edit / Create form
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{config ? 'Edit' : 'New'} Facility Integration</CardTitle>
          <HelpPopover content="Credentials are encrypted using Fernet (AES-128) before storage and are never returned in API responses." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Settings */}
        <div className="space-y-3 border rounded-lg p-3">
          <p className="text-sm font-medium flex items-center gap-1"><Link2 className="h-4 w-4" /> API Connection</p>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.api_enabled ?? false}
              onCheckedChange={v => setForm(f => ({ ...f, api_enabled: v }))}
            />
            <Label className="!mt-0">{form.api_enabled ? 'API Enabled' : 'API Disabled'}</Label>
          </div>
          {form.api_enabled && (
            <>
              <div className="space-y-1">
                <Label>API Base URL</Label>
                <Input
                  placeholder="https://api.example.com/v1"
                  value={form.api_base_url ?? ''}
                  onChange={e => setForm(f => ({ ...f, api_base_url: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Auth Type</Label>
                <Select value={form.api_auth_type ?? 'none'} onValueChange={v => setForm(f => ({ ...f, api_auth_type: v as ApiAuthType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {/* Credentials (only when API enabled) */}
        {form.api_enabled && (
          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-medium flex items-center gap-1">
              <Shield className="h-4 w-4" /> Credentials
              <span className="text-xs text-muted-foreground font-normal ml-1">(encrypted at rest, never returned)</span>
            </p>
            {(authType === 'api_key' || authType === 'oauth2') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>API Key</Label>
                  <Input type="password" autoComplete="off" placeholder={config ? '••••••••' : ''} value={form.api_key ?? ''} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>API Secret</Label>
                  <Input type="password" autoComplete="off" placeholder={config ? '••••••••' : ''} value={form.api_secret ?? ''} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))} />
                </div>
              </div>
            )}
            {authType === 'basic' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input type="text" autoComplete="off" placeholder={config ? '••••••••' : ''} value={form.api_username ?? ''} onChange={e => setForm(f => ({ ...f, api_username: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input type="password" autoComplete="off" placeholder={config ? '••••••••' : ''} value={form.api_password ?? ''} onChange={e => setForm(f => ({ ...f, api_password: e.target.value }))} />
                </div>
              </div>
            )}
            {authType === 'bearer' && (
              <div className="space-y-1">
                <Label>Bearer Token</Label>
                <Input type="password" autoComplete="off" placeholder={config ? '••••••••' : ''} value={form.api_token ?? ''} onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))} />
              </div>
            )}
          </div>
        )}

        {/* Contract & Accreditation */}
        <div className="space-y-3 border rounded-lg p-3">
          <p className="text-sm font-medium">Contract & Accreditation</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Contract Number</Label>
              <Input value={form.contract_number ?? ''} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Accreditation #</Label>
              <Input value={form.accreditation_number ?? ''} onChange={e => setForm(f => ({ ...f, accreditation_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Accreditation Status</Label>
              <Select value={form.accreditation_status ?? 'not_accredited'} onValueChange={v => setForm(f => ({ ...f, accreditation_status: v as InsuranceProviderConfigCreateInput['accreditation_status'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_accredited">Not Accredited</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accredited">Accredited</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Submission Format</Label>
              <Select value={form.submission_format ?? 'manual'} onValueChange={v => setForm(f => ({ ...f, submission_format: v as SubmissionFormat }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="edi">EDI</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Max Claim Amount (KES)</Label>
              <Input type="number" value={form.max_claim_amount ?? ''} onChange={e => setForm(f => ({ ...f, max_claim_amount: e.target.value || null }))} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} className="gap-1">
            <Save className="h-3 w-3" /> {isPending ? 'Saving…' : 'Save Config'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function InsuranceProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const providerId = Number(params.id);

  const { data: provider, isLoading, refetch: refetchProvider } = useInsuranceProvider(providerId);
  const { data: plansData, refetch: refetchPlans } = useInsurancePlans({ provider: providerId });
  const { data: configsData, refetch: refetchConfigs } = useProviderConfigs({ provider: providerId });
  const updateProvider = useUpdateProvider();

  const [editingProvider, setEditingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    contact_email: '',
    contact_phone: '',
    contact_person: '',
    address: '',
    website: '',
    notes: '',
  });

  // Initialise form when provider loads
  React.useEffect(() => {
    if (provider) {
      setProviderForm({
        contact_email: provider.contact_email,
        contact_phone: provider.contact_phone,
        contact_person: provider.contact_person,
        address: provider.address,
        website: provider.website,
        notes: provider.notes,
      });
    }
  }, [provider]);

  const handleUpdateProvider = async () => {
    try {
      await updateProvider.mutateAsync({ id: providerId, data: providerForm });
      toast({ title: 'Provider updated' });
      setEditingProvider(false);
      refetchProvider();
    } catch {
      toast({ title: 'Error', description: 'Failed to update provider.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!provider) {
    return <div className="text-center py-10 text-muted-foreground">Provider not found.</div>;
  }

  const plans = plansData?.results ?? [];
  const facilityConfig = configsData?.results?.[0] ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={provider.name}
        helpContent="View and manage provider details, plans, and facility-level API integration."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingProvider(!editingProvider)} className="gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/insurance/providers')}>
              All Providers
            </Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {provider.code}
            <span className="text-muted-foreground"> • {PROVIDER_TYPE_LABELS[provider.provider_type]}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {provider.plans_count} plans • {provider.active_enrollments_count} active enrollments
          </p>
        </div>
        <Badge className={`${STATUS_COLORS[provider.status]} shrink-0 w-fit self-start sm:self-auto`}>
          {provider.status}
        </Badge>
      </div>

      {/* Contact Info (view or edit) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          {editingProvider ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Contact Person</Label>
                  <Input value={providerForm.contact_person} onChange={e => setProviderForm(f => ({ ...f, contact_person: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={providerForm.contact_email} onChange={e => setProviderForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={providerForm.contact_phone} onChange={e => setProviderForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Website</Label>
                  <Input value={providerForm.website} onChange={e => setProviderForm(f => ({ ...f, website: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <Textarea rows={2} value={providerForm.address} onChange={e => setProviderForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={providerForm.notes} onChange={e => setProviderForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingProvider(false)}>Cancel</Button>
                <Button onClick={handleUpdateProvider} disabled={updateProvider.isPending}>
                  {updateProvider.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {provider.contact_person && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{provider.contact_person}</span>
                </div>
              )}
              {provider.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{provider.contact_email}</span>
                </div>
              )}
              {provider.contact_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{provider.contact_phone}</span>
                </div>
              )}
              {provider.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{provider.website}</a>
                </div>
              )}
              {provider.address && (
                <div className="flex items-center gap-2 col-span-full">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{provider.address}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facility Integration Config */}
      <FacilityConfigCard
        config={facilityConfig}
        providerId={providerId}
        onSaved={() => refetchConfigs()}
      />

      {/* Plans Table */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Insurance Plans</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{plans.length} plan{plans.length !== 1 ? 's' : ''}</Badge>
            <AddPlanDialog providerId={providerId} onSuccess={() => refetchPlans()} />
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<InsurancePlan>
            data={plans}
            columns={[
              { key: 'name', header: 'Plan Name', sortable: true, cell: (p) => <span className="font-medium">{p.name}</span> },
              { key: 'code', header: 'Code', sortable: true, hideOnMobile: true },
              { key: 'coverage_type', header: 'Coverage', sortable: true, hideOnMobile: true, cell: (p) => p.coverage_type },
              { key: 'default_copay_percent', header: 'Co-pay %', sortable: true, sortType: 'number', cell: (p) => `${p.default_copay_percent}%` },
              { key: 'annual_limit', header: 'Annual Limit', sortable: true, hideOnMobile: true, cell: (p) => p.annual_limit ? `KES ${Number(p.annual_limit).toLocaleString()}` : '—' },
              { key: 'status', header: 'Status', sortable: true, cell: (p) => (
                <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge>
              )},
            ]}
            keyExtractor={(p) => p.id}
            emptyMessage="No plans registered for this provider."
          />
        </CardContent>
      </Card>

      {/* Notes (read-only view when not editing) */}
      {!editingProvider && provider.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{provider.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
