/**
 * WHO Growth Standards — Client-side LMS data and percentile calculation.
 *
 * Mirrors the backend WHOGrowthCalculator (hmis.apps.mch.services.growth)
 * for client-side chart rendering with WHO reference bands.
 *
 * Uses LMS (Lambda-Mu-Sigma) method for Z-score ↔ measurement conversions.
 */

// LMS data point for age-based indicators
export interface LMSDataPoint {
  age_days: number;
  L: number;
  M: number;
  S: number;
}

// LMS data point for length/height-based indicators
export interface LMSLengthDataPoint {
  length_cm?: number;
  height_cm?: number;
  L: number;
  M: number;
  S: number;
}

export type GrowthIndicator =
  | 'weight_for_age'
  | 'height_for_age'
  | 'weight_for_height'
  | 'head_circumference_for_age'
  | 'bmi_for_age'
  | 'muac_for_age';

export type Sex = 'M' | 'F';

// Import all reference data — 0-5y (WHO Child Growth Standards)
import wfaBoys from './wfa_boys_0_5.json';
import wfaGirls from './wfa_girls_0_5.json';
import lhfaBoys from './lhfa_boys_0_5.json';
import lhfaGirls from './lhfa_girls_0_5.json';
import hcfaBoys from './hcfa_boys_0_5.json';
import hcfaGirls from './hcfa_girls_0_5.json';
import bfaBoys from './bfa_boys_0_5.json';
import bfaGirls from './bfa_girls_0_5.json';
import wflBoys from './wfl_boys.json';
import wflGirls from './wfl_girls.json';
import wfhBoys from './wfh_boys.json';
import wfhGirls from './wfh_girls.json';

// Import 5-19y data (WHO Growth Reference 2007)
import bfaBoys5_19 from './bfa_boys_5_19.json';
import bfaGirls5_19 from './bfa_girls_5_19.json';
import lhfaBoys5_19 from './lhfa_boys_5_19.json';
import lhfaGirls5_19 from './lhfa_girls_5_19.json';
import wfaBoys5_10 from './wfa_boys_5_10.json';
import wfaGirls5_10 from './wfa_girls_5_10.json';

/** Age range for growth data selection */
export type AgeRange = '0_5' | '5_19' | '5_10' | 'all';

/**
 * Get the LMS reference data for a given indicator, sex, and age range.
 *
 * @param indicator - Growth indicator type
 * @param sex - 'M' or 'F'
 * @param ageRange - '0_5' (default), '5_19', '5_10', or 'all' (combined)
 */
export function getLMSData(
  indicator: GrowthIndicator,
  sex: Sex,
  ageRange: AgeRange = '0_5',
): LMSDataPoint[] | LMSLengthDataPoint[] {
  // MUAC has no WHO LMS table in our bundle — it uses absolute cutoffs
  // (SAM < 11.5cm, MAM 11.5–12.4cm, Normal ≥ 12.5cm).
  if (indicator === 'muac_for_age') {
    return [];
  }

  // Weight-for-height is not age-based, return as-is
  if (indicator === 'weight_for_height') {
    return sex === 'M'
      ? [...(wflBoys as LMSLengthDataPoint[]), ...(wfhBoys as LMSLengthDataPoint[])]
      : [...(wflGirls as LMSLengthDataPoint[]), ...(wfhGirls as LMSLengthDataPoint[])];
  }

  // Head circumference: only 0-5y data exists
  if (indicator === 'head_circumference_for_age') {
    return sex === 'M' ? (hcfaBoys as LMSDataPoint[]) : (hcfaGirls as LMSDataPoint[]);
  }

  // Age-based indicators with 0-5 / 5-19 / 5-10 selection
  const data0_5: Record<string, LMSDataPoint[]> = {
    weight_for_age_M: wfaBoys as LMSDataPoint[],
    weight_for_age_F: wfaGirls as LMSDataPoint[],
    height_for_age_M: lhfaBoys as LMSDataPoint[],
    height_for_age_F: lhfaGirls as LMSDataPoint[],
    bmi_for_age_M: bfaBoys as LMSDataPoint[],
    bmi_for_age_F: bfaGirls as LMSDataPoint[],
  };

  const dataExt: Record<string, LMSDataPoint[]> = {
    weight_for_age_M: wfaBoys5_10 as LMSDataPoint[],
    weight_for_age_F: wfaGirls5_10 as LMSDataPoint[],
    height_for_age_M: lhfaBoys5_19 as LMSDataPoint[],
    height_for_age_F: lhfaGirls5_19 as LMSDataPoint[],
    bmi_for_age_M: bfaBoys5_19 as LMSDataPoint[],
    bmi_for_age_F: bfaGirls5_19 as LMSDataPoint[],
  };

  const key = `${indicator}_${sex}`;
  const base = data0_5[key] || [];
  const ext = dataExt[key] || [];

  switch (ageRange) {
    case '5_19':
    case '5_10':
      return ext;
    case 'all':
      return [...base, ...ext];
    default:
      return base;
  }
}

