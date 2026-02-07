/**
 * Tests for Sprint 2 Encounter Types 
 * 
 * Validates all new type definitions, state transitions, and visit reason taxonomy.
 * Sprint 2 - Phase 2A, 2B, 2C, 2D
 */
import {
  ENCOUNTER_STATUS_DISPLAY,
  VALID_ENCOUNTER_TRANSITIONS,
  VISIT_REASON_DISPLAY,
  SKIP_TRIAGE_REASONS,
} from '@/lib/types/encounter';
import type { EncounterStatus, VisitReason } from '@/lib/types/encounter';

describe('Encounter Status Types (Sprint 2)', () => {
  describe('ENCOUNTER_STATUS_DISPLAY', () => {
    it('has display text for all 10 statuses', () => {
      expect(Object.keys(ENCOUNTER_STATUS_DISPLAY)).toHaveLength(10);
    });

    it('includes all expected statuses', () => {
      const expected: EncounterStatus[] = [
        'CREATED', 'CHECKED_IN', 'TRIAGED', 'IN_PROGRESS', 'ON_HOLD',
        'ORDERS_PLACED', 'RESULTS_PENDING', 'READY_TO_CLOSE', 'CLOSED', 'CANCELLED',
      ];
      expected.forEach((status) => {
        expect(ENCOUNTER_STATUS_DISPLAY[status]).toBeDefined();
      });
    });
  });

  describe('VALID_ENCOUNTER_TRANSITIONS', () => {
    it('has transition rules for all 10 statuses', () => {
      expect(Object.keys(VALID_ENCOUNTER_TRANSITIONS)).toHaveLength(10);
    });

    it('CREATED can transition to CHECKED_IN and CANCELLED', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.CREATED).toContain('CHECKED_IN');
      expect(VALID_ENCOUNTER_TRANSITIONS.CREATED).toContain('CANCELLED');
      expect(VALID_ENCOUNTER_TRANSITIONS.CREATED).toHaveLength(2);
    });

    it('CHECKED_IN can transition to TRIAGED, IN_PROGRESS, or CANCELLED', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.CHECKED_IN).toContain('TRIAGED');
      expect(VALID_ENCOUNTER_TRANSITIONS.CHECKED_IN).toContain('IN_PROGRESS');
      expect(VALID_ENCOUNTER_TRANSITIONS.CHECKED_IN).toContain('CANCELLED');
      expect(VALID_ENCOUNTER_TRANSITIONS.CHECKED_IN).toHaveLength(3);
    });

    it('TRIAGED can transition to IN_PROGRESS or CANCELLED', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.TRIAGED).toContain('IN_PROGRESS');
      expect(VALID_ENCOUNTER_TRANSITIONS.TRIAGED).toContain('CANCELLED');
      expect(VALID_ENCOUNTER_TRANSITIONS.TRIAGED).toHaveLength(2);
    });

    it('IN_PROGRESS has multiple productive transitions', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.IN_PROGRESS).toContain('ON_HOLD');
      expect(VALID_ENCOUNTER_TRANSITIONS.IN_PROGRESS).toContain('ORDERS_PLACED');
      expect(VALID_ENCOUNTER_TRANSITIONS.IN_PROGRESS).toContain('READY_TO_CLOSE');
      expect(VALID_ENCOUNTER_TRANSITIONS.IN_PROGRESS).toContain('CANCELLED');
      expect(VALID_ENCOUNTER_TRANSITIONS.IN_PROGRESS).toHaveLength(4);
    });

    it('CLOSED is a terminal state with no transitions', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.CLOSED).toHaveLength(0);
    });

    it('CANCELLED is a terminal state with no transitions', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.CANCELLED).toHaveLength(0);
    });

    it('READY_TO_CLOSE can only transition to CLOSED', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.READY_TO_CLOSE).toEqual(['CLOSED']);
    });

    it('ON_HOLD can transition back to IN_PROGRESS or be CANCELLED', () => {
      expect(VALID_ENCOUNTER_TRANSITIONS.ON_HOLD).toContain('IN_PROGRESS');
      expect(VALID_ENCOUNTER_TRANSITIONS.ON_HOLD).toContain('CANCELLED');
    });
  });
});

describe('Visit Reason Types (Sprint 2)', () => {
  describe('VISIT_REASON_DISPLAY', () => {
    it('has display text for all 8 visit reasons', () => {
      expect(Object.keys(VISIT_REASON_DISPLAY)).toHaveLength(8);
    });

    it('includes all expected reasons', () => {
      const expected: VisitReason[] = [
        'NEW_COMPLAINT', 'FOLLOW_UP', 'CHRONIC_CARE', 'PROCEDURE_REVIEW',
        'REFILL_ONLY', 'LAB_REVIEW', 'REFERRAL_VISIT', 'OTHER',
      ];
      expected.forEach((reason) => {
        expect(VISIT_REASON_DISPLAY[reason]).toBeDefined();
      });
    });
  });

  describe('SKIP_TRIAGE_REASONS', () => {
    it('includes LAB_REVIEW', () => {
      expect(SKIP_TRIAGE_REASONS).toContain('LAB_REVIEW');
    });

    it('includes REFILL_ONLY', () => {
      expect(SKIP_TRIAGE_REASONS).toContain('REFILL_ONLY');
    });

    it('does not include NEW_COMPLAINT', () => {
      expect(SKIP_TRIAGE_REASONS).not.toContain('NEW_COMPLAINT');
    });

    it('does not include FOLLOW_UP', () => {
      expect(SKIP_TRIAGE_REASONS).not.toContain('FOLLOW_UP');
    });

    it('has exactly 2 skip-triage reasons', () => {
      expect(SKIP_TRIAGE_REASONS).toHaveLength(2);
    });
  });
});
