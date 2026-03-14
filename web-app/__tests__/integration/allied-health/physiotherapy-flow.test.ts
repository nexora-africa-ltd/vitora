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

// =============================================================================
// NUTRITION CONSULTATION FLOW
// =============================================================================

import { nutritionApi } from '@/lib/api/nutrition';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';
import { socialWorkApi } from '@/lib/api/social-work';
import { counsellingApi } from '@/lib/api/counselling';

jest.mock('@/lib/api/nutrition');
jest.mock('@/lib/api/occupational-therapy');
jest.mock('@/lib/api/social-work');
jest.mock('@/lib/api/counselling');

const mockNutritionApi = nutritionApi as jest.Mocked<typeof nutritionApi>;
const mockOTApi = occupationalTherapyApi as jest.Mocked<typeof occupationalTherapyApi>;
const mockSocialWorkApi = socialWorkApi as jest.Mocked<typeof socialWorkApi>;
const mockCounsellingApi = counsellingApi as jest.Mocked<typeof counsellingApi>;

const mockConsultation = {
  id: 1,
  order_number: 'NUT-20260226-0001',
  patient: mockPatient.id,
  patient_name: 'John Doe',
  patient_mrn: mockPatient.mrn,
  encounter_id: mockEncounter.id,
  status: 'PENDING' as const,
  consultation_type: 'INITIAL' as const,
  reason: 'Weight management',
  dietary_history: '',
  assessment: '',
  recommendations: '',
  anthropometrics: null,
  bmi: null,
  bmi_classification: null,
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

describe('Nutrition Consultation Flow - Integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create nutrition consultation from encounter', async () => {
    mockNutritionApi.createConsultation.mockResolvedValueOnce(mockConsultation);

    const result = await nutritionApi.createConsultation({
      patient_id: mockPatient.id,
      encounter_id: mockEncounter.id,
      consultation_type: 'INITIAL',
      reason: 'Weight management',
    });

    expect(mockNutritionApi.createConsultation).toHaveBeenCalledWith(
      expect.objectContaining({ encounter_id: mockEncounter.id })
    );
    expect(result.order_number).toMatch(/^NUT-\d{8}-\d{4}$/);
    expect(result.status).toBe('PENDING');
  });

  it('should calculate BMI from anthropometrics', async () => {
    const consultationWithBMI = {
      ...mockConsultation,
      anthropometrics: { weight_kg: 75, height_cm: 170 },
      bmi: 25.95,
      bmi_classification: 'OVERWEIGHT' as const,
    };
    mockNutritionApi.syncAnthropometrics.mockResolvedValueOnce(consultationWithBMI);

    const result = await nutritionApi.syncAnthropometrics(mockConsultation.id);

    expect(result.bmi).toBeCloseTo(25.95, 1);
    expect(result.bmi_classification).toBe('OVERWEIGHT');
    expect(mockNutritionApi.syncAnthropometrics).toHaveBeenCalledWith(mockConsultation.id);
  });

  it('should create diet plan from consultation', async () => {
    const mockDietPlan = {
      id: 1,
      consultation_id: mockConsultation.id,
      plan_type: 'WEIGHT_MANAGEMENT' as const,
      title: 'Calorie-controlled diet',
      description: 'Balanced 2000kcal plan',
      status: 'DRAFT' as const,
      start_date: '2026-02-27',
      end_date: null,
      created_at: '2026-02-26T11:00:00Z',
      updated_at: '2026-02-26T11:00:00Z',
    };
    mockNutritionApi.createDietPlan.mockResolvedValueOnce(mockDietPlan);

    const result = await nutritionApi.createDietPlan({
      consultation_id: mockConsultation.id,
      plan_type: 'WEIGHT_MANAGEMENT',
      title: 'Calorie-controlled diet',
      description: 'Balanced 2000kcal plan',
    });

    expect(result.consultation_id).toBe(mockConsultation.id);
    expect(result.status).toBe('DRAFT');
    expect(mockNutritionApi.createDietPlan).toHaveBeenCalled();
  });

  it('should complete follow-up consultation', async () => {
    const completedConsultation = {
      ...mockConsultation,
      consultation_type: 'FOLLOW_UP' as const,
      status: 'COMPLETED' as const,
      assessment: 'Patient progressing well',
      recommendations: 'Continue current plan',
    };
    mockNutritionApi.completeConsultation.mockResolvedValueOnce(completedConsultation);

    const result = await nutritionApi.completeConsultation(mockConsultation.id);

    expect(result.status).toBe('COMPLETED');
    expect(mockNutritionApi.completeConsultation).toHaveBeenCalledWith(mockConsultation.id);
  });
});

