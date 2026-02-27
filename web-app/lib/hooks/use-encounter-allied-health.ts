/**
 * Encounter Allied Health Hooks
 * Hooks for fetching allied health data filtered by encounter ID.
 * Used in encounter detail and edit views.
 */

import { useQuery } from '@tanstack/react-query';
import { physiotherapyApi } from '@/lib/api/physiotherapy';
import { nutritionApi } from '@/lib/api/nutrition';
import { counsellingApi } from '@/lib/api/counselling';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';
import { socialWorkApi } from '@/lib/api/social-work';

// Query key factory for encounter-specific allied health data
export const encounterAlliedHealthKeys = {
  all: (encounterId: number) => ['encounter-allied-health', encounterId] as const,
  physioOrders: (encounterId: number) =>
    [...encounterAlliedHealthKeys.all(encounterId), 'physio-orders'] as const,
  nutritionConsultations: (encounterId: number) =>
    [...encounterAlliedHealthKeys.all(encounterId), 'nutrition-consultations'] as const,
  counsellingReferrals: (encounterId: number) =>
    [...encounterAlliedHealthKeys.all(encounterId), 'counselling-referrals'] as const,
  otOrders: (encounterId: number) =>
    [...encounterAlliedHealthKeys.all(encounterId), 'ot-orders'] as const,
  swReferrals: (encounterId: number) =>
    [...encounterAlliedHealthKeys.all(encounterId), 'sw-referrals'] as const,
};

/** Fetch physiotherapy orders linked to an encounter */
export function useEncounterPhysioOrders(encounterId: number | undefined) {
  return useQuery({
    queryKey: encounterAlliedHealthKeys.physioOrders(encounterId!),
    queryFn: () => physiotherapyApi.listOrders({ encounter_id: encounterId }),
    enabled: !!encounterId,
  });
}

/** Fetch nutrition consultations linked to an encounter */
export function useEncounterNutritionConsultations(encounterId: number | undefined) {
  return useQuery({
    queryKey: encounterAlliedHealthKeys.nutritionConsultations(encounterId!),
    queryFn: () => nutritionApi.listConsultations({ encounter_id: encounterId }),
    enabled: !!encounterId,
  });
}

/** Fetch counselling referrals linked to an encounter */
export function useEncounterCounsellingReferrals(encounterId: number | undefined) {
  return useQuery({
    queryKey: encounterAlliedHealthKeys.counsellingReferrals(encounterId!),
    queryFn: () => counsellingApi.listReferrals({ encounter_id: encounterId }),
    enabled: !!encounterId,
  });
}

/** Fetch OT orders linked to an encounter */
export function useEncounterOTOrders(encounterId: number | undefined) {
  return useQuery({
    queryKey: encounterAlliedHealthKeys.otOrders(encounterId!),
    queryFn: () => occupationalTherapyApi.listOrders({ encounter_id: encounterId }),
    enabled: !!encounterId,
  });
}

/** Fetch social work referrals linked to an encounter */
export function useEncounterSWReferrals(encounterId: number | undefined) {
  return useQuery({
    queryKey: encounterAlliedHealthKeys.swReferrals(encounterId!),
    queryFn: () => socialWorkApi.listReferrals({ encounter_id: encounterId }),
    enabled: !!encounterId,
  });
}
