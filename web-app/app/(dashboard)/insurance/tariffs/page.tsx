'use client';

import React, { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useCreateTariff, useInsuranceProviders, usePayerTariffs } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { PayerTariff } from '@/lib/types/insurance';

export default function InsuranceTariffsPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = usePayerTariffs({ page: 1 });
  const { data: providersData } = useInsuranceProviders({ page: 1 });
  const createTariff = useCreateTariff();

  const [provider, setProvider] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [payerCode, setPayerCode] = useState('');
  const [tariffAmount, setTariffAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [requiresPreauth, setRequiresPreauth] = useState(false);

  const handleCreate = async () => {
    if (!provider || !serviceCode || !payerCode || !tariffAmount) {
      toast({
        title: 'Missing fields',
        description: 'Provider, service code, payer code, and tariff amount are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createTariff.mutateAsync({
        provider: Number(provider),
        service_code: serviceCode,
        payer_code: payerCode,
        tariff_amount: tariffAmount,
        effective_from: effectiveFrom,
        requires_preauth: requiresPreauth,
      });
      toast({ title: 'Tariff created' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to create tariff.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Payer Tariffs"
        helpContent="Maintain payer service code and tariff mappings."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Tariff</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {(providersData?.results ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Service Code</Label>
            <Input value={serviceCode} onChange={(e) => setServiceCode(e.target.value)} />
          </div>
          <div>
            <Label>Payer Code</Label>
            <Input value={payerCode} onChange={(e) => setPayerCode(e.target.value)} />
          </div>
          <div>
            <Label>Tariff Amount</Label>
            <Input value={tariffAmount} onChange={(e) => setTariffAmount(e.target.value)} />
          </div>
          <div>
            <Label>Effective From</Label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <div className="mt-6 flex items-center gap-2">
            <Checkbox
              checked={requiresPreauth}
              onCheckedChange={(v) => setRequiresPreauth(Boolean(v))}
            />
            <Label>Requires preauth</Label>
          </div>
          <div className="flex justify-end md:col-span-2">
            <Button onClick={handleCreate} disabled={createTariff.isPending}>
              {createTariff.isPending ? 'Creating...' : 'Create Tariff'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResponsiveTable<PayerTariff>
        data={data?.results ?? []}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyMessage="No tariffs found."
        columns={[
          { key: 'provider_name', header: 'Provider', cell: (item) => item.provider_name },
          { key: 'service_code', header: 'Service Code', cell: (item) => item.service_code },
          { key: 'payer_code', header: 'Payer Code', cell: (item) => item.payer_code },
          {
            key: 'tariff_amount',
            header: 'Tariff',
            cell: (item) => `KES ${Number(item.tariff_amount).toLocaleString()}`,
          },
          {
            key: 'requires_preauth',
            header: 'Preauth',
            cell: (item) => (item.requires_preauth ? 'Yes' : 'No'),
          },
        ]}
      />
    </div>
  );
}