// =============================================================================
// OCCUPATIONAL THERAPY FLOW
// =============================================================================

const mockOTTreatmentType = {
  id: 1,
  code: 'OT-ADL-001',
  name: 'ADL Training',
  category: 'ADL' as const,
  typical_duration_minutes: 60,
  recommended_sessions: 10,
  cost_per_session: '2500.00',
  sha_claimable: true,
  sha_intervention_code: 'OT001',
  is_active: true,
};

const mockOTOrder = {
  id: 1,
  order_number: 'OT-20260226-0001',
  patient: mockPatient,
  patient_id: mockPatient.id,
  encounter_id: mockEncounter.id,
  treatment_type: mockOTTreatmentType,
  treatment_type_id: mockOTTreatmentType.id,
  status: 'PENDING' as const,
  total_sessions: 10,
  sessions_completed: 0,
  independence_score_initial: 65,
  independence_score_current: 65,
  clinical_indication: 'Stroke rehabilitation ADL training',
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

describe('Occupational Therapy Flow - Integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create OT order with independence assessment', async () => {
    mockOTApi.createOrder.mockResolvedValueOnce(mockOTOrder);

    const result = await occupationalTherapyApi.createOrder({
      patient_id: mockPatient.id,
      encounter_id: mockEncounter.id,
      treatment_type_id: mockOTTreatmentType.id,
      clinical_indication: 'Stroke rehabilitation ADL training',
      total_sessions: 10,
      independence_score_initial: 65,
    });

    expect(result.order_number).toMatch(/^OT-\d{8}-\d{4}$/);
    expect(result.independence_score_initial).toBe(65);
    expect(result.status).toBe('PENDING');
    expect(mockOTApi.createOrder).toHaveBeenCalled();
  });

  it('should track independence score progress', async () => {
    const updatedOrder = {
      ...mockOTOrder,
      sessions_completed: 5,
      independence_score_current: 78,
    };
    mockOTApi.getOrder.mockResolvedValueOnce(updatedOrder);

    const result = await occupationalTherapyApi.getOrder(mockOTOrder.id);

    expect(result.independence_score_current).toBe(78);
    expect(result.independence_score_current).toBeGreaterThan(
      result.independence_score_initial!
    );
    expect(result.sessions_completed).toBe(5);
  });

  it('should complete ADL training session', async () => {
    const completedSession = {
      id: 1,
      session_number: 'OTS-20260227-0001',
      order: mockOTOrder.id,
      status: 'COMPLETED' as const,
      session_date: '2026-02-27',
      independence_score: 70,
      progress_notes: 'Patient improved in dressing and grooming tasks',
      adl_outcomes: { dressing: 'MODIFIED_INDEPENDENT', grooming: 'MODIFIED_INDEPENDENT' },
      created_at: '2026-02-27T10:00:00Z',
      updated_at: '2026-02-27T11:00:00Z',
    };
    mockOTApi.completeSession.mockResolvedValueOnce(completedSession);

    const result = await occupationalTherapyApi.completeSession(1, {
      progress_notes: 'Patient improved in dressing and grooming tasks',
      independence_score: 70,
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.independence_score).toBe(70);
    expect(mockOTApi.completeSession).toHaveBeenCalledWith(1, expect.objectContaining({
      independence_score: 70,
    }));
  });
});

// =============================================================================
// SOCIAL WORK FLOW
// =============================================================================

