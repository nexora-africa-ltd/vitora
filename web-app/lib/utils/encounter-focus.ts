/**
 * Encounter focus routing helpers.
 *
 * Use this when building encounter detail URLs so callers can deep-link
 * into a specific encounter section/tab via `?focus=...`.
 *
 * Usage:
 * - buildEncounterHref(encounterId)
 * - buildEncounterHref(encounterId, 'orders')
 * - getEncounterFocusFromStatus(encounter.status)
 *
 * Inputs:
 * - encounterId: number | string (required)
 * - focus: optional EncounterFocusTarget
 * - status: optional encounter status string
 */

export type EncounterFocusTarget =
  | 'vitals'
  | 'soap'
  | 'assessment'
  | 'orders'
  | 'referrals'
  | 'history'
  | 'comments';

export function buildEncounterHref(
  encounterId: number | string,
  focus?: EncounterFocusTarget | null,
): string {
  const base = `/encounters/${encounterId}`;
  return focus ? `${base}?focus=${focus}` : base;
}

export function getEncounterFocusFromStatus(status: string | null | undefined): EncounterFocusTarget {
  switch ((status || '').toUpperCase()) {
    case 'CREATED':
    case 'CHECKED_IN':
    case 'TRIAGED':
      return 'vitals';
    case 'ORDERS_PLACED':
    case 'RESULTS_PENDING':
      return 'orders';
    case 'READY_TO_CLOSE':
      return 'assessment';
    case 'CLOSED':
      return 'history';
    case 'CANCELLED':
      return 'comments';
    case 'ON_HOLD':
    case 'IN_PROGRESS':
    default:
      return 'soap';
  }
}
