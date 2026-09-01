/**
 * Shared Kardex status helpers.
 *
 * Use these functions to normalize, format, encode/decode, and derive
 * discharge booleans from Kardex mobility/oral status values.
 */

export const MOBILITY_STATUS_OPTIONS = [
  { value: 'INDEPENDENT', label: 'Independent ambulation' },
  { value: 'AMBULATORY_WITH_ASSISTANCE', label: 'Ambulatory with assistance' },
  { value: 'BED_TO_CHAIR_ONLY', label: 'Bed to chair only' },
  { value: 'WHEELCHAIR_ONLY', label: 'Wheelchair only' },
  { value: 'BEDBOUND', label: 'Bedbound / non-ambulatory' },
  { value: 'UNKNOWN', label: 'Unknown / not assessed' },
] as const;

export const ORAL_TOLERANCE_OPTIONS = [
  { value: 'CAN_TOLERATE_ORAL', label: 'Can tolerate oral intake' },
  { value: 'CANNOT_TOLERATE_ORAL', label: 'Cannot tolerate oral intake' },
  { value: 'UNKNOWN', label: 'Unknown / not assessed' },
] as const;

const MOBILITY_STATUS_LABELS: Map<string, string> = new Map(
  MOBILITY_STATUS_OPTIONS.map((option) => [option.value, option.label])
);
const ORAL_TOLERANCE_LABELS: Map<string, string> = new Map(
  ORAL_TOLERANCE_OPTIONS.map((option) => [option.value, option.label])
);

export const normalizeMobilityStatus = (value?: string | null): string => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (MOBILITY_STATUS_LABELS.has(normalized)) return normalized;
  if (normalized.includes('BEDBOUND') || normalized.includes('NON_AMBULATORY')) return 'BEDBOUND';
  if (normalized.includes('WHEELCHAIR')) return 'WHEELCHAIR_ONLY';
  if (normalized.includes('BED') && normalized.includes('CHAIR')) return 'BED_TO_CHAIR_ONLY';
  if (normalized.includes('AMBUL') || normalized.includes('WALK'))
    return 'AMBULATORY_WITH_ASSISTANCE';
  if (normalized.includes('INDEPENDENT')) return 'INDEPENDENT';
  return 'UNKNOWN';
};

export const normalizeOralTolerance = (value?: string | null): string => {
  if (!value) return '';
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (ORAL_TOLERANCE_LABELS.has(normalized)) return normalized;
  if (['NIL_BY_MOUTH', 'NBM', 'NPO', 'IV_ONLY'].includes(normalized)) return 'CANNOT_TOLERATE_ORAL';
  if (normalized.includes('ORAL') && normalized.includes('TOLERAT')) return 'CAN_TOLERATE_ORAL';
  return 'UNKNOWN';
};

export const formatMobilityStatus = (value?: string | null): string => {
  if (!value) return 'Not specified';
  const [rawCodeValue, rawNotes] = value.split('::');
  const rawCode = rawCodeValue ?? '';
  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, '_');
  const label = MOBILITY_STATUS_LABELS.get(normalized) ?? rawCode;
  const notes = rawNotes?.trim();
  return notes ? `${label} - ${notes}` : label;
};

export const formatOralTolerance = (value?: string | null): string => {
  if (!value) return 'Not specified';
  const [rawCodeValue, rawNotes] = value.split('::');
  const rawCode = rawCodeValue ?? '';
  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, '_');
  const label = ORAL_TOLERANCE_LABELS.get(normalized) ?? rawCode;
  const notes = rawNotes?.trim();
  return notes ? `${label} - ${notes}` : label;
};

export const decodeStructuredStatus = (
  value: string | null | undefined,
  normalize: (raw?: string | null) => string
): { code: string; notes: string } => {
  if (!value) return { code: '', notes: '' };
  const [rawCode, ...rawNotesParts] = value.split('::');
  const normalizedCode = normalize(rawCode);
  const notesFromDelimited = rawNotesParts.join('::').trim();
  if (notesFromDelimited) {
    return { code: normalizedCode, notes: notesFromDelimited };
  }
  if (normalizedCode === 'UNKNOWN') {
    return { code: normalizedCode, notes: value.trim() };
  }
  return { code: normalizedCode, notes: '' };
};

export const encodeStructuredStatus = (code: string, notes: string): string | undefined => {
  const normalizedCode = code.trim();
  if (!normalizedCode) return undefined;
  const normalizedNotes = notes.trim();
  return normalizedNotes ? `${normalizedCode}::${normalizedNotes}` : normalizedCode;
};

export const resolveCanAmbulate = (mobilityStatus?: string | null): boolean | null => {
  if (!mobilityStatus) return null;
  const rawCode = mobilityStatus.split('::')[0] ?? mobilityStatus;
  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, '_');

  if (
    ['INDEPENDENT', 'AMBULATORY_WITH_ASSISTANCE', 'AMBULANT', 'WALKS_INDEPENDENTLY'].includes(
      normalized
    )
  ) {
    return true;
  }
  if (['BEDBOUND', 'NON_AMBULATORY', 'WHEELCHAIR_ONLY', 'BED_TO_CHAIR_ONLY'].includes(normalized)) {
    return false;
  }
  if (
    normalized.includes('BED') ||
    normalized.includes('WHEELCHAIR') ||
    normalized.includes('NON_AMBULAT')
  ) {
    return false;
  }
  if (
    normalized.includes('AMBULAT') ||
    normalized.includes('WALK') ||
    normalized.includes('INDEPENDENT')
  ) {
    return true;
  }
  return null;
};

export const resolveCanTolerateOral = (dietaryRequirements?: string | null): boolean | null => {
  if (!dietaryRequirements) return null;
  const rawCode = dietaryRequirements.split('::')[0] ?? dietaryRequirements;
  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, '_');

  if (normalized === 'CAN_TOLERATE_ORAL') return true;
  if (['CANNOT_TOLERATE_ORAL', 'NIL_BY_MOUTH', 'NBM', 'NPO', 'IV_ONLY'].includes(normalized)) {
    return false;
  }
  if (
    normalized.includes('CANNOT') ||
    normalized.includes('NPO') ||
    normalized.includes('NBM') ||
    normalized.includes('IV_ONLY')
  ) {
    return false;
  }
  if (normalized.includes('ORAL') && normalized.includes('TOLERAT')) {
    return true;
  }
  return null;
};
