import type { Claim } from '@/lib/types/sha';

export const PREVIEW_INACTIVE_INTERVENTION_STATUSES = new Set([
  'retired',
  'inactive',
  'cancelled',
  'deleted',
  'void',
  'removed',
]);

const PREVIEW_INACTIVE_STATUS_TOKENS = [
  'retir',
  'inactiv',
  'cancel',
  'delet',
  'void',
  'remov',
  'close',
  'closed',
  'end',
  'ended',
  'stop',
  'stopped',
  'suspend',
  'terminate',
];

const CORE_ATTACHMENT_ERROR_REGEX = /Missing required attachment:\s*([^\s].*)$/i;
const INTERVENTION_DOCUMENT_ERROR_REGEX =
  /Missing required document\s+'([^']+)'\s+for intervention\s+([A-Z0-9-]+)/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeInterventionCode(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function readPreviewInterventionLifecycleRaw(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(
      row.workflow_state || row.workflowState || row.status || row.intervention_status || ''
    )
      .trim()
      .toLowerCase();
  }
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isPreviewInterventionInactiveStatus(value: unknown): boolean {
  const raw = readPreviewInterventionLifecycleRaw(value);
  if (!raw) return false;
  if (PREVIEW_INACTIVE_INTERVENTION_STATUSES.has(raw)) return true;
  const normalized = raw.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return false;
  return PREVIEW_INACTIVE_STATUS_TOKENS.some((token) => normalized.includes(token));
}

export function parseInterventionCodeFromMissingDocError(error: string): string {
  const match = error.match(INTERVENTION_DOCUMENT_ERROR_REGEX);
  return normalizeInterventionCode(match?.[1]);
}

export interface MissingCoreAttachmentError {
  rawError: string;
  attachmentCode: string;
}

export interface MissingInterventionDocumentError {
  rawError: string;
  documentCode: string;
  interventionCode: string;
}

export function parseMissingCoreAttachmentErrors(errors: string[]): MissingCoreAttachmentError[] {
  return errors
    .map((error) => {
      const match = error.match(CORE_ATTACHMENT_ERROR_REGEX);
      const attachmentCode = String(match?.[1] || '').trim();
      if (!attachmentCode) return null;
      return { rawError: error, attachmentCode };
    })
    .filter((entry): entry is MissingCoreAttachmentError => !!entry);
}

export function parseMissingInterventionDocumentErrors(
  errors: string[]
): MissingInterventionDocumentError[] {
  return errors
    .map((error) => {
      const match = error.match(INTERVENTION_DOCUMENT_ERROR_REGEX);
      const documentCode = String(match?.[1] || '').trim();
      const interventionCode = normalizeInterventionCode(match?.[2]);
      if (!documentCode || !interventionCode) return null;
      return {
        rawError: error,
        documentCode,
        interventionCode,
      };
    })
    .filter((entry): entry is MissingInterventionDocumentError => !!entry);
}

export function getPreviewActiveInterventionCodeSet(previewPayload: unknown): Set<string> {
  const payload = asRecord(previewPayload);
  const interventions = Array.isArray(payload.interventions) ? payload.interventions : [];
  return new Set(
    interventions
      .filter((entry) => {
        const row = asRecord(entry);
        return !isPreviewInterventionInactiveStatus(row);
      })
      .map((entry) => normalizeInterventionCode(asRecord(entry).intervention_code))
      .filter(Boolean)
  );
}

export function toActiveInterventionCodeSet(
  activeInterventions: Array<{ intervention_code?: string | null }>
): Set<string> {
  return new Set(
    activeInterventions
      .map((entry) => normalizeInterventionCode(entry.intervention_code))
      .filter(Boolean)
  );
}

export function filterValidationErrorsByActiveInterventions(
  errors: string[],
  options: {
    activeInterventionCodes: Set<string>;
    previewPayload?: unknown;
  }
): string[] {
  const previewInterventionCodes = getPreviewActiveInterventionCodeSet(options.previewPayload);
  return errors.filter((error) => {
    const interventionCode = parseInterventionCodeFromMissingDocError(error);
    if (!interventionCode) return true;
    if (previewInterventionCodes.size > 0 && options.activeInterventionCodes.size > 0) {
      return (
        previewInterventionCodes.has(interventionCode) &&
        options.activeInterventionCodes.has(interventionCode)
      );
    }
    if (previewInterventionCodes.size > 0) {
      return previewInterventionCodes.has(interventionCode);
    }
    return options.activeInterventionCodes.has(interventionCode);
  });
}

type MissingDocEntry = NonNullable<Claim['missing_document_types']>[number];

export function filterClaimMissingDocumentTypesByActiveInterventions(
  missing: MissingDocEntry[],
  options: {
    activeInterventionCodes: Set<string>;
    previewPayload?: unknown;
  }
): MissingDocEntry[] {
  const previewInterventionCodes = getPreviewActiveInterventionCodeSet(options.previewPayload);
  return missing.filter((entry) => {
    const interventionCode = normalizeInterventionCode(entry.intervention_code);
    if (!interventionCode) return true;
    if (previewInterventionCodes.size > 0 && options.activeInterventionCodes.size > 0) {
      return (
        previewInterventionCodes.has(interventionCode) &&
        options.activeInterventionCodes.has(interventionCode)
      );
    }
    if (previewInterventionCodes.size > 0) {
      return previewInterventionCodes.has(interventionCode);
    }
    return options.activeInterventionCodes.has(interventionCode);
  });
}
