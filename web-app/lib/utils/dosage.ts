/**
 * Dosage Utilities
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Provides smart dosage suggestions based on drug properties.
 * Parses drug strength strings and generates contextual dosage options.
 */

import type { Drug, DrugForm } from '@/lib/types/pharmacy';

/**
 * Parsed strength information from a drug's strength string
 */
export interface ParsedStrength {
  value: number;
  unit: string;
  perVolume?: number; // For liquid formulations like "50mg/5ml"
  volumeUnit?: string;
  raw: string;
}

/**
 * Dosage suggestion for prescription
 */
export interface DosageSuggestion {
  value: string; // e.g., "500mg"
  label: string; // e.g., "500mg (1 tablet)"
  quantity: number; // Number of units (e.g., 1 tablet)
  isDefault?: boolean;
}

/**
 * Route suggestion based on drug form
 */
export interface RouteSuggestion {
  value: string;
  label: string;
  isDefault?: boolean;
}

/**
 * Parse a drug's strength string into structured components
 *
 * Examples:
 * - "500mg" → { value: 500, unit: "mg", raw: "500mg" }
 * - "50mg/5ml" → { value: 50, unit: "mg", perVolume: 5, volumeUnit: "ml", raw: "50mg/5ml" }
 * - "250/125mg" → { value: 250, unit: "mg", raw: "250/125mg" } (combination - use first)
 * - "0.5mg" → { value: 0.5, unit: "mg", raw: "0.5mg" }
 */
export function parseStrength(strength: string): ParsedStrength | null {
  if (!strength) return null;

  const raw = strength.trim();

  // Pattern 1: Liquid formulation "50mg/5ml" or "250mg/5ml 100ml"
  const liquidPattern = /^(\d+(?:\.\d+)?)\s*(mg|mcg|g|iu|units?)\s*\/\s*(\d+(?:\.\d+)?)\s*(ml|l)/i;
  const liquidMatch = raw.match(liquidPattern);
  if (liquidMatch && liquidMatch[1] && liquidMatch[2] && liquidMatch[3] && liquidMatch[4]) {
    return {
      value: parseFloat(liquidMatch[1]),
      unit: liquidMatch[2].toLowerCase(),
      perVolume: parseFloat(liquidMatch[3]),
      volumeUnit: liquidMatch[4].toLowerCase(),
      raw,
    };
  }

  // Pattern 2: Combination drug "250/125mg" - take first value
  const comboPattern = /^(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|iu|units?)/i;
  const comboMatch = raw.match(comboPattern);
  if (comboMatch && comboMatch[1] && comboMatch[2]) {
    return {
      value: parseFloat(comboMatch[1]),
      unit: comboMatch[2].toLowerCase(),
      raw,
    };
  }

  // Pattern 3: Simple strength "500mg", "0.5mg", "1g"
  const simplePattern = /^(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?|%)/i;
  const simpleMatch = raw.match(simplePattern);
  if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
    return {
      value: parseFloat(simpleMatch[1]),
      unit: simpleMatch[2].toLowerCase(),
      raw,
    };
  }

  // Pattern 4: Percentage "0.05% 15g" or "1% 10ml"
  const percentPattern = /^(\d+(?:\.\d+)?)\s*%/i;
  const percentMatch = raw.match(percentPattern);
  if (percentMatch && percentMatch[1]) {
    return {
      value: parseFloat(percentMatch[1]),
      unit: '%',
      raw,
    };
  }

  return null;
}

/**
 * Get human-readable unit name for display
 */
