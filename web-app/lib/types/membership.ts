/**
 * Multi-Org Membership & Join Request Types
 */

// =============================================================================
// Organization Membership Types
// =============================================================================

export interface MembershipFacility {
  id: number;
  name: string;
  mfl_code: string;
}

export interface OrgMembership {
  id: number;
  organization_id: number;
  organization_name: string;
  role_code: string;
  role_name: string;
  is_primary: boolean;
  facilities: MembershipFacility[];
}

// =============================================================================
// Join Request Types
// =============================================================================

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface OrgJoinRequest {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  organization: number;
  organization_name: string;
  requested_role: number | null;
  requested_role_name: string;
  message: string;
  status: JoinRequestStatus;
  reviewed_by: number | null;
  reviewed_by_name: string;
  reviewed_at: string | null;
  review_notes: string;
  created_at: string;
  updated_at: string;
}

export interface JoinRequestCreateData {
  organization: number;
  requested_role?: number | null;
  message?: string;
}

export interface JoinRequestApproveData {
  role: number;
  department?: number | null;
  facilities?: number[];
  review_notes?: string;
}

export interface JoinRequestRejectData {
  review_notes?: string;
}

export interface JoinRequestListParams {
  page?: number;
  page_size?: number;
  status?: JoinRequestStatus;
}