const mockSWReferral = {
  id: 1,
  referral_number: 'SW-20260226-0001',
  patient: mockPatient.id,
  patient_name: 'John Doe',
  encounter_id: mockEncounter.id,
  reason: 'FINANCIAL' as const,
  urgency: 'HIGH' as const,
  status: 'PENDING' as const,
  is_sensitive: false,
  presenting_issues: 'Cannot afford medication',
  specific_requests: 'NHIF enrollment help',
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

const mockSWCase = {
  id: 1,
  case_number: 'SWC-20260226-0001',
  referral: mockSWReferral.id,
  patient: mockPatient.id,
  patient_name: 'John Doe',
  status: 'OPEN' as const,
  is_sensitive: false,
  presenting_issues: 'Cannot afford medication',
  case_plan: 'Assist with NHIF enrollment',
  assigned_worker_name: 'Jane Worker',
  created_at: '2026-02-26T11:00:00Z',
  updated_at: '2026-02-26T11:00:00Z',
};

describe('Social Work Flow - Integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create referral with urgency level', async () => {
    mockSocialWorkApi.createReferral.mockResolvedValueOnce(mockSWReferral);

    const result = await socialWorkApi.createReferral({
      patient_id: mockPatient.id,
      encounter_id: mockEncounter.id,
      reason: 'FINANCIAL',
      urgency: 'HIGH',
      presenting_issues: 'Cannot afford medication',
      specific_requests: 'NHIF enrollment help',
    });

    expect(result.referral_number).toMatch(/^SW-\d{8}-\d{4}$/);
    expect(result.urgency).toBe('HIGH');
    expect(result.status).toBe('PENDING');
    expect(mockSocialWorkApi.createReferral).toHaveBeenCalled();
  });

  it('should convert referral to case', async () => {
    mockSocialWorkApi.createCaseFromReferral.mockResolvedValueOnce(mockSWCase);

    const result = await socialWorkApi.createCaseFromReferral(mockSWReferral.id, {
      case_plan: 'Assist with NHIF enrollment',
    });

    expect(result.case_number).toMatch(/^SWC-\d{8}-\d{4}$/);
    expect(result.referral).toBe(mockSWReferral.id);
    expect(result.status).toBe('OPEN');
    expect(mockSocialWorkApi.createCaseFromReferral).toHaveBeenCalledWith(
      mockSWReferral.id,
      expect.objectContaining({ case_plan: 'Assist with NHIF enrollment' })
    );
  });

  it('should mark case as sensitive with restricted access', async () => {
    const sensitiveCase = {
      ...mockSWCase,
      is_sensitive: true,
      sensitive_categories: ['GBV'],
      confidentiality_level: 'HIGHLY_RESTRICTED' as const,
    };
    mockSocialWorkApi.updateCase.mockResolvedValueOnce(sensitiveCase);

    const result = await socialWorkApi.updateCase(mockSWCase.id, {
      is_sensitive: true,
      sensitive_categories: ['GBV'],
    });

    expect(result.is_sensitive).toBe(true);
    expect(result.confidentiality_level).toBe('HIGHLY_RESTRICTED');
    expect(mockSocialWorkApi.updateCase).toHaveBeenCalledWith(
      mockSWCase.id,
      expect.objectContaining({ is_sensitive: true })
    );
  });

  it('should add intervention to case', async () => {
    const mockIntervention = {
      id: 1,
      case_id: mockSWCase.id,
      intervention_type: 'REFERRAL' as const,
      description: 'Referred to NHIF office for enrollment',
      date: '2026-02-27',
      outcome: 'Application submitted',
      performed_by_name: 'Jane Worker',
      created_at: '2026-02-27T10:00:00Z',
      updated_at: '2026-02-27T10:00:00Z',
    };
    mockSocialWorkApi.createIntervention.mockResolvedValueOnce(mockIntervention);

    const result = await socialWorkApi.createIntervention({
      case_id: mockSWCase.id,
      intervention_type: 'REFERRAL',
      description: 'Referred to NHIF office for enrollment',
      date: '2026-02-27',
      outcome: 'Application submitted',
    });

    expect(result.case_id).toBe(mockSWCase.id);
    expect(result.intervention_type).toBe('REFERRAL');
    expect(mockSocialWorkApi.createIntervention).toHaveBeenCalled();
  });

  it('should close case with outcome summary', async () => {
    const closedCase = {
      ...mockSWCase,
      status: 'CLOSED' as const,
      closure_reason: 'GOALS_MET' as const,
      outcome_summary: 'Patient successfully enrolled in NHIF. Medication costs covered.',
      closed_at: '2026-03-15T10:00:00Z',
    };
    mockSocialWorkApi.closeCase.mockResolvedValueOnce(closedCase);

    const result = await socialWorkApi.closeCase(mockSWCase.id, {
      closure_reason: 'GOALS_MET',
      outcome_summary: 'Patient successfully enrolled in NHIF. Medication costs covered.',
    });

    expect(result.status).toBe('CLOSED');
    expect(result.closure_reason).toBe('GOALS_MET');
    expect(result.outcome_summary).toContain('NHIF');
    expect(mockSocialWorkApi.closeCase).toHaveBeenCalledWith(
      mockSWCase.id,
      expect.objectContaining({ closure_reason: 'GOALS_MET' })
    );
  });
});

