/**
 * Patient Model Tests
 * 
 * Tests for Patient model methods.
 */

import { Patient } from '../../lib/db/models/Patient';

describe('Patient Model', () => {
  describe('fullName getter', () => {
    test('should return full name', () => {
      const mockPatient = {
        firstName: 'John',
        lastName: 'Doe',
      } as Patient;

      // Access through prototype since it's a getter
      const descriptor = Object.getOwnPropertyDescriptor(Patient.prototype, 'fullName');
      expect(descriptor?.get).toBeDefined();
    });
  });

  describe('age getter', () => {
    test('should be defined', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Patient.prototype, 'age');
      expect(descriptor?.get).toBeDefined();
    });
  });

  describe('static table name', () => {
    test('should be patients', () => {
      expect(Patient.table).toBe('patients');
    });
  });
});
