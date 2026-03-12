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
  ineligibility_reason?: string | null;
  sha_number?: string | null;
  membership_type?: string | null;
  message?: string | null;
}

export interface PatientSHAEligibility extends SHAEligibilityResponse {
  patient_id: number;
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
  reason?: string | null;
  is_employed?: boolean;
  error?: string | null;
}

export function getCoverageStatus(isEligible?: boolean | null): CoverageStatus {
  if (typeof isEligible !== 'boolean') {
    return 'pending';
  }

  return isEligible ? 'covered' : 'not_covered';
}

export function getCoverageStatusLabel(status: CoverageStatus): string {
  if (status === 'covered') {
    return 'Covered';
  }

  if (status === 'not_covered') {
    return 'Not Covered';
  }

  return 'Pending';
}

export function getCoverageStatusTone(status: CoverageStatus): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'covered') {
    return 'primary';
  }

  if (status === 'not_covered') {
    return 'danger';
  }

  return 'warning';
}