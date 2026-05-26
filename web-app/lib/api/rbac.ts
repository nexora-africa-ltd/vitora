/**
 * RBAC API Client
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { AxiosError } from 'axios';
import { z } from 'zod';
import {
  DepartmentSchema,
  OrgChartResponseSchema,
  RoleSchema,
  PermissionSchema,
  StaffProfileSchema,
  OrgMembershipSchema,
  UserPermissionsSchema,
  AuditLogEntrySchema,
  UsernameCheckResponseSchema,
  UsernameSuggestionResponseSchema,
  PaginatedDepartmentSchema,
  PaginatedRoleSchema,
  PaginatedStaffProfileSchema,
  PaginatedOrgMembershipSchema,
  PaginatedAuditLogSchema,
} from '@/lib/schemas/rbac.schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  Department,
  DepartmentCreateData,
  DepartmentUpdateData,
  DepartmentListParams,
  OrgChartParams,
  OrgChartResponse,
  Role,
  RoleCreateData,
  RoleUpdateData,
  RoleListParams,
  Permission,
  StaffProfile,
  StaffProfileCreateData,
  StaffProfileUpdateData,
  OrgMembership,
  OrgMembershipCreateData,
  OrgMembershipUpdateData,
  OrgMembershipListParams,
  StaffListParams,
  UserPermissions,
  AuditLogEntry,
  AuditLogListParams,
  UsernameCheckResponse,
  UsernameSuggestionResponse,
  LicenseSummary,
} from '@/lib/types/rbac';

// =============================================================================
// Departments API
// =============================================================================

export const departmentsApi = {
  list: async (params?: DepartmentListParams): Promise<PaginatedResponse<Department>> => {
    const response = await apiClient.get<PaginatedResponse<Department>>('/api/departments/', { params });
    return parseResponse(PaginatedDepartmentSchema, response.data, { context: 'departmentsApi.list' });
  },

  get: async (id: number): Promise<Department> => {
    const response = await apiClient.get<Department>(`/api/departments/${id}/`);
    return parseResponse(DepartmentSchema, response.data, { context: 'departmentsApi.get' });
  },

  create: async (data: DepartmentCreateData): Promise<Department> => {
    const response = await apiClient.post<Department>('/api/departments/', data);
    return parseResponse(DepartmentSchema, response.data, { context: 'departmentsApi.create' });
  },

  update: async (id: number, data: DepartmentUpdateData): Promise<Department> => {
    const response = await apiClient.patch<Department>(`/api/departments/${id}/`, data);
    return parseResponse(DepartmentSchema, response.data, { context: 'departmentsApi.update' });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/departments/${id}/`);
  },

  getOrgChart: async (params?: OrgChartParams): Promise<OrgChartResponse> => {
    const response = await apiClient.get<OrgChartResponse>('/api/departments/org-chart/', {
      params,
    });
    return parseResponse(OrgChartResponseSchema, response.data, {
      context: 'departmentsApi.getOrgChart',
    });
  },
};

// =============================================================================
// Roles API
// =============================================================================

export const rolesApi = {
  list: async (params?: RoleListParams): Promise<PaginatedResponse<Role>> => {
    const response = await apiClient.get<PaginatedResponse<Role>>('/api/roles/', { params });
    return parseResponse(PaginatedRoleSchema, response.data, { context: 'rolesApi.list' });
  },

  get: async (id: number): Promise<Role> => {
    const response = await apiClient.get<Role>(`/api/roles/${id}/`);
    return parseResponse(RoleSchema, response.data, { context: 'rolesApi.get' });
  },

  create: async (data: RoleCreateData): Promise<Role> => {
    const response = await apiClient.post<Role>('/api/roles/', data);
    return parseResponse(RoleSchema, response.data, { context: 'rolesApi.create' });
  },

  update: async (id: number, data: RoleUpdateData): Promise<Role> => {
    const response = await apiClient.patch<Role>(`/api/roles/${id}/`, data);
    return parseResponse(RoleSchema, response.data, { context: 'rolesApi.update' });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/roles/${id}/`);
  },

  /**
   * Sync all roles from the default roles.json fixture.
   * Superusers only.
   */
  syncDefaults: async (): Promise<{ message: string; roles_updated: number; permissions_synced: number }> => {
    const response = await apiClient.post<{ message: string; roles_updated: number; permissions_synced: number }>(
      '/api/roles/sync-defaults/'
    );
    return response.data;
  },
};

