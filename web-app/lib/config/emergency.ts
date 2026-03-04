/**
 * Emergency Department Configuration
 *
 * Shared constants and styling for the Emergency Module.
 * Used by zone cards, dashboards, and patient routing.
 */

import type { TriageCategory, AssignedArea } from '@/lib/types/triage';

// =============================================================================
// ZONE ROUTING
// =============================================================================

/**
 * Maps zone codes to URL route segments.
 * Used for navigation from dashboard to individual zone pages.
 */
export const ZONE_ROUTES: Record<string, string> = {
  ER_RESUS: 'resus',
  ER_ACUTE: 'acute',
  TRAUMA: 'trauma',
  ER_FAST_TRACK: 'fast-track',
  OBSERVATION: 'observation',
  PEDIATRIC_ER: 'pediatric',
  MATERNITY: 'maternity',
};

/**
 * Reverse mapping: URL route segment → zone code (AssignedArea).
 */
export const ROUTE_TO_ZONE: Record<string, AssignedArea> = {
  resus: 'ER_RESUS',
  acute: 'ER_ACUTE',
  trauma: 'TRAUMA',
  'fast-track': 'ER_FAST_TRACK',
  observation: 'OBSERVATION',
  pediatric: 'PEDIATRIC_ER',
  maternity: 'MATERNITY',
};

/**
 * Zone metadata: labels, short labels for tabs, and primary categories.
 */
export interface ZoneMetadata {
  /** Full display name */
  label: string;
  /** Short label for tabs and mobile */
  shortLabel: string;
  /** Route segment for URL */
  route: string;
  /** Area code for API filtering */
  code: AssignedArea;
  /** Primary triage category associated with this zone */
  primaryCategory: TriageCategory;
  /** Default capacity */
  defaultCapacity: number;
}

export const ZONE_METADATA: ZoneMetadata[] = [
  { label: 'Resuscitation', shortLabel: 'Resus', route: 'resus', code: 'ER_RESUS', primaryCategory: 'RED', defaultCapacity: 4 },
  { label: 'Acute Care', shortLabel: 'Acute', route: 'acute', code: 'ER_ACUTE', primaryCategory: 'ORANGE', defaultCapacity: 10 },
  { label: 'Trauma Bay', shortLabel: 'Trauma', route: 'trauma', code: 'TRAUMA', primaryCategory: 'RED', defaultCapacity: 2 },
  { label: 'Fast Track', shortLabel: 'Fast Trk', route: 'fast-track', code: 'ER_FAST_TRACK', primaryCategory: 'GREEN', defaultCapacity: 12 },
  { label: 'Observation', shortLabel: 'Obs', route: 'observation', code: 'OBSERVATION', primaryCategory: 'YELLOW', defaultCapacity: 8 },
  { label: 'Pediatric ER', shortLabel: 'Peds', route: 'pediatric', code: 'PEDIATRIC_ER', primaryCategory: 'ORANGE', defaultCapacity: 6 },
  { label: 'Maternity', shortLabel: 'Maternity', route: 'maternity', code: 'MATERNITY', primaryCategory: 'ORANGE', defaultCapacity: 4 },
];

// =============================================================================
// TRIAGE CATEGORY STYLING
// =============================================================================

/**
 * Color classes for each triage category.
 * Uses semantic tokens where possible for dark mode consistency.
 */
export const CATEGORY_COLORS: Record<
  TriageCategory,
  { bg: string; text: string; border: string; indicatorState: 'active' | 'down' | 'fixing' | 'idle' }
> = {
  RED: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/50',
    indicatorState: 'down', // Red pulsing dot
  },
  ORANGE: {
    bg: 'bg-orange-100 dark:bg-orange-950/50',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-300 dark:border-orange-700',
    indicatorState: 'fixing', // Yellow/orange pulsing dot
  },
  YELLOW: {
    bg: 'bg-yellow-100 dark:bg-yellow-950/50',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-300 dark:border-yellow-700',
    indicatorState: 'fixing', // Yellow pulsing dot
  },
  GREEN: {
    bg: 'bg-green-100 dark:bg-green-950/50',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-300 dark:border-green-700',
    indicatorState: 'active', // Green pulsing dot
  },
  BLUE: {
    bg: 'bg-blue-100 dark:bg-blue-950/50',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
    indicatorState: 'idle', // Muted dot
  },
};

/**
 * Triage category order for rendering (highest acuity first).
 */
export const TRIAGE_CATEGORY_ORDER: TriageCategory[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'];

/**
 * Human-readable labels for triage categories.
 */
export const CATEGORY_LABELS: Record<TriageCategory, string> = {
  RED: 'Immediate',
  ORANGE: 'Very Urgent',
  YELLOW: 'Urgent',
  GREEN: 'Standard',
  BLUE: 'Non-Urgent',
};
