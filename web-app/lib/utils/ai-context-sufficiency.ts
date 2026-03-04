/**
 * AI Context Sufficiency Checker
 *
 * Evaluates whether enough clinical data is available for meaningful AI
 * responses. Used by the chat widget to provide helpful guidance when a
 * clinician queries TibaBot before filling in key fields.
 *
 * The checker distinguishes between:
 * - **Sufficient**: Enough data for a clinically useful response
 * - **Partial**: Some data present — AI can respond but quality may be limited
 * - **Insufficient**: Critical data missing — guide the user to enter it first
 *
 * Also provides **context enrichment** — the ability to fill in missing fields
 * directly from the chat widget without navigating back to the form.
 */

import type { AIPatientContext, AIEncounterContext } from '@/lib/types/ai';

// =============================================================================
// Types
// =============================================================================

export type ContextSufficiency = 'sufficient' | 'partial' | 'insufficient';

export interface ContextSufficiencyResult {
  /** Overall sufficiency level */
  level: ContextSufficiency;
  /** Human-readable message explaining what's missing */
  message: string;
  /** List of missing field groups (e.g., "vital signs", "chief complaint") */
  missingFields: string[];
  /** List of present field groups */
  presentFields: string[];
  /** Count of present vital signs (out of core 5: HR, BP, Temp, RR, SpO2) */
  vitalCount: number;
  /** Whether the minimum for a useful response is met */
  canProceed: boolean;
}

/**
 * User-provided context enrichment from the chat widget inline form.
 * Used to fill in missing fields without navigating back to the encounter/triage form.
 */
export interface AIContextEnrichment {
  chief_complaint?: string;
  temperature?: number;
  heart_rate?: number;
  spo2?: number;
  respiratory_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  allergies?: string;
  current_medications?: string;
}

// =============================================================================
// Core check
// =============================================================================

/**
 * Assess whether the current AI context has enough data for a meaningful
 * clinical response.
 *
 * Minimum for "sufficient":
 * - Patient demographics (age + sex)
 * - Chief complaint
 * - At least 2 vital signs
 *
 * "Partial" = has demographics but missing complaint or most vitals.
 * "Insufficient" = no encounter context at all or no demographics.
 */
export function assessContextSufficiency(
  patientContext: AIPatientContext | null,
  encounterContext: AIEncounterContext | null,
): ContextSufficiencyResult {
  const missingFields: string[] = [];
  const presentFields: string[] = [];

  // --- Demographics ---
  const hasDemographics =
    patientContext != null &&
    patientContext.patient_age != null &&
    patientContext.patient_sex != null;

  if (hasDemographics) {
    presentFields.push('patient demographics');
  } else {
    missingFields.push('patient demographics (age, sex)');
  }

  // --- Chief complaint ---
  const hasChiefComplaint =
    encounterContext?.chief_complaint != null &&
    encounterContext.chief_complaint.trim().length > 0;

  if (hasChiefComplaint) {
    presentFields.push('chief complaint');
  } else {
    missingFields.push('chief complaint');
  }

  // --- Vital signs (core 5) ---
  const vitals = encounterContext?.vitals;
  let vitalCount = 0;
  const missingVitals: string[] = [];

  if (vitals?.pulse != null) { vitalCount++; } else { missingVitals.push('heart rate'); }
  if (vitals?.spo2 != null) { vitalCount++; } else { missingVitals.push('SpO2'); }
  if (vitals?.temperature != null) { vitalCount++; } else { missingVitals.push('temperature'); }
  if (vitals?.rr != null) { vitalCount++; } else { missingVitals.push('respiratory rate'); }
  if (vitals?.map != null) { vitalCount++; } else { missingVitals.push('blood pressure'); }

  if (vitalCount >= 2) {
    presentFields.push(`${vitalCount}/5 vital signs`);
  }
  if (vitalCount < 5) {
    missingFields.push(
      vitalCount === 0
        ? 'vital signs'
        : `some vitals (${missingVitals.join(', ')})`
    );
  }

  // --- Allergies / meds (nice-to-have, not required) ---
  if (patientContext?.allergies && patientContext.allergies.length > 0) {
    presentFields.push('allergies');
  }
  if (patientContext?.current_medications && patientContext.current_medications.length > 0) {
    presentFields.push('medications');
  }

  // --- Determine overall level ---
  let level: ContextSufficiency;
  let canProceed: boolean;
  let message: string;

  if (hasDemographics && hasChiefComplaint && vitalCount >= 2) {
    level = 'sufficient';
    canProceed = true;
    message = vitalCount < 5
      ? `Good context available (${vitalCount}/5 vitals). Adding ${missingVitals.join(', ')} would improve recommendations.`
      : 'Full clinical context available for analysis.';
  } else if (hasDemographics && (hasChiefComplaint || vitalCount >= 1)) {
    level = 'partial';
    canProceed = true;
    const missing = missingFields.filter(f => f !== 'patient demographics (age, sex)');
    message = `Limited context — ${missing.join(' and ')} not yet entered. TibaBot can respond, but recommendations will be more accurate with complete data.`;
  } else {
    level = 'insufficient';
    canProceed = false;
    message = buildInsufficientMessage(hasDemographics, hasChiefComplaint, vitalCount);
  }

  return { level, message, missingFields, presentFields, vitalCount, canProceed };
}

