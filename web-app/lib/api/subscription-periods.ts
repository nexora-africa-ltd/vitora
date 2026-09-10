// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Subscription billing-period API client. Use from platform-admin billing workflows. */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedSubscriptionPeriodSchema,
  SubscriptionPeriodSchema,
} from '@/lib/schemas/subscription.schema';
import type { PaginatedResponse } from '@/lib/types';
import type { SubscriptionPeriod, SubscriptionPeriodCreateData } from '@/lib/types/subscription';

export const subscriptionPeriodsApi = {
  async list(): Promise<PaginatedResponse<SubscriptionPeriod>> {
    const response = await apiClient.get('/api/subscription-periods/');
    return parseResponse(PaginatedSubscriptionPeriodSchema, response.data, {
      context: 'subscriptionPeriodsApi.list',
    });
  },

  async create(data: SubscriptionPeriodCreateData): Promise<SubscriptionPeriod> {
    const response = await apiClient.post('/api/subscription-periods/', data);
    return parseResponse(SubscriptionPeriodSchema, response.data, {
      context: 'subscriptionPeriodsApi.create',
    });
  },

  async confirm(id: number, paymentReference: string): Promise<SubscriptionPeriod> {
    const response = await apiClient.post(`/api/subscription-periods/${id}/confirm/`, {
      payment_reference: paymentReference,
    });
    return parseResponse(SubscriptionPeriodSchema, response.data, {
      context: 'subscriptionPeriodsApi.confirm',
    });
  },
};
