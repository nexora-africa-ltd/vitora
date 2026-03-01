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
  | 'bmi_for_age';

export type Sex = 'M' | 'F';

// Import all reference data
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

/**
 * Get the LMS reference data for a given indicator and sex.
 */
export function getLMSData(
  indicator: GrowthIndicator,
  sex: Sex,
): LMSDataPoint[] | LMSLengthDataPoint[] {
  const dataMap: Record<string, LMSDataPoint[] | LMSLengthDataPoint[]> = {
    weight_for_age_M: wfaBoys as LMSDataPoint[],
    weight_for_age_F: wfaGirls as LMSDataPoint[],
    height_for_age_M: lhfaBoys as LMSDataPoint[],
    height_for_age_F: lhfaGirls as LMSDataPoint[],
    head_circumference_for_age_M: hcfaBoys as LMSDataPoint[],
    head_circumference_for_age_F: hcfaGirls as LMSDataPoint[],
    bmi_for_age_M: bfaBoys as LMSDataPoint[],
    bmi_for_age_F: bfaGirls as LMSDataPoint[],
    weight_for_height_M: [...(wflBoys as LMSLengthDataPoint[]), ...(wfhBoys as LMSLengthDataPoint[])],
    weight_for_height_F: [...(wflGirls as LMSLengthDataPoint[]), ...(wfhGirls as LMSLengthDataPoint[])],
  };
  return dataMap[`${indicator}_${sex}`] || [];
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
): Record<string, { x: number; y: number }[]> {
  const data = getLMSData(indicator, sex) as LMSDataPoint[];
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

  for (const z of Z_SCORE_LINES) {
    const key = zLabels[z]!;
    lines[key] = [];

    for (const point of data) {
      if (!('age_days' in point)) continue;
      const y = measurementFromZ(z, point.L, point.M, point.S);
      lines[key]!.push({ x: point.age_days, y: Math.round(y * 100) / 100 });
    }
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
