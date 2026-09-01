import type { Claim, ClaimStatus } from '@/lib/types/sha';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';

const SUBMITTED_LIKE_WORKFLOW_STATES = new Set([
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'PROCESSED',
  'PAID',
]);

const PAYER_PREVIEW_VISIBLE_STATUSES = new Set([
  'submitted',
  'acknowledged',
  'under_review',
  'processing',
  'query',
  'approved',
  'partial_approved',
  'rejected',
  'paid',
]);

export function getEffectiveClaimStatus(
  claim: Pick<Claim, 'status' | 'submitted_at' | 'dha_discharge_snapshot'>
): ClaimStatus {
  const snapshot =
    claim.dha_discharge_snapshot && typeof claim.dha_discharge_snapshot === 'object'
      ? (claim.dha_discharge_snapshot as Record<string, unknown>)
      : null;
  const workflowState = String(snapshot?.workflow_state || '')
    .trim()
    .toUpperCase();
  if (
    claim.status === 'draft' &&
    (!!claim.submitted_at || SUBMITTED_LIKE_WORKFLOW_STATES.has(workflowState))
  ) {
    return 'submitted';
  }
  return claim.status;
}

export function isPayerPreviewEligibleStatus(status: string): boolean {
  return PAYER_PREVIEW_VISIBLE_STATUSES.has(status);
}

export function isPayerPreviewEligibleClaim(
  claim: Pick<Claim, 'status' | 'submitted_at' | 'dha_discharge_snapshot'>
): boolean {
  return isPayerPreviewEligibleStatus(getEffectiveClaimStatus(claim));
}

export function payerStateNeedsAttention(payerState: string | null): boolean {
  if (!payerState) return false;
  return new Set([
    'MISSING_DOCUMENTS',
    'CLARIFICATION_AFTER_AUTOMATIC_CHECKS',
    'SENT_BACK',
    'SENT_TO_SURVEILLANCE',
    'REJECTED',
  ]).has(payerState);
}

export function claimStatusNeedsAdjudicationAttention(status: string): boolean {
  return ['query', 'rejected', 'under_review'].includes(status);
}

export interface PayerPreviewSnapshot {
  claimId: number;
  result: IlmCallResult;
  fetchedAtIso: string;
}

export function payerPreviewQueryKey(claimId: number) {
  return ['sha', 'claims', claimId, 'payer-preview'] as const;
}

export function payerPreviewStorageKey(claimId: number): string {
  return `sha:payer-preview:${claimId}`;
}
