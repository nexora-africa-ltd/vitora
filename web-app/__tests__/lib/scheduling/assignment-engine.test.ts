// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests for assignment engine UI helper logic.
 */

import {
  buildAutoAssignReason,
  getTargetReferenceLabel,
  isPatientTargetRelevant,
} from '@/lib/scheduling/assignment-engine';

describe('assignment-engine helpers', () => {
  it('flags patient-relevant assignment types correctly', () => {
    expect(isPatientTargetRelevant('APPOINTMENT')).toBe(true);
    expect(isPatientTargetRelevant('BED_ASSIGNMENT')).toBe(true);
    expect(isPatientTargetRelevant('THEATRE_SLOT')).toBe(true);
    expect(isPatientTargetRelevant('SHIFT')).toBe(false);
    expect(isPatientTargetRelevant('LAB_BATCH')).toBe(false);
  });

  it('returns specific target labels for non-patient assignment types', () => {
    expect(getTargetReferenceLabel('SHIFT')).toBe('Shift reference');
    expect(getTargetReferenceLabel('LAB_BATCH')).toBe('Lab batch reference');
    expect(getTargetReferenceLabel('THEATRE_SLOT')).toBe('Target reference');
  });

  it('builds a reason string with optional target context', () => {
    expect(buildAutoAssignReason('Needs immediate cover', 'SHIFT-42')).toBe(
      'Needs immediate cover [target:SHIFT-42]'
    );
    expect(buildAutoAssignReason('Needs immediate cover', '')).toBe('Needs immediate cover');
    expect(buildAutoAssignReason('', 'SHIFT-42')).toBe('Auto-assigned [target:SHIFT-42]');
  });
});
