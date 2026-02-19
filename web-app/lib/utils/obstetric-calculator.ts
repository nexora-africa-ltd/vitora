/**
 * Obstetric Calculator Utilities
 *
 * Calculates pregnancy-related dates and values based on LMP (Last Menstrual Period).
 * Uses Naegele's Rule: EDD = LMP + 280 days (40 weeks)
 */

import { addDays, addWeeks, differenceInDays, differenceInWeeks, format, isValid, parseISO } from 'date-fns';

export interface ObstetricCalculation {
  /** Last Menstrual Period date */
  lmp: Date;
  /** Expected Date of Delivery (LMP + 280 days) */
  edd: Date;
  /** Current gestational age in completed weeks */
  gestationalAgeWeeks: number;
  /** Remaining days after completed weeks */
  gestationalAgeDays: number;
  /** Gestational age as string "X weeks Y days" */
  gestationalAgeDisplay: string;
  /** Current trimester (1, 2, or 3) */
  trimester: 1 | 2 | 3;
  /** Trimester display name */
  trimesterDisplay: string;
  /** Days until EDD (negative if past EDD) */
  daysUntilEdd: number;
  /** Weeks remaining until EDD */
  weeksRemaining: number;
  /** Whether the pregnancy is at term (37-42 weeks) */
  isAtTerm: boolean;
  /** Whether pregnancy is post-term (>42 weeks) */
  isPostTerm: boolean;
  /** Whether patient is in labor window (37-41 weeks) */
  isLaborWindow: boolean;
}

/**
 * Calculate obstetric values from LMP date.
 *
 * @param lmpDate - LMP as Date object or ISO string (YYYY-MM-DD)
 * @param referenceDate - Date to calculate from (defaults to today)
 * @returns ObstetricCalculation or null if invalid LMP
 */
export function calculateFromLMP(
  lmpDate: Date | string,
  referenceDate: Date = new Date()
): ObstetricCalculation | null {
  const lmp = typeof lmpDate === 'string' ? parseISO(lmpDate) : lmpDate;

  if (!isValid(lmp)) {
    return null;
  }

  // Naegele's Rule: EDD = LMP + 280 days
  const edd = addDays(lmp, 280);

  // Calculate gestational age
  const totalDays = differenceInDays(referenceDate, lmp);

  // Pregnancy shouldn't be negative or impossibly long
  if (totalDays < 0 || totalDays > 320) {
    return null;
  }

  const gestationalAgeWeeks = Math.floor(totalDays / 7);
  const gestationalAgeDays = totalDays % 7;

  // Determine trimester
  let trimester: 1 | 2 | 3;
  let trimesterDisplay: string;
  if (gestationalAgeWeeks < 12) {
    trimester = 1;
    trimesterDisplay = 'First Trimester';
  } else if (gestationalAgeWeeks < 28) {
    trimester = 2;
    trimesterDisplay = 'Second Trimester';
  } else {
    trimester = 3;
    trimesterDisplay = 'Third Trimester';
  }

  const daysUntilEdd = differenceInDays(edd, referenceDate);
  const weeksRemaining = Math.max(0, Math.floor(daysUntilEdd / 7));

  return {
    lmp,
    edd,
    gestationalAgeWeeks,
    gestationalAgeDays,
    gestationalAgeDisplay: `${gestationalAgeWeeks} weeks ${gestationalAgeDays} days`,
    trimester,
    trimesterDisplay,
    daysUntilEdd,
    weeksRemaining,
    isAtTerm: gestationalAgeWeeks >= 37 && gestationalAgeWeeks <= 42,
    isPostTerm: gestationalAgeWeeks > 42,
    isLaborWindow: gestationalAgeWeeks >= 37 && gestationalAgeWeeks <= 41,
  };
}

/**
 * Calculate LMP from EDD (reverse calculation).
 *
 * @param eddDate - EDD as Date object or ISO string
 * @returns LMP date or null if invalid
 */
export function calculateLMPFromEDD(eddDate: Date | string): Date | null {
  const edd = typeof eddDate === 'string' ? parseISO(eddDate) : eddDate;

  if (!isValid(edd)) {
    return null;
  }

  // LMP = EDD - 280 days
  return addDays(edd, -280);
}

/**
 * Format date for display.
 */
export function formatObstetricDate(date: Date): string {
  return format(date, 'dd MMM yyyy');
}

/**
 * Format date for form input (ISO format).
 */
export function formatDateForInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get milestone dates based on LMP.
 */
export function getMilestones(lmp: Date | string) {
  const lmpDate = typeof lmp === 'string' ? parseISO(lmp) : lmp;

  if (!isValid(lmpDate)) {
    return null;
  }

  return {
    // First trimester ends
    endFirstTrimester: addWeeks(lmpDate, 12),
    // Anatomy scan window (18-22 weeks)
    anatomyScanStart: addWeeks(lmpDate, 18),
    anatomyScanEnd: addWeeks(lmpDate, 22),
    // Viability (24 weeks)
    viability: addWeeks(lmpDate, 24),
    // Second trimester ends
    endSecondTrimester: addWeeks(lmpDate, 28),
    // Term (37 weeks)
    term: addWeeks(lmpDate, 37),
    // Due date (40 weeks)
    dueDate: addWeeks(lmpDate, 40),
    // Post-term (42 weeks)
    postTerm: addWeeks(lmpDate, 42),
  };
}
