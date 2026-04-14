const CLINICIAN_ROLES = new Set([
  'DOCTOR',
  'MEDICAL_DOCTOR',
  'CLINICAL_OFFICER',
  'MEDICAL_OFFICER',
  'CONSULTANT',
  'SENIOR_CONSULTANT',
]);

function normalizeRole(role?: string | null): string | null {
  if (!role) {
    return null;
  }

  const normalized = role
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();

  return normalized || null;
}

export function hasClinicianRole(...roles: Array<string | null | undefined>): boolean {
  return roles.some((role) => {
    const normalizedRole = normalizeRole(role);
    return normalizedRole ? CLINICIAN_ROLES.has(normalizedRole) : false;
  });
}

export function getClinicianHonorific(...roles: Array<string | null | undefined>): string | null {
  return hasClinicianRole(...roles) ? 'Dr.' : null;
}
