/**
 * Licensing types for Vitora HMIS.
 *
 * Mirrors the backend licensing app's API responses.
 */

export type InstallationStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface LicenseStatus {
  valid: boolean;
  tier: string;
  features: Record<string, boolean>;
  org_name: string;
  subscription_status: string;
  expires_at: number | null;
  check_in_by: number | null;
  check_in_overdue: boolean;
  error: string;
}

export interface ActivationResponse {
  license_token: string;
  installation_id: string;
  org_name: string;
  tier: string;
  features: Record<string, boolean>;
  expires_at: number;
  check_in_by: number;
}

export interface ActivationRequest {
  installation_id: string;
  activation_code: string;
  name?: string;
  app_version?: string;
  os_info?: string;
}

export interface CheckInRequest {
  installation_id: string;
  app_version?: string;
  os_info?: string;
}

export interface InstallationListItem {
  id: number;
  installation_id: string;
  name: string;
  org_name: string;
  status: InstallationStatus;
  activated_at: string | null;
  last_check_in: string | null;
  app_version: string;
  os_info: string;
  created_at: string;
}

export interface InstallationDetail extends InstallationListItem {
  organization: number;
  facility: number | null;
  facility_name: string;
  activation_code: string;
  activated_by: number | null;
  check_in_ip: string;
  revoked_at: string | null;
  revoked_reason: string;
  updated_at: string;
}

export interface GenerateCodeRequest {
  organization_id: number;
  name?: string;
  facility_id?: number;
}

export interface GenerateCodeResponse {
  id: number;
  activation_code: string;
  organization: string;
  facility: string | null;
  status: InstallationStatus;
}

export interface PaginatedInstallations {
  count: number;
  next: string | null;
  previous: string | null;
  results: InstallationListItem[];
}
