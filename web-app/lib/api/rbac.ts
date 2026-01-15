/**
 * RBAC API Client
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

import { apiClient, type PaginatedResponse } from './client';
import type {
  Department,
  DepartmentCreateData,
  DepartmentUpdateData,
  DepartmentListParams,
  Role,
  RoleCreateData,
  RoleUpdateData,
  RoleListParams,
  Permission,
  StaffProfile,
  StaffProfileCreateData,
  StaffProfileUpdateData,
  StaffListParams,
  UserPermissions,
  AuditLogEntry,
  AuditLogListParams,
} from '@/lib/types/rbac';

// =============================================================================
// Departments API
// =============================================================================

export const departmentsApi = {
  list: async (params?: DepartmentListParams): Promise<PaginatedResponse<Department>> => {
    const response = await apiClient.get<PaginatedResponse<Department>>('/departments/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Department> => {
    const response = await apiClient.get<Department>(`/departments/${id}/`);
    return response.data;
  },

  create: async (data: DepartmentCreateData): Promise<Department> => {
    const response = await apiClient.post<Department>('/departments/', data);
    return response.data;
  },

  update: async (id: number, data: DepartmentUpdateData): Promise<Department> => {
    const response = await apiClient.patch<Department>(`/departments/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/departments/${id}/`);
  },
};

// =============================================================================
// Roles API
// =============================================================================

export const rolesApi = {
  list: async (params?: RoleListParams): Promise<PaginatedResponse<Role>> => {
    const response = await apiClient.get<PaginatedResponse<Role>>('/roles/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Role> => {
    const response = await apiClient.get<Role>(`/roles/${id}/`);
    return response.data;
  },

  create: async (data: RoleCreateData): Promise<Role> => {
    const response = await apiClient.post<Role>('/roles/', data);
    return response.data;
  },

  update: async (id: number, data: RoleUpdateData): Promise<Role> => {
    const response = await apiClient.patch<Role>(`/roles/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/roles/${id}/`);
  },
};

// =============================================================================
// Permissions API
// =============================================================================

export const permissionsApi = {
  list: async (): Promise<PaginatedResponse<Permission>> => {
    const response = await apiClient.get<PaginatedResponse<Permission>>('/permissions/');
    return response.data;
  },

  getMyPermissions: async (): Promise<UserPermissions> => {
    const response = await apiClient.get<UserPermissions>('/me/permissions/');
    return response.data;
  },
};

// =============================================================================
// Staff API
// =============================================================================

export const staffApi = {
  list: async (params?: StaffListParams): Promise<PaginatedResponse<StaffProfile>> => {
    const response = await apiClient.get<PaginatedResponse<StaffProfile>>('/staff/', { params });
    return response.data;
  },

  get: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.get<StaffProfile>(`/staff/${id}/`);
    return response.data;
  },

  create: async (data: StaffProfileCreateData): Promise<StaffProfile> => {
    const response = await apiClient.post<StaffProfile>('/staff/', data);
    return response.data;
  },

  update: async (id: number, data: StaffProfileUpdateData): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/staff/${id}/`, data);
    return response.data;
  },

  deactivate: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/staff/${id}/`, { is_active: false });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/staff/${id}/`);
  },
};

// =============================================================================
// Audit Logs API
// =============================================================================

export const auditLogsApi = {
  list: async (params?: AuditLogListParams): Promise<PaginatedResponse<AuditLogEntry>> => {
    const response = await apiClient.get<PaginatedResponse<AuditLogEntry>>('/audit-logs/', { params });
    return response.data;
  },

  get: async (id: number): Promise<AuditLogEntry> => {
    const response = await apiClient.get<AuditLogEntry>(`/audit-logs/${id}/`);
    return response.data;
  },
};