export function getUnitDisplayName(form: DrugForm, plural = false): string {
  const units: Record<DrugForm, [string, string]> = {
    TABLET: ['tablet', 'tablets'],
    CAPSULE: ['capsule', 'capsules'],
    SYRUP: ['ml', 'ml'],
    INJECTION: ['ml', 'ml'],
    CREAM: ['application', 'applications'],
    OINTMENT: ['application', 'applications'],
    DROPS: ['drop', 'drops'],
    INHALER: ['puff', 'puffs'],
    SUPPOSITORY: ['suppository', 'suppositories'],
    POWDER: ['sachet', 'sachets'],
    SUSPENSION: ['ml', 'ml'],
    SOLUTION: ['ml', 'ml'],
    GEL: ['application', 'applications'],
    PATCH: ['patch', 'patches'],
    SPRAY: ['spray', 'sprays'],
  };

  const [singular, pluralForm] = units[form] || ['unit', 'units'];
  return plural ? pluralForm : singular;
}

/**
 * Generate smart dosage suggestions based on drug properties
 */
export function generateDosageSuggestions(drug: Drug): DosageSuggestion[] {
  const suggestions: DosageSuggestion[] = [];
  const parsed = parseStrength(drug.strength);
  const unitName = getUnitDisplayName(drug.form);
  const unitNamePlural = getUnitDisplayName(drug.form, true);

  // For liquid formulations
  if (parsed?.perVolume && parsed.volumeUnit) {
    const volumeMultipliers = [0.5, 1, 1.5, 2, 3];
    const baseVolume = parsed.perVolume;

    for (const mult of volumeMultipliers) {
      const volume = baseVolume * mult;
      const dose = parsed.value * mult;
      const volumeStr = Number.isInteger(volume) ? volume.toString() : volume.toFixed(1);
      const doseStr = Number.isInteger(dose) ? dose.toString() : dose.toFixed(1);

      suggestions.push({
        value: `${volumeStr}${parsed.volumeUnit}`,
        label: `${volumeStr}${parsed.volumeUnit} (${doseStr}${parsed.unit})`,
        quantity: volume,
        isDefault: mult === 1,
      });
    }

    return suggestions;
  }

  // For solid dosage forms (tablets, capsules)
  if (parsed && ['TABLET', 'CAPSULE'].includes(drug.form)) {
    const multipliers = [0.5, 1, 2, 3];

    for (const mult of multipliers) {
      const dose = parsed.value * mult;
      const doseStr = Number.isInteger(dose) ? dose.toString() : dose.toFixed(1);
      const quantityLabel = mult === 0.5 ? '½' : mult.toString();
      const unit = mult === 1 ? unitName : unitNamePlural;

      // Skip half tablet if dose would be very small
      if (mult === 0.5 && parsed.value < 10) continue;

      suggestions.push({
        value: `${doseStr}${parsed.unit}`,
        label: `${doseStr}${parsed.unit} (${quantityLabel} ${unit})`,
        quantity: mult,
        isDefault: mult === 1,
      });
    }

    return suggestions;
  }

  // For inhalers
  if (drug.form === 'INHALER') {
    const puffs = [1, 2, 3, 4];
    for (const p of puffs) {
      const label = p === 1 ? '1 puff' : `${p} puffs`;
      suggestions.push({
        value: label,
        label,
        quantity: p,
        isDefault: p === 2,
      });
    }
    return suggestions;
  }

  // For drops
  if (drug.form === 'DROPS') {
    const drops = [1, 2, 3, 4, 5];
    for (const d of drops) {
      const label = d === 1 ? '1 drop' : `${d} drops`;
      suggestions.push({
        value: label,
        label,
        quantity: d,
        isDefault: d === 2,
      });
    }
    return suggestions;
  }

  // For topicals (cream, ointment, gel)
  if (['CREAM', 'OINTMENT', 'GEL'].includes(drug.form)) {
    suggestions.push(
      { value: 'Apply thin layer', label: 'Apply thin layer', quantity: 1, isDefault: true },
      { value: 'Apply liberally', label: 'Apply liberally', quantity: 1 },
      { value: 'Apply small amount', label: 'Apply small amount', quantity: 1 }
    );
    return suggestions;
  }

  // For patches
  if (drug.form === 'PATCH') {
    suggestions.push(
      { value: '1 patch', label: '1 patch', quantity: 1, isDefault: true },
      { value: '2 patches', label: '2 patches', quantity: 2 }
    );
    return suggestions;
  }

  // For suppositories
  if (drug.form === 'SUPPOSITORY') {
    suggestions.push(
      { value: '1 suppository', label: '1 suppository', quantity: 1, isDefault: true },
      { value: '2 suppositories', label: '2 suppositories', quantity: 2 }
    );
    return suggestions;
  }

  // For injections - use the strength directly
  if (drug.form === 'INJECTION' && parsed) {
    suggestions.push({
      value: drug.strength,
      label: drug.strength,
      quantity: 1,
      isDefault: true,
    });

    // Add half dose option if reasonable
    if (parsed.value >= 10) {
      const halfDose = parsed.value / 2;
      const halfStr = Number.isInteger(halfDose) ? halfDose.toString() : halfDose.toFixed(1);
      suggestions.push({
        value: `${halfStr}${parsed.unit}`,
        label: `${halfStr}${parsed.unit}`,
        quantity: 0.5,
      });
    }

    return suggestions;
  }

  // Fallback: use the drug's strength as-is
  if (parsed) {
    suggestions.push({
      value: `${parsed.value}${parsed.unit}`,
      label: `${parsed.value}${parsed.unit} (1 ${unitName})`,
      quantity: 1,
      isDefault: true,
    });
  } else {
    // Can't parse - just use raw strength
    suggestions.push({
      value: drug.strength,
      label: drug.strength,
      quantity: 1,
      isDefault: true,
    });
  }

  return suggestions;
}

