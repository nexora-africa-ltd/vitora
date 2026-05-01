/**
 * SHA Intervention Combination Rules
 *
 * Encodes DHA's intervention combination matrix. Once a primary intervention
 * is added to a claim, only specific other interventions can be combined.
 *
 * Source: DHA SHA Claims & Pre-authorizations Guide (Section: Intervention Code Combinations)
 */

/**
 * SHA Intervention packages with their codes and combination rules.
 */
export interface InterventionPackage {
  code: string;
  name: string;
  /** List of intervention codes that can be combined with this one, or 'ALONE' */
  allowedCombinations: string[] | 'ALONE';
  /** Optional notes about specific sub-code restrictions */
  notes?: string;
}

/**
 * The DHA SHA intervention combination matrix.
 * Each entry defines what other packages can be combined when this package
 * is the primary intervention on a claim.
 */
export const INTERVENTION_COMBINATION_RULES: Record<string, InterventionPackage> = {
  'SHA-01': {
    code: 'SHA-01',
    name: 'Ambulance and Emergency Services',
    allowedCombinations: 'ALONE',
  },
  'SHA-03': {
    code: 'SHA-03',
    name: 'Critical Care Services',
    allowedCombinations: ['SHA-07', 'SHA-06', 'SHA-16', 'SHA-09', 'SHA-13', 'SHA-08', 'SHA-19'],
    notes: 'SHA-19 subject to surgical rules',
  },
  'SHA-05': {
    code: 'SHA-05',
    name: 'Optical Health Services',
    allowedCombinations: 'ALONE',
  },
  'SHA-06': {
    code: 'SHA-06',
    name: 'Haematology and Oncology Services',
    allowedCombinations: 'ALONE',
  },
  'SHA-07': {
    code: 'SHA-07',
    name: 'Inpatient Services',
    allowedCombinations: ['SHA-03', 'SHA-06', 'SHA-16', 'SHA-09', 'SHA-19'],
    notes: 'SHA-16 limited to sub-codes 001, 002, 004, 007, 008, 011',
  },
  'SHA-08': {
    code: 'SHA-08',
    name: 'Maternity and Child Health Services',
    allowedCombinations: ['SHA-03', 'SHA-09', 'SHA-07'],
    notes: 'SHA-07-005/006 only after global period lapse per Maternity rules',
  },
  'SHA-09': {
    code: 'SHA-09',
    name: 'Medical Imaging & Other Investigations',
    allowedCombinations: 'ALONE',
  },
  'SHA-10': {
    code: 'SHA-10',
    name: 'Mental Wellness Services',
    allowedCombinations: 'ALONE',
  },
  'SHA-12': {
    code: 'SHA-12',
    name: 'Outpatient Services',
    allowedCombinations: 'ALONE',
  },
  'SHA-13': {
    code: 'SHA-13',
    name: 'Palliative Care Services',
    allowedCombinations: ['SHA-03', 'SHA-06', 'SHA-07', 'SHA-09', 'SHA-16', 'SHA-19'],
  },
  'SHA-16': {
    code: 'SHA-16',
    name: 'Renal Care Services',
    allowedCombinations: ['SHA-03', 'SHA-07'],
    notes: 'SHA-16-001/002/004 must be reported ALONE; SHA-16-003/005/006/007/009 allow SHA-03 | SHA-07',
  },
  'SHA-18': {
    code: 'SHA-18',
    name: 'Essential Diagnostic Laboratory (NCDs)',
    allowedCombinations: 'ALONE',
  },
  'SHA-19': {
    code: 'SHA-19',
    name: 'Surgical Services',
    allowedCombinations: ['SHA-07', 'SHA-09', 'SHA-03', 'SHA-13'],
    notes: 'SHA-03 & SHA-13 only after surgical global period',
  },
};

/** Renal sub-codes that must be reported ALONE (no combinations allowed) */
export const RENAL_ALONE_SUBCODES = ['SHA-16-001', 'SHA-16-002', 'SHA-16-004'];

