/**
 * TDD Tests for cn utility function
 * Following TDD approach: Write tests FIRST before implementation
 */
import { cn } from '@/lib/utils/cn';

describe('cn (class name merge utility)', () => {
  describe('basic functionality', () => {
    it('should return empty string for no arguments', () => {
      expect(cn()).toBe('');
    });

    it('should return single class unchanged', () => {
      expect(cn('p-4')).toBe('p-4');
    });

    it('should merge multiple classes', () => {
      expect(cn('p-4', 'm-2')).toBe('p-4 m-2');
    });
  });

  describe('conditional classes', () => {
    it('should filter out falsy values', () => {
      expect(cn('p-4', false && 'm-2', 'text-sm')).toBe('p-4 text-sm');
    });

    it('should handle null and undefined', () => {
      expect(cn('p-4', null, undefined, 'text-sm')).toBe('p-4 text-sm');
    });

    it('should handle empty strings', () => {
      expect(cn('p-4', '', 'text-sm')).toBe('p-4 text-sm');
    });
  });

  describe('tailwind merge (conflict resolution)', () => {
    it('should resolve conflicting padding classes', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('should resolve conflicting margin classes', () => {
      expect(cn('m-4', 'mx-2')).toBe('m-4 mx-2');
    });

    it('should resolve conflicting text color classes', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should resolve conflicting background classes', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('should keep non-conflicting classes', () => {
      expect(cn('p-4', 'text-lg', 'p-2', 'font-bold')).toBe('text-lg p-2 font-bold');
    });
  });

  describe('array inputs', () => {
    it('should handle array of classes', () => {
      expect(cn(['p-4', 'm-2'])).toBe('p-4 m-2');
    });

    it('should handle mixed arrays and strings', () => {
      expect(cn('text-lg', ['p-4', 'm-2'], 'font-bold')).toBe('text-lg p-4 m-2 font-bold');
    });
  });

  describe('object inputs (conditional)', () => {
    it('should handle object with boolean values', () => {
      expect(cn({ 'p-4': true, 'm-2': false, 'text-lg': true })).toBe('p-4 text-lg');
    });

    it('should handle mixed objects and strings', () => {
      expect(cn('font-bold', { 'p-4': true, 'm-2': false })).toBe('font-bold p-4');
    });
  });
});
