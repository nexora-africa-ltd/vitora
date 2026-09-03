/**
 * Push subscription API client.
 *
 * Manages Web Push subscription lifecycle:
 * - Get VAPID public key
 * - Register push subscription
 * - Unsubscribe
 */

import { apiClient } from './client';
import { z } from 'zod';
import { parseResponse } from '@/lib/schemas/validation';

export interface PushSubscriptionResponse {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface VapidKeyResponse {
  configured: boolean;
  vapid_public_key?: string;
  message?: string;
}

const PushSubscriptionResponseSchema = z.object({
  id: z.number(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  created_at: z.string(),
});

const VapidKeyResponseSchema = z.object({
  configured: z.boolean().default(false),
  vapid_public_key: z.string().optional(),
  message: z.string().optional(),
});

const PushSubscriptionListSchema = z.object({
  results: z.array(PushSubscriptionResponseSchema),
});

export const pushApi = {
  /** Get the server's VAPID public key for PushManager.subscribe(). */
  async getVapidKey(): Promise<VapidKeyResponse> {
    const response = await apiClient.get('/api/push-subscriptions/vapid-key/');
    return parseResponse(VapidKeyResponseSchema, response.data, {
      context: 'pushApi.getVapidKey',
    });
  },

  /** Register a push subscription with the backend. */
  async subscribe(subscription: PushSubscription): Promise<PushSubscriptionResponse> {
    const json = subscription.toJSON();
    const response = await apiClient.post('/api/push-subscriptions/', {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    });
    return parseResponse(PushSubscriptionResponseSchema, response.data, {
      context: 'pushApi.subscribe',
    });
  },

  /** Remove a push subscription from the backend. */
  async unsubscribe(id: number): Promise<void> {
    await apiClient.delete(`/api/push-subscriptions/${id}/`);
  },

  /** List all push subscriptions for the current user. */
  async list(): Promise<{ results: PushSubscriptionResponse[] }> {
    const response = await apiClient.get('/api/push-subscriptions/');
    return parseResponse(PushSubscriptionListSchema, response.data, {
      context: 'pushApi.list',
    });
  },
};
