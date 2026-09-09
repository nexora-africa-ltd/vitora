// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests for JSON input parsing and formatting helpers used by new forms.
 */

import {
  formatJsonInput,
  safeParseJsonArray,
  safeParseJsonObject,
} from '@/lib/utils/json-input';

describe('json-input helpers', () => {
  it('parses object JSON and rejects arrays for object parser', () => {
    expect(safeParseJsonObject('{"a":1}').error).toBeNull();
    expect(safeParseJsonObject('[1,2,3]').error).toBe('JSON must be an object.');
  });

  it('parses array-of-objects JSON and rejects scalar arrays', () => {
    expect(safeParseJsonArray('[{"a":1}]').error).toBeNull();
    expect(safeParseJsonArray('[1,2,3]').error).toBe('All array entries must be objects.');
  });

  it('formats valid JSON and errors for invalid JSON', () => {
    const formatted = formatJsonInput('{"a":1}');
    expect(formatted.error).toBeNull();
    expect(formatted.value).toContain('\n');
    expect(formatJsonInput('{').error).toBe('Cannot format invalid JSON.');
  });
});
