/**
 * useClaimNextStep — Derives the single most important next action for an SHA claim.
 *
 * Collapses multiple competing alerts (rejection / missing docs / consent / no
 * interventions / ready-to-submit) into one prioritized prompt so the user
 * always knows what to do next.
 */
import { useMemo } from 'react';
import type { Claim } from '@/lib/types/sha';
import type { ClaimFlowInfo } from './use-claim-flow';

export type NextStepAction =
  | 'resubmit'
  | 'upload-documents'
  | 'start-consent'
  | 'add-intervention'
  | 'submit'
  | 'respond-query'
  | 'discharge'
  | 'view-payment'
  | null;

export interface ClaimNextStep {
  /** Stable action key. `null` when nothing is required. */
  action: NextStepAction;
  /** Headline shown in the banner. */
  title: string;
  /** Optional helper text shown below the headline. */
  description?: string;
  /** Primary call-to-action label. Empty when no CTA is appropriate. */
  ctaLabel?: string;
  /** Anchor on the page (tab id) to jump to when the CTA is clicked. */
  targetTab?: 'overview' | 'workflow' | 'interventions' | 'adjudication';
  /** Severity drives banner colour. */
  severity: 'info' | 'warning' | 'destructive' | 'success';
  /** True when the action is currently blocked (e.g. time-barred, no permission). */
  blocked?: boolean;
}

/**
 * Compute the highest-priority next step for a claim. Priority order:
 *   1. Time-barred (blocked)
 *   2. Rejected → resubmit
 *   3. Query from insurer → respond
 *   4. Missing documents → upload
 *   5. Consent required → start consent
 *   6. Draft without interventions → add intervention
 *   7. Draft ready → submit
 *   8. Submitted/processing → no action (info)
 *   9. Approved → discharge / mark paid
 *  10. Paid → success
 */
export function useClaimNextStep(
  claim: Claim | null | undefined,
  flow: ClaimFlowInfo | null | undefined,
): ClaimNextStep {
  return useMemo<ClaimNextStep>(() => {
    if (!claim) {
      return { action: null, title: '', severity: 'info' };
    }

    // 1. Time-barred — nothing else matters
    if (claim.is_time_barred) {
      return {
        action: null,
        title: 'Claim is time-barred',
        description:
          'This claim has exceeded its DHA submission deadline and can no longer be processed.',
        severity: 'destructive',
        blocked: true,
      };
    }

    // 2. Rejected → resubmit
    if (claim.status === 'rejected') {
      return {
        action: 'resubmit',
        title: 'Claim was rejected',
        description: claim.rejection_reason || 'Review the rejection details and resubmit.',
        ctaLabel: 'Resubmit',
        targetTab: 'overview',
        severity: 'destructive',
      };
    }

    // 3. Query from insurer → respond
    if (claim.status === 'query') {
      return {
        action: 'respond-query',
        title: 'Insurer query awaiting response',
        description: 'Provide the requested information to keep the claim moving.',
        ctaLabel: 'Respond',
        targetTab: 'overview',
        severity: 'warning',
      };
    }

    // 4. Missing documents → upload
    const missing = claim.missing_document_types ?? [];
    if (missing.length > 0) {
      const count = missing.reduce((sum, entry) => sum + entry.missing.length, 0);
      return {
        action: 'upload-documents',
        title: `${count} required ${count === 1 ? 'document is' : 'documents are'} missing`,
        description: 'Upload the documents flagged by SHA before submitting this claim.',
        ctaLabel: 'Upload documents',
        targetTab: 'workflow',
        severity: 'warning',
      };
    }

    // 5. Consent required (SHIF/PHC flows)
    const needsConsent =
      flow?.requiresConsent && !claim.is_emergency_claim && !claim.dha_visit_started_at;
    if (needsConsent && claim.status === 'draft') {
      return {
        action: 'start-consent',
        title: 'Patient consent required',
        description:
          'Obtain OTP or biometric consent before the claim can be submitted to SHA.',
        ctaLabel: 'Start consent',
        targetTab: 'workflow',
        severity: 'info',
      };
    }

    // 6. Draft without active interventions → add
    const activeInterventions =
      claim.claim_interventions?.filter((i) => i.status === 'active') ?? [];
    if (claim.status === 'draft' && activeInterventions.length === 0) {
      return {
        action: 'add-intervention',
        title: 'Add at least one intervention',
        description: 'Every claim needs an active SHA intervention before submission.',
        ctaLabel: 'Add intervention',
        targetTab: 'workflow',
        severity: 'info',
      };
    }

    // 7. Draft ready → submit
    if (claim.status === 'draft') {
      return {
        action: 'submit',
        title: 'Ready to submit',
        description: 'All prerequisites are met. Submit this claim to SHA.',
        ctaLabel: 'Submit to SHA',
        targetTab: 'overview',
        severity: 'success',
      };
    }

    // 8. Inpatient discharge pending
    if (
      flow?.supportsInpatientDischarge &&
      claim.admission_date &&
      !claim.discharge_date &&
      ['submitted', 'acknowledged', 'under_review'].includes(claim.status)
    ) {
      return {
        action: 'discharge',
        title: 'Discharge pending',
        description: 'Complete the inpatient discharge workflow when the patient is ready.',
        ctaLabel: 'Open discharge',
        targetTab: 'workflow',
        severity: 'info',
      };
    }

    // 9. Approved → record payment / view adjudication
    if (['approved', 'partially_approved'].includes(claim.status)) {
      return {
        action: 'view-payment',
        title: 'Claim approved',
        description: 'Review the adjudication and record payment when received.',
        ctaLabel: 'View adjudication',
        targetTab: 'adjudication',
        severity: 'success',
      };
    }

    // 10. Paid — nothing required
    if (claim.status === 'paid' || claim.status === 'partial') {
      return {
        action: null,
        title: 'Claim paid',
        description: 'No further action required.',
        severity: 'success',
      };
    }

    // Catch-all (submitted, acknowledged, under_review, etc.)
    return {
      action: null,
      title: 'Awaiting insurer response',
      description: 'The claim is being processed by SHA. Check back later.',
      severity: 'info',
    };
  }, [claim, flow]);
}
