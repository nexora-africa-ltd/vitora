import type { RiskFactor } from '@/lib/types/mch';
import type { Patient } from '@/lib/types/patient';

function calculateAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

export function deriveRiskFactors(input: {
  patient?: Pick<Patient, 'date_of_birth'> | null;
  isHighRisk?: boolean;
  isMultiplePregnancy?: boolean;
  riskFactorsText?: string | null;
}): RiskFactor[] {
  const factors = [] as RiskFactor[];
  const age = calculateAge(input.patient?.date_of_birth ?? null);
  const normalizedRiskText = (input.riskFactorsText ?? '').toLowerCase();

  if (typeof age === 'number' && age < 18) {
    factors.push({ code: 'maternal_age_under_18', label: 'Maternal age under 18', severity: 'danger' });
  }
  if (typeof age === 'number' && age > 35) {
    factors.push({ code: 'maternal_age_over_35', label: 'Maternal age over 35', severity: 'warning' });
  }
  if (input.isMultiplePregnancy) {
    factors.push({ code: 'multiple_pregnancy', label: 'Multiple pregnancy', severity: 'danger' });
  }
  if (normalizedRiskText.includes('c-section') || normalizedRiskText.includes('caes')) {
    factors.push({ code: 'previous_c_section', label: 'Previous C-section history', severity: 'warning' });
  }
  if (input.isHighRisk) {
    factors.push({ code: 'registration_flag', label: 'Clinician marked high risk', severity: 'danger' });
  }

  return factors;
}