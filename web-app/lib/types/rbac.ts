/**
 * RBAC (Role-Based Access Control) Types
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

// =============================================================================
// Department Types
// =============================================================================

export type DepartmentType = 'CLINICAL' | 'ANCILLARY' | 'ADMINISTRATIVE' | 'SUPPORT';

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string;
  department_type: DepartmentType;
  department_type_display: string;
  parent: number | null;
  parent_name: string | null;
  head: number | null;
  head_name: string | null;
  is_active: boolean;
  staff_count: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreateData {
  name: string;
  code: string;
  description?: string;
  department_type: DepartmentType;
  parent?: number | null;
  head?: number | null;
  is_active?: boolean;
}

export interface DepartmentUpdateData extends Partial<DepartmentCreateData> {}

// =============================================================================
// Role Types
// =============================================================================

export type RoleType = 'CLINICAL' | 'ADMINISTRATIVE' | 'SUPPORT' | 'SYSTEM';

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  role_type: RoleType;
  role_type_display: string;
  permissions: string[];
  is_default: boolean;
  is_system: boolean;
  staff_count: number;
  created_at: string;
  updated_at: string;
}

export interface RoleCreateData {
  name: string;
  code: string;
  description?: string;
  role_type: RoleType;
  permissions: string[];
  is_default?: boolean;
}

export interface RoleUpdateData extends Partial<RoleCreateData> {}

// =============================================================================
// Permission Types
// =============================================================================

export interface Permission {
  codename: string;
  name: string;
  app_label: string;
}

export interface PermissionGroup {
  app_label: string;
  app_name: string;
  permissions: Permission[];
}

// =============================================================================
// Staff Profile Types
// =============================================================================

export interface StaffProfile {
  id: number;
  user: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  full_name: string;
  employee_id: string;
  department: number | null;
  department_name: string | null;
  role: number | null;
  role_name: string | null;
  phone_number: string;
  hwr_id: string | null;
  license_number: string | null;
  license_expiry: string | null;
  license_verified: boolean;
  licensing_body: string | null;
  specialization: string | null;
  is_active: boolean;
  hire_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffProfileCreateData {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  password?: string; // Auto-generated if not provided
  employee_id: string;
  department?: number | null;
  role?: number | null;
  phone_number?: string;
  hwr_id?: string;
  license_number?: string;
  license_expiry?: string;
  licensing_body?: string;
  specialization?: string;
  is_active?: boolean;
  hire_date?: string;
}

export interface StaffProfileUpdateData extends Partial<Omit<StaffProfileCreateData, 'password'>> {
  password?: string;
}

// Username check response
export interface UsernameCheckResponse {
  username: string;
  available: boolean;
  suggestions: string[];
}

// Username suggestion response
export interface UsernameSuggestionResponse {
  suggestions: string[];
}

// =============================================================================
// User Permissions Types
// =============================================================================

export interface UserPermissions {
  permissions: string[];
}

// =============================================================================
// Audit Log Types
// =============================================================================

export type AuditAction = 
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'permission_granted'
  | 'permission_revoked'
  | 'staff_created'
  | 'staff_updated'
  | 'staff_deactivated'
  | 'role_assigned'
  | 'department_created'
  | 'department_updated';

export interface AuditLogEntry {
  id: number;
  user: number;
  user_name: string;
  action: AuditAction;
  resource_type: string;
  resource_id: number;
  resource_name: string;
  details: Record<string, unknown>;
  ip_address: string;
  timestamp: string;
}

// =============================================================================
// List Params Types
// =============================================================================

export interface DepartmentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  department_type?: DepartmentType;
  is_active?: boolean;
  parent?: number;
}

export interface RoleListParams {
  page?: number;
  page_size?: number;
  search?: string;
  role_type?: RoleType;
  is_system?: boolean;
}

export interface StaffListParams {
  page?: number;
  page_size?: number;
  search?: string;
  department?: number;
  role?: number;
  is_active?: boolean;
}

export interface AuditLogListParams {
  page?: number;
  page_size?: number;
  action?: AuditAction;
  user?: number;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}
