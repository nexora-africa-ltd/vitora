import { z } from 'zod';

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedProcedureCatalogSchema,
  PaginatedProcedureOrderSchema,
  ProcedureDashboardSchema,
} from '@/lib/schemas/procedure.schema';

export const proceduresApi = {
  // ---- Catalog ----
  listCatalog: async (params?: Record<string, string>) => {
    const response = await apiClient.get('/api/procedures/catalog/', { params });
    return parseResponse(PaginatedProcedureCatalogSchema, response.data, {
      context: 'proceduresApi.listCatalog',
    });
  },

  getCatalogEntry: async (id: number) => {
    const response = await apiClient.get(`/api/procedures/catalog/${id}/`);
    return response.data;
  },

  // ---- Orders ----
  listOrders: async (params?: Record<string, string>) => {
    const response = await apiClient.get('/api/procedures/orders/', { params });
    return parseResponse(PaginatedProcedureOrderSchema, response.data, {
      context: 'proceduresApi.listOrders',
    });
  },

  createOrder: async (data: Record<string, unknown>) => {
    const response = await apiClient.post('/api/procedures/orders/', data);
    return response.data;
  },

  getOrder: async (id: number) => {
    const response = await apiClient.get(`/api/procedures/orders/${id}/`);
    return response.data;
  },

  // ---- Workflow Actions ----
  scheduleOrder: async (
    id: number,
    data: { scheduled_date: string; scheduled_time?: string; scheduled_location?: string },
  ) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/schedule/`,
      data,
    );
    return response.data;
  },

  startProcedure: async (id: number, data?: { location?: string }) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/start/`,
      data || {},
    );
    return response.data;
  },

  completeProcedure: async (id: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/complete/`,
      data,
    );
    return response.data;
  },

  cancelOrder: async (id: number, reason: string) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${id}/cancel/`,
      { reason },
    );
    return response.data;
  },

  // ---- Consent ----
  getConsent: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/consent/`,
    );
    return response.data;
  },

  createConsent: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/create/`,
      data,
    );
    return response.data;
  },

  signConsent: async (orderId: number) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/sign/`,
    );
    return response.data;
  },

  declineConsent: async (orderId: number, reason?: string) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consent/decline/`,
      { reason: reason || '' },
    );
    return response.data;
  },

  // ---- Consumables ----
  listConsumables: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/consumables/`,
    );
    return response.data;
  },

  addConsumable: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/consumables/add/`,
      data,
    );
    return response.data;
  },

  // ---- Outcomes ----
  listOutcomes: async (orderId: number) => {
    const response = await apiClient.get(
      `/api/procedures/orders/${orderId}/outcomes/`,
    );
    return response.data;
  },

  addOutcome: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(
      `/api/procedures/orders/${orderId}/outcomes/add/`,
      data,
    );
    return response.data;
  },

  // ---- Dashboard ----
  getDashboard: async () => {
    const response = await apiClient.get('/api/procedures/dashboard/');
    return parseResponse(ProcedureDashboardSchema, response.data, {
      context: 'proceduresApi.getDashboard',
    });
  },
};
