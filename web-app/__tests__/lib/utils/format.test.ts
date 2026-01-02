/**
 * TDD Tests for format utility functions
 * Following TDD approach: Write tests FIRST before implementation
 */
import {
  formatDate,
  formatRelativeTime,
  calculateAge,
  formatPhoneNumber,
  formatCurrency,
  formatMRN,
} from '@/lib/utils/format';

describe('format utilities', () => {
  describe('formatDate', () => {
    it('should format ISO date string to default pattern', () => {
      expect(formatDate('2025-12-25')).toBe('Dec 25, 2025');
    });

    it('should format Date object to default pattern', () => {
      expect(formatDate(new Date(2025, 11, 25))).toBe('Dec 25, 2025');
    });

    it('should format with custom pattern', () => {
      expect(formatDate('2025-12-25', 'yyyy-MM-dd')).toBe('2025-12-25');
    });

    it('should format with day of week pattern', () => {
      expect(formatDate('2025-12-25', 'EEEE, MMMM d, yyyy')).toBe('Thursday, December 25, 2025');
    });

    it('should format datetime string correctly', () => {
      expect(formatDate('2025-12-25T10:30:00', 'MMM d, yyyy HH:mm')).toBe('Dec 25, 2025 10:30');
    });
  });

  describe('formatRelativeTime', () => {
    beforeAll(() => {
      // Mock current date for consistent testing
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T12:00:00'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should return relative time for recent date', () => {
      const result = formatRelativeTime('2026-01-01T10:00:00');
      expect(result).toContain('hours ago');
    });

    it('should return relative time for date days ago', () => {
      const result = formatRelativeTime('2025-12-29T12:00:00');
      expect(result).toContain('days ago');
    });

    it('should handle Date object', () => {
      const result = formatRelativeTime(new Date('2025-12-31T12:00:00'));
      expect(result).toContain('ago');
    });
  });

  describe('calculateAge', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T12:00:00'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should calculate age from date string', () => {
      expect(calculateAge('1990-01-01')).toBe(36);
    });

    it('should calculate age from Date object', () => {
      expect(calculateAge(new Date(1985, 0, 1))).toBe(41);
    });

    it('should calculate age for recent birthday', () => {
      // Birthday after current date in year
      expect(calculateAge('1990-06-15')).toBe(35);
    });

    it('should return 0 for current year birth', () => {
      expect(calculateAge('2025-06-01')).toBe(0);
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format Kenyan +254 phone number', () => {
      expect(formatPhoneNumber('+254712345678')).toBe('+254 712 345 678');
    });

    it('should format local Kenyan 0xxx phone number', () => {
      expect(formatPhoneNumber('0712345678')).toBe('0712 345 678');
    });

    it('should return empty string for empty input', () => {
      expect(formatPhoneNumber('')).toBe('');
    });

    it('should return unformatted for non-Kenyan numbers', () => {
      expect(formatPhoneNumber('+1234567890')).toBe('+1234567890');
    });

    it('should handle phone with spaces', () => {
      // Edge case - already has spaces
      expect(formatPhoneNumber('+254 712 345 678')).toBe('+254 712 345 678');
    });
  });

  describe('formatCurrency', () => {
    it('should format amount in KES', () => {
      const result = formatCurrency(1500);
      expect(result).toContain('1,500');
      expect(result).toMatch(/KES|Ksh/i);
    });

    it('should format large amounts with comma separators', () => {
      const result = formatCurrency(1500000);
      expect(result).toContain('1,500,000');
    });

    it('should format zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0');
    });

    it('should handle decimal amounts', () => {
      const result = formatCurrency(1500.5);
      // Intl.NumberFormat rounds to whole numbers based on minimumFractionDigits
      expect(result).toMatch(/1,50[01]/);
    });
  });

  describe('formatMRN', () => {
    it('should return MRN unchanged', () => {
      expect(formatMRN('MRN-20251225-0001')).toBe('MRN-20251225-0001');
    });

    it('should handle empty MRN', () => {
      expect(formatMRN('')).toBe('');
    });
  });
});
