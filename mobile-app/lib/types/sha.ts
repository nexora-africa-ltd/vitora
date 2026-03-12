/**
 * SHA eligibility type definitions for the mobile app.
 */

export type CoverageStatus = 'covered' | 'not_covered' | 'pending';

export interface SHAEligibilityRequest {
  patient_id?: number;
  sha_number?: string;
}

export interface SHAEligibilityResponse {
  is_eligible: boolean;
  result: string;
  eligible_until?: string | null;
  benefit_balance?: number | null;
  ineligibility_reason?: string;
  sha_number?: string;
  membership_type?: string;
  message?: string;
}

export interface SHAEligibility extends SHAEligibilityResponse {
  patient_id?: number;
  checked_at: string;
  coverage_status: CoverageStatus;
}

export interface SHADirectEligibilityRequest {
  national_id?: string;
  sha_number?: string;
  identification_type?: string;
  identification_number?: string;
}

export interface SHADirectEligibilityResponse {
  is_eligible: boolean;
  sha_number?: string | null;
  full_name?: string | null;
  coverage_end_date?: string | null;
  copay_percentage?: number;
  reason?: string;
  is_employed?: boolean;
  error?: string | null;
}

export function getCoverageStatus(
  eligibility?: Pick<SHAEligibility, 'is_eligible'> | null,
): CoverageStatus {
  if (!eligibility) {
    return 'pending';
  }

  return eligibility.is_eligible ? 'covered' : 'not_covered';
}

export function getCoverageStatusLabel(status: CoverageStatus): string {
  switch (status) {
    case 'covered':
      return 'Covered';
    case 'not_covered':
      return 'Not Covered';
    default:
      return 'Pending';
  }
}