// =============================================================================
// Helpers
// =============================================================================

function buildInsufficientMessage(
  hasDemographics: boolean,
  hasChiefComplaint: boolean,
  vitalCount: number,
): string {
  const parts: string[] = [];

  if (!hasDemographics) {
    parts.push('patient demographics');
  }
  if (!hasChiefComplaint) {
    parts.push('a chief complaint');
  }
  if (vitalCount === 0) {
    parts.push('vital signs');
  }

  return `Not enough clinical data for a meaningful recommendation. Please enter ${parts.join(', ')} first, then try again.`;
}

/**
 * Build a user-friendly system message for the chat when context is
 * insufficient or partial.
 */
export function buildContextGuidanceMessage(result: ContextSufficiencyResult): string {
  if (result.level === 'insufficient') {
    const lines = [
      '⚠️ **Insufficient clinical data**\n',
      result.message,
      '',
      '**What to do:**',
    ];

    if (result.missingFields.includes('chief complaint')) {
      lines.push('- Go to the **Assessment** tab and enter the chief complaint');
    }
    if (result.missingFields.some(f => f.includes('vital'))) {
      lines.push('- Go to the **Vitals** tab and record vital signs');
    }
    if (result.missingFields.includes('patient demographics (age, sex)')) {
      lines.push('- Ensure patient demographics are loaded');
    }

    lines.push('\nOnce you\'ve entered the data, come back and I\'ll have full context to assist you.');
    return lines.join('\n');
  }

  if (result.level === 'partial') {
    const lines = [
      '⚠️ **Limited clinical context available**\n',
      result.message,
      '',
      'I\'ll do my best with what\'s available, but consider filling in the missing fields for more precise recommendations.',
    ];
    return lines.join('\n');
  }

  return '';
}

// =============================================================================
// Context Enrichment Merging
// =============================================================================

/**
 * Calculate MAP from systolic and diastolic blood pressure.
 * MAP = DBP + 1/3 * (SBP - DBP)
 */
function calculateMAPFromBP(systolic?: number, diastolic?: number): number | undefined {
  if (systolic == null || diastolic == null) return undefined;
  return Math.round(diastolic + (systolic - diastolic) / 3);
}

/**
 * Merge user-provided enrichment data with the existing AI context.
 * Enrichment values take priority over base context (they're the latest input).
 *
 * Returns new patient + encounter context objects with enrichment merged in.
 */
export function mergeContextWithEnrichment(
  patientContext: AIPatientContext | null,
  encounterContext: AIEncounterContext | null,
  enrichment: AIContextEnrichment | null,
): { mergedPatient: AIPatientContext | null; mergedEncounter: AIEncounterContext | null } {
  if (!enrichment) {
    return { mergedPatient: patientContext, mergedEncounter: encounterContext };
  }

  // --- Merge patient context ---
  const baseAllergies = patientContext?.allergies ?? [];
  const enrichedAllergies = enrichment.allergies
    ? enrichment.allergies.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const baseMeds = patientContext?.current_medications ?? [];
  const enrichedMeds = enrichment.current_medications
    ? enrichment.current_medications.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const mergedPatient: AIPatientContext | null = patientContext
    ? {
        ...patientContext,
        allergies: enrichedAllergies ?? baseAllergies,
        current_medications: enrichedMeds ?? baseMeds,
      }
    : null;

  // --- Merge encounter context ---
  const baseVitals = encounterContext?.vitals ?? {};

  const mergedVitals = {
    spo2: enrichment.spo2 ?? baseVitals.spo2,
    pulse: enrichment.heart_rate ?? baseVitals.pulse,
    temperature: enrichment.temperature ?? baseVitals.temperature,
    rr: enrichment.respiratory_rate ?? baseVitals.rr,
    map: (enrichment.systolic_bp != null && enrichment.diastolic_bp != null)
      ? calculateMAPFromBP(enrichment.systolic_bp, enrichment.diastolic_bp)
      : baseVitals.map,
  };

  const mergedEncounter: AIEncounterContext = {
    // Preserve any inpatient-specific fields from the base context
    ...encounterContext,
    chief_complaint: enrichment.chief_complaint || encounterContext?.chief_complaint,
    vitals: mergedVitals,
  };

  return { mergedPatient, mergedEncounter };
}
