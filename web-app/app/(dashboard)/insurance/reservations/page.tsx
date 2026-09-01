'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  useInsuranceClaims,
  useReserveClaimBalance,
  useVisitAuthorizations,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { InsuranceClaim, InsuranceVisitAuthorization } from '@/lib/types/insurance';

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

type ReservationDraft = {
  invoice_number: string;
  amount: string;
};

export default function InsuranceReservationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const reserveBalance = useReserveClaimBalance();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [draftByClaimId, setDraftByClaimId] = useState<Record<number, ReservationDraft>>({});
  const debouncedSearch = useDebounce(search, 300);

  const { data: claimsData, isLoading } = useInsuranceClaims({
    page,
    search: debouncedSearch || undefined,
  });
  const { data: authorizationsData } = useVisitAuthorizations({ page: 1, page_size: 250 });

  const claims = claimsData?.results ?? [];
  const totalCount = claimsData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const validatedAuthByEnrollment = useMemo(() => {
    const map = new Map<number, InsuranceVisitAuthorization>();
    const sessions = authorizationsData?.results ?? [];

    sessions
      .filter(
        (session) =>
          session.status === 'validated' || session.workflow_step === 'authorization_validated'
      )
      .forEach((session) => {
        const existing = map.get(session.enrollment);
        if (
          !existing ||
          new Date(session.updated_at).getTime() > new Date(existing.updated_at).getTime()
        ) {
          map.set(session.enrollment, session);
        }
      });

    return map;
  }, [authorizationsData?.results]);

  const getDraft = (claim: InsuranceClaim): ReservationDraft => {
    return (
      draftByClaimId[claim.id] ?? {
        invoice_number: claim.claim_number,
        amount: claim.total_amount,
      }
    );
  };

  const updateDraft = (claim: InsuranceClaim, patch: Partial<ReservationDraft>) => {
    const current = getDraft(claim);
    setDraftByClaimId((prev) => ({
      ...prev,
      [claim.id]: {
        invoice_number: current.invoice_number,
        amount: current.amount,
        ...patch,
      },
    }));
  };

  const handleReserve = async (claim: InsuranceClaim) => {
    const authorization = validatedAuthByEnrollment.get(claim.patient_insurance);
    if (!authorization) {
      toast({
        title: 'No validated authorization',
        description: 'This claim has no validated session yet. Validate token first.',
        variant: 'destructive',
      });
      return;
    }

    const draft = getDraft(claim);
    if (!draft.invoice_number || !draft.amount) {
      toast({
        title: 'Missing fields',
        description: 'Invoice number and amount are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await reserveBalance.mutateAsync({
        id: claim.id,
        data: {
          authorization_id: authorization.id,
          invoice_number: draft.invoice_number,
          amount: draft.amount,
        },
      });
      toast({
        title: 'Balance reserved',
        description: `Reservation ${result.reservation_guid || result.id} created.`,
      });
    } catch {
      toast({
        title: 'Reservation failed',
        description: 'Could not reserve balance for this claim.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Balance Reservations"
        helpContent="Reserve insurer balance per claim using the latest validated authorization session."
      />

      <Card>
        <CardContent className="p-3">
          <Input
            placeholder="Search claim number, patient, member number, provider..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <ResponsiveTable<InsuranceClaim>
        data={claims}
        isLoading={isLoading}
        keyExtractor={(item) => item.id}
        columns={[
          {
            key: 'claim',
            header: 'Claim',
            cell: (item) => (
              <div>
                <p className="font-mono text-sm font-medium">{item.claim_number}</p>
                <p className="text-xs text-muted-foreground">
                  {item.patient_name} - {item.member_number}
                </p>
              </div>
            ),
          },
          {
            key: 'amount',
            header: 'Claim Amount',
            cell: (item) => (
              <span className="text-sm font-medium">{formatCurrency(item.total_amount)}</span>
            ),
          },
          {
            key: 'authorization',
            header: 'Authorization',
            cell: (item) => {
              const authorization = validatedAuthByEnrollment.get(item.patient_insurance);
              if (!authorization) {
                return <Badge variant="outline">Missing validated session</Badge>;
              }
              return (
                <Badge className="bg-green-100 text-green-800">Session #{authorization.id}</Badge>
              );
            },
          },
          {
            key: 'reservation',
            header: 'Reserve Balance',
            cell: (item) => {
              const draft = getDraft(item);
              const hasAuthorization = validatedAuthByEnrollment.has(item.patient_insurance);

              return (
                <div className="grid w-full max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-[180px_140px_auto]">
                  <Input
                    value={draft.invoice_number}
                    placeholder="Invoice number"
                    onChange={(e) => updateDraft(item, { invoice_number: e.target.value })}
                  />
                  <Input
                    value={draft.amount}
                    placeholder={item.total_amount}
                    onChange={(e) => updateDraft(item, { amount: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleReserve(item)}
                    disabled={!hasAuthorization || reserveBalance.isPending}
                  >
                    {reserveBalance.isPending ? 'Reserving...' : 'Reserve'}
                  </Button>
                </div>
              );
            },
          },
          {
            key: 'open',
            header: 'Open',
            cell: (item) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/insurance/claims/${item.id}`)}
              >
                Claim
              </Button>
            ),
          },
        ]}
        emptyMessage="No claims available for reservation."
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
