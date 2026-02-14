/**
 * Imaging API client.
 * Phase B: Frontend Order Management
 * Phase C Sprint C.3: DICOM Viewer
 */

import { apiClient, getApiBaseUrl } from './client';
import {
  ImagingProcedure,
  ImagingProcedureDetail,
  ImagingOrder,
  ImagingOrderCreateData,
  ScheduleOrderData,
  CancelOrderData,
  ImagingProcedureListParams,
  ImagingOrderListParams,
  ImagingResource,
  ImagingCalendarResponse,
  ImagingCalendarParams,
  ResourceAvailabilityParams,
  WeeklyAvailabilityParams,
  ImagingCalendarSlot,
  ImagingWeeklyDay,
  SlotAvailabilityCheckResponse,
  DICOMStudy,
  DICOMStudyDetail,
  DICOMSeriesList,
  DICOMInstance,
  DICOMStudyListParams,
  DICOMUploadResponse,
  RadiologyReport,
  RadiologyReportCreateData,
  RadiologyReportUpdateData,
  RadiologyReportAmendData,
  CommunicateCriticalData,
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
  ImagingResourceSchema,
  ImagingResourcesListResponseSchema,
  ImagingCalendarResponseSchema,
  ImagingResourceAvailabilityResponseSchema,
  ImagingWeeklyAvailabilityResponseSchema,
  SlotAvailabilityCheckResponseSchema,
  ImagingCalendarSlotSchema,
  DICOMStudySchema,
  DICOMStudyDetailSchema,
  PaginatedDICOMStudySchema,
  DICOMSeriesArraySchema,
  DICOMInstanceArraySchema,
  DICOMUploadResponseSchema,
  RadiologyReportSchema,
  PaginatedRadiologyReportSchema,
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

  // ============ Scheduling / Calendar ============

  /**
   * Get list of imaging resources (rooms, scanners).
   */
  async listResources(modality?: string): Promise<ImagingResource[]> {
    const response = await apiClient.get('/api/imaging/resources/', {
      params: modality ? { modality } : undefined,
    });
    const data = parseResponse(ImagingResourcesListResponseSchema, response.data, {
      context: 'imagingApi.listResources',
    });
    return data.results;
  },

  /**
   * Get a single imaging resource.
   */
  async getResource(resourceId: number): Promise<ImagingResource> {
    const response = await apiClient.get(`/api/imaging/resources/${resourceId}/`);
    return parseResponse(ImagingResourceSchema, response.data, {
      context: 'imagingApi.getResource',
    }) as ImagingResource;
  },

  /**
   * Get availability slots for a specific resource on a date.
   */
  async getResourceAvailability(
    resourceId: number,
    params?: ResourceAvailabilityParams
  ): Promise<ImagingCalendarSlot[]> {
    const response = await apiClient.get(
      `/api/imaging/resources/${resourceId}/availability/`,
      { params }
    );
    const data = parseResponse(ImagingResourceAvailabilityResponseSchema, response.data, {
      context: 'imagingApi.getResourceAvailability',
    });
    return data.slots;
  },

  /**
   * Get weekly availability for a resource.
   */
  async getResourceWeeklyAvailability(
    resourceId: number,
    params?: WeeklyAvailabilityParams
  ): Promise<ImagingWeeklyDay[]> {
    const response = await apiClient.get(
      `/api/imaging/resources/${resourceId}/availability/weekly/`,
      { params }
    );
    const data = parseResponse(ImagingWeeklyAvailabilityResponseSchema, response.data, {
      context: 'imagingApi.getResourceWeeklyAvailability',
    });
    return data.days;
  },

  /**
   * Check if a specific slot is available.
   */
  async checkSlotAvailability(
    resourceId: number,
    date: string,
    startTime: string,
    endTime: string
  ): Promise<SlotAvailabilityCheckResponse> {
    const response = await apiClient.get(
      `/api/imaging/resources/${resourceId}/availability/check/`,
      {
        params: {
          date,
          start_time: startTime,
          end_time: endTime,
        },
      }
    );
    return parseResponse(SlotAvailabilityCheckResponseSchema, response.data, {
      context: 'imagingApi.checkSlotAvailability',
    }) as SlotAvailabilityCheckResponse;
  },

  /**
   * Get department-wide imaging calendar for a date.
   */
  async getCalendar(params?: ImagingCalendarParams): Promise<ImagingCalendarResponse> {
    const response = await apiClient.get('/api/imaging/calendar/', { params });
    return parseResponse(ImagingCalendarResponseSchema, response.data, {
      context: 'imagingApi.getCalendar',
    }) as ImagingCalendarResponse;
  },

  // ============ DICOM Studies (Phase C Sprint C.3) ============

  /**
   * Get paginated list of DICOM studies.
   */
  async listStudies(
    params?: DICOMStudyListParams
  ): Promise<PaginatedResponse<DICOMStudy>> {
    const response = await apiClient.get<PaginatedResponse<DICOMStudy>>(
      '/api/imaging/studies/',
      { params }
    );
    return parseResponse(PaginatedDICOMStudySchema, response.data, {
      context: 'imagingApi.listStudies',
    }) as PaginatedResponse<DICOMStudy>;
  },

  /**
   * Get DICOM study details by study instance UID.
   */
  async getStudy(studyInstanceUid: string): Promise<DICOMStudyDetail> {
    const response = await apiClient.get<DICOMStudyDetail>(
      `/api/imaging/studies/${studyInstanceUid}/`
    );
    return parseResponse(DICOMStudyDetailSchema, response.data, {
      context: 'imagingApi.getStudy',
    }) as DICOMStudyDetail;
  },

  /**
   * Get all series for a DICOM study.
   */
  async getStudySeries(studyInstanceUid: string): Promise<DICOMSeriesList[]> {
    const response = await apiClient.get<DICOMSeriesList[]>(
      `/api/imaging/studies/${studyInstanceUid}/series/`
    );
    return parseResponse(DICOMSeriesArraySchema, response.data, {
      context: 'imagingApi.getStudySeries',
    }) as DICOMSeriesList[];
  },

  /**
   * Get all instances for a DICOM study.
   */
  async getStudyInstances(studyInstanceUid: string): Promise<DICOMInstance[]> {
    const response = await apiClient.get<DICOMInstance[]>(
      `/api/imaging/studies/${studyInstanceUid}/instances/`
    );
    return parseResponse(DICOMInstanceArraySchema, response.data, {
      context: 'imagingApi.getStudyInstances',
    }) as DICOMInstance[];
  },

  /**
   * Upload DICOM files.
   * @param files - Array of DICOM files to upload
   * @param imagingOrderId - Optional imaging order ID to link
   * @param patientId - Patient ID (required if no imaging order)
   */
  async uploadDICOM(
    files: File[],
    options?: { imagingOrderId?: number; patientId?: number }
  ): Promise<DICOMUploadResponse> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (options?.imagingOrderId) {
      formData.append('imaging_order', String(options.imagingOrderId));
    }
    if (options?.patientId) {
      formData.append('patient', String(options.patientId));
    }

    const response = await apiClient.post<DICOMUploadResponse>(
      '/api/imaging/studies/upload/',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return parseResponse(DICOMUploadResponseSchema, response.data, {
      context: 'imagingApi.uploadDICOM',
    }) as DICOMUploadResponse;
  },

  /**
   * Delete a DICOM study.
   */
  async deleteStudy(studyInstanceUid: string): Promise<void> {
    await apiClient.delete(`/api/imaging/studies/${studyInstanceUid}/`);
  },

  /**
   * Get the URL for retrieving a DICOM file via WADO.
   * This URL can be used with cornerstone-wado-image-loader.
   */
  getDICOMFileUrl(sopInstanceUid: string): string {
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}/api/imaging/dicom/${sopInstanceUid}/`;
  },

  /**
   * Get the URL for rendering a DICOM frame as PNG.
   * Useful for browsers without native DICOM support or for previews.
   *
   * @param sopInstanceUid - SOP Instance UID
   * @param options - Rendering options
   */
  getFrameRenderUrl(
    sopInstanceUid: string,
    options?: {
      size?: number;
      frame?: number;
      windowCenter?: number;
      windowWidth?: number;
    }
  ): string {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (options?.size) params.append('size', String(options.size));
    if (options?.frame !== undefined) params.append('frame', String(options.frame));
    if (options?.windowCenter !== undefined)
      params.append('window_center', String(options.windowCenter));
    if (options?.windowWidth !== undefined)
      params.append('window_width', String(options.windowWidth));

    const queryString = params.toString();
    return `${baseUrl}/api/imaging/dicom/${sopInstanceUid}/frame/${queryString ? '?' + queryString : ''}`;
  },

  /**
   * Get the URL for a DICOM instance thumbnail.
   */
  getThumbnailUrl(thumbnailPath: string | null | undefined): string | null {
    if (!thumbnailPath) return null;
    const baseUrl = getApiBaseUrl();
    // thumbnail_path is relative to MEDIA_ROOT, served at /media/
    return `${baseUrl}/media/${thumbnailPath}`;
  },

  // ============ Radiology Reports (Phase D) ============

  /**
   * List radiology reports with optional filters.
   */
  async listReports(params?: {
    status?: string;
    is_critical?: boolean;
    reported_by?: number;
    patient?: number;
    order?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<RadiologyReport>> {
    const response = await apiClient.get<PaginatedResponse<RadiologyReport>>(
      '/api/imaging/reports/',
      { params }
    );
    return parseResponse(PaginatedRadiologyReportSchema, response.data, {
      context: 'imagingApi.listReports',
    }) as PaginatedResponse<RadiologyReport>;
  },

  /**
   * Get a radiology report by report number.
   */
  async getReport(reportNumber: string): Promise<RadiologyReport> {
    const response = await apiClient.get<RadiologyReport>(
      `/api/imaging/reports/${reportNumber}/`
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.getReport',
    }) as RadiologyReport;
  },

  /**
   * Get a radiology report by imaging order number (convenience method).
   * Returns null if no report exists for the order.
   */
  async getReportByOrder(orderNumber: string): Promise<RadiologyReport | null> {
    try {
      const response = await apiClient.get<PaginatedResponse<RadiologyReport>>(
        '/api/imaging/reports/',
        { params: { order: orderNumber } }
      );
      const data = parseResponse(PaginatedRadiologyReportSchema, response.data, {
        context: 'imagingApi.getReportByOrder',
      }) as PaginatedResponse<RadiologyReport>;
      return data.results[0] ?? null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Create a new radiology report draft.
   */
  async createReport(data: RadiologyReportCreateData): Promise<RadiologyReport> {
    const response = await apiClient.post<RadiologyReport>(
      '/api/imaging/reports/',
      data
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.createReport',
    }) as RadiologyReport;
  },

  /**
   * Update a draft radiology report.
   */
  async updateReport(
    reportNumber: string,
    data: RadiologyReportUpdateData
  ): Promise<RadiologyReport> {
    const response = await apiClient.patch<RadiologyReport>(
      `/api/imaging/reports/${reportNumber}/`,
      data
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.updateReport',
    }) as RadiologyReport;
  },

  /**
   * Sign and finalize a radiology report.
   */
  async signReport(reportNumber: string): Promise<RadiologyReport> {
    const response = await apiClient.post<RadiologyReport>(
      `/api/imaging/reports/${reportNumber}/sign/`
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.signReport',
    }) as RadiologyReport;
  },

  /**
   * Amend a finalized radiology report.
   */
  async amendReport(
    reportNumber: string,
    data: RadiologyReportAmendData
  ): Promise<RadiologyReport> {
    const response = await apiClient.post<RadiologyReport>(
      `/api/imaging/reports/${reportNumber}/amend/`,
      data
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.amendReport',
    }) as RadiologyReport;
  },

  /**
   * Communicate a critical finding.
   */
  async communicateCritical(
    reportNumber: string,
    data: CommunicateCriticalData
  ): Promise<RadiologyReport> {
    const response = await apiClient.post<RadiologyReport>(
      `/api/imaging/reports/${reportNumber}/communicate-critical/`,
      data
    );
    return parseResponse(RadiologyReportSchema, response.data, {
      context: 'imagingApi.communicateCritical',
    }) as RadiologyReport;
  },

  /**
   * Delete a draft radiology report.
   * Only drafts can be deleted.
   */
  async deleteReport(reportNumber: string): Promise<void> {
    await apiClient.delete(`/api/imaging/reports/${reportNumber}/`);
  },

  /**
   * Get the URL for downloading report PDF.
   */
  getReportPdfUrl(reportNumber: string): string {
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}/api/imaging/reports/${reportNumber}/pdf/`;
  },
};

export default imagingApi;
