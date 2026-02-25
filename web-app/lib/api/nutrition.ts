/**
 * Nutrition API Client
 * Sprint Allied Health - Nutrition
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  NutritionConsultationSchema,
  DietPlanSchema,
  PaginatedNutritionConsultationListSchema,
  PaginatedDietPlanListSchema,
} from '@/lib/schemas/nutrition.schema';
import type {
  NutritionConsultation,
  NutritionConsultationListItem,
  NutritionConsultationCreateData,
  NutritionConsultationUpdateData,
  NutritionConsultationListParams,
  DietPlan,
  DietPlanListItem,
  DietPlanCreateData,
  DietPlanListParams,
} from '@/lib/types/nutrition';
import type { PaginatedResponse } from '@/lib/types/allied-health';

const BASE_URL = '/api/nutrition';

export const nutritionApi = {
  // ============ Consultations ============

  listConsultations: async (
    params?: NutritionConsultationListParams
  ): Promise<PaginatedResponse<NutritionConsultationListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/consultations/`, { params });
    return parseResponse(PaginatedNutritionConsultationListSchema, response.data, {
      context: 'nutritionApi.listConsultations',
    });
  },

  getConsultation: async (id: number): Promise<NutritionConsultation> => {
    const response = await apiClient.get(`${BASE_URL}/consultations/${id}/`);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.getConsultation',
    });
  },

  getConsultationByNumber: async (orderNumber: string): Promise<NutritionConsultation> => {
    const response = await apiClient.get(`${BASE_URL}/consultations/`, {
      params: { order_number: orderNumber },
    });
    const paginated = parseResponse(PaginatedNutritionConsultationListSchema, response.data, {
      context: 'nutritionApi.getConsultationByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Consultation ${orderNumber} not found`);
    }
    return nutritionApi.getConsultation(firstResult.id);
  },

  createConsultation: async (
    data: NutritionConsultationCreateData
  ): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/`, data);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.createConsultation',
    });
  },

  updateConsultation: async (
    id: number,
    data: NutritionConsultationUpdateData
  ): Promise<NutritionConsultation> => {
    const response = await apiClient.patch(`${BASE_URL}/consultations/${id}/`, data);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.updateConsultation',
    });
  },

  deleteConsultation: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/consultations/${id}/`);
  },

  // Consultation Actions
  approveConsultation: async (id: number): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/approve/`);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.approveConsultation',
    });
  },

  assignDietitian: async (id: number, dietitianId: number): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/assign_dietitian/`, {
      dietitian_id: dietitianId,
    });
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.assignDietitian',
    });
  },

  syncAnthropometrics: async (id: number): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/sync_anthropometrics/`);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.syncAnthropometrics',
    });
  },

  updateStatus: async (
    id: number,
    status: NutritionConsultation['status']
  ): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/update_status/`, {
      status,
    });
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.updateStatus',
    });
  },

  completeConsultation: async (id: number): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/complete/`);
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.completeConsultation',
    });
  },

  cancelConsultation: async (id: number, reason?: string): Promise<NutritionConsultation> => {
    const response = await apiClient.post(`${BASE_URL}/consultations/${id}/cancel/`, { reason });
    return parseResponse(NutritionConsultationSchema, response.data, {
      context: 'nutritionApi.cancelConsultation',
    });
  },

  // ============ Diet Plans ============

  listDietPlans: async (
    params?: DietPlanListParams
  ): Promise<PaginatedResponse<DietPlanListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/diet-plans/`, { params });
    return parseResponse(PaginatedDietPlanListSchema, response.data, {
      context: 'nutritionApi.listDietPlans',
    });
  },

  getDietPlan: async (id: number): Promise<DietPlan> => {
    const response = await apiClient.get(`${BASE_URL}/diet-plans/${id}/`);
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.getDietPlan',
    });
  },

  createDietPlan: async (data: DietPlanCreateData): Promise<DietPlan> => {
    const response = await apiClient.post(`${BASE_URL}/diet-plans/`, data);
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.createDietPlan',
    });
  },

  updateDietPlan: async (id: number, data: Partial<DietPlanCreateData>): Promise<DietPlan> => {
    const response = await apiClient.patch(`${BASE_URL}/diet-plans/${id}/`, data);
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.updateDietPlan',
    });
  },

  deleteDietPlan: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/diet-plans/${id}/`);
  },

  // Diet Plan Actions
  activateDietPlan: async (id: number): Promise<DietPlan> => {
    const response = await apiClient.post(`${BASE_URL}/diet-plans/${id}/activate/`);
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.activateDietPlan',
    });
  },

  discontinueDietPlan: async (id: number, reason?: string): Promise<DietPlan> => {
    const response = await apiClient.post(`${BASE_URL}/diet-plans/${id}/discontinue/`, { reason });
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.discontinueDietPlan',
    });
  },

  putDietPlanOnHold: async (id: number, reason?: string): Promise<DietPlan> => {
    const response = await apiClient.post(`${BASE_URL}/diet-plans/${id}/put_on_hold/`, { reason });
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.putDietPlanOnHold',
    });
  },

  completeDietPlan: async (id: number): Promise<DietPlan> => {
    const response = await apiClient.post(`${BASE_URL}/diet-plans/${id}/complete/`);
    return parseResponse(DietPlanSchema, response.data, {
      context: 'nutritionApi.completeDietPlan',
    });
  },

  // ============ Consultation Diet Plans ============

  getConsultationDietPlans: async (
    consultationId: number
  ): Promise<PaginatedResponse<DietPlanListItem>> => {
    return nutritionApi.listDietPlans({ consultation_id: consultationId });
  },
};
