/**
 * RBAC API Client
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

import { apiClient } from './client';
import type { PaginatedResponse } from '@/lib/types';
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
  UsernameCheckResponse,
  UsernameSuggestionResponse,
} from '@/lib/types/rbac';

// =============================================================================
// Departments API
// =============================================================================

export const departmentsApi = {
  list: async (params?: DepartmentListParams): Promise<PaginatedResponse<Department>> => {
    const response = await apiClient.get<PaginatedResponse<Department>>('/api/departments/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Department> => {
    const response = await apiClient.get<Department>(`/api/departments/${id}/`);
    return response.data;
  },

  create: async (data: DepartmentCreateData): Promise<Department> => {
    const response = await apiClient.post<Department>('/api/departments/', data);
    return response.data;
  },

  update: async (id: number, data: DepartmentUpdateData): Promise<Department> => {
    const response = await apiClient.patch<Department>(`/api/departments/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/departments/${id}/`);
  },
};

// =============================================================================
// Roles API
// =============================================================================

export const rolesApi = {
  list: async (params?: RoleListParams): Promise<PaginatedResponse<Role>> => {
    const response = await apiClient.get<PaginatedResponse<Role>>('/api/roles/', { params });
    return response.data;
  },

  get: async (id: number): Promise<Role> => {
    const response = await apiClient.get<Role>(`/api/roles/${id}/`);
    return response.data;
  },

  create: async (data: RoleCreateData): Promise<Role> => {
    const response = await apiClient.post<Role>('/api/roles/', data);
    return response.data;
  },

  update: async (id: number, data: RoleUpdateData): Promise<Role> => {
    const response = await apiClient.patch<Role>(`/api/roles/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/roles/${id}/`);
  },
};

// =============================================================================
// Permissions API
// =============================================================================

export const permissionsApi = {
  list: async (): Promise<Permission[]> => {
    const response = await apiClient.get<Permission[]>('/api/permissions/');
    return response.data;
  },

  getMyPermissions: async (): Promise<UserPermissions> => {
    const response = await apiClient.get<UserPermissions>('/api/me/permissions/');
    return response.data;
  },
};

// =============================================================================
// Staff API
// =============================================================================

export const staffApi = {
  list: async (params?: StaffListParams): Promise<PaginatedResponse<StaffProfile>> => {
    const response = await apiClient.get<PaginatedResponse<StaffProfile>>('/api/staff/', { params });
    return response.data;
  },

  get: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.get<StaffProfile>(`/api/staff/${id}/`);
    return response.data;
  },

  create: async (data: StaffProfileCreateData): Promise<StaffProfile> => {
    const response = await apiClient.post<StaffProfile>('/api/staff/', data);
    return response.data;
  },

  update: async (id: number, data: StaffProfileUpdateData): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/api/staff/${id}/`, data);
    return response.data;
  },

  deactivate: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/api/staff/${id}/`, { is_active: false });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/staff/${id}/`);
  },

  /**
   * Check if a username is available
   */
  checkUsername: async (username: string): Promise<UsernameCheckResponse> => {
    const response = await apiClient.get<UsernameCheckResponse>('/api/staff/check_username/', {
      params: { username },
    });
    return response.data;
  },

  /**
   * Suggest unique usernames based on name
   */
  suggestUsername: async (firstName: string, lastName: string, middleName?: string): Promise<UsernameSuggestionResponse> => {
    const response = await apiClient.post<UsernameSuggestionResponse>('/api/staff/suggest_username/', {
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName || '',
    });
    return response.data;
  },
};

// =============================================================================
// Audit Logs API
// =============================================================================

export const auditLogsApi = {
  list: async (params?: AuditLogListParams): Promise<PaginatedResponse<AuditLogEntry>> => {
    const response = await apiClient.get<PaginatedResponse<AuditLogEntry>>('/api/auditlogs/', { params });
    return response.data;
  },

  get: async (id: number): Promise<AuditLogEntry> => {
    const response = await apiClient.get<AuditLogEntry>(`/api/auditlogs/${id}/`);
    return response.data;
  },
};
