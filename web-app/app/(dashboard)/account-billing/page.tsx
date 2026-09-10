// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Tenant account and billing page. View entitlements and initiate hosted Paystack checkout. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Cpu, ExternalLink, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useFacility } from '@/lib/context/facility-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { organizationsApi } from '@/lib/api/organizations';
import { subscriptionPlansApi } from '@/lib/api/subscription-plans';
import type { BillingContact } from '@/lib/types/organization';

function formatAmount(amount: string, currency = 'KES') {
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function formatTokens(value: number | null) {
  return value === null ? 'Unlimited' : value.toLocaleString();
}

export default function AccountBillingPage() {
  const { organization } = useFacility();
  const { isAdmin } = usePermissions();
  const searchParams = useSearchParams();
  const reconciledReference = useRef<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [interval, setInterval] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [billingContact, setBillingContact] = useState<BillingContact>({
    contact_name: '', billing_email: '', phone: '', billing_address: '', kra_pin: '',
  });
  const organizationId = organization?.id;

  const { data: billing, isLoading, refetch } = useQuery({
    queryKey: ['account-billing', organizationId],
    queryFn: () => organizationsApi.getAccountBilling(organizationId as number),
    enabled: Boolean(organizationId),
  });
  const { data: plansData } = useQuery({
    queryKey: ['subscription-plans', 'account-billing'],
    queryFn: () => subscriptionPlansApi.list({ is_active: true, ordering: 'sort_order' }),
    enabled: Boolean(organizationId),
  });
  const { data: billingContactData, refetch: refetchBillingContact } = useQuery({
    queryKey: ['billing-contact', organizationId],
    queryFn: () => organizationsApi.getBillingContact(organizationId as number),
    enabled: Boolean(organizationId),
  });
  const checkoutMutation = useMutation({
    mutationFn: () => organizationsApi.initiatePaystackCheckout(organizationId as number, {
      plan_id: Number(selectedPlan),
      billing_interval: interval,
    }),
    onSuccess: ({ authorization_url }) => window.location.assign(authorization_url),
    onError: () => toast.error('Unable to start Paystack checkout. Please contact support if the issue continues.'),
  });
  const reconcileMutation = useMutation({
    mutationFn: (reference: string) => organizationsApi.reconcilePaystackPayment(organizationId as number, reference),
    onSuccess: () => {
      toast.success('Payment confirmed and subscription activated');
      refetch();
    },
    onError: () => toast.message('Payment is still being confirmed. Your history will update automatically after Paystack verification.'),
  });
  const billingContactMutation = useMutation({
    mutationFn: () => organizationsApi.updateBillingContact(organizationId as number, billingContact),
    onSuccess: () => {
      toast.success('Billing contact updated');
      refetchBillingContact();
    },
    onError: () => toast.error('Unable to update billing contact details'),
  });

  useEffect(() => {
    const reference = searchParams.get('reference') ?? searchParams.get('trxref');
    if (organizationId && reference && reconciledReference.current !== reference) {
      reconciledReference.current = reference;
      reconcileMutation.mutate(reference);
    }
  }, [organizationId, reconcileMutation, searchParams]);

  useEffect(() => {
    if (billing?.plan && !selectedPlan) setSelectedPlan(String(billing.plan.id));
  }, [billing?.plan, selectedPlan]);

  useEffect(() => {
    if (billingContactData) setBillingContact(billingContactData);
  }, [billingContactData]);

  if (!organizationId) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Select an organization to view account billing.</CardContent></Card>;
  }
  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!billing) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Billing details are unavailable.</CardContent></Card>;
  }

  const plans = plansData?.results ?? [];
  const selected = plans.find((plan) => plan.id === Number(selectedPlan));
  const price = selected ? (interval === 'ANNUAL' ? selected.annual_price : selected.monthly_price) : null;
  const canPay = isAdmin && selectedPlan && Number(price) > 0;
  const aiUsageText = billing.ai_tokens.monthly === null
    ? `${formatTokens(billing.ai_tokens.used)} used · no token limit`
    : `${formatTokens(billing.ai_tokens.remaining)} remaining of ${formatTokens(billing.ai_tokens.monthly)}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Account & Billing" helpContent="Review your organization plan, AI allowance, and payment history. Plan changes take effect only after a verified payment is confirmed." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden md:col-span-2"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" /><CardContent className="relative p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Current plan</p><p className="text-xl font-semibold">{billing.plan?.name ?? 'No active plan'}</p><p className="mt-1 text-sm text-muted-foreground">{billing.subscription_valid_until ? `Valid until ${new Date(billing.subscription_valid_until).toLocaleDateString()}` : 'No expiry date set'}</p></div><Badge variant={billing.subscription_status === 'ACTIVE' ? 'default' : 'secondary'}>{billing.subscription_status}</Badge></div></CardContent></Card>
        <Card className="relative overflow-hidden"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" /><CardContent className="relative p-5"><Cpu className="mb-3 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">AI token spend</p><p className="text-xl font-semibold">{formatTokens(billing.ai_tokens.used)} used</p><p className="mt-1 text-sm text-muted-foreground">{aiUsageText}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />Upgrade or Renew
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-none">
            <Label htmlFor="current-plan">Plan</Label>
            <div className="mt-1 flex gap-2">
              <div className="w-28 min-w-0 flex-none">
                <Input
                  id="current-plan"
                  readOnly
                  value={billing.plan?.name ?? 'No active plan'}
                  className="w-full bg-muted"
                />
              </div>
              <div className="w-96 min-w-0 flex-none">
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger className="w-full min-w-0" aria-label="Change plan">
                    <span>Change</span>
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name} · {formatAmount(interval === 'ANNUAL' ? plan.annual_price : plan.monthly_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="w-full min-w-0 sm:w-48 sm:flex-none">
            <Label htmlFor="billing-frequency">Billing frequency</Label>
            <Select value={interval} onValueChange={(value) => setInterval(value as 'MONTHLY' | 'ANNUAL')}>
              <SelectTrigger id="billing-frequency" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="ANNUAL">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="w-fit flex-none px-2"
            disabled={!canPay || checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate()}
          >
            {checkoutMutation.isPending ? 'Opening checkout...' : (
              <><ExternalLink className="mr-1 h-4 w-4" />Pay with Paystack</>
            )}
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            {isAdmin ? 'Payment opens in Paystack. The page will verify the returned payment reference; webhook verification remains the authoritative fallback.' : 'Ask an organization administrator to initiate a renewal or upgrade payment.'}
          </p>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Billing Contact</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="billing-contact-name">Contact name</Label><Input id="billing-contact-name" className="mt-1" disabled={!isAdmin} value={billingContact.contact_name} onChange={(event) => setBillingContact({ ...billingContact, contact_name: event.target.value })} /></div><div><Label htmlFor="billing-email">Billing email</Label><Input id="billing-email" type="email" className="mt-1" disabled={!isAdmin} value={billingContact.billing_email} onChange={(event) => setBillingContact({ ...billingContact, billing_email: event.target.value })} /></div><div><Label htmlFor="billing-phone">Phone number</Label><Input id="billing-phone" className="mt-1" disabled={!isAdmin} value={billingContact.phone} onChange={(event) => setBillingContact({ ...billingContact, phone: event.target.value })} /></div><div><Label htmlFor="billing-kra">KRA PIN</Label><Input id="billing-kra" className="mt-1" disabled={!isAdmin} value={billingContact.kra_pin} onChange={(event) => setBillingContact({ ...billingContact, kra_pin: event.target.value })} /></div><div className="md:col-span-2"><Label htmlFor="billing-address">Billing address</Label><Input id="billing-address" className="mt-1" disabled={!isAdmin} value={billingContact.billing_address} onChange={(event) => setBillingContact({ ...billingContact, billing_address: event.target.value })} /></div>{isAdmin && <div className="md:col-span-2"><Button disabled={billingContactMutation.isPending} onClick={() => billingContactMutation.mutate()}>{billingContactMutation.isPending ? 'Saving...' : 'Save billing contact'}</Button></div>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" />Subscription History</CardTitle></CardHeader><CardContent className="px-0 sm:px-6"><ResponsiveTable data={billing.periods} keyExtractor={(period) => period.id} columns={[{ key: 'amount', header: 'Amount', sortable: true, sortType: 'number', cell: (period) => formatAmount(period.amount, period.currency) }, { key: 'billing_interval', header: 'Frequency', sortable: true, cell: (period) => period.billing_interval === 'ANNUAL' ? 'Annual' : 'Monthly' }, { key: 'period_end', header: 'Valid Until', sortable: true, sortType: 'date', cell: (period) => new Date(period.period_end).toLocaleDateString() }, { key: 'status', header: 'Status', sortable: true, cell: (period) => <Badge variant={period.status === 'PAID' ? 'default' : 'secondary'}>{period.status}</Badge> }]} emptyMessage="No subscription periods yet." /></CardContent></Card>
    </div>
  );
}
