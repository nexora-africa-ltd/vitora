/**
 * Push subscription API client.
 *
 * Manages Web Push subscription lifecycle:
 * - Get VAPID public key
 * - Register push subscription
 * - Unsubscribe
 */

import { apiClient } from './client';

export interface PushSubscriptionResponse {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface VapidKeyResponse {
  vapid_public_key: string;
}

export const pushApi = {
  /** Get the server's VAPID public key for PushManager.subscribe(). */
  async getVapidKey(): Promise<VapidKeyResponse> {
    const response = await apiClient.get('/api/push-subscriptions/vapid-key/');
    return response.data;
  },

  /** Register a push subscription with the backend. */
  async subscribe(subscription: PushSubscription): Promise<PushSubscriptionResponse> {
    const json = subscription.toJSON();
    const response = await apiClient.post('/api/push-subscriptions/', {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    });
    return response.data;
  },

  /** Remove a push subscription from the backend. */
  async unsubscribe(id: number): Promise<void> {
    await apiClient.delete(`/api/push-subscriptions/${id}/`);
  },

  /** List all push subscriptions for the current user. */
  async list(): Promise<{ results: PushSubscriptionResponse[] }> {
    const response = await apiClient.get('/api/push-subscriptions/');
    return response.data;
  },
};
