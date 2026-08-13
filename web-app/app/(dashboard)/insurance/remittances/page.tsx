'use client';

import React, { useMemo, useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCheckClaimRemittance,
  useInsuranceClaims,
  useInsuranceRemittances,
  useRemittanceClaimsDrilldown,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import type {
  InsuranceRemittance,
  InsuranceRemittanceClaimsDrilldown,
} from '@/lib/types/insurance';

type RemittanceLookupError = {
  message: string;
  action?: string;
  upstreamPath?: string;
  upstreamStatus?: number;
};

function parseLookupError(error: unknown): RemittanceLookupError {
  const fallback: RemittanceLookupError = {
    message: 'Failed to fetch claim remittance from HealthCloud.',
  };

  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const err = error as {
    message?: string;
    response?: {
      data?: {
        error?: string;
        message?: string;
        action?: string;
        upstream?: {
          path?: string;
          status?: number;
        };
      };
    };
  };

  const data = err.response?.data;
  const upstream = data?.upstream;

  return {
    message: data?.error || data?.message || err.message || fallback.message,
    action: data?.action,
    upstreamPath: upstream?.path,
    upstreamStatus: upstream?.status,
  };
}

export default function InsuranceRemittancesPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useInsuranceRemittances({ page: 1 });
  const { data: claimsData } = useInsuranceClaims({ page: 1 });
  const checkClaimRemittance = useCheckClaimRemittance();
  const remittanceDrilldown = useRemittanceClaimsDrilldown();

  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(null);
  const [lookupError, setLookupError] = useState<RemittanceLookupError | null>(null);
  const [drilldownResult, setDrilldownResult] =
    useState<InsuranceRemittanceClaimsDrilldown | null>(null);

  const remittances = data?.results ?? [];
  const claims = claimsData?.results ?? [];

  const totals = useMemo(() => {
    const claimsAmount = remittances.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const reconciledAmount = remittances.reduce(
      (sum, item) => sum + Number(item.reconciled_amount || 0),
      0
    );
    return {
      claimsAmount,
      reconciledAmount,
    };
  }, [remittances]);

  const remittancePayload =
    lookupResult &&
    typeof lookupResult === 'object' &&
    'remittance' in lookupResult &&
    lookupResult.remittance &&
    typeof lookupResult.remittance === 'object'
      ? (lookupResult.remittance as Record<string, unknown>)
      : null;

  const handleClaimRemittanceLookup = async () => {
    if (!selectedClaimId) {
      toast({
        title: 'Select claim',
        description: 'Pick a submitted HealthCloud claim first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await checkClaimRemittance.mutateAsync(Number(selectedClaimId));
      setLookupResult(result);
      setLookupError(null);
      toast({ title: 'Claim remittance retrieved' });
      refetch();
    } catch (error) {
      const parsed = parseLookupError(error);
      setLookupResult(null);
      setLookupError(parsed);
      toast({
        title: 'Lookup failed',
        description: parsed.action ? `${parsed.message} ${parsed.action}` : parsed.message,
        variant: 'destructive',
      });
    }
  };

  const handleRemittanceDrilldown = async (id: number) => {
    try {
      const result = await remittanceDrilldown.mutateAsync(id);
      setDrilldownResult(result);
      toast({ title: 'Remittance claims loaded' });
    } catch {
      toast({
        title: 'Drilldown failed',
        description: 'Could not fetch claims for this remittance reference.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Remittances"
        helpContent="HealthCloud remittance feed and claim remittance lookups. This view is read-only against Slade remittance APIs."
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Slade Remittance Feed</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh Feed
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Batches: {remittances.length}</Badge>
            <Badge variant="outline">
              claims_amount: KES {totals.claimsAmount.toLocaleString()}
            </Badge>
            <Badge variant="outline">
              reconciled: KES {totals.reconciledAmount.toLocaleString()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mapping: Slade <code>claims_amount</code> → <code>total_amount</code>,{' '}
            <code>payer</code> → <code>payment_reference</code>, and upstream remittance key →{' '}
            <code>remittance_number</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim Remittance Lookup</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Claim</Label>
            <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
              <SelectTrigger>
                <SelectValue placeholder="Select claim" />
              </SelectTrigger>
              <SelectContent>
                {claims.map((claim) => (
                  <SelectItem key={claim.id} value={String(claim.id)}>
                    {claim.claim_number} - {claim.patient_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <Button onClick={() => void handleClaimRemittanceLookup()} disabled={checkClaimRemittance.isPending}>
              {checkClaimRemittance.isPending ? 'Checking...' : 'Check Claim Remittance'}
            </Button>
          </div>

          {lookupError && (
            <div className="md:col-span-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
              <p className="font-medium">{lookupError.message}</p>
              {lookupError.action && <p>{lookupError.action}</p>}
              {(lookupError.upstreamPath || lookupError.upstreamStatus) && (
                <p className="font-mono text-xs">
                  {lookupError.upstreamStatus ? `HTTP ${lookupError.upstreamStatus}` : 'Upstream'}
                  {lookupError.upstreamPath ? ` - ${lookupError.upstreamPath}` : ''}
                </p>
              )}
            </div>
          )}

          {remittancePayload && (
            <div className="md:col-span-3 rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">Latest claim remittance payload</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Provider Invoice No</p>
                  <p className="font-medium">{String(remittancePayload.provider_invoice_no || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proposed Amount</p>
                  <p className="font-medium">{String(remittancePayload.proposed_amount || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Approved Amount</p>
                  <p className="font-medium">{String(remittancePayload.approved_amount || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balanced Paid Amount</p>
                  <p className="font-medium">{String(remittancePayload.balanced_paid_amount || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance Invoiced Amount</p>
                  <p className="font-medium">{String(remittancePayload.balance_invoiced_amount || '-')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Copay Amount</p>
                  <p className="font-medium">{String(remittancePayload.copay_amount || '-')}</p>
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Raw response
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(remittancePayload, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      <ResponsiveTable<InsuranceRemittance>
        data={remittances}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        emptyMessage="No remittances found."
        columns={[
          {
            key: 'remittance_number',
            header: 'Remittance key',
            cell: (item) => item.remittance_number || 'N/A',
          },
          { key: 'provider_name', header: 'Provider', cell: (item) => item.provider_name || '-' },
          {
            key: 'payment_reference',
            header: 'Payer',
            cell: (item) => item.payment_reference || '-',
          },
          {
            key: 'total_amount',
            header: 'claims_amount',
            sortable: true,
            sortType: 'number',
            cell: (item) => `KES ${Number(item.total_amount || 0).toLocaleString()}`,
          },
          {
            key: 'remittance_date',
            header: 'Fetched date',
            sortable: true,
            sortType: 'date',
            cell: (item) => new Date(item.remittance_date).toLocaleDateString(),
          },
          { key: 'status', header: 'Local status', cell: (item) => item.status },
          {
            key: 'actions',
            header: 'Actions',
            cell: (item) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRemittanceDrilldown(item.id)}
                disabled={remittanceDrilldown.isPending}
              >
                Claims
              </Button>
            ),
          },
        ]}
      />

      {drilldownResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Remittance Claims - {drilldownResult.drilldown.remittance_reference}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Claims: {drilldownResult.drilldown.claims.length}</Badge>
              <Badge variant="outline">Processed: {drilldownResult.drilldown.processed}</Badge>
              <Badge variant="outline">Local lines: {drilldownResult.drilldown.local_lines}</Badge>
            </div>
            <ResponsiveTable<Record<string, unknown>>
              data={drilldownResult.drilldown.claims}
              keyExtractor={(item) =>
                String(
                  item.claim_number ||
                    item.claim_id ||
                    item.provider_invoice_no ||
                    `${item.approved_amount || 'claim'}-${item.balanced_paid_amount || '0'}`
                )
              }
              emptyMessage="No claims returned for this remittance."
              columns={[
                {
                  key: 'claim_number',
                  header: 'Claim',
                  cell: (item) =>
                    String(item.claim_number || item.claim_id || item.provider_invoice_no || '-'),
                },
                {
                  key: 'approved_amount',
                  header: 'Approved',
                  cell: (item) => String(item.approved_amount || '-'),
                },
                {
                  key: 'balanced_paid_amount',
                  header: 'Paid',
                  cell: (item) => String(item.balanced_paid_amount || '-'),
                },
                {
                  key: 'balance_invoiced_amount',
                  header: 'Balance',
                  cell: (item) => String(item.balance_invoiced_amount || '-'),
                },
                {
                  key: 'copay_amount',
                  header: 'Copay',
                  cell: (item) => String(item.copay_amount || '-'),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
