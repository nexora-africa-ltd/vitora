import type { Permission } from '@/lib/types/rbac';

export type PermissionMatrix = Record<string, Record<string, boolean>>;

const ACTION_PREFIX_TO_MATRIX_ACTION: Record<string, string> = {
  add: 'create',
  view: 'read',
  change: 'update',
  delete: 'delete',
};

function toResourceName(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function parsePermission(permission: Permission) {
  const separatorIndex = permission.codename.indexOf('_');
  if (separatorIndex <= 0) {
    return null;
  }

  const prefix = permission.codename.slice(0, separatorIndex);
  const action = ACTION_PREFIX_TO_MATRIX_ACTION[prefix] ?? prefix;
  const modelName = permission.model || permission.codename.slice(separatorIndex + 1);

  return {
    action,
    resource: toResourceName(modelName),
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