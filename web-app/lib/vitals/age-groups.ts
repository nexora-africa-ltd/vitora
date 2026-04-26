/**
 * Age Group Classification for Vital Signs
 *
 * Shared age-group utilities used by triage, encounters, and inpatient modules
 * for age-adjusted vital sign thresholds.
 *
 * @module lib/vitals/age-groups
 */

/**
 * WHO/ETAT age groups for age-adjusted vital sign thresholds.
 * Mirrors the AgeGroup type in lib/types/triage.ts.
 */
export type AgeGroup =
  | 'neonate'     // 0-28 days
  | 'infant'      // 1-12 months
  | 'young_child' // 1-5 years
  | 'school_age'  // 6-12 years
  | 'adolescent'  // 13-17 years
  | 'adult';      // 18+ years

/**
 * Determine age group from date of birth.
 * Used to conditionally show paediatric fields and apply age-adjusted thresholds.
 */
export function getAgeGroup(dob: string | Date): AgeGroup {
  const birth = new Date(dob);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (days <= 28) return 'neonate';
  if (days <= 365) return 'infant';
  const years = days / 365.25;
  if (years < 6) return 'young_child';
  if (years < 13) return 'school_age';
  if (years < 18) return 'adolescent';
  return 'adult';
}

/**
 * Determine age group from age in years.
 * Useful when only the patient's age (number) is available (e.g., admissions).
 */
export function getAgeGroupFromYears(ageYears: number): AgeGroup {
  if (ageYears < 0) return 'neonate';
  if (ageYears < 1) return 'infant';
  if (ageYears < 6) return 'young_child';
  if (ageYears < 13) return 'school_age';
  if (ageYears < 18) return 'adolescent';
  return 'adult';
}

/** Returns true if the patient is paediatric (<13 years) */
export function isPediatric(ageGroup: AgeGroup): boolean {
  return ['neonate', 'infant', 'young_child', 'school_age'].includes(ageGroup);
}

/** Returns true if the patient is a neonate or infant (<1 year) */
export function isNeonateOrInfant(ageGroup: AgeGroup): boolean {
  return ageGroup === 'neonate' || ageGroup === 'infant';
}