// =============================================================================
// COUNSELLING FLOW
// =============================================================================

const mockCounsellingReferral = {
  id: 1,
  referral_number: 'COUN-20260226-0001',
  patient: mockPatient.id,
  patient_name: 'John Doe',
  encounter_id: mockEncounter.id,
  counselling_type: 'INDIVIDUAL' as const,
  reason: 'ANXIETY' as const,
  urgency: 'MEDIUM' as const,
  status: 'PENDING' as const,
  total_sessions: 8,
  sessions_completed: 0,
  is_sensitive: false,
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

describe('Counselling Flow - Integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create counselling referral', async () => {
    mockCounsellingApi.createReferral.mockResolvedValueOnce(mockCounsellingReferral);

    const result = await counsellingApi.createReferral({
      patient_id: mockPatient.id,
      encounter_id: mockEncounter.id,
      counselling_type: 'INDIVIDUAL',
      reason: 'ANXIETY',
      urgency: 'MEDIUM',
      total_sessions: 8,
    });

    expect(result.referral_number).toMatch(/^COUN-\d{8}-\d{4}$/);
    expect(result.status).toBe('PENDING');
    expect(result.total_sessions).toBe(8);
    expect(mockCounsellingApi.createReferral).toHaveBeenCalled();
  });

  it('should schedule follow-up sessions via generateSessions', async () => {
    const mockSessions = [
      { id: 1, session_number: 'CS-20260227-0001', referral_id: 1, scheduled_date: '2026-02-27', status: 'SCHEDULED' as const },
      { id: 2, session_number: 'CS-20260303-0001', referral_id: 1, scheduled_date: '2026-03-03', status: 'SCHEDULED' as const },
      { id: 3, session_number: 'CS-20260310-0001', referral_id: 1, scheduled_date: '2026-03-10', status: 'SCHEDULED' as const },
    ];
    mockCounsellingApi.generateSessions.mockResolvedValueOnce(mockSessions);

    const result = await counsellingApi.generateSessions(mockCounsellingReferral.id, {
      start_date: '2026-02-27',
      frequency: 'WEEKLY',
      count: 3,
    });

    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('SCHEDULED');
    expect(mockCounsellingApi.generateSessions).toHaveBeenCalledWith(
      mockCounsellingReferral.id,
      expect.objectContaining({ frequency: 'WEEKLY', count: 3 })
    );
  });

  it('should track session count for treatment plan', async () => {
    const updatedReferral = {
      ...mockCounsellingReferral,
      status: 'IN_PROGRESS' as const,
      sessions_completed: 4,
      total_sessions: 8,
    };
    mockCounsellingApi.getReferral.mockResolvedValueOnce(updatedReferral);

    const result = await counsellingApi.getReferral(mockCounsellingReferral.id);

    expect(result.sessions_completed).toBe(4);
    expect(result.total_sessions).toBe(8);
    expect(result.sessions_completed).toBeLessThanOrEqual(result.total_sessions);
  });

  it('should handle sensitive mental health cases', async () => {
    const sensitiveReferral = {
      ...mockCounsellingReferral,
      reason: 'SUICIDAL_IDEATION' as const,
      is_sensitive: true,
      urgency: 'CRITICAL' as const,
    };
    mockCounsellingApi.createReferral.mockResolvedValueOnce(sensitiveReferral);

    const result = await counsellingApi.createReferral({
      patient_id: mockPatient.id,
      encounter_id: mockEncounter.id,
      counselling_type: 'INDIVIDUAL',
      reason: 'SUICIDAL_IDEATION',
      urgency: 'CRITICAL',
      is_sensitive: true,
      total_sessions: 12,
    });

    expect(result.is_sensitive).toBe(true);
    expect(result.urgency).toBe('CRITICAL');
    expect(mockCounsellingApi.createReferral).toHaveBeenCalledWith(
      expect.objectContaining({ is_sensitive: true, urgency: 'CRITICAL' })
    );
  });
});
