/**
 * useClaimFlow — derives DHA HIE workflow rules from an SHA Claim.
 *
 * Mirrors the backend `services/sha_flow_router.py` logic and the DHA HIE
 * user-journey spec (https://hie-docs.dha.go.ke/docs/userJourney). Returns
 * a single object the UI can switch on to:
 *
 *   - decide which panels to render (Consent / Preauth / ILM / Discharge)
 *   - choose the correct add-line endpoint (standard vs virtual claim line)
 *   - filter the intervention catalogue (PHC restricts to Level 2/3)
 *   - skip consent for ECCIF (emergency, possibly unidentified patient)
 */
import { useMemo } from 'react';
import type { Claim, ClaimFlow } from '@/lib/types/sha';

export type AddLineEndpoint = 'add_intervention' | 'add_virtual_claim_line';
export type InterventionCatalog = 'SHIF' | 'PHC' | 'ECCIF_BUNDLE';

export interface ClaimFlowInfo {
  /** Routed flow. Falls back to 'shif' when the backend hasn't classified yet. */
  flow: ClaimFlow;
  /** True when backend has explicitly set claim_flow. */
  isFlowResolved: boolean;
  /** Initial OTP/biometric consent must be obtained before billing. */
  requiresConsent: boolean;
  /** Pre-authorization step is part of this flow. */
  requiresPreauth: boolean;
  /** Add-line button calls the virtual claim line endpoint (PHC). */
  addLineEndpoint: AddLineEndpoint;
  /** Intervention picker scope. */
  interventionCatalog: InterventionCatalog;
  /** Inpatient discharge step applies. */
  supportsInpatientDischarge: boolean;
  /** ECCIF flow allows unidentified patients. */
  allowsUnidentifiedPatient: boolean;
  /** Short label for badges, e.g. 'PHC \u00b7 Capitation'. */
  badgeLabel: string;
  /** Long human-readable explanation suitable for tooltips/help text. */
  description: string;
}

const FLOW_RULES: Record<ClaimFlow, Omit<ClaimFlowInfo, 'flow' | 'isFlowResolved'>> = {
  shif: {
    requiresConsent: true,
    requiresPreauth: true,
    addLineEndpoint: 'add_intervention',
    interventionCatalog: 'SHIF',
    supportsInpatientDischarge: true,
    allowsUnidentifiedPatient: false,
    badgeLabel: 'SHIF',
    description:
      'Social Health Insurance Fund. Mandatory OTP/biometric consent. Pre-authorization is required for restricted services.',
  },
  phc: {
    requiresConsent: true,
    requiresPreauth: false,
    addLineEndpoint: 'add_virtual_claim_line',
    interventionCatalog: 'PHC',
    supportsInpatientDischarge: false,
    allowsUnidentifiedPatient: false,
    badgeLabel: 'PHC \u00b7 Capitation',
    description:
      'Primary Health Care Fund (Level 2\u20133). Simplified consent, no pre-authorization. Uses virtual claim lines.',
  },
  eccif: {
    requiresConsent: false,
    requiresPreauth: false,
    addLineEndpoint: 'add_intervention',
    interventionCatalog: 'ECCIF_BUNDLE',
    supportsInpatientDischarge: true,
    allowsUnidentifiedPatient: true,
    badgeLabel: 'ECCIF \u00b7 Emergency',
    description:
      'Emergency, Chronic & Critical Illness Fund. Initial consent is not required; bundled emergency tariffs apply.',
  },
};

/**
 * Parse the claim's `claim_flow` field, defaulting to 'shif' when missing
 * (the safest default — full consent + preauth UX).
 */
export function resolveClaimFlow(
  claim: Pick<Claim, 'claim_flow'> | null | undefined,
): { flow: ClaimFlow; isFlowResolved: boolean } {
  const raw = claim?.claim_flow;
  if (raw === 'shif' || raw === 'phc' || raw === 'eccif') {
    return { flow: raw, isFlowResolved: true };
  }
  return { flow: 'shif', isFlowResolved: false };
}

export function useClaimFlow(
  claim: Pick<Claim, 'claim_flow'> | null | undefined,
): ClaimFlowInfo {
  return useMemo(() => {
    const { flow, isFlowResolved } = resolveClaimFlow(claim);
    return { flow, isFlowResolved, ...FLOW_RULES[flow] };
  }, [claim?.claim_flow]);
}
