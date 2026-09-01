'use client';

import React, { useState } from 'react';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  useCreateProviderConfig,
  useInsuranceProviders,
  useProviderConfigs,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { InsuranceProviderConfig } from '@/lib/types/insurance';
import { useFacility } from '@/lib/context/facility-context';

const KNOWN_PAYER_CODES = [
  { name: 'Jubilee Health Insurance Limited', code: 457 },
  { name: 'APA Insurance Company', code: 2001 },
  { name: 'Madison General Insurance Kenya', code: 2011 },
  { name: 'Britam General Insurance', code: 2002 },
  { name: 'Minet Insurance Brokers Limited', code: 2020 },
  { name: 'Savannah Informatics Insurance Scheme', code: 2023 },
  { name: 'GNRSH Insurance Scheme', code: 2022 },
] as const;

export default function InsuranceProviderConfigsPage() {
  const { toast } = useToast();
  const { facility, organization } = useFacility();
  const { data: providersData } = useInsuranceProviders(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const {
    data: configsData,
    isLoading,
    refetch,
  } = useProviderConfigs(
    { page: 1, page_size: 200 },
    { enabled: !!facility?.id && !!organization?.id }
  );
  const createConfig = useCreateProviderConfig();

  const [provider, setProvider] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(
    'https://provider-edi-api.multitenant.slade360.co.ke/v1'
  );
  const [authBaseUrl, setAuthBaseUrl] = useState('https://accounts.multitenant.slade360.co.ke');
  const [providerEdiBaseUrl, setProviderEdiBaseUrl] = useState(
    'https://provider-edi-api.multitenant.slade360.co.ke/v1'
  );
  const [providerIsBaseUrl, setProviderIsBaseUrl] = useState(
    'https://is-api.multitenant.slade360.co.ke/v1'
  );
  const [healthCrmBaseUrl, setHealthCrmBaseUrl] = useState(
    'https://is-api.multitenant.slade360.co.ke/v1'
  );
  const [payerSladeCode, setPayerSladeCode] = useState('');
  const [apiEnabled, setApiEnabled] = useState(true);
  const [healthcloudEnabled, setHealthcloudEnabled] = useState(true);

  const providerOptions =
    providersData?.results ??
    Array.from(
      new Map(
        (configsData?.results ?? []).map((c) => [
          c.provider,
          { id: c.provider, name: c.provider_name },
        ])
      ).values()
    );

  const handleCreate = async () => {
    if (!provider) {
      toast({
        title: 'Missing provider',
        description: 'Select a provider before creating a provider config.',
        variant: 'destructive',
      });
      return;
    }

    if (healthcloudEnabled && !payerSladeCode) {
      toast({
        title: 'Missing payer code',
        description: 'Select payer Slade code when HealthCloud is enabled.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createConfig.mutateAsync({
        provider: Number(provider),
        api_base_url: apiBaseUrl,
        auth_base_url: authBaseUrl,
        provider_edi_base_url: providerEdiBaseUrl,
        provider_is_base_url: providerIsBaseUrl,
        health_crm_base_url: healthCrmBaseUrl,
        payer_slade_code: payerSladeCode ? Number(payerSladeCode) : null,
        api_enabled: apiEnabled,
        healthcloud_enabled: healthcloudEnabled,
        api_auth_type: 'oauth2',
      });
      toast({ title: 'Provider config created' });
      refetch();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create provider config.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Insurance Provider Configs"
        helpContent="Configure HealthCloud settings per provider and facility."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slade Credentials</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Manage shared facility-level Slade OAuth credentials in a separate page.
          </p>
          <Button asChild variant="outline">
            <Link href="/insurance/slade-credentials">Open Slade Credentials</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Provider Mapping</p>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Payer Slade Code</Label>
                <Select value={payerSladeCode} onValueChange={setPayerSladeCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payer code" />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_PAYER_CODES.map((entry) => (
                      <SelectItem key={entry.code} value={String(entry.code)}>
                        {entry.name} ({entry.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">API Endpoints</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Auth Base URL</Label>
                <Input value={authBaseUrl} onChange={(e) => setAuthBaseUrl(e.target.value)} />
              </div>
              <div>
                <Label>API Base URL</Label>
                <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
              </div>
              <div>
                <Label>Provider EDI Base URL</Label>
                <Input
                  value={providerEdiBaseUrl}
                  onChange={(e) => setProviderEdiBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <Label>Provider IS Base URL</Label>
                <Input
                  value={providerIsBaseUrl}
                  onChange={(e) => setProviderIsBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <Label>Health CRM Base URL</Label>
                <Input
                  value={healthCrmBaseUrl}
                  onChange={(e) => setHealthCrmBaseUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={apiEnabled} onCheckedChange={(v) => setApiEnabled(Boolean(v))} />
              <Label>API Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={healthcloudEnabled}
                onCheckedChange={(v) => setHealthcloudEnabled(Boolean(v))}
              />
              <Label>HealthCloud Enabled</Label>
            </div>
          </div>

          <div className="flex justify-end md:col-span-2">
            <Button onClick={handleCreate} disabled={createConfig.isPending}>
              {createConfig.isPending ? 'Saving...' : 'Create Config'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResponsiveTable<InsuranceProviderConfig>
        data={configsData?.results ?? []}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyMessage="No provider configs found."
        columns={[
          { key: 'provider_name', header: 'Provider', cell: (item) => item.provider_name },
          {
            key: 'payer_slade_code',
            header: 'Payer Code',
            cell: (item) => item.payer_slade_code ?? '-',
          },
          {
            key: 'api_enabled',
            header: 'API',
            cell: (item) => (item.api_enabled ? 'Enabled' : 'Disabled'),
          },
          {
            key: 'healthcloud_enabled',
            header: 'HealthCloud',
            cell: (item) => (item.healthcloud_enabled ? 'Enabled' : 'Disabled'),
          },
        ]}
      />
    </div>
  );
}
