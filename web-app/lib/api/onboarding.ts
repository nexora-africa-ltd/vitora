/**
 * Onboarding & Authentication API Client
 * Staff invitations, password reset, credential flows
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  StaffInvitationSchema,
  PaginatedInvitationSchema,
  InvitationPublicSchema,
  InvitationAcceptResponseSchema,
  MessageResponseSchema,
  OrgSignupResponseSchema,
  EmailVerifyResponseSchema,
  SetupCheckResponseSchema,
  SetupInitializeResponseSchema,
  OnboardingStatusResponseSchema,
  OnboardingCompleteResponseSchema,
} from '@/lib/schemas/onboarding.schema';
import { API_BASE_URL } from '@/lib/utils/constants';
import type { PaginatedResponse } from '@/lib/types';
import type {
  OnboardingStatusResponse,
  OnboardingCompleteResponse,
  StaffInvitation,
  InvitationCreateData,
  InvitationPublicInfo,
  InvitationAcceptData,
  InvitationAcceptResponse,
  InvitationListParams,
  PasswordResetRequestData,
  PasswordResetConfirmData,
  ChangePasswordData,
  OrgSignupData,
  OrgSignupResponse,
  EmailVerifyData,
  EmailVerifyResponse,
  SetupCheckResponse,
  SetupInitializeData,
  SetupInitializeResponse,
} from '@/lib/types/onboarding';

// =============================================================================
// Invitations API (Admin - authenticated)
// =============================================================================

export const invitationsApi = {
  list: async (params?: InvitationListParams): Promise<PaginatedResponse<StaffInvitation>> => {
    const response = await apiClient.get('/api/core/invitations/', { params });
    return parseResponse(PaginatedInvitationSchema, response.data, { context: 'invitationsApi.list' });
  },

  create: async (data: InvitationCreateData): Promise<StaffInvitation> => {
    const response = await apiClient.post('/api/core/invitations/', data);
    return parseResponse(StaffInvitationSchema, response.data, { context: 'invitationsApi.create' });
  },

  get: async (id: number): Promise<StaffInvitation> => {
    const response = await apiClient.get(`/api/core/invitations/${id}/`);
    return parseResponse(StaffInvitationSchema, response.data, { context: 'invitationsApi.get' });
  },

  resend: async (id: number): Promise<StaffInvitation> => {
    const response = await apiClient.post(`/api/core/invitations/${id}/resend/`);
    return parseResponse(StaffInvitationSchema, response.data, { context: 'invitationsApi.resend' });
  },

  revoke: async (id: number): Promise<StaffInvitation> => {
    const response = await apiClient.post(`/api/core/invitations/${id}/revoke/`);
    return parseResponse(StaffInvitationSchema, response.data, { context: 'invitationsApi.revoke' });
  },

  /** Accept a cross-org invitation (authenticated user) */
  acceptCrossOrg: async (token: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/api/core/invitations/accept-cross-org/', { token });
    return parseResponse(MessageResponseSchema, response.data, { context: 'invitationsApi.acceptCrossOrg' });
  },

  /** Decline a cross-org invitation (authenticated user) */
  decline: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`/api/core/invitations/${id}/decline/`);
    return parseResponse(MessageResponseSchema, response.data, { context: 'invitationsApi.decline' });
  },
};

// =============================================================================
// Public Invitation API (No auth required - uses fetch directly)
// =============================================================================