/**
 * Linearly interpolate LMS parameters between two age points.
 */
function interpolateLMS(
  ageDays: number,
  data: LMSDataPoint[],
): { L: number; M: number; S: number } | null {
  if (data.length === 0) return null;
  const first = data[0]!;
  if (ageDays <= first.age_days) return { L: first.L, M: first.M, S: first.S };
  const last = data[data.length - 1]!;
  if (ageDays >= last.age_days) {
    return { L: last.L, M: last.M, S: last.S };
  }

  for (let i = 0; i < data.length - 1; i++) {
    const curr = data[i]!;
    const next = data[i + 1]!;
    if (ageDays >= curr.age_days && ageDays <= next.age_days) {
      const t =
        (ageDays - curr.age_days) / (next.age_days - curr.age_days);
      return {
        L: curr.L + t * (next.L - curr.L),
        M: curr.M + t * (next.M - curr.M),
        S: curr.S + t * (next.S - curr.S),
      };
    }
  }
  return null;
}

/**
 * Calculate Z-score from measurement using LMS method.
 * Formula: Z = ((X/M)^L - 1) / (L * S) when L ≠ 0
 *          Z = ln(X/M) / S when L ≈ 0
 */
export function calculateZScore(
  measurement: number,
  L: number,
  M: number,
  S: number,
): number {
  if (M === 0 || S === 0) return 0;

  let z: number;
  if (Math.abs(L) < 0.01) {
    z = Math.log(measurement / M) / S;
  } else {
    z = (Math.pow(measurement / M, L) - 1) / (L * S);
  }
  return Math.max(-6, Math.min(6, z));
}

/**
 * Calculate measurement value from Z-score using inverse LMS.
 * Y = M * (1 + L * S * Z)^(1/L) when L ≠ 0
 * Y = M * e^(S * Z) when L ≈ 0
 */
export function measurementFromZ(
  z: number,
  L: number,
  M: number,
  S: number,
): number {
  if (Math.abs(L) < 0.01) {
    return M * Math.exp(S * z);
  }
  const inner = 1 + L * S * z;
  if (inner <= 0) return 0;
  return M * Math.pow(inner, 1 / L);
}

/**
 * Z-score lines used for chart reference bands.
 */
export const Z_SCORE_LINES = [-3, -2, -1, 0, 1, 2, 3] as const;

/**
 * Standard percentile names mapping to Z-scores.
 */
export const PERCENTILE_MAP: Record<string, number> = {
  '3rd': -1.88,
  '15th': -1.04,
  '50th': 0,
  '85th': 1.04,
  '97th': 1.88,
};

/**
 * Generate percentile/Z-score reference lines for age-based indicators.
 * Returns an object with z_neg3, z_neg2, z_neg1, z_0, z_pos1, z_pos2, z_pos3
 * where each value is an array of {x: age_days, y: measurement_value}.
 */
