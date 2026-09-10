import { z } from 'zod';
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  OrganizationDetailSchema,
  OrgTokenUsageSchema,
  PaystackCheckoutResponseSchema,
  BillingContactSchema,
  PaginatedOrganizationListSchema,
  TenantBillingSummarySchema,
} from '@/lib/schemas/organization.schema';
import { FacilityListItemSchema } from '@/lib/schemas/facility.schema';
import { SubscriptionPeriodSchema } from '@/lib/schemas/subscription.schema';
import type { PaginatedResponse } from '@/lib/types';
import type { FacilityListItem } from '@/lib/types/facility';
import type {
  OrganizationCreateData,
  OrganizationDetail,
  OrganizationListItem,
  OrganizationUpdateData,
  OrgTokenUsage,
  PaystackCheckoutResponse,
  BillingContact,
  TenantBillingSummary,
} from '@/lib/types/organization';

export const organizationsApi = {
  async list(
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<PaginatedResponse<OrganizationListItem>> {
    const response = await apiClient.get('/api/organizations/', { params });
    return parseResponse(PaginatedOrganizationListSchema, response.data, {
      context: 'organizationsApi.list',
    });
  },

  async get(id: number): Promise<OrganizationDetail> {
    const response = await apiClient.get(`/api/organizations/${id}/`);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.get',
    });
  },

  async create(data: OrganizationCreateData): Promise<OrganizationDetail> {
    const response = await apiClient.post('/api/organizations/', data);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.create',
    });
  },

  async update(id: number, data: OrganizationUpdateData): Promise<OrganizationDetail> {
    const response = await apiClient.patch(`/api/organizations/${id}/`, data);
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.update',
    });
  },

  async uploadLogo(id: number, file: File): Promise<OrganizationDetail> {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await apiClient.patch(`/api/organizations/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.uploadLogo',
    });
  },

  async removeLogo(id: number): Promise<OrganizationDetail> {
    const response = await apiClient.patch(`/api/organizations/${id}/`, { logo: null });
    return parseResponse(OrganizationDetailSchema, response.data, {
      context: 'organizationsApi.removeLogo',
    });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/organizations/${id}/`);
  },

  async listFacilities(
    orgId: number,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<FacilityListItem[]> {
    const response = await apiClient.get(`/api/organizations/${orgId}/facilities/`, { params });
    return parseResponse(z.array(FacilityListItemSchema), response.data, {
      context: 'organizationsApi.listFacilities',
    });
  },

  async getTokenUsage(orgId: number): Promise<OrgTokenUsage> {
    const response = await apiClient.get(`/api/organizations/${orgId}/token-usage/`);
    return parseResponse(OrgTokenUsageSchema, response.data, {
      context: 'organizationsApi.getTokenUsage',
    });
  },

  async getAccountBilling(orgId: number): Promise<TenantBillingSummary> {
    const response = await apiClient.get(`/api/organizations/${orgId}/account-billing/`);
    return parseResponse(TenantBillingSummarySchema, response.data, {
      context: 'organizationsApi.getAccountBilling',
    });
  },

  async initiatePaystackCheckout(
    orgId: number,
    data: { plan_id: number; billing_interval: 'MONTHLY' | 'ANNUAL' }
  ): Promise<PaystackCheckoutResponse> {
    const response = await apiClient.post(`/api/organizations/${orgId}/paystack-checkout/`, data);
    return parseResponse(PaystackCheckoutResponseSchema, response.data, {
      context: 'organizationsApi.initiatePaystackCheckout',
    });
  },

  async reconcilePaystackPayment(orgId: number, reference: string) {
    const response = await apiClient.post(`/api/organizations/${orgId}/paystack-status/`, { reference });
    return parseResponse(SubscriptionPeriodSchema, response.data, {
      context: 'organizationsApi.reconcilePaystackPayment',
    });
  },

  async getBillingContact(orgId: number): Promise<BillingContact> {
    const response = await apiClient.get(`/api/organizations/${orgId}/billing-contact/`);
    return parseResponse(BillingContactSchema, response.data, {
      context: 'organizationsApi.getBillingContact',
    });
  },

  async updateBillingContact(orgId: number, data: Partial<BillingContact>): Promise<BillingContact> {
    const response = await apiClient.patch(`/api/organizations/${orgId}/billing-contact/`, data);
    return parseResponse(BillingContactSchema, response.data, {
      context: 'organizationsApi.updateBillingContact',
    });
  },
};
