// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * JSON input helpers for form ergonomics.
 * Parses and formats user-entered JSON for object/array form fields.
 */

export function safeParseJsonObject(
  text: string
): { value: Record<string, unknown> | null; error: string | null } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: 'JSON must be an object.' };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: null, error: 'Invalid JSON syntax.' };
  }
}

export function safeParseJsonArray(
  text: string
): { value: Array<Record<string, unknown>> | null; error: string | null } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { value: null, error: 'JSON must be an array.' };
    }
    if (parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      return { value: null, error: 'All array entries must be objects.' };
    }
    return { value: parsed as Array<Record<string, unknown>>, error: null };
  } catch {
    return { value: null, error: 'Invalid JSON syntax.' };
  }
}

export function formatJsonInput(text: string): { value: string | null; error: string | null } {
  try {
    const parsed = JSON.parse(text);
    return { value: JSON.stringify(parsed, null, 2), error: null };
  } catch {
    return { value: null, error: 'Cannot format invalid JSON.' };
  }
}