/**
 * Get suggested route based on drug form
 */
export function getSuggestedRoute(form: DrugForm): RouteSuggestion {
  const routeMap: Record<DrugForm, RouteSuggestion> = {
    TABLET: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    CAPSULE: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    SYRUP: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    SUSPENSION: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    SOLUTION: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    POWDER: { value: 'PO', label: 'Oral (PO)', isDefault: true },
    INJECTION: { value: 'IM', label: 'Intramuscular (IM)', isDefault: true },
    CREAM: { value: 'TOPICAL', label: 'Topical', isDefault: true },
    OINTMENT: { value: 'TOPICAL', label: 'Topical', isDefault: true },
    GEL: { value: 'TOPICAL', label: 'Topical', isDefault: true },
    DROPS: { value: 'OPTH', label: 'Ophthalmic', isDefault: true },
    INHALER: { value: 'INH', label: 'Inhaled', isDefault: true },
    SPRAY: { value: 'INH', label: 'Inhaled', isDefault: true },
    SUPPOSITORY: { value: 'PR', label: 'Rectal (PR)', isDefault: true },
    PATCH: { value: 'TOPICAL', label: 'Topical', isDefault: true },
  };

  return routeMap[form] || { value: 'PO', label: 'Oral (PO)', isDefault: true };
}

/**
 * Get all available route options
 */
export function getRouteOptions(): RouteSuggestion[] {
  return [
    { value: 'PO', label: 'Oral (PO)' },
    { value: 'IV', label: 'Intravenous (IV)' },
    { value: 'IM', label: 'Intramuscular (IM)' },
    { value: 'SC', label: 'Subcutaneous (SC)' },
    { value: 'TOPICAL', label: 'Topical' },
    { value: 'INH', label: 'Inhaled' },
    { value: 'PR', label: 'Rectal (PR)' },
    { value: 'SL', label: 'Sublingual' },
    { value: 'OPTH', label: 'Ophthalmic' },
    { value: 'OTIC', label: 'Otic (Ear)' },
    { value: 'NASAL', label: 'Nasal' },
    { value: 'TD', label: 'Transdermal' },
  ];
}

/**
 * Get frequency options - these are standard medical frequencies
 */
