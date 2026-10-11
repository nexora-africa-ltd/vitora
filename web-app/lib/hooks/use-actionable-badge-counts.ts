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

export type ActionableBadgeModules = Partial<
  Record<
    | 'pharmacy'
    | 'inventory'
    | 'scheduling'
    | 'insurance'
    | 'billing'
    | 'laboratory'
    | 'inpatient'
    | 'surveillance',
    boolean
  >
>;

async function getCount(url: string, params?: Record<string, string>): Promise<number> {
  try {
    const response = await apiClient.get(url, { params });
    return CountResponseSchema.parse(response.data).count;
  } catch {
    return 0;
  }
}

export function useActionableBadgeCounts(enabled: boolean, modules?: ActionableBadgeModules) {
  return useQuery({
    queryKey: ['actionable-badge-counts', modules],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const moduleEnabled = (module: keyof ActionableBadgeModules) =>
        modules ? Boolean(modules[module]) : true;

      // Keep sidebar-only work behind the interactive dashboard path. Batches
      // stay below the staging database pool size instead of launching twelve
      // independent count queries together.
      const [pharmacyAlerts, inventoryExceptions, pendingVerification] = await Promise.all([
        moduleEnabled('pharmacy')
          ? apiClient.get('/api/pharmacy/alerts/severity-summary/', {
              params: { resolved: 'false' },
            })
          : Promise.resolve(null),
        moduleEnabled('inventory')
          ? apiClient.get('/api/inventory/exceptions-summary/')
          : Promise.resolve(null),
        moduleEnabled('laboratory')
          ? getCount('/api/lab/results/pending-verification/', { page_size: '1' })
          : Promise.resolve(0),
      ]);
      const [openVacancies, pendingSwaps, acceptedSwaps] = await Promise.all([
        moduleEnabled('scheduling')
          ? getCount('/api/scheduling/vacancies/', { status: 'OPEN', page_size: '1' })
          : Promise.resolve(0),
        moduleEnabled('scheduling')
          ? getCount('/api/scheduling/shift-swaps/', { status: 'PENDING', page_size: '1' })
          : Promise.resolve(0),
        moduleEnabled('scheduling')
          ? getCount('/api/scheduling/shift-swaps/', { status: 'ACCEPTED', page_size: '1' })
          : Promise.resolve(0),
      ]);
      const [insuranceQueries, rejectedClaims, pendingInvoices] = await Promise.all([
        moduleEnabled('insurance')
          ? getCount('/api/insurance/claims/', { status: 'query', page_size: '1' })
          : Promise.resolve(0),
        moduleEnabled('insurance')
          ? getCount('/api/insurance/claims/', { status: 'rejected', page_size: '1' })
          : Promise.resolve(0),
        moduleEnabled('billing')
          ? getCount('/api/billing/invoices/', { status__in: 'pending,partial', page_size: '1' })
          : Promise.resolve(0),
      ]);
      const [pendingBedRequests, dischargeReadiness, unacknowledgedSurveillanceAlerts] =
        await Promise.all([
          moduleEnabled('inpatient')
            ? getCount('/api/inpatient/bed-assignment-requests/', {
                status: 'PENDING',
                page_size: '1',
              })
            : Promise.resolve(0),
          moduleEnabled('inpatient')
            ? apiClient.get('/api/inpatient/discharge-readiness-summary/')
            : Promise.resolve(null),
          moduleEnabled('surveillance')
            ? getCount('/api/surveillance/alerts/', { is_acknowledged: 'false', page_size: '1' })
            : Promise.resolve(0),
        ]);

      return {
        pharmacyAlerts: PharmacyAlertSummarySchema.safeParse(pharmacyAlerts?.data).data?.total ?? 0,
        inventoryExceptions:
          InventoryExceptionsSchema.safeParse(inventoryExceptions?.data).data?.total ?? 0,
        openVacancies,
        pendingSwaps: pendingSwaps + acceptedSwaps,
        insuranceAction: insuranceQueries + rejectedClaims,
        pendingInvoices,
        pendingVerification,
        pendingBedRequests,
        dischargeReadiness:
          DischargeReadinessSchema.safeParse(dischargeReadiness?.data).data?.total_blocked ?? 0,
        unacknowledgedSurveillanceAlerts,
      };
    },
  });
}
