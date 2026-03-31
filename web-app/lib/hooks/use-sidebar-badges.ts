'use client';

import { useMemo } from 'react';
import { useDashboardStats } from '@/lib/hooks/use-dashboard-stats';
import { useUnreadCount } from '@/lib/hooks/use-notifications';

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
  const { data: stats } = useDashboardStats();
  const { data: unreadCount } = useUnreadCount();

  return useMemo(() => {
    const badges: SidebarBadges = {};
    if (!stats) return badges;

    // Check-in: patients waiting
    if (stats.checkin.waiting > 0) {
      badges['/patients/checkin'] = stats.checkin.waiting;
    }

    // Triage: patients waiting for triage
    if (stats.triage.waiting > 0) {
      badges['/triage'] = stats.triage.waiting;
    }

    // Encounters: in-progress encounters
    if (stats.encounters.in_progress > 0) {
      badges['/encounters'] = stats.encounters.in_progress;
    }

    // Pharmacy: pending dispensing
    if (stats.pharmacy.pending_dispensing > 0) {
      badges['/pharmacy/dispensing'] = stats.pharmacy.pending_dispensing;
    }

    // Laboratory: pending tests
    if (stats.laboratory.pending_tests > 0) {
      badges['/laboratory/orders'] = stats.laboratory.pending_tests;
    }

    // Laboratory: critical results
    if (stats.laboratory.critical_results > 0) {
      badges['/laboratory/validations'] = stats.laboratory.critical_results;
    }

    // Imaging: pending orders
    if (stats.imaging.pending_orders > 0) {
      badges['/imaging/worklist'] = stats.imaging.pending_orders;
    }

    // Inpatient: current admissions
    if (stats.inpatient.current_admissions > 0) {
      badges['/admissions'] = stats.inpatient.current_admissions;
    }

    // Emergency: pending review
    if (stats.emergency.pending_review > 0) {
      badges['/emergency'] = stats.emergency.pending_review;
    }

    // Billing: pending payments
    if (stats.billing.pending_payments > 0) {
      badges['/transactions/payments'] = stats.billing.pending_payments;
    }

    // Billing: pending SHA claims
    if (stats.billing.sha_claims_pending > 0) {
      badges['/transactions/sha-claims'] = stats.billing.sha_claims_pending;
    }

    // Allied Health: pending referrals
    if (stats.allied_health.pending_referrals > 0) {
      badges['/allied-health'] = stats.allied_health.pending_referrals;
    }

    // Procedures: pending consent
    if (stats.procedures.pending_consent > 0) {
      badges['/procedures/orders'] = stats.procedures.pending_consent;
    }

    // Surveillance: alerts (total_unresolved from alerts stats)
    if (stats.alerts.total_unresolved > 0) {
      badges['/surveillance/alerts'] = stats.alerts.total_unresolved;
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
    const unread = typeof unreadCount === 'number' ? unreadCount : unreadCount?.unread_count ?? 0;
    if (unread > 0) {
      badges['/notifications'] = unread;
    }

    return badges;
  }, [stats, unreadCount]);
}
