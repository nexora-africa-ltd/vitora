import type { AuthUser } from '@/lib/types/auth';

function tokenize(value?: string | null): string[] {
  return (value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function userTokens(user: AuthUser | null): Set<string> {
  const tokens = new Set<string>();

  for (const token of tokenize(user?.role)) {
    tokens.add(token);
  }
  for (const token of tokenize(user?.role_category)) {
    tokens.add(token);
  }
  for (const permission of user?.permissions ?? []) {
    for (const token of tokenize(permission)) {
      tokens.add(token);
    }
  }

  return tokens;
}

export function hasLaboratoryRole(user: AuthUser | null): boolean {
  const tokens = userTokens(user);
  return ['lab', 'laboratory', 'pathology', 'technologist', 'technician'].some((token) =>
    tokens.has(token)
  );
}

export function hasPharmacyRole(user: AuthUser | null): boolean {
  const tokens = userTokens(user);
  return ['pharmacy', 'pharmacist', 'dispensing', 'medication'].some((token) =>
    tokens.has(token)
  );
}

export function hasClinicalRole(user: AuthUser | null): boolean {
  const tokens = userTokens(user);
  return (
    user?.is_staff === true ||
    ['doctor', 'clinical', 'clinician', 'nurse', 'medical', 'consultant', 'officer'].some((token) =>
      tokens.has(token)
    )
  );
}

export type ModuleLauncherConfig = {
  label: string;
  description: string;
  variant: 'primary' | 'secondary';
};

export function getLaboratoryLauncherConfig(user: AuthUser | null): ModuleLauncherConfig {
  if (hasLaboratoryRole(user)) {
    return {
      label: 'Laboratory results',
      description: 'Review result queues, inspect abnormal findings, and verify completed tests.',
      variant: 'primary',
    };
  }

  return {
    label: 'Laboratory orders',
    description: 'Place new lab requests from consultations and track specimen and result progress.',
    variant: 'primary',
  };
}

export function getPharmacyLauncherConfig(user: AuthUser | null): ModuleLauncherConfig {
  if (hasPharmacyRole(user)) {
    return {
      label: 'Pharmacy queue',
      description: 'Open the dispensing queue, review stock-aware medication items, and record dispensing.',
      variant: 'secondary',
    };
  }

  return {
    label: 'Prescriptions',
    description: 'Create prescriptions from encounter treatment plans and monitor medication status.',
    variant: 'secondary',
  };
}

export function getSupportWorkspaceTitle(user: AuthUser | null): string {
  if (hasLaboratoryRole(user) && hasPharmacyRole(user)) {
    return 'Lab and pharmacy workspaces';
  }
  if (hasLaboratoryRole(user)) {
    return 'Laboratory workspace';
  }
  if (hasPharmacyRole(user)) {
    return 'Pharmacy workspace';
  }
  return 'Support modules';
}

export function hasInpatientRole(user: AuthUser | null): boolean {
  const tokens = userTokens(user);
  return (
    user?.is_staff === true ||
    ['nurse', 'nursing', 'inpatient', 'ward', 'doctor', 'clinical', 'clinician', 'medical'].some(
      (token) => tokens.has(token)
    )
  );
}

export function getInpatientLauncherConfig(user: AuthUser | null): ModuleLauncherConfig {
  if (hasInpatientRole(user)) {
    return {
      label: 'Wards & admissions',
      description:
        'View ward occupancy, manage beds, and access bedside nursing workflows — kardex, rounds, and vitals.',
      variant: 'primary',
    };
  }

  return {
    label: 'Inpatient overview',
    description: 'View ward occupancy and admitted patient summaries.',
    variant: 'secondary',
  };
}
