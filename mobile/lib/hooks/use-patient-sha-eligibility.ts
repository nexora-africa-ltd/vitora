import { useMutation, useQuery } from '@tanstack/react-query';

import { shaApi } from '@/lib/api/sha';
import { getLocalPatient, storePatientEligibility } from '@/lib/db';
import { queryClient } from '@/lib/query/client';
import { getCoverageStatus } from '@/lib/types/sha';
import type { PatientSHAEligibility } from '@/lib/types/sha';

function toEligibility(patientId: number, patient: Awaited<ReturnType<typeof getLocalPatient>>): PatientSHAEligibility | null {
  if (!patient?.sha_coverage_status) {
    return null;
  }

  return {
    patient_id: patientId,
    checked_at: patient.sha_checked_at ?? patient.updated_at,
    coverage_status: patient.sha_coverage_status,
    is_eligible: patient.sha_coverage_status === 'covered',
    result: patient.sha_result ?? (patient.sha_coverage_status === 'covered' ? 'ELIGIBLE' : 'INELIGIBLE'),
    eligible_until: patient.sha_eligible_until ?? null,
    benefit_balance: patient.sha_benefit_balance ?? null,
    ineligibility_reason: patient.sha_ineligibility_reason ?? null,
    sha_number: patient.sha_number ?? null,
    membership_type: null,
    message: null,
  };
}

export function usePatientSHAEligibility(patientId: number | null) {
  return useQuery({
    queryKey: ['patient-sha-eligibility', patientId],
    queryFn: async () => {
      if (!patientId) {
        return null;
      }

      const patient = await getLocalPatient(patientId);
      return toEligibility(patientId, patient);
    },
    enabled: Boolean(patientId),
  });
}

export function useCheckPatientSHAEligibility(patientId: number | null) {
  return useMutation({
    mutationFn: async () => {
      if (!patientId || patientId <= 0) {
        throw new Error('Patient must be synced before SHA eligibility can be checked.');
      }

      return shaApi.checkPatientEligibility(patientId);
    },
    onSuccess: async (eligibility) => {
      await storePatientEligibility(eligibility.patient_id, eligibility);
      await queryClient.invalidateQueries({ queryKey: ['patient-sha-eligibility', eligibility.patient_id] });
    },
  });
}
