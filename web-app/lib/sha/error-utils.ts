/**
 * SHA error parsing helpers.
 * Use this module in SHA UI/API code to normalize backend and Axios error payloads
 * into a consistent shape for user-facing messaging.
 * Inputs: unknown error-like values (Axios errors, Error instances, or SHA payload objects).
 */

type MaybeRecord = Record<string, unknown>;

export interface SHAErrorInfo {
  title: string;
  message: string;
  detail?: string;
  code?: string;
  upstreamStatus?: number;
}

function asRecord(value: unknown): MaybeRecord | null {
  if (!value || typeof value !== 'object') return null;
  return value as MaybeRecord;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractFromPayload(payload: unknown): SHAErrorInfo | null {
  const data = asRecord(payload);
  if (!data) return null;

  const hasExplicitErrorSignal =
    asNonEmptyString(data.error) ||
    asNonEmptyString(data.error_code) ||
    asNonEmptyString(data.error_title) ||
    asNonEmptyString(data.error_detail) ||
    asNumber(data.upstream_status) !== undefined;
  if (!hasExplicitErrorSignal) return null;

  const code = asNonEmptyString(data.error_code);
  const title =
    asNonEmptyString(data.error_title) ||
    asNonEmptyString(data.reason) ||
    asNonEmptyString(data.error) ||
    asNonEmptyString(data.message);
  const message =
    asNonEmptyString(data.error) ||
    asNonEmptyString(data.message) ||
    asNonEmptyString(data.detail) ||
    asNonEmptyString(data.reason);
  const detail = asNonEmptyString(data.error_detail) || asNonEmptyString(data.detail);
  const upstreamStatus = asNumber(data.upstream_status);

  if (!title && !message && !code) return null;

  return {
    title: title || 'SHA service error',
    message: message || title || 'Unable to complete SHA request.',
    detail,
    code,
    upstreamStatus,
  };
}

/**
 * Normalize SHA errors from API payloads, Axios responses, or Error instances.
 */
export function extractSHAErrorInfo(input: unknown): SHAErrorInfo | null {
  const direct = extractFromPayload(input);
  if (direct) return direct;

  const source = asRecord(input);
  const response = source ? asRecord(source.response) : null;
  const responseData = response ? asRecord(response.data) : null;
  const fromResponse = extractFromPayload(responseData);
  if (fromResponse) {
    const status = asNumber(response?.status);
    return {
      ...fromResponse,
      upstreamStatus: fromResponse.upstreamStatus ?? status,
    };
  }

  const responseStatus = asNumber(response?.status);
  if (responseStatus !== undefined && responseStatus >= 400) {
    const title =
      asNonEmptyString(responseData?.error_title) ||
      asNonEmptyString(responseData?.detail) ||
      asNonEmptyString(responseData?.message) ||
      'SHA request failed';
    const message =
      asNonEmptyString(responseData?.error) ||
      asNonEmptyString(responseData?.message) ||
      asNonEmptyString(responseData?.detail) ||
      asNonEmptyString(source?.message) ||
      'Unable to complete SHA request.';

    return {
      title,
      message,
      detail: asNonEmptyString(responseData?.error_detail),
      code: asNonEmptyString(responseData?.error_code),
      upstreamStatus: responseStatus,
    };
  }

  if (input instanceof Error) {
    return {
      title: 'SHA request failed',
      message: input.message,
    };
  }

  return null;
}
