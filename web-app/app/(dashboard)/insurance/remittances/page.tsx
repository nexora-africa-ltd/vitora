'use client';

import React, { useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateRemittance, useInsuranceProviders, useInsuranceRemittances, useReconcileRemittance } from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type { InsuranceRemittance } from '@/lib/types/insurance';

export default function InsuranceRemittancesPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useInsuranceRemittances({ page: 1 });
  const { data: providersData } = useInsuranceProviders({ page: 1 });
  const createRemittance = useCreateRemittance();
  const reconcileRemittance = useReconcileRemittance();

  const [provider, setProvider] = useState('');
  const [remittanceNumber, setRemittanceNumber] = useState('');
  const [remittanceDate, setRemittanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState('');

  const handleCreate = async () => {
    if (!provider || !remittanceNumber || !totalAmount) {
      toast({ title: 'Missing fields', description: 'Provider, remittance number, and total amount are required.', variant: 'destructive' });
      return;
    }
    try {
      await createRemittance.mutateAsync({
        provider: Number(provider),
        remittance_number: remittanceNumber,
        remittance_date: remittanceDate,
        total_amount: totalAmount,
      });
      toast({ title: 'Remittance created' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to create remittance.', variant: 'destructive' });
    }
  };

  const handleReconcile = async (id: number) => {
    try {
      await reconcileRemittance.mutateAsync(id);
      toast({ title: 'Remittance reconciled' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to reconcile remittance.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Remittances" helpContent="Manage insurance remittance batches and reconciliation." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Remittance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {(providersData?.results ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Remittance Number</Label>
            <Input value={remittanceNumber} onChange={(e) => setRemittanceNumber(e.target.value)} />
          </div>
          <div>
            <Label>Remittance Date</Label>
            <Input type="date" value={remittanceDate} onChange={(e) => setRemittanceDate(e.target.value)} />
          </div>
          <div>
            <Label>Total Amount</Label>
            <Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={handleCreate} disabled={createRemittance.isPending}>{createRemittance.isPending ? 'Creating...' : 'Create Remittance'}</Button>
          </div>
        </CardContent>
      </Card>

      <ResponsiveTable<InsuranceRemittance>
        data={data?.results ?? []}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyMessage="No remittances found."
        columns={[
          { key: 'remittance_number', header: 'Remittance #', cell: (item) => item.remittance_number },
          { key: 'provider_name', header: 'Provider', cell: (item) => item.provider_name },
          { key: 'remittance_date', header: 'Date', cell: (item) => new Date(item.remittance_date).toLocaleDateString() },
          { key: 'total_amount', header: 'Total', cell: (item) => `KES ${Number(item.total_amount).toLocaleString()}` },
          { key: 'status', header: 'Status', cell: (item) => item.status },
          {
            key: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button size="sm" variant="outline" onClick={() => void handleReconcile(item.id)}>
                Reconcile
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
