/**
 * Intra-op vital sign thresholds — mirrors backend CRITICAL_THRESHOLDS
 * on IntraOpVitalReading (backend/hmis/apps/theatre/models.py).
 *
 * [lowCritical, highCritical] — null means no bound on that side.
 */
export const CRITICAL_THRESHOLDS: Record<string, [number | null, number | null]> = {
  spo2: [92, null],
  systolic_bp: [80, 200],
  diastolic_bp: [40, 120],
  heart_rate: [40, 150],
  etco2: [20, 60],
  respiratory_rate: [6, 40],
};

/** Warning thresholds — a softer zone before critical. */
export const WARNING_THRESHOLDS: Record<string, [number | null, number | null]> = {
  spo2: [94, null],
  systolic_bp: [90, 180],
  diastolic_bp: [50, 110],
  heart_rate: [50, 130],
  etco2: [25, 55],
  respiratory_rate: [8, 35],
};

export type VitalStatus = 'normal' | 'warning' | 'critical';

/** Evaluate whether a value is normal, warning, or critical for a given field. */
export function getVitalStatus(
  field: string,
  value: number | null | undefined
): VitalStatus {
  if (value == null) return 'normal';

  const critical = CRITICAL_THRESHOLDS[field];
  if (critical) {
    const [low, high] = critical;
    if (low != null && value < low) return 'critical';
    if (high != null && value > high) return 'critical';
  }

  const warning = WARNING_THRESHOLDS[field];
  if (warning) {
    const [low, high] = warning;
    if (low != null && value < low) return 'warning';
    if (high != null && value > high) return 'warning';
  }

  return 'normal';
}

/** Human-readable alert message, or null if normal. */
export function getVitalAlert(
  field: string,
  value: number | null | undefined
): string | null {
  if (value == null) return null;

  const status = getVitalStatus(field, value);
  if (status === 'normal') return null;

  const labels: Record<string, string> = {
    spo2: 'SpO2',
    systolic_bp: 'Systolic BP',
    diastolic_bp: 'Diastolic BP',
    heart_rate: 'Heart rate',
    etco2: 'EtCO2',
    respiratory_rate: 'Respiratory rate',
  };
  const label = labels[field] ?? field;

  const thresholds = status === 'critical' ? CRITICAL_THRESHOLDS[field] : WARNING_THRESHOLDS[field];
  if (!thresholds) return null;

  const [low, high] = thresholds;
  if (low != null && value < low) {
    return `${label} ${value} is ${status === 'critical' ? 'critically' : ''} low (threshold <${low})`.replace('  ', ' ');
  }
  if (high != null && value > high) {
    return `${label} ${value} is ${status === 'critical' ? 'critically' : ''} high (threshold >${high})`.replace('  ', ' ');
  }
  return null;
}

/** Tailwind classes for a table cell based on vital status. */
export function vitalCellClass(
  field: string,
  value: number | null | undefined
): string {
  const status = getVitalStatus(field, value);
  if (status === 'critical')
    return 'text-red-600 font-semibold bg-red-50 dark:bg-red-950/30';
  if (status === 'warning')
    return 'text-amber-600 font-medium bg-amber-50 dark:bg-amber-950/30';
  return '';
}

/** Tailwind border/ring classes for a form input based on vital status. */
export function vitalInputClass(
  field: string,
  value: number | null | undefined
): string {
  const status = getVitalStatus(field, value);
  if (status === 'critical')
    return 'border-red-500 ring-1 ring-red-500/40 focus-visible:ring-red-500';
  if (status === 'warning')
    return 'border-amber-500 ring-1 ring-amber-500/40 focus-visible:ring-amber-500';
  return '';
}

/** Badge variant for a vital value. */
export function vitalBadgeVariant(
  field: string,
  value: number | null | undefined
): 'outline' | 'warning' | 'destructive' {
  const status = getVitalStatus(field, value);
  if (status === 'critical') return 'destructive';
  if (status === 'warning') return 'warning';
  return 'outline';
}

/** Normal range description for a field (for tooltips / help text). */
export function getNormalRange(field: string): string | null {
  const ranges: Record<string, string> = {
    heart_rate: '50–130 bpm (warning) · 40–150 bpm (critical)',
    spo2: '≥94% (warning) · ≥92% (critical)',
    systolic_bp: '90–180 mmHg (warning) · 80–200 mmHg (critical)',
    diastolic_bp: '50–110 mmHg (warning) · 40–120 mmHg (critical)',
    etco2: '25–55 mmHg (warning) · 20–60 mmHg (critical)',
    respiratory_rate: '8–35 /min (warning) · 6–40 /min (critical)',
  };
  return ranges[field] ?? null;
}