/** SHA-16 sub-codes that allow combinations */
export const RENAL_COMBINABLE_SUBCODES = ['SHA-16-003', 'SHA-16-005', 'SHA-16-006', 'SHA-16-007', 'SHA-16-009'];

/**
 * Extract the benefit (package) code from a full intervention code.
 * e.g., "SHA-07-001" → "SHA-07", "SHA-16-003" → "SHA-16"
 */
export function getBenefitCode(interventionCode: string): string {
  const parts = interventionCode.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return interventionCode;
}

export interface CombinationValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate whether adding a new intervention to a claim is allowed
 * based on the existing interventions already on the claim.
 *
 * @param existingInterventionCodes - Codes already on the claim (active only)
 * @param newInterventionCode - The intervention code being added
 * @returns Validation result with reason if invalid
 */
export function validateInterventionCombination(
  existingInterventionCodes: string[],
  newInterventionCode: string,
): CombinationValidationResult {
  const newBenefitCode = getBenefitCode(newInterventionCode);

  // If no existing interventions, anything is allowed (it becomes the primary)
  if (existingInterventionCodes.length === 0) {
    return { valid: true };
  }

  // Get the primary intervention (first one added)
  const primaryCode = existingInterventionCodes[0]!;
  const primaryBenefitCode = getBenefitCode(primaryCode);

  // Look up the primary's combination rules
  const primaryRules = INTERVENTION_COMBINATION_RULES[primaryBenefitCode];
  if (!primaryRules) {
    // Unknown primary — allow (DHA will validate remotely)
    return { valid: true };
  }

  // If primary is ALONE, no other interventions can be added
  if (primaryRules.allowedCombinations === 'ALONE') {
    return {
      valid: false,
      reason: `${primaryRules.name} (${primaryBenefitCode}) cannot be combined with any other intervention.`,
    };
  }

  // Check if the new benefit code is in the allowed list
  if (!primaryRules.allowedCombinations.includes(newBenefitCode)) {
    return {
      valid: false,
      reason: `${primaryRules.name} (${primaryBenefitCode}) cannot be combined with ${newBenefitCode}. Allowed: ${primaryRules.allowedCombinations.join(', ')}.`,
    };
  }

  // Special case: Renal sub-codes that must be ALONE
  if (newBenefitCode === 'SHA-16' && RENAL_ALONE_SUBCODES.includes(newInterventionCode)) {
    return {
      valid: false,
      reason: `Renal sub-code ${newInterventionCode} must be reported alone and cannot be combined with other interventions.`,
    };
  }

  // Also check from the new intervention's perspective (bidirectional check)
  const newRules = INTERVENTION_COMBINATION_RULES[newBenefitCode];
  if (newRules && newRules.allowedCombinations === 'ALONE') {
    return {
      valid: false,
      reason: `${newRules.name} (${newBenefitCode}) can only be reported alone.`,
    };
  }

  if (newRules && newRules.allowedCombinations !== 'ALONE') {
    if (!newRules.allowedCombinations.includes(primaryBenefitCode)) {
      return {
        valid: false,
        reason: `${newRules.name} (${newBenefitCode}) cannot be combined with ${primaryBenefitCode}.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Given a primary benefit code, return the list of benefit codes that can
 * be combined with it. Returns empty array if the package must be ALONE.
 */
export function getAllowedCombinations(primaryBenefitCode: string): string[] {
  const rules = INTERVENTION_COMBINATION_RULES[primaryBenefitCode];
  if (!rules) return [];
  if (rules.allowedCombinations === 'ALONE') return [];
  return rules.allowedCombinations;
}

/**
 * Check if an intervention package must be reported alone.
 */
export function isAlonePackage(benefitCode: string): boolean {
  const rules = INTERVENTION_COMBINATION_RULES[benefitCode];
  if (!rules) return false;
  return rules.allowedCombinations === 'ALONE';
}
