import type { Permission } from '@/lib/types/rbac';

export type PermissionMatrix = Record<string, Record<string, boolean>>;

const ACTION_PREFIX_TO_MATRIX_ACTION: Record<string, string> = {
  add: 'create',
  view: 'read',
  change: 'update',
  delete: 'delete',
};

/**
 * Custom permission codenames that are standalone (not prefixed with a CRUD action).
 * These map directly to the matrix action key without model-name suffixing.
 * Must stay in sync with backend CUSTOM_ACTIONS in sync_role_permissions.py.
 */
const CUSTOM_PERMISSION_CODENAMES = new Set([
  'perform_triage',
  'view_triage_queue',
  'override_triage_category',
  'escalate_patient',
  'receive_critical_alerts',
  'certify_death',
  'release_body',
  'void_death_record',
  'accept_referral',
  'decline_referral',
  'submit_sha_claim',
  'approve_sha_claim',
  'appeal_sha_claim',
  'manage_clinic_staff',
  'manage_clinic_schedule',
  'view_ccc_clinic',
  'view_mental_health_clinic',
  'approve_physiotherapy_order',
  'approve_ot_order',
  'accept_sw_referral',
  'close_sw_case',
  'escalate_ihr_to_county',
  'escalate_ihr_to_national',
  'notify_ihr_to_who',
  'approve_emergency_access',
  'revoke_emergency_access',
  'view_emergency_dashboard',
  'manage_etims',
  'manage_schedules',
  'manage_theatre_settings',
  'approve_purchase_order',
  'approve_stock_count',
  'approve_stock_transfer',
  'approve_swap',
  'submit_to_authorities',
  'follow_up',
  'issue',
  'resolve',
  'submit_to_dhis2',
  'regenerate',
  'export_sdmx',
  'import_csv',
  'export_csv',
  'issue_sick_note',
  'revoke_sick_note',
  'verify_enrollment',
  'submit_insurance_claim',
  'approve_insurance_claim',
  'adjudicate_insurance_claim',
  'approve_insurance_preauth',
  'reconcile_remittance',
  'approve_supplierbill',
  'manage_blood_bank',
  'issue_blood_unit',
  'perform_crossmatch',
  'manage_dialysis',
  'perform_dialysis',
  'accept_order',
  'reject_order',
  'acknowledge',
  'accept',
  'decline',
  'complete',
  'cancel',
  'record',
  'add_observation',
  'mark_reaction',
  'complete_transfusion',
  'submit_to_ppb',
  'manage_theatre',
  'document_surgery',
  'assign_physiotherapy_therapist',
  'assign_ot_therapist',
  'assign_social_worker',
  'supervise_sw_case',
]);

/**
 * Action prefixes that include the model name in the codename but are NOT
 * standard Django CRUD (add/view/change/delete). The matrix action is the
 * prefix itself (e.g. 'view_sensitive') and the model is the suffix.
 * Must stay in sync with backend MODEL_SUFFIXED_ACTIONS.
 */
const MODEL_SUFFIXED_ACTION_PREFIXES = ['view_sensitive'];

function toResourceName(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function parsePermission(permission: Permission) {
  const { codename } = permission;

  // Prefer the canonical matrix_key / matrix_action from the backend when present.
  // These are derived from the same MODEL_MAPPING / CUSTOM_ACTIONS / ACTION_MAPPING
  // sets used by sync_role_group_permissions, so they always agree with how the
  // permissions_matrix is keyed.
  const resourceFromBackend = permission.matrix_key ?? null;
  const actionFromBackend = permission.matrix_action ?? null;
  if (resourceFromBackend && actionFromBackend) {
    return { action: actionFromBackend, resource: resourceFromBackend };
  }

  // ----- Fallback: derive from codename (legacy clients / unmapped permissions) -----

  // Check if this is a custom standalone permission (no CRUD prefix)
  if (CUSTOM_PERMISSION_CODENAMES.has(codename)) {
    // Custom permissions use the codename as-is for the action key.
    // The resource is derived from the model name.
    const modelName = permission.model || codename;
    return {
      action: codename,
      resource: resourceFromBackend ?? toResourceName(modelName),
    };
  }

  // Check for model-suffixed custom actions (e.g. view_sensitive_patient)
  for (const prefix of MODEL_SUFFIXED_ACTION_PREFIXES) {
    if (codename.startsWith(prefix + '_')) {
      const modelSuffix = codename.slice(prefix.length + 1);
      return {
        action: prefix,
        resource: resourceFromBackend ?? toResourceName(permission.model || modelSuffix),
      };
    }
  }

  const separatorIndex = codename.indexOf('_');
  if (separatorIndex <= 0) {
    return null;
  }

  const crudPrefix = codename.slice(0, separatorIndex);
  const action = ACTION_PREFIX_TO_MATRIX_ACTION[crudPrefix] ?? crudPrefix;
  const modelName = permission.model || codename.slice(separatorIndex + 1);

  return {
    action,
    resource: resourceFromBackend ?? toResourceName(modelName),
  };
}

export function getPermissionCode(permission: Permission): string {
  return `${permission.app_label}.${permission.codename}`;
}

export function buildPermissionsMatrix(
  selectedPermissionCodes: string[],
  permissions: Permission[]
): PermissionMatrix {
  const permissionsByCode = new Map(
    permissions.map((permission) => [getPermissionCode(permission), permission])
  );

  return selectedPermissionCodes.reduce<PermissionMatrix>((matrix, code) => {
    const permission = permissionsByCode.get(code);
    if (!permission) {
      return matrix;
    }

    const parsed = parsePermission(permission);
    if (!parsed) {
      return matrix;
    }

    if (!matrix[parsed.resource]) {
      matrix[parsed.resource] = {};
    }

    const resourceMatrix = matrix[parsed.resource];
    if (!resourceMatrix) {
      return matrix;
    }

    resourceMatrix[parsed.action] = true;
    return matrix;
  }, {});
}

export function matrixToPermissionCodes(
  matrix: PermissionMatrix,
  permissions: Permission[]
): string[] {
  return permissions.flatMap((permission) => {
    const parsed = parsePermission(permission);
    if (!parsed) {
      return [];
    }

    if (!matrix[parsed.resource]?.[parsed.action]) {
      return [];
    }

    return [getPermissionCode(permission)];
  });
}