// =============================================================================
// Permissions API
// =============================================================================

export const permissionsApi = {
  list: async (): Promise<Permission[]> => {
    const response = await apiClient.get<Permission[]>('/api/permissions/');
    return parseResponse(z.array(PermissionSchema), response.data, { context: 'permissionsApi.list' });
  },

  getMyPermissions: async (): Promise<UserPermissions> => {
    const response = await apiClient.get<UserPermissions>('/api/me/permissions/');
    return parseResponse(UserPermissionsSchema, response.data, { context: 'permissionsApi.getMyPermissions' });
  },
};

// =============================================================================
// Staff API
// =============================================================================

export const staffApi = {
  list: async (params?: StaffListParams): Promise<PaginatedResponse<StaffProfile>> => {
    const response = await apiClient.get<PaginatedResponse<StaffProfile>>('/api/staff/', { params });
    return parseResponse(PaginatedStaffProfileSchema, response.data, { context: 'staffApi.list' });
  },

  getMe: async (): Promise<StaffProfile | null> => {
    try {
      const response = await apiClient.get<StaffProfile>('/api/staff/me/');
      return parseResponse(StaffProfileSchema, response.data, { context: 'staffApi.getMe' });
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  get: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.get<StaffProfile>(`/api/staff/${id}/`);
    return parseResponse(StaffProfileSchema, response.data, { context: 'staffApi.get' });
  },

  create: async (data: StaffProfileCreateData): Promise<StaffProfile> => {
    const response = await apiClient.post<StaffProfile>('/api/staff/', data);
    return parseResponse(StaffProfileSchema, response.data, { context: 'staffApi.create' });
  },

  update: async (id: number, data: StaffProfileUpdateData): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/api/staff/${id}/`, data);
    return parseResponse(StaffProfileSchema, response.data, { context: 'staffApi.update' });
  },

  deactivate: async (id: number): Promise<StaffProfile> => {
    const response = await apiClient.patch<StaffProfile>(`/api/staff/${id}/`, { is_active: false });
    return parseResponse(StaffProfileSchema, response.data, { context: 'staffApi.deactivate' });
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
    return parseResponse(UsernameCheckResponseSchema, response.data, { context: 'staffApi.checkUsername' });
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
    return parseResponse(UsernameSuggestionResponseSchema, response.data, { context: 'staffApi.suggestUsername' });
  },

  /**
   * Get license status summary for the org (admin) or current user
   */
  licenseSummary: async (): Promise<LicenseSummary> => {
    const response = await apiClient.get<LicenseSummary>('/api/staff/license_summary/');
    return response.data;
  },
};

export const orgMembershipsApi = {
  list: async (params?: OrgMembershipListParams): Promise<PaginatedResponse<OrgMembership>> => {
    const response = await apiClient.get<PaginatedResponse<OrgMembership>>('/api/org-memberships/', { params });
    return parseResponse(PaginatedOrgMembershipSchema, response.data, { context: 'orgMembershipsApi.list' });
  },

  create: async (data: OrgMembershipCreateData): Promise<OrgMembership> => {
    const response = await apiClient.post<OrgMembership>('/api/org-memberships/', data);
    return parseResponse(OrgMembershipSchema, response.data, { context: 'orgMembershipsApi.create' });
  },

  update: async (id: number, data: OrgMembershipUpdateData): Promise<OrgMembership> => {
    const response = await apiClient.patch<OrgMembership>(`/api/org-memberships/${id}/`, data);
    return parseResponse(OrgMembershipSchema, response.data, { context: 'orgMembershipsApi.update' });
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/org-memberships/${id}/`);
  },
};

// =============================================================================
// Audit Logs API
// =============================================================================

export const auditLogsApi = {
  list: async (params?: AuditLogListParams): Promise<PaginatedResponse<AuditLogEntry>> => {
    const response = await apiClient.get<PaginatedResponse<AuditLogEntry>>('/api/auditlogs/', { params });
    return parseResponse(PaginatedAuditLogSchema, response.data, { context: 'auditLogsApi.list' });
  },

  get: async (id: number): Promise<AuditLogEntry> => {
    const response = await apiClient.get<AuditLogEntry>(`/api/auditlogs/${id}/`);
    return parseResponse(AuditLogEntrySchema, response.data, { context: 'auditLogsApi.get' });
  },
};
