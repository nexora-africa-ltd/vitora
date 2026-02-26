/**
 * Patient Allied Health Hooks
 * Hooks for fetching allied health data filtered by patient ID
 * 
 * Note: Sessions are filtered by order_id, not patient_id.
 * To get patient sessions, fetch orders first, then sessions per order.
 */

import { useQuery } from '@tanstack/react-query';
import { physiotherapyApi } from '@/lib/api/physiotherapy';
import { nutritionApi } from '@/lib/api/nutrition';
import { counsellingApi } from '@/lib/api/counselling';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';
import { socialWorkApi } from '@/lib/api/social-work';

// Query key factory for patient-specific allied health data
export const patientAlliedHealthKeys = {
  all: (patientId: number) => ['patient-allied-health', patientId] as const,
  // Physiotherapy
  physioOrders: (patientId: number) =>
    [...patientAlliedHealthKeys.all(patientId), 'physio-orders'] as const,
  // Nutrition
  nutritionConsultations: (patientId: number) =>
    [...patientAlliedHealthKeys.all(patientId), 'nutrition-consultations'] as const,
  // Counselling
  counsellingReferrals: (patientId: number) =>
    [...patientAlliedHealthKeys.all(patientId), 'counselling-referrals'] as const,
  // Occupational Therapy
  otOrders: (patientId: number) =>
    [...patientAlliedHealthKeys.all(patientId), 'ot-orders'] as const,
  // Social Work
  swReferrals: (patientId: number) =>
    [...patientAlliedHealthKeys.all(patientId), 'sw-referrals'] as const,
};

// ============ Physiotherapy ============

/**
 * Fetch physiotherapy orders for a specific patient
 */
export function usePatientPhysioOrders(patientId: number | undefined) {
  return useQuery({
    queryKey: patientAlliedHealthKeys.physioOrders(patientId!),
    queryFn: () => physiotherapyApi.listOrders({ patient_id: patientId }),
    enabled: !!patientId,
  });
}

// ============ Nutrition ============

/**
 * Fetch nutrition consultations for a specific patient
 */
export function usePatientNutritionConsultations(patientId: number | undefined) {
  return useQuery({
    queryKey: patientAlliedHealthKeys.nutritionConsultations(patientId!),
    queryFn: () => nutritionApi.listConsultations({ patient_id: patientId }),
    enabled: !!patientId,
  });
}

// ============ Counselling ============

/**
 * Fetch counselling referrals for a specific patient
 */
export function usePatientCounsellingReferrals(patientId: number | undefined) {
  return useQuery({
    queryKey: patientAlliedHealthKeys.counsellingReferrals(patientId!),
    queryFn: () => counsellingApi.listReferrals({ patient_id: patientId }),
    enabled: !!patientId,
  });
}

// ============ Occupational Therapy ============

/**
 * Fetch OT orders for a specific patient
 */
export function usePatientOTOrders(patientId: number | undefined) {
  return useQuery({
    queryKey: patientAlliedHealthKeys.otOrders(patientId!),
    queryFn: () => occupationalTherapyApi.listOrders({ patient_id: patientId }),
    enabled: !!patientId,
  });
}

// ============ Social Work ============

/**
 * Fetch social work referrals for a specific patient
 */
export function usePatientSWReferrals(patientId: number | undefined) {
  return useQuery({
    queryKey: patientAlliedHealthKeys.swReferrals(patientId!),
    queryFn: () => socialWorkApi.listReferrals({ patient_id: patientId }),
    enabled: !!patientId,
  });
}
