/**
 * Allied Health Dashboard API Client
 * Sprint Allied Health - Dashboard stats
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { AlliedHealthDashboardStatsSchema } from '@/lib/schemas/allied-health.schema';
import type { AlliedHealthDashboardStats } from '@/lib/types/allied-health';

const BASE_URL = '/api/allied-health';

export const alliedHealthApi = {
  /**
   * Get dashboard statistics for all Allied Health modules
   */
  getDashboardStats: async (): Promise<AlliedHealthDashboardStats> => {
    const response = await apiClient.get(`${BASE_URL}/dashboard/`);
    return parseResponse(AlliedHealthDashboardStatsSchema, response.data, {
      context: 'alliedHealthApi.getDashboardStats',
    });
  },

  /**
   * Get today's sessions across all modules
   */
  getTodaysSessions: async (): Promise<AlliedHealthDashboardStats['todays_sessions']> => {
    const stats = await alliedHealthApi.getDashboardStats();
    return stats.todays_sessions;
  },
};
