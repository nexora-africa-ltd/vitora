/**
 * Imaging API client.
 * Phase B: Frontend Order Management
 */

import { apiClient } from './client';
import {
  ImagingProcedure,
  ImagingProcedureDetail,
  ImagingOrder,
  ImagingOrderCreateData,
  ScheduleOrderData,
  CancelOrderData,
  ImagingProcedureListParams,
  ImagingOrderListParams,
} from '@/lib/types/imaging';
import { PaginatedResponse } from '@/lib/types';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  ImagingProcedureSchema,
  ImagingProcedureDetailSchema,
  ImagingOrderSchema,
  PaginatedImagingProcedureSchema,
  PaginatedImagingOrderSchema,
  ImagingProcedureArraySchema,
  ImagingOrderArraySchema,
} from '@/lib/schemas/imaging.schema';

export const imagingApi = {
  // ============ Procedure Catalog ============

  /**
   * Get paginated list of imaging procedures.
   */
  async listProcedures(
    params?: ImagingProcedureListParams
  ): Promise<PaginatedResponse<ImagingProcedure>> {
    const response = await apiClient.get<PaginatedResponse<ImagingProcedure>>(
      '/api/imaging/procedures/',
      { params }
    );
    return parseResponse(PaginatedImagingProcedureSchema, response.data, {
      context: 'imagingApi.listProcedures',
    }) as PaginatedResponse<ImagingProcedure>;
  },

  /**
   * Get a single procedure by code.
   */
  async getProcedure(code: string): Promise<ImagingProcedureDetail> {
    const response = await apiClient.get<ImagingProcedureDetail>(
      `/api/imaging/procedures/${code}/`
    );
    return parseResponse(ImagingProcedureDetailSchema, response.data, {
      context: 'imagingApi.getProcedure',
    }) as ImagingProcedureDetail;
  },

  /**
   * Search procedures by name or code.
   */
  async searchProcedures(query: string): Promise<ImagingProcedure[]> {
    const response = await apiClient.get<ImagingProcedure[]>(
      '/api/imaging/procedures/',
      { params: { search: query } }
    );
    // API returns paginated response, extract results
    const data = response.data as unknown as PaginatedResponse<ImagingProcedure>;
    return parseResponse(ImagingProcedureArraySchema, data.results || data, {
      context: 'imagingApi.searchProcedures',
    }) as ImagingProcedure[];
  },

  // ============ Imaging Orders ============

  /**
   * Get paginated list of imaging orders.
   */
  async listOrders(
    params?: ImagingOrderListParams
  ): Promise<PaginatedResponse<ImagingOrder>> {
    const response = await apiClient.get<PaginatedResponse<ImagingOrder>>(
      '/api/imaging/orders/',
      { params }
    );
    return parseResponse(PaginatedImagingOrderSchema, response.data, {
      context: 'imagingApi.listOrders',
    }) as PaginatedResponse<ImagingOrder>;
  },

  /**
   * Get a single imaging order by order number.
   */
  async getOrder(orderNumber: string): Promise<ImagingOrder> {
    const response = await apiClient.get<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/`
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.getOrder',
    }) as ImagingOrder;
  },

  /**
   * Get imaging orders for a specific patient.
   */
  async getPatientOrders(patientId: number): Promise<ImagingOrder[]> {
    const response = await apiClient.get<PaginatedResponse<ImagingOrder>>(
      '/api/imaging/orders/',
      { params: { patient: patientId } }
    );
    const data = response.data;
    return parseResponse(ImagingOrderArraySchema, data.results || [], {
      context: 'imagingApi.getPatientOrders',
    }) as ImagingOrder[];
  },

  /**
   * Get imaging orders for a specific encounter.
   */
  async getEncounterOrders(encounterId: number): Promise<ImagingOrder[]> {
    const response = await apiClient.get<PaginatedResponse<ImagingOrder>>(
      '/api/imaging/orders/',
      { params: { encounter: encounterId } }
    );
    const data = response.data;
    return parseResponse(ImagingOrderArraySchema, data.results || [], {
      context: 'imagingApi.getEncounterOrders',
    }) as ImagingOrder[];
  },

  /**
   * Create a new imaging order.
   */
  async createOrder(data: ImagingOrderCreateData): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>('/api/imaging/orders/', data);
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.createOrder',
    }) as ImagingOrder;
  },

  /**
   * Update an imaging order.
   */
  async updateOrder(
    orderNumber: string,
    data: Partial<ImagingOrder>
  ): Promise<ImagingOrder> {
    const response = await apiClient.patch<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/`,
      data
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.updateOrder',
    }) as ImagingOrder;
  },

  /**
   * Delete an imaging order.
   */
  async deleteOrder(orderNumber: string): Promise<void> {
    await apiClient.delete(`/api/imaging/orders/${orderNumber}/`);
  },

  // ============ Order Workflow Actions ============

  /**
   * Submit order for processing (DRAFT -> ORDERED).
   */
  async submitOrder(orderNumber: string): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/submit/`
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.submitOrder',
    }) as ImagingOrder;
  },

  /**
   * Schedule order (ORDERED -> SCHEDULED).
   */
  async scheduleOrder(
    orderNumber: string,
    data: ScheduleOrderData
  ): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/schedule/`,
      data
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.scheduleOrder',
    }) as ImagingOrder;
  },

  /**
   * Start imaging process (ORDERED/SCHEDULED -> IN_PROGRESS).
   */
  async startOrder(orderNumber: string): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/start/`
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.startOrder',
    }) as ImagingOrder;
  },

  /**
   * Complete imaging (IN_PROGRESS -> COMPLETED).
   */
  async completeOrder(orderNumber: string): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/complete/`
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.completeOrder',
    }) as ImagingOrder;
  },

  /**
   * Cancel order.
   */
  async cancelOrder(
    orderNumber: string,
    data?: CancelOrderData
  ): Promise<ImagingOrder> {
    const response = await apiClient.post<ImagingOrder>(
      `/api/imaging/orders/${orderNumber}/cancel/`,
      data || {}
    );
    return parseResponse(ImagingOrderSchema, response.data, {
      context: 'imagingApi.cancelOrder',
    }) as ImagingOrder;
  },

  // ============ Worklist ============

  /**
   * Get worklist orders (orders that need action).
   * Filters by status: ORDERED, SCHEDULED, IN_PROGRESS
   */
  async getWorklist(
    params?: Omit<ImagingOrderListParams, 'status'>
  ): Promise<ImagingOrder[]> {
    // Get all actionable orders
    const statuses = ['ORDERED', 'SCHEDULED', 'IN_PROGRESS'];
    const orders: ImagingOrder[] = [];

    for (const status of statuses) {
      const response = await apiClient.get<PaginatedResponse<ImagingOrder>>(
        '/api/imaging/orders/',
        { params: { ...params, status } }
      );
      const data = parseResponse(PaginatedImagingOrderSchema, response.data, {
        context: `imagingApi.getWorklist (${status})`,
      }) as PaginatedResponse<ImagingOrder>;
      orders.push(...data.results);
    }

    // Sort by priority (STAT first) then by ordered_at
    return orders.sort((a, b) => {
      const priorityOrder = { STAT: 0, URGENT: 1, ROUTINE: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.ordered_at).getTime() - new Date(b.ordered_at).getTime();
    });
  },

  /**
   * Get worklist statistics.
   */
  async getWorklistStats(): Promise<{
    total_pending: number;
    total_in_progress: number;
    total_completed_today: number;
    stat_orders: number;
    urgent_orders: number;
  }> {
    // Get counts for each status
    const [ordered, scheduled, inProgress, completed] = await Promise.all([
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: { status: 'ORDERED', page_size: 1 },
      }),
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: { status: 'SCHEDULED', page_size: 1 },
      }),
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: { status: 'IN_PROGRESS', page_size: 1 },
      }),
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: {
          status: 'COMPLETED',
          date_from: new Date().toISOString().split('T')[0],
          page_size: 1,
        },
      }),
    ]);

    // Get stat and urgent counts
    const [statOrders, urgentOrders] = await Promise.all([
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: { priority: 'STAT', status: 'ORDERED', page_size: 1 },
      }),
      apiClient.get<PaginatedResponse<ImagingOrder>>('/api/imaging/orders/', {
        params: { priority: 'URGENT', status: 'ORDERED', page_size: 1 },
      }),
    ]);

    return {
      total_pending: (ordered.data.count || 0) + (scheduled.data.count || 0),
      total_in_progress: inProgress.data.count || 0,
      total_completed_today: completed.data.count || 0,
      stat_orders: statOrders.data.count || 0,
      urgent_orders: urgentOrders.data.count || 0,
    };
  },
};

export default imagingApi;