export function generatePercentileLines(
  indicator: GrowthIndicator,
  sex: Sex,
  ageRange: AgeRange = '0_5',
): Record<string, { x: number; y: number }[]> {
  const data = getLMSData(indicator, sex, ageRange) as Array<
    LMSDataPoint | LMSLengthDataPoint
  >;
  const lines: Record<string, { x: number; y: number }[]> = {};

  const zLabels: Record<number, string> = {
    [-3]: 'z_neg3',
    [-2]: 'z_neg2',
    [-1]: 'z_neg1',
    0: 'z_0',
    1: 'z_pos1',
    2: 'z_pos2',
    3: 'z_pos3',
  };

  // Extract the appropriate x value: age_days for age-based indicators,
  // length_cm / height_cm for weight_for_height.
  const getX = (point: LMSDataPoint | LMSLengthDataPoint): number | null => {
    if ('age_days' in point) return point.age_days;
    if ('length_cm' in point && point.length_cm != null) return point.length_cm;
    if ('height_cm' in point && point.height_cm != null) return point.height_cm;
    return null;
  };

  for (const z of Z_SCORE_LINES) {
    const key = zLabels[z]!;
    lines[key] = [];

    for (const point of data) {
      const x = getX(point);
      if (x == null) continue;
      const y = measurementFromZ(z, point.L, point.M, point.S);
      lines[key]!.push({ x, y: Math.round(y * 100) / 100 });
    }

    // Sort ascending so Recharts draws a clean line
    lines[key]!.sort((a, b) => a.x - b.x);
  }

  return lines;
}

/**
 * Get the display label and Y-axis unit for a growth indicator.
 */
export function getIndicatorMeta(indicator: GrowthIndicator): {
  label: string;
  yAxisLabel: string;
  xAxisLabel: string;
} {
  switch (indicator) {
    case 'weight_for_age':
      return { label: 'Weight-for-Age', yAxisLabel: 'Weight (kg)', xAxisLabel: 'Age (months)' };
    case 'height_for_age':
      return { label: 'Height/Length-for-Age', yAxisLabel: 'Height (cm)', xAxisLabel: 'Age (months)' };
    case 'weight_for_height':
      return { label: 'Weight-for-Height', yAxisLabel: 'Weight (kg)', xAxisLabel: 'Height (cm)' };
    case 'head_circumference_for_age':
      return { label: 'Head Circumference-for-Age', yAxisLabel: 'HC (cm)', xAxisLabel: 'Age (months)' };
    case 'bmi_for_age':
      return { label: 'BMI-for-Age', yAxisLabel: 'BMI (kg/m²)', xAxisLabel: 'Age (months)' };
    case 'muac_for_age':
      return { label: 'MUAC-for-Age', yAxisLabel: 'MUAC (cm)', xAxisLabel: 'Age (months)' };
  }
}

/**
 * Convert age in days to months for chart display.
 */
export function ageDaysToMonths(days: number): number {
  return Math.round((days / 30.4375) * 10) / 10;
}

/**
 * Get the Z-score classification label.
 */
export function getZScoreClassification(z: number): {
  label: string;
  severity: 'normal' | 'moderate' | 'severe';
  color: string;
} {
  const absZ = Math.abs(z);
  if (absZ < 2) {
    return { label: 'Normal', severity: 'normal', color: 'text-green-700' };
  }
  if (absZ < 3) {
    return {
      label: z < 0 ? 'Moderate undernutrition' : 'Above normal',
      severity: 'moderate',
      color: z < 0 ? 'text-orange-700' : 'text-blue-700',
    };
  }
  return {
    label: z < 0 ? 'Severe undernutrition' : 'Well above normal',
    severity: 'severe',
    color: z < 0 ? 'text-red-700' : 'text-purple-700',
  };
}
