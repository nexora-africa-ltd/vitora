/**
 * Tests for format utility functions.
 */

import { formatDate, formatRelativeTime, formatDateTime } from '../format';

describe('format utilities', () => {
  describe('formatDate', () => {
    it('should format date string to readable format', () => {
      const result = formatDate('2026-01-15');
      expect(result).toBe('Jan 15, 2026');
    });

    it('should handle ISO datetime strings', () => {
      const result = formatDate('2026-01-15T10:30:00Z');
      expect(result).toMatch(/Jan 15, 2026/);
    });

    it('should return original string on invalid date', () => {
      const invalid = 'not-a-date';
      const result = formatDate(invalid);
      expect(result).toBe(invalid);
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent dates as relative time', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo.toISOString());
      expect(result).toContain('ago');
    });

    it('should return original string on invalid date', () => {
      const invalid = 'not-a-date';
      const result = formatRelativeTime(invalid);
      expect(result).toBe(invalid);
    });
  });

  describe('formatDateTime', () => {
    it('should format datetime with time', () => {
      const result = formatDateTime('2026-01-15T14:30:00Z');
      expect(result).toMatch(/Jan 15, 2026 at/);
      expect(result).toMatch(/PM|AM/);
    });

    it('should return original string on invalid date', () => {
      const invalid = 'not-a-date';
      const result = formatDateTime(invalid);
      expect(result).toBe(invalid);
    });
  });
});
