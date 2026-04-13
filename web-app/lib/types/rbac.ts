/**
 * RBAC (Role-Based Access Control) Types
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

// =============================================================================
// Department Types
// =============================================================================

/**
 * Department type categories matching backend DEPARTMENT_TYPES
 */
export type DepartmentType =
  | 'CLINICAL'
  | 'ADMINISTRATIVE'
  | 'SUPPORT'
  | 'LABORATORY'
  | 'PHARMACY'
  | 'RADIOLOGY'
  | 'RECORDS';

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

/**
 * Role categories matching backend ROLE_CATEGORIES
 */
export type RoleCategory =
  | 'CLINICAL'
  | 'ADMINISTRATIVE'
  | 'TECHNICAL'
  | 'MANAGEMENT'
  | 'COMMUNITY'
  | 'ALLIED_HEALTH';

export type RoleScope = 'ORG' | 'FACILITY';

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  category: RoleCategory;
  category_display?: string | null;
  scope: RoleScope;
  scope_display?: string | null;
  organization: number | null;
  organization_name?: string | null;
  facility: number | null;
  facility_name?: string | null;
  permissions_matrix: Record<string, Record<string, boolean>>;
  hierarchy_level: number;
  parent_role: number | null;
  parent_role_name?: string | null;
  django_group: number | null;
  django_group_name?: string | null;
  requires_license: boolean;
  license_body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleCreateData {
  name: string;
  code: string;
  description?: string;
  category: RoleCategory;
  scope?: RoleScope;
  organization?: number | null;
  facility?: number | null;
  permissions_matrix?: Record<string, Record<string, boolean>>;
  hierarchy_level?: number;
  parent_role?: number | null;
  requires_license?: boolean;
  license_body?: string;
}

export interface RoleUpdateData extends Partial<RoleCreateData> {}

// =============================================================================
// Permission Types
// =============================================================================

export interface Permission {
  id: number;
  codename: string;
  name: string;
  app_label: string;
  model: string;
}

export interface PermissionGroup {
  app_label: string;
  app_name: string;
  permissions: Permission[];
}

// =============================================================================
// Staff Profile Types
// =============================================================================

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'LOCUM';

export interface StaffProfile {
  id: number;
  user: number;
  user_username: string;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  full_name: string;
  employee_id: string;
  title?: string | null;
  middle_name?: string | null;
  primary_role?: number | null;
  primary_role_name?: string | null;
  secondary_roles?: number[];
  primary_department?: number | null;
  primary_department_name?: string | null;
  secondary_departments?: number[];
  primary_facility?: number | null;
  primary_facility_name?: string | null;
  secondary_facilities?: number[];
  organization?: number | null;
  organization_name?: string | null;
  hwr_id?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  license_verified?: boolean;
  licensing_body?: string | null;
  is_license_valid?: boolean;
  specialization?: string | null;
  phone_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  employment_status?: EmploymentStatus;
  employment_type?: EmploymentType | null;
  date_joined?: string | null;
  date_left?: string | null;
  supervisor?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrgChartSummary {
  department_count: number;
  staff_count: number;
  root_department_count: number;
  department_heads_count: number;
  supervisor_link_count: number;
}

export interface OrgChartResponse {
  departments: Department[];
  staff: StaffProfile[];
  summary: OrgChartSummary;
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
  hire_date?: string;
}

export interface StaffProfileUpdateData extends Partial<Omit<StaffProfileCreateData, 'password'>> {
  password?: string;
  title?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  secondary_departments?: number[];
  secondary_facilities?: number[];
  secondary_roles?: number[];
  primary_department?: number | null;
  primary_role?: number | null;
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
  | 'department_created'
  | 'department_updated'
  | 'department_deleted'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'staff_created'
  | 'staff_updated'
  | 'staff_deactivated'
  | 'role_assigned';

export interface AuditLogEntry {
  id: number;
  user: number | null;
  username: string;
  user_name?: string;
  action: string;
  resource_type: string;
  resource_id: number | null;
  resource_name?: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
  patient_id: number | null;
  facility: number | null;
  facility_name?: string | null;
  organization: number | null;
  organization_name?: string | null;
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

export interface OrgChartParams {
  include_inactive?: boolean;
}

export interface RoleListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: RoleCategory;
  is_active?: boolean;
}

export interface StaffListParams {
  page?: number;
  page_size?: number;
  search?: string;
  primary_department?: number;
  primary_role?: number;
  employment_status?: EmploymentStatus;
}

export interface AuditLogListParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: AuditAction;
  user?: number;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}
