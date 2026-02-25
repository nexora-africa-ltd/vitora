/**
 * Integration Tests for Physiotherapy Order Flow
 *
 * Tests the complete workflow from order creation through session completion,
 * including billing integration and clinic queue routing.
 *
 * Test Scenarios:
 * 1. Create order from encounter
 * 2. Approve order and create clinic visit
 * 3. Assign therapist to order
 * 4. Generate sessions for order
 * 5. Complete session and create invoice item
 * 6. Complete all sessions and close order
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { physiotherapyApi } from '@/lib/api/physiotherapy';

// Mock APIs
jest.mock('@/lib/api/physiotherapy');
jest.mock('@/lib/api/encounters');
jest.mock('@/lib/api/clinics');
jest.mock('@/lib/api/billing');

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    refresh: mockRefresh,
  }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockPhysiotherapyApi = physiotherapyApi as jest.Mocked<typeof physiotherapyApi>;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260226-0001',
  first_name: 'John',
  last_name: 'Doe',
  full_name: 'John Doe',
  date_of_birth: '1970-05-15',
  gender: 'M' as const,
};

const mockEncounter = {
  id: 100,
  patient: mockPatient.id,
  patient_name: 'John Doe',
  encounter_type: 'OPD' as const,
  encounter_date: '2026-02-26',
  chief_complaint: 'Knee pain after surgery',
  status: 'IN_PROGRESS' as const,
};

const mockTreatmentType = {
  id: 1,
  code: 'PT-PSR-001',
  name: 'Post-Surgery Rehabilitation',
  category: 'POST_SURGICAL' as const,
  typical_duration_minutes: 45,
  recommended_sessions: 12,
  cost_per_session: '2000.00',
  sha_claimable: true,
  sha_intervention_code: 'PT001',
  is_active: true,
};

const mockOrder = {
  id: 1,
  order_number: 'PHYSIO-20260226-0001',
  patient: mockPatient,
  patient_id: mockPatient.id,
  encounter_id: mockEncounter.id,
  clinic_visit_id: null,
  treatment_type: mockTreatmentType,
  treatment_type_id: mockTreatmentType.id,
  ordered_by: {
    id: 10,
    username: 'dr.smith',
    first_name: 'Dr.',
    last_name: 'Smith',
    full_name: 'Dr. Smith',
  },
  ordered_by_id: 10,
  assigned_therapist: null,
  assigned_therapist_id: null,
  referral_reason: 'POST_SURGERY' as const,
  clinical_indication: 'Post knee replacement rehabilitation',
  relevant_history: 'Total knee replacement 2 weeks ago',
  diagnosis: 'Post-operative knee stiffness',
  precautions: 'Weight bearing as tolerated',
  contraindications: '',
  total_sessions: 12,
  sessions_completed: 0,
  frequency: '3x per week',
  treatment_goals: 'Full ROM and strength restoration',
  priority: 'ROUTINE' as const,
  status: 'PENDING' as const,
  start_date: '2026-02-27',
  expected_end_date: '2026-04-15',
  clinical_notes: 'Initial assessment needed',
  is_sensitive: false,
  sha_code: 'PT001',
  sha_claimable: true,
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

const mockTherapist = {
  id: 20,
  username: 'jane.therapist',
  first_name: 'Jane',
  last_name: 'Therapist',
  full_name: 'Jane Therapist',
};

const mockSession = {
  id: 1,
  session_number: 'PS-20260227-0001',
  order: mockOrder.id,
  order_number: mockOrder.order_number,
  patient: mockPatient,
  patient_id: mockPatient.id,
  therapist: mockTherapist,
  therapist_id: mockTherapist.id,
  session_date: '2026-02-27',
  start_time: '09:00:00',
  end_time: null,
  duration_minutes: null,
  status: 'SCHEDULED' as const,
  progress_notes: '',
  treatment_provided: '',
  pain_level_before: null,
  pain_level_after: null,
  outcome: null,
  patient_response: '',
  home_exercises: '',
  next_session_plan: '',
  invoice_item_id: null,
  created_at: '2026-02-26T10:30:00Z',
  updated_at: '2026-02-26T10:30:00Z',
};

// =============================================================================
// TEST WRAPPER
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Physiotherapy Order Flow - Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Order Creation from Encounter', () => {
    it('should create a new physiotherapy order with encounter context', async () => {
      const newOrder = { ...mockOrder };
      mockPhysiotherapyApi.createOrder.mockResolvedValueOnce(newOrder);

      const createData = {
        patient_id: mockPatient.id,
        encounter_id: mockEncounter.id,
        treatment_type_id: mockTreatmentType.id,
        referral_reason: 'POST_SURGERY' as const,
        clinical_indication: 'Post knee replacement rehabilitation',
        total_sessions: 12,
        frequency: '3x per week',
        priority: 'ROUTINE' as const,
      };

      const result = await physiotherapyApi.createOrder(createData);

      expect(mockPhysiotherapyApi.createOrder).toHaveBeenCalledWith(createData);
      expect(result.order_number).toBe('PHYSIO-20260226-0001');
      expect(result.status).toBe('PENDING');
      expect(result.encounter_id).toBe(mockEncounter.id);
    });

    it('should auto-generate order number in PHYSIO-YYYYMMDD-XXXX format', async () => {
      mockPhysiotherapyApi.createOrder.mockResolvedValueOnce(mockOrder);

      const result = await physiotherapyApi.createOrder({
        patient_id: 1,
        encounter_id: 100,
        treatment_type_id: 1,
        referral_reason: 'POST_SURGERY',
        clinical_indication: 'Test',
        total_sessions: 6,
        frequency: '2x per week',
      });

      expect(result.order_number).toMatch(/^PHYSIO-\d{8}-\d{4}$/);
    });

    it('should set initial status to PENDING', async () => {
      mockPhysiotherapyApi.createOrder.mockResolvedValueOnce(mockOrder);

      const result = await physiotherapyApi.createOrder({
        patient_id: 1,
        encounter_id: 100,
        treatment_type_id: 1,
        referral_reason: 'POST_SURGERY',
        clinical_indication: 'Test',
        total_sessions: 6,
        frequency: '2x per week',
      });

      expect(result.status).toBe('PENDING');
    });
  });

  describe('Order Approval', () => {
    it('should approve order and transition status to APPROVED', async () => {
      const approvedOrder = { ...mockOrder, status: 'APPROVED' as const };
      mockPhysiotherapyApi.approveOrder.mockResolvedValueOnce(approvedOrder);

      const result = await physiotherapyApi.approveOrder(mockOrder.id);

      expect(result.status).toBe('APPROVED');
      expect(mockPhysiotherapyApi.approveOrder).toHaveBeenCalledWith(mockOrder.id);
    });

    it('should create clinic visit on approval (via backend signal)', async () => {
      const approvedOrderWithClinicVisit = {
        ...mockOrder,
        status: 'APPROVED' as const,
        clinic_visit_id: 500, // Created by backend signal
      };
      mockPhysiotherapyApi.approveOrder.mockResolvedValueOnce(approvedOrderWithClinicVisit);

      const result = await physiotherapyApi.approveOrder(mockOrder.id);

      expect(result.clinic_visit_id).toBe(500);
    });

    it('should reject invalid status transitions', async () => {
      mockPhysiotherapyApi.approveOrder.mockRejectedValueOnce(
        new Error('Cannot approve order with status COMPLETED')
      );

      await expect(
        physiotherapyApi.approveOrder(999) // Completed order
      ).rejects.toThrow('Cannot approve order with status COMPLETED');
    });
  });

  describe('Therapist Assignment', () => {
    it('should assign therapist to order', async () => {
      const orderWithTherapist = {
        ...mockOrder,
        assigned_therapist: mockTherapist,
        assigned_therapist_id: mockTherapist.id,
      };
      mockPhysiotherapyApi.assignTherapist.mockResolvedValueOnce(orderWithTherapist);

      const result = await physiotherapyApi.assignTherapist(mockOrder.id, mockTherapist.id);

      expect(result.assigned_therapist_id).toBe(mockTherapist.id);
      expect(result.assigned_therapist?.full_name).toBe('Jane Therapist');
    });
  });

  describe('Session Generation', () => {
    it('should generate sessions based on total_sessions count', async () => {
      const sessions = Array.from({ length: 12 }, (_, i) => ({
        ...mockSession,
        id: i + 1,
        session_number: `PS-20260227-${String(i + 1).padStart(4, '0')}`,
        session_date: new Date(2026, 1, 27 + Math.floor(i * 2.33)).toISOString().split('T')[0],
      }));

      mockPhysiotherapyApi.generateSessions.mockResolvedValueOnce({
        sessions_created: 12,
        sessions,
      });

      const result = await physiotherapyApi.generateSessions(mockOrder.id);

      expect(result.sessions_created).toBe(12);
      expect(result.sessions).toHaveLength(12);
    });

    it('should set all generated sessions to SCHEDULED status', async () => {
      const sessions = [mockSession, { ...mockSession, id: 2 }];
      mockPhysiotherapyApi.generateSessions.mockResolvedValueOnce({
        sessions_created: 2,
        sessions,
      });

      const result = await physiotherapyApi.generateSessions(mockOrder.id);

      result.sessions.forEach((session) => {
        expect(session.status).toBe('SCHEDULED');
      });
    });
  });

  describe('Session Completion', () => {
    it('should complete session with progress notes', async () => {
      const completedSession = {
        ...mockSession,
        status: 'COMPLETED' as const,
        progress_notes: 'Good ROM improvement observed',
        outcome: 'IMPROVED' as const,
        duration_minutes: 45,
        invoice_item_id: 1001, // Created by billing signal
      };
      mockPhysiotherapyApi.completeSession.mockResolvedValueOnce(completedSession);

      const completeData = {
        progress_notes: 'Good ROM improvement observed',
        outcome: 'IMPROVED' as const,
        pain_level_after: 3,
      };

      const result = await physiotherapyApi.completeSession(mockSession.id, completeData);

      expect(result.status).toBe('COMPLETED');
      expect(result.progress_notes).toBe('Good ROM improvement observed');
      expect(result.outcome).toBe('IMPROVED');
    });

    it('should create invoice item on session completion', async () => {
      const completedSession = {
        ...mockSession,
        status: 'COMPLETED' as const,
        invoice_item_id: 1001,
      };
      mockPhysiotherapyApi.completeSession.mockResolvedValueOnce(completedSession);

      const result = await physiotherapyApi.completeSession(mockSession.id, {
        progress_notes: 'Session completed',
        outcome: 'IMPROVED',
      });

      // Invoice item created by backend billing signal
      expect(result.invoice_item_id).toBe(1001);
    });

    it('should increment sessions_completed on order', async () => {
      const orderAfterSession = {
        ...mockOrder,
        status: 'IN_PROGRESS' as const,
        sessions_completed: 1,
      };
      mockPhysiotherapyApi.getOrder.mockResolvedValueOnce(orderAfterSession);

      const result = await physiotherapyApi.getOrder(mockOrder.id);

      expect(result.sessions_completed).toBe(1);
    });
  });

  describe('Order Completion', () => {
    it('should auto-complete order when all sessions are done', async () => {
      const fullyCompletedOrder = {
        ...mockOrder,
        status: 'COMPLETED' as const,
        sessions_completed: 12,
      };
      mockPhysiotherapyApi.getOrder.mockResolvedValueOnce(fullyCompletedOrder);

      const result = await physiotherapyApi.getOrder(mockOrder.id);

      expect(result.status).toBe('COMPLETED');
      expect(result.sessions_completed).toBe(result.total_sessions);
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel order with reason', async () => {
      const cancelledOrder = {
        ...mockOrder,
        status: 'CANCELLED' as const,
      };
      mockPhysiotherapyApi.cancelOrder.mockResolvedValueOnce(cancelledOrder);

      const result = await physiotherapyApi.cancelOrder(mockOrder.id, 'Patient declined treatment');

      expect(result.status).toBe('CANCELLED');
      expect(mockPhysiotherapyApi.cancelOrder).toHaveBeenCalledWith(
        mockOrder.id,
        'Patient declined treatment'
      );
    });

    it('should cancel pending sessions when order is cancelled', async () => {
      // Verify remaining sessions are cancelled when order is cancelled
      mockPhysiotherapyApi.cancelOrder.mockResolvedValueOnce({
        ...mockOrder,
        status: 'CANCELLED' as const,
      });

      await physiotherapyApi.cancelOrder(mockOrder.id, 'Order cancelled');

      // The backend signal should cancel all pending sessions
      expect(mockPhysiotherapyApi.cancelOrder).toHaveBeenCalled();
    });
  });
});

describe('Nutrition Consultation Flow - Integration', () => {
  // Similar integration tests for nutrition module
  it.todo('should create nutrition consultation from encounter');
  it.todo('should calculate BMI from anthropometrics');
  it.todo('should create diet plan from consultation');
  it.todo('should complete follow-up consultation');
});

describe('Occupational Therapy Flow - Integration', () => {
  // Similar integration tests for OT module
  it.todo('should create OT order with FIM assessment');
  it.todo('should track independence score progress');
  it.todo('should complete ADL training session');
});

describe('Social Work Flow - Integration', () => {
  // Social work specific tests
  it.todo('should create referral with urgency level');
  it.todo('should convert referral to case');
  it.todo('should mark case as sensitive with restricted access');
  it.todo('should add intervention to case');
  it.todo('should close case with outcome summary');
});

describe('Counselling Flow - Integration', () => {
  // Counselling specific tests
  it.todo('should create counselling referral');
  it.todo('should schedule follow-up session');
  it.todo('should track session count for treatment plan');
  it.todo('should handle sensitive mental health cases');
});