export const invitationPublicApi = {
  lookup: async (token: string): Promise<InvitationPublicInfo> => {
    const response = await fetch(`${API_BASE_URL}/api/core/invitations/${token}/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Invitation not found');
    }
    const data = await response.json();
    return parseResponse(InvitationPublicSchema, data, { context: 'invitationPublicApi.lookup' });
  },

  accept: async (data: InvitationAcceptData): Promise<InvitationAcceptResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/core/invitations/accept/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // Extract field-level errors or general error
      if (error.username) throw new Error(Array.isArray(error.username) ? error.username[0] : error.username);
      if (error.error) throw new Error(error.error);
      if (error.confirm_password) throw new Error(Array.isArray(error.confirm_password) ? error.confirm_password[0] : error.confirm_password);
      throw new Error('Failed to accept invitation');
    }
    const result = await response.json();
    return parseResponse(InvitationAcceptResponseSchema, result, { context: 'invitationPublicApi.accept' });
  },
};

// =============================================================================
// Password Reset API (Public - uses fetch directly)
// =============================================================================

export const passwordResetApi = {
  request: async (data: PasswordResetRequestData): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/core/auth/password-reset/request/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to send reset email');
    }
    const result = await response.json();
    return parseResponse(MessageResponseSchema, result, { context: 'passwordResetApi.request' });
  },

  confirm: async (data: PasswordResetConfirmData): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/core/auth/password-reset/confirm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to reset password');
    }
    const result = await response.json();
    return parseResponse(MessageResponseSchema, result, { context: 'passwordResetApi.confirm' });
  },
};

// =============================================================================
// Change Password API (Authenticated)
// =============================================================================

export const changePasswordApi = {
  change: async (data: ChangePasswordData): Promise<{ message: string }> => {
    const response = await apiClient.post('/api/core/auth/change-password/', data);
    return parseResponse(MessageResponseSchema, response.data, { context: 'changePasswordApi.change' });
  },
};

// =============================================================================
// Org Signup API (Public - Phase C)
// =============================================================================

export const orgSignupApi = {
  signup: async (data: OrgSignupData): Promise<OrgSignupResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/core/auth/signup/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.org_name) throw new Error(Array.isArray(error.org_name) ? error.org_name[0] : error.org_name);
      if (error.admin_email) throw new Error(Array.isArray(error.admin_email) ? error.admin_email[0] : error.admin_email);
      if (error.confirm_password) throw new Error(Array.isArray(error.confirm_password) ? error.confirm_password[0] : error.confirm_password);
      if (error.facility_mfl_code) throw new Error(Array.isArray(error.facility_mfl_code) ? error.facility_mfl_code[0] : error.facility_mfl_code);
      if (error.facility_sub_county) throw new Error(Array.isArray(error.facility_sub_county) ? error.facility_sub_county[0] : error.facility_sub_county);
      throw new Error(error.error || error.detail || 'Signup failed');
    }
    const result = await response.json();
    return parseResponse(OrgSignupResponseSchema, result, { context: 'orgSignupApi.signup' });
  },

  verifyEmail: async (data: EmailVerifyData): Promise<EmailVerifyResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/core/auth/verify-email/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Verification failed');
    }
    const result = await response.json();
    return parseResponse(EmailVerifyResponseSchema, result, { context: 'orgSignupApi.verifyEmail' });
  },
};

// =============================================================================
// Setup Wizard API (Public - Phase C)
// =============================================================================

export const setupApi = {
  check: async (): Promise<SetupCheckResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/core/setup/check/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to check setup status');
    const result = await response.json();
    return parseResponse(SetupCheckResponseSchema, result, { context: 'setupApi.check' });
  },

  initialize: async (data: SetupInitializeData): Promise<SetupInitializeResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/core/setup/initialize/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.facility_mfl_code) throw new Error(Array.isArray(error.facility_mfl_code) ? error.facility_mfl_code[0] : error.facility_mfl_code);
      if (error.admin_username) throw new Error(Array.isArray(error.admin_username) ? error.admin_username[0] : error.admin_username);
      if (error.admin_email) throw new Error(Array.isArray(error.admin_email) ? error.admin_email[0] : error.admin_email);
      if (error.confirm_password) throw new Error(Array.isArray(error.confirm_password) ? error.confirm_password[0] : error.confirm_password);
      throw new Error(error.error || error.detail || 'Setup failed');
    }
    const result = await response.json();
    return parseResponse(SetupInitializeResponseSchema, result, { context: 'setupApi.initialize' });
  },
};

// =============================================================================
// Organization Onboarding Checklist API (Authenticated)
// =============================================================================

export const onboardingChecklistApi = {
  getStatus: async (): Promise<OnboardingStatusResponse> => {
    const response = await apiClient.get('/api/core/onboarding/status/');
    return parseResponse(OnboardingStatusResponseSchema, response.data, { context: 'onboardingChecklistApi.getStatus' });
  },

  markComplete: async (): Promise<OnboardingCompleteResponse> => {
    const response = await apiClient.post('/api/core/onboarding/status/');
    return parseResponse(OnboardingCompleteResponseSchema, response.data, { context: 'onboardingChecklistApi.markComplete' });
  },
};
