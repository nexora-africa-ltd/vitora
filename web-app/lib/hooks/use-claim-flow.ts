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
import type { Claim, ClaimFlow, PaymentMechanism } from '@/lib/types/sha';

export type AddLineEndpoint = 'add_intervention' | 'add_virtual_claim_line';
export type InterventionCatalog = 'SHIF' | 'PHC' | 'ECCIF_BUNDLE';
export type PreauthType = 'normal' | 'surgical' | 'renal' | 'oncology' | 'imaging' | 'optical';

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

  // --- Per-intervention routing (Phase 1 HIE gap closure) ---
  /** Payment mechanism of primary active intervention (null if no interventions yet). */
  paymentMechanism: PaymentMechanism | null;
  /** True if primary intervention uses PER_DIEM billing (auto-generates line items). */
  isPerDiem: boolean;
  /** True if primary intervention uses FEE_FOR_SERVICE (manual billing lines). */
  isFFS: boolean;
  /** True if primary intervention is elective preauth (doctor approval required). */
  isElectivePreauth: boolean;
  /** Derived preauth form type from intervention flags. */
  preauthType: PreauthType;
  /** True if any active intervention has needs_preauth from DHA flags. */
  interventionRequiresPreauth: boolean;
}

type BaseFlowRules = Omit<
  ClaimFlowInfo,
  'flow' | 'isFlowResolved' | 'paymentMechanism' | 'isPerDiem' | 'isFFS' | 'isElectivePreauth' | 'preauthType' | 'interventionRequiresPreauth'
>;

const FLOW_RULES: Record<ClaimFlow, BaseFlowRules> = {
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
 * Derive the preauth type from an intervention's flags.
 */
function derivePreauthType(intervention: {
  is_surgical_preauth?: boolean;
  is_renal_preauth?: boolean;
  is_oncology_preauth?: boolean;
  is_imaging_preauth?: boolean;
  is_optical_preauth?: boolean;
}): PreauthType {
  if (intervention.is_surgical_preauth) return 'surgical';
  if (intervention.is_renal_preauth) return 'renal';
  if (intervention.is_oncology_preauth) return 'oncology';
  if (intervention.is_imaging_preauth) return 'imaging';
  if (intervention.is_optical_preauth) return 'optical';
  return 'normal';
}

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
  claim: Pick<Claim, 'claim_flow' | 'claim_interventions'> | null | undefined,
): ClaimFlowInfo {
  return useMemo(() => {
    const { flow, isFlowResolved } = resolveClaimFlow(claim);
    const rules = FLOW_RULES[flow];

    // Derive per-intervention routing from the primary active intervention
    const activeInterventions = claim?.claim_interventions?.filter(
      (i) => i.status === 'active'
    ) ?? [];
    const primary = activeInterventions[0];

    const paymentMechanism = (primary?.payment_mechanism as PaymentMechanism) || null;
    const isPerDiem = paymentMechanism === 'PER_DIEM';
    const isFFS = paymentMechanism === 'FEE_FOR_SERVICE';
    const isElectivePreauth = !!(primary?.needs_preauth && primary?.needs_manual_preauth_approval);
    const preauthType: PreauthType = primary ? derivePreauthType(primary) : 'normal';
    const interventionRequiresPreauth = activeInterventions.some((i) => i.needs_preauth);

    return {
      flow,
      isFlowResolved,
      ...rules,
      // Override requiresPreauth based on actual intervention flags when available
      requiresPreauth: activeInterventions.length > 0
        ? interventionRequiresPreauth
        : rules.requiresPreauth,
      paymentMechanism,
      isPerDiem,
      isFFS,
      isElectivePreauth,
      preauthType,
      interventionRequiresPreauth,
    };
  }, [claim?.claim_flow, claim?.claim_interventions]);
}
