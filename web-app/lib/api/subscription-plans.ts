import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  SubscriptionPlanDetailSchema,
  PaginatedSubscriptionPlanListSchema,
} from '@/lib/schemas/subscription.schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  SubscriptionPlanCreateData,
  SubscriptionPlanDetail,
  SubscriptionPlanListItem,
  SubscriptionPlanUpdateData,
} from '@/lib/types/subscription';

export const subscriptionPlansApi = {
  async list(
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<PaginatedResponse<SubscriptionPlanListItem>> {
    const response = await apiClient.get('/api/subscription-plans/', { params });
    return parseResponse(PaginatedSubscriptionPlanListSchema, response.data, {
      context: 'subscriptionPlansApi.list',
    });
  },

  async get(id: number): Promise<SubscriptionPlanDetail> {
    const response = await apiClient.get(`/api/subscription-plans/${id}/`);
    return parseResponse(SubscriptionPlanDetailSchema, response.data, {
      context: 'subscriptionPlansApi.get',
    });
  },

  async create(data: SubscriptionPlanCreateData): Promise<SubscriptionPlanDetail> {
    const response = await apiClient.post('/api/subscription-plans/', data);
    return parseResponse(SubscriptionPlanDetailSchema, response.data, {
      context: 'subscriptionPlansApi.create',
    });
  },

  async update(id: number, data: SubscriptionPlanUpdateData): Promise<SubscriptionPlanDetail> {
    const response = await apiClient.patch(`/api/subscription-plans/${id}/`, data);
    return parseResponse(SubscriptionPlanDetailSchema, response.data, {
      context: 'subscriptionPlansApi.update',
    });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/subscription-plans/${id}/`);
  },
};
