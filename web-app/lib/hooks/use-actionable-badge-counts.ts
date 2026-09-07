// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Fetches compact, actionable operational counters for sidebar navigation.
 * Used by useSidebarBadges; all requests are tenant-scoped by their APIs.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const CountResponseSchema = z.object({ count: z.number() });
const PharmacyAlertSummarySchema = z.object({ total: z.number() });
const InventoryExceptionsSchema = z.object({ total: z.number() });
const DischargeReadinessSchema = z.object({ total_blocked: z.number() });

async function getCount(url: string, params?: Record<string, string>): Promise<number> {
  try {
    const response = await apiClient.get(url, { params });
    return CountResponseSchema.parse(response.data).count;
  } catch {
    return 0;
  }
}

export function useActionableBadgeCounts(enabled: boolean) {
  return useQuery({
    queryKey: ['actionable-badge-counts'],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [
        pharmacyAlerts,
        inventoryExceptions,
        openVacancies,
        pendingSwaps,
        acceptedSwaps,
        insuranceQueries,
        rejectedClaims,
        pendingInvoices,
        pendingVerification,
        pendingBedRequests,
        dischargeReadiness,
        unacknowledgedSurveillanceAlerts,
      ] = await Promise.all([
        apiClient.get('/api/pharmacy/alerts/severity-summary/', { params: { resolved: 'false' } }),
        apiClient.get('/api/inventory/exceptions-summary/'),
        getCount('/api/scheduling/vacancies/', { status: 'OPEN', page_size: '1' }),
        getCount('/api/scheduling/shift-swaps/', { status: 'PENDING', page_size: '1' }),
        getCount('/api/scheduling/shift-swaps/', { status: 'ACCEPTED', page_size: '1' }),
        getCount('/api/insurance/claims/', { status: 'QUERY', page_size: '1' }),
        getCount('/api/insurance/claims/', { status: 'REJECTED', page_size: '1' }),
        getCount('/api/billing/invoices/', { status__in: 'pending,partial', page_size: '1' }),
        getCount('/api/lab/results/pending-verification/', { page_size: '1' }),
        getCount('/api/inpatient/bed-assignment-requests/', { status: 'PENDING', page_size: '1' }),
        apiClient.get('/api/inpatient/discharge-readiness-summary/'),
        getCount('/api/surveillance/alerts/', { is_acknowledged: 'false', page_size: '1' }),
      ]);

      return {
        pharmacyAlerts: PharmacyAlertSummarySchema.safeParse(pharmacyAlerts.data).data?.total ?? 0,
        inventoryExceptions: InventoryExceptionsSchema.safeParse(inventoryExceptions.data).data?.total ?? 0,
        openVacancies,
        pendingSwaps: pendingSwaps + acceptedSwaps,
        insuranceAction: insuranceQueries + rejectedClaims,
        pendingInvoices,
        pendingVerification,
        pendingBedRequests,
        dischargeReadiness:
          DischargeReadinessSchema.safeParse(dischargeReadiness.data).data?.total_blocked ?? 0,
        unacknowledgedSurveillanceAlerts,
      };
    },
  });
}