export function getFrequencyOptions() {
  return [
    { value: 'OD', label: 'Once daily (OD)' },
    { value: 'BD', label: 'Twice daily (BD)' },
    { value: 'TDS', label: 'Three times daily (TDS)' },
    { value: 'QID', label: 'Four times daily (QID)' },
    { value: 'STAT', label: 'Immediately (STAT)' },
    { value: 'PRN', label: 'As needed (PRN)' },
    { value: 'Q4H', label: 'Every 4 hours' },
    { value: 'Q6H', label: 'Every 6 hours' },
    { value: 'Q8H', label: 'Every 8 hours' },
    { value: 'Q12H', label: 'Every 12 hours' },
    { value: 'NOCTE', label: 'At night (NOCTE)' },
    { value: 'MANE', label: 'In the morning (MANE)' },
    { value: 'WEEKLY', label: 'Once weekly' },
    { value: 'BIWEEKLY', label: 'Twice weekly' },
    { value: 'MONTHLY', label: 'Once monthly' },
  ];
}

/**
 * Get duration options
 */
export function getDurationOptions() {
  return [
    { value: '1 day', label: '1 day' },
    { value: '3 days', label: '3 days' },
    { value: '5 days', label: '5 days' },
    { value: '7 days', label: '7 days' },
    { value: '10 days', label: '10 days' },
    { value: '14 days', label: '14 days' },
    { value: '21 days', label: '21 days' },
    { value: '30 days', label: '30 days' },
    { value: '3 months', label: '3 months' },
    { value: '6 months', label: '6 months' },
    { value: 'Ongoing', label: 'Ongoing/Chronic' },
  ];
}

/**
 * Map a frequency abbreviation to doses per day.
 * Returns null for PRN (as-needed) since quantity can't be calculated.
 */
export function getFrequencyDosesPerDay(frequency: string): number | null {
  const map: Record<string, number | null> = {
    OD: 1,
    BD: 2,
    TDS: 3,
    QID: 4,
    STAT: 1,
    PRN: null,
    Q4H: 6,
    Q6H: 4,
    Q8H: 3,
    Q12H: 2,
    NOCTE: 1,
    MANE: 1,
    WEEKLY: 1 / 7,
    BIWEEKLY: 2 / 7,
    MONTHLY: 1 / 30,
  };
  return map[frequency] ?? null;
}

/**
 * Parse a duration string (e.g., "7 days", "3 months") into total days.
 * Returns null for "Ongoing" since quantity can't be calculated.
 */
export function parseDurationDays(duration: string): number | null {
  if (!duration || duration === 'Ongoing') return null;

  const daysMatch = duration.match(/^(\d+)\s*days?$/i);
  if (daysMatch?.[1]) return parseInt(daysMatch[1]);

  const monthsMatch = duration.match(/^(\d+)\s*months?$/i);
  if (monthsMatch?.[1]) return parseInt(monthsMatch[1]) * 30;

  const weeksMatch = duration.match(/^(\d+)\s*weeks?$/i);
  if (weeksMatch?.[1]) return parseInt(weeksMatch[1]) * 7;

  return null;
}

/**
 * Calculate total quantity to dispense based on dosage, frequency, and duration.
 *
 * @param unitsPerDose - Number of units per dose (from DosageSuggestion.quantity)
 * @param frequency - Frequency abbreviation (e.g., "TDS")
 * @param duration - Duration string (e.g., "7 days")
 * @returns Calculated quantity (rounded up) or null if calculation is not possible
 */
export function calculateQuantity(
  unitsPerDose: number | null | undefined,
  frequency: string | undefined,
  duration: string | undefined,
): number | null {
  if (!unitsPerDose || !frequency || !duration) return null;

  const dosesPerDay = getFrequencyDosesPerDay(frequency);
  if (dosesPerDay === null) return null;

  const days = parseDurationDays(duration);
  if (days === null) return null;

  return Math.ceil(unitsPerDose * dosesPerDay * days);
}
