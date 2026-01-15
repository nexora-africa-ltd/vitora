/**
 * RBAC React Query Hooks
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, rolesApi, permissionsApi, staffApi, auditLogsApi } from '@/lib/api/rbac';
import type {
  DepartmentCreateData,
  DepartmentUpdateData,
  DepartmentListParams,
  RoleCreateData,
  RoleUpdateData,
  RoleListParams,
  StaffProfileCreateData,
  StaffProfileUpdateData,
  StaffListParams,
  AuditLogListParams,
  AuditAction,
} from '@/lib/types/rbac';

// Re-export types for convenience
export type { AuditAction } from '@/lib/types/rbac';

// =============================================================================
// Department Hooks
// =============================================================================

export function useDepartments(params?: DepartmentListParams) {
  return useQuery({
    queryKey: ['departments', params],
    queryFn: () => departmentsApi.list(params),
  });
}

export function useDepartment(id: number) {
  return useQuery({
    queryKey: ['department', id],
    queryFn: () => departmentsApi.get(id),
    enabled: id > 0,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DepartmentCreateData) => departmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DepartmentUpdateData }) =>
      departmentsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['department', id] });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => departmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

// =============================================================================
// Role Hooks
// =============================================================================

export function useRoles(params?: RoleListParams) {
  return useQuery({
    queryKey: ['roles', params],
    queryFn: () => rolesApi.list(params),
  });
}

export function useRole(id: number) {
  return useQuery({
    queryKey: ['role', id],
    queryFn: () => rolesApi.get(id),
    enabled: id > 0,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RoleCreateData) => rolesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RoleUpdateData }) =>
      rolesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['role', id] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => rolesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

// =============================================================================
// Permission Hooks
// =============================================================================

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.list(),
    staleTime: 10 * 60 * 1000, // Permissions rarely change
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => permissionsApi.getMyPermissions(),
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Staff Hooks
// =============================================================================

export function useStaffList(params?: StaffListParams) {
  return useQuery({
    queryKey: ['staff', params],
    queryFn: () => staffApi.list(params),
  });
}

export function useStaffProfile(id: number) {
  return useQuery({
    queryKey: ['staff-profile', id],
    queryFn: () => staffApi.get(id),
    enabled: id > 0,
  });
}

export function useCreateStaffProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StaffProfileCreateData) => staffApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

export function useUpdateStaffProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: StaffProfileUpdateData }) =>
      staffApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['staff-profile', id] });
    },
  });
}

export function useDeactivateStaffProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => staffApi.deactivate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['staff-profile', id] });
    },
  });
}

// =============================================================================
// Audit Log Hooks
// =============================================================================

export function useAuditLogs(params?: AuditLogListParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditLogsApi.list(params),
  });
}

export function useAuditLog(id: number) {
  return useQuery({
    queryKey: ['audit-log', id],
    queryFn: () => auditLogsApi.get(id),
    enabled: id > 0,
  });
}
