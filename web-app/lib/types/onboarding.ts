/**
 * Onboarding & Authentication Types
 * Staff invitation, password reset, credential flows
 */

// =============================================================================
// Invitation Types
// =============================================================================

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface StaffInvitation {
  id: number;
  token: string;
  email: string;
  organization: number;
  organization_name: string;
  facility: number | null;
  facility_name: string;
  role: number | null;
  role_name: string;
  department: number | null;
  department_name: string;
  job_title: string;
  employee_id: string;
  status: InvitationStatus;
  invited_by: number | null;
  invited_by_name: string;
  expires_at: string;
  expires_hours: number;
  accepted_at: string | null;
  accepted_user: number | null;
  last_sent_at: string | null;
  send_count: number;
  is_expired: boolean;
  is_usable: boolean;
  created_at: string;
}

export interface InvitationCreateData {
  email: string;
  organization: number;
  facility?: number | null;
  role?: number | null;
  department?: number | null;
  secondary_roles?: number[];
  secondary_departments?: number[];
  job_title?: string;
  employee_id?: string;
  expires_hours?: number;
}

export interface InvitationPublicInfo {
  email: string;
  organization_name: string;
  role_name: string;
  department_name: string;
  job_title: string;
  is_expired: boolean;
  is_usable: boolean;
  expires_at: string;
}

export interface InvitationAcceptData {
  token: string;
  username: string;
  password: string;
  confirm_password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
}

export interface InvitationAcceptResponse {
  message: string;
  username: string;
}

// =============================================================================
// Password Reset Types
// =============================================================================

export interface PasswordResetRequestData {
  email: string;
}

export interface PasswordResetConfirmData {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface ChangePasswordData {
  current_password?: string;
  new_password: string;
  confirm_password: string;
}

// =============================================================================
// Direct Creation Credential Response
// =============================================================================

export interface StaffCreateWithCredentials {
  temp_password: string;
  id: number;
  user: number;
  user_username: string;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  full_name: string;
  employee_id: string;
}

// =============================================================================
// Invitation List Params
// =============================================================================

export interface InvitationListParams {
  page?: number;
  page_size?: number;
  status?: InvitationStatus;
  search?: string;
}

// =============================================================================
// Org Signup Types (Phase C)
// =============================================================================

export interface OrgSignupData {
  org_name: string;
  admin_email: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_password: string;
  confirm_password: string;
  facility_name: string;
  facility_mfl_code: string;
  facility_county: number;
  facility_sub_county: number;
  facility_level?: string;
  facility_ownership?: string;
}

export interface OrgSignupResponse {
  message: string;
  org_name: string;
  admin_email: string;
  facility_name: string;
  facility_mfl_code: string;
  username: string;
}

// =============================================================================
// Email Verification Types (Phase C)
// =============================================================================

export interface EmailVerifyData {
  token: string;
}

export interface EmailVerifyResponse {
  message: string;
  org_name: string;
  username: string;
}

// =============================================================================
// Setup Wizard Types (Phase C)
// =============================================================================

export interface SetupCheckResponse {
  setup_required: boolean;
  setup_enabled: boolean;
  has_organizations: boolean;
  has_facilities?: boolean;
  has_staff_with_facility?: boolean;
}

export type FacilityLevel = '1' | '2' | '3' | '4' | '5' | '6';
export type OwnershipType = 'GOK' | 'FBO' | 'NGO' | 'PRIVATE';

export interface SetupInitializeData {
  org_name: string;
  org_contact_email?: string;
  org_contact_phone?: string;
  facility_name: string;
  facility_mfl_code: string;
  facility_level: FacilityLevel;
  facility_ownership?: OwnershipType;
  facility_county: number;
  facility_sub_county: number;
  admin_username: string;
  admin_email: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_password: string;
  confirm_password: string;
}

export interface SetupInitializeResponse {
  message: string;
  org_name: string;
  facility_name: string;
  username: string;
}
