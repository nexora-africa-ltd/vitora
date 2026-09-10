// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Platform subscription billing ledger. Create periods and confirm verified payments. */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { organizationsApi } from '@/lib/api/organizations';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import { subscriptionPeriodsApi } from '@/lib/api/subscription-periods';
import type { SubscriptionPeriodCreateData } from '@/lib/types/subscription';

const EMPTY_FORM: SubscriptionPeriodCreateData = {
  organization: 0,
  plan: 0,
  billing_interval: 'MONTHLY',
  amount: '',
  currency: 'KES',
  period_start: '',
  period_end: '',
};

function formatMoney(amount: string, currency: string) {
  return `${currency} ${Number(amount).toLocaleString()}`;
}

export default function SubscriptionPeriodsPage() {
  const { isSuperuser } = usePermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [form, setForm] = useState<SubscriptionPeriodCreateData>(EMPTY_FORM);

  const { data: periodsData, isLoading } = useQuery({
    queryKey: ['subscription-periods'],
    queryFn: () => subscriptionPeriodsApi.list(),
    enabled: isSuperuser,
  });
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations', 'subscription-periods'],
    queryFn: () => organizationsApi.list(),
    enabled: isSuperuser && createOpen,
  });
  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans', 'subscription-periods'],
    queryFn: () => subscriptionPlansApi.list({ is_active: true, ordering: 'sort_order' }),
    enabled: isSuperuser && createOpen,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['subscription-periods'] });
  const createMutation = useMutation({
    mutationFn: (data: SubscriptionPeriodCreateData) => subscriptionPeriodsApi.create(data),
    onSuccess: () => {
      toast.success('Subscription period created');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: () => toast.error('Could not create the subscription period'),
  });
  const confirmMutation = useMutation({
    mutationFn: ({ id, reference }: { id: number; reference: string }) => subscriptionPeriodsApi.confirm(id, reference),
    onSuccess: () => {
      toast.success('Payment confirmed and entitlement activated');
      setConfirmingId(null);
      setPaymentReference('');
      invalidate();
    },
    onError: () => toast.error('Could not confirm this payment reference'),
  });

  if (!isSuperuser) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Only Nexora superusers can manage subscription billing.</CardContent></Card>;
  }

  const periods = periodsData?.results ?? [];
  const organizations = organizationsData?.results ?? [];
  const plans = plansData?.results ?? [];
  const selectedPeriod = periods.find((period) => period.id === confirmingId);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Subscription Billing"
        helpContent="Create an auditable subscription period first. Confirming a verified payment activates its plan and resets the organization AI quota."
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />New Period</Button>}
      />
      <ResponsiveTable
        data={periods}
        isLoading={isLoading}
        keyExtractor={(period) => period.id}
        defaultSortColumn="period_end"
        defaultSortDirection="desc"
        columns={[
          { key: 'organization', header: 'Organization', sortable: true, cell: (period) => `Organization #${period.organization}` },
          { key: 'plan', header: 'Plan', sortable: true, cell: (period) => `Plan #${period.plan}` },
          { key: 'amount', header: 'Amount', sortable: true, sortType: 'number', cell: (period) => formatMoney(period.amount, period.currency) },
          { key: 'period_end', header: 'Valid Until', sortable: true, sortType: 'date', cell: (period) => new Date(period.period_end).toLocaleDateString() },
          { key: 'status', header: 'Status', sortable: true, cell: (period) => <Badge variant={period.status === 'PAID' ? 'default' : 'secondary'}>{period.status}</Badge> },
          { key: 'actions', header: '', cell: (period) => period.status === 'PENDING' ? <Button size="sm" variant="outline" onClick={() => setConfirmingId(period.id)}><CheckCircle2 className="mr-1 h-4 w-4" />Confirm</Button> : null },
        ]}
        mobileCard={(period) => <div className="flex items-center justify-between p-3"><div><p className="font-medium">{formatMoney(period.amount, period.currency)}</p><p className="text-xs text-muted-foreground">Valid until {new Date(period.period_end).toLocaleDateString()}</p></div><Badge variant={period.status === 'PAID' ? 'default' : 'secondary'}>{period.status}</Badge></div>}
        emptyMessage="No subscription periods have been created."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Subscription Period</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label>Organization</Label><Select value={form.organization ? String(form.organization) : ''} onValueChange={(value) => setForm({ ...form, organization: Number(value) })}><SelectTrigger className="mt-1"><SelectValue placeholder="Select organization" /></SelectTrigger><SelectContent>{organizations.map((organization) => <SelectItem key={organization.id} value={String(organization.id)}>{organization.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Plan</Label><Select value={form.plan ? String(form.plan) : ''} onValueChange={(value) => { const plan = plans.find((item) => item.id === Number(value)); setForm({ ...form, plan: Number(value), amount: plan ? (form.billing_interval === 'ANNUAL' ? plan.annual_price : plan.monthly_price) : form.amount }); }}><SelectTrigger className="mt-1"><SelectValue placeholder="Select plan" /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={String(plan.id)}>{plan.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Billing interval</Label><Select value={form.billing_interval} onValueChange={(value) => setForm({ ...form, billing_interval: value as 'MONTHLY' | 'ANNUAL' })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">Monthly</SelectItem><SelectItem value="ANNUAL">Annual</SelectItem></SelectContent></Select></div><div><Label htmlFor="amount">Amount</Label><Input id="amount" type="number" min="0.01" step="0.01" className="mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="period-start">Starts</Label><Input id="period-start" type="datetime-local" className="mt-1" value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} /></div><div><Label htmlFor="period-end">Ends</Label><Input id="period-end" type="datetime-local" className="mt-1" value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} /></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!form.organization || !form.plan || !form.amount || !form.period_start || !form.period_end || createMutation.isPending} onClick={() => createMutation.mutate({ ...form, period_start: new Date(form.period_start).toISOString(), period_end: new Date(form.period_end).toISOString() })}>{createMutation.isPending ? 'Creating...' : 'Create Period'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingId !== null} onOpenChange={(open) => !open && setConfirmingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Verified Payment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This activates {selectedPeriod ? formatMoney(selectedPeriod.amount, selectedPeriod.currency) : 'the'} subscription period. Only enter a payment reference verified through the payment provider or approved finance workflow.</p>
          <div><Label htmlFor="payment-reference">Payment reference</Label><Input id="payment-reference" className="mt-1" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmingId(null)}>Cancel</Button><Button disabled={!paymentReference.trim() || confirmMutation.isPending || confirmingId === null} onClick={() => confirmingId !== null && confirmMutation.mutate({ id: confirmingId, reference: paymentReference.trim() })}><ReceiptText className="mr-1 h-4 w-4" />{confirmMutation.isPending ? 'Confirming...' : 'Confirm Payment'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
