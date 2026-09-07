'use client';

import { useMemo } from 'react';
import { useDashboardStats } from '@/lib/hooks/use-dashboard-stats';
import { useUnreadCount } from '@/lib/hooks/use-notifications';
import { useWaitingQueue } from '@/lib/hooks/use-triage';
import { useActionableBadgeCounts } from '@/lib/hooks/use-actionable-badge-counts';
import { useAuth } from '@/lib/auth/context';

/**
 * Badge counts keyed by sidebar item href.
 * Only items with actionable pending counts get badges.
 */
export type SidebarBadges = Record<string, number>;

/**
 * Derives sidebar badge counts from dashboard stats and notification counts.
 *
 * Reuses the existing `useDashboardStats` (5-min polling) and
 * `useUnreadCount` (30-sec polling) hooks — no extra API calls.
 */
export function useSidebarBadges(): SidebarBadges {
  const { isAuthenticated, isLoading } = useAuth();
  const canQuery = isAuthenticated && !isLoading;
  const { data: stats } = useDashboardStats({ enabled: canQuery });
  const { data: unreadCount } = useUnreadCount({ enabled: canQuery });
  const { data: waitingTriageQueue } = useWaitingQueue(
    { status: 'WAITING_TRIAGE' },
    { enabled: canQuery }
  );
  const { data: actionableCounts } = useActionableBadgeCounts(canQuery);

  return useMemo(() => {
    const badges: SidebarBadges = {};
    if (!stats) return badges;

    // Check-in: patients waiting
    if (stats.checkin.waiting > 0) {
      badges['/patients/checkin'] = stats.checkin.waiting;
    }

    // Triage: patients still awaiting their initial assessment, not past assessments.
    if ((waitingTriageQueue?.count ?? 0) > 0) {
      badges['/triage'] = waitingTriageQueue?.count ?? 0;
    }

    // Encounters: in-progress encounters
    if (stats.encounters.in_progress > 0) {
      badges['/encounters'] = stats.encounters.in_progress;
    }

    // Pharmacy: pending dispensing
    if (stats.pharmacy.pending_dispensing > 0) {
      badges['/pharmacy/dispensing'] = stats.pharmacy.pending_dispensing;
    }

    if ((actionableCounts?.pharmacyAlerts ?? 0) > 0) {
      badges['/pharmacy'] = actionableCounts?.pharmacyAlerts ?? 0;
    }

    if ((actionableCounts?.inventoryExceptions ?? 0) > 0) {
      badges['/inventory'] = actionableCounts?.inventoryExceptions ?? 0;
    }

    // Laboratory: pending tests
    if (stats.laboratory.pending_tests > 0) {
      badges['/laboratory/orders'] = stats.laboratory.pending_tests;
    }

    // Laboratory: results awaiting verification.
    if ((actionableCounts?.pendingVerification ?? 0) > 0) {
      badges['/laboratory/validations'] = actionableCounts?.pendingVerification ?? 0;
    }

    // Imaging: urgent orders take precedence over the broad worklist count.
    if (stats.imaging.urgent_orders > 0) {
      badges['/imaging/worklist'] = stats.imaging.urgent_orders;
    }

    if ((actionableCounts?.pendingBedRequests ?? 0) > 0) {
      badges['/inpatient/bed-assignment-requests'] = actionableCounts?.pendingBedRequests ?? 0;
    }

    if ((actionableCounts?.dischargeReadiness ?? 0) > 0) {
      badges['/admissions'] = actionableCounts?.dischargeReadiness ?? 0;
    }

    // Emergency: pending review
    if (stats.emergency.pending_review > 0) {
      badges['/emergency'] = stats.emergency.pending_review;
    }

    // Billing: invoices awaiting payment. `pending_payments` is a currency amount, not a count.
    if ((actionableCounts?.pendingInvoices ?? 0) > 0) {
      badges['/transactions/invoices'] = actionableCounts?.pendingInvoices ?? 0;
    }

    // Billing: pending SHA claims
    if (stats.billing.sha_claims_pending > 0) {
      badges['/transactions/sha-claims'] = stats.billing.sha_claims_pending;
    }

    if ((actionableCounts?.insuranceAction ?? 0) > 0) {
      badges['/insurance/claims'] = actionableCounts?.insuranceAction ?? 0;
    }

    if ((actionableCounts?.pendingSwaps ?? 0) > 0) {
      badges['/scheduling/shift-swaps'] = actionableCounts?.pendingSwaps ?? 0;
    }

    if ((actionableCounts?.openVacancies ?? 0) > 0) {
      badges['/scheduling/roster'] = actionableCounts?.openVacancies ?? 0;
    }

    // Allied Health: pending referrals
    if (stats.allied_health.pending_referrals > 0) {
      badges['/allied-health'] = stats.allied_health.pending_referrals;
    }

    // Procedures: pending consent
    if (stats.procedures.pending_consent > 0) {
      badges['/procedures/orders'] = stats.procedures.pending_consent;
    }

    // Surveillance: unacknowledged disease-surveillance alerts only.
    if ((actionableCounts?.unacknowledgedSurveillanceAlerts ?? 0) > 0) {
      badges['/surveillance/alerts'] = actionableCounts?.unacknowledgedSurveillanceAlerts ?? 0;
    }

    // MCH: high-risk registrations
    if (stats.mch.high_risk > 0) {
      badges['/mch'] = stats.mch.high_risk;
    }

    // Theatre: in-progress
    if (stats.theatre.in_progress > 0) {
      badges['/theatre/cases'] = stats.theatre.in_progress;
    }

    // Notifications (uses separate polling hook)
    const unread = typeof unreadCount === 'number' ? unreadCount : (unreadCount?.unread_count ?? 0);
    if (unread > 0) {
      badges['/notifications'] = unread;
    }

    return badges;
  }, [actionableCounts, stats, unreadCount, waitingTriageQueue?.count]);
}
