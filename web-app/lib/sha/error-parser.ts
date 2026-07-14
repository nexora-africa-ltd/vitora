import { AxiosError } from 'axios';
import { getApiErrorMessage } from '@/lib/api/client';

function stripTransportPrefix(message: string): string {
  return message.replace(/^[A-Z]+\s+\/[^\s]+\s+HTTP\s+\d+:\s*/i, '');
}

function stripWhitelistPrefixes(message: string): string {
  return message
    .replace(/^failed to initiate OTP whitelist request:\s*/i, '')
    .replace(/^failed to initiate OTP whitelist callback:\s*/i, '');
}

export function normalizeDHAErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return message;

  const withoutTransport = stripTransportPrefix(trimmed);
  const withoutWhitelist = stripWhitelistPrefixes(withoutTransport);
  const cleaned = withoutWhitelist.replace(/^DHA API error \(\d+\):\s*/i, '').trim();
  return cleaned || withoutWhitelist || withoutTransport || trimmed;
}

export function extractDHAErrorMessage(error: unknown): string {
  let raw = getApiErrorMessage(error);

  // Prefer backend `message` when `error` only contains a class name such as
  // "DHAValidationError"; this preserves the useful DHA validation text.
  if (error instanceof AxiosError) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    const errorField = typeof data?.error === 'string' ? data.error.trim() : '';
    const messageField = typeof data?.message === 'string' ? data.message.trim() : '';
    const isErrorClassName = /^[A-Za-z]+Error$/.test(errorField);
    if (messageField && (isErrorClassName || !errorField)) {
      raw = messageField;
    }
  }

  const normalized = normalizeDHAErrorMessage(raw);

  const ediMatch = normalized.match(
    /["']?Edi Error["']?\s*:\s*\{[^}]*["']?error["']?\s*:\s*["']([^"']+)["']/
  );
  if (ediMatch?.[1]) {
    return ediMatch[1];
  }

  const visitMatch = normalized.match(/failed to start visit for patient:\s*(.+)/i);
  if (visitMatch?.[1]) {
    try {
      const parsed = JSON.parse(visitMatch[1]);
      if (parsed?.['Edi Error']?.error) return String(parsed['Edi Error'].error);
    } catch {
      // Not JSON; return message body as-is.
    }
    return visitMatch[1].trim();
  }

  return normalized || raw;
}

export function isPendingWhitelistError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('already existing pending request') ||
    lower.includes('kindly wait for an approval')
  );
}
