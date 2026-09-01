import type { FacilityLevel, FacilityLevelSubtype } from '@/lib/types/facility';

export const FACILITY_LEVEL_LABELS: Record<FacilityLevel, string> = {
  '1': 'Community Unit',
  '2': 'Dispensary',
  '3': 'Health Centre',
  '4': 'Sub-County Hospital',
  '5': 'County Referral Hospital',
  '6': 'National Referral Hospital',
};

export const FACILITY_LEVEL_OPTIONS: Array<{ value: FacilityLevel; label: string }> = [
  { value: '1', label: 'Level 1 – Community Unit' },
  { value: '2', label: 'Level 2 – Dispensary' },
  { value: '3', label: 'Level 3 – Health Centre' },
  { value: '4', label: 'Level 4 – Sub-County Hospital' },
  { value: '5', label: 'Level 5 – County Referral Hospital' },
  { value: '6', label: 'Level 6 – National Referral Hospital' },
];

export const FACILITY_LEVEL_SUBTYPE_OPTIONS: Array<{
  value: Exclude<FacilityLevelSubtype, ''>;
  label: string;
}> = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];

export function supportsFacilityLevelSubtype(level?: string | null): boolean {
  return ['3', '4', '5', '6'].includes(String(level || '').trim());
}

export function formatFacilityLevel(
  level?: string | null,
  subtype?: string | null,
  compact = false
): string {
  const levelText = String(level || '').trim();
  if (!levelText) return '—';

  const normalizedSubtype = String(subtype || '')
    .trim()
    .toUpperCase();
  const suffix = normalizedSubtype ? normalizedSubtype : '';
  const code = `${levelText}${suffix}`;
  if (compact) {
    return `Level ${code}`;
  }

  const baseLabel = FACILITY_LEVEL_LABELS[levelText as FacilityLevel];
  if (!baseLabel) {
    return `Level ${code}`;
  }
  return `Level ${code} – ${baseLabel}`;
}
