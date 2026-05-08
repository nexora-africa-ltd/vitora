/**
 * Worksheets & Label Printing API client.
 * Phase L5.3
 */

import { apiClient } from './client';
import type {
  WorksheetTemplate,
  WorksheetTemplateCreateData,
  Worksheet,
  WorksheetGenerateData,
  LabelTemplate,
  LabelTemplateCreateData,
  LabelPrintJob,
  LabelGenerateData,
} from '@/lib/types/worksheets';
import { parseResponse } from '@/lib/schemas/validation';
import {
  WorksheetTemplateSchema,
  PaginatedWorksheetTemplateSchema,
  WorksheetSchema,
  WorksheetListItemSchema,
  PaginatedWorksheetSchema,
  LabelTemplateSchema,
  PaginatedLabelTemplateSchema,
  LabelPrintJobSchema,
  PaginatedLabelPrintJobSchema,
} from '@/lib/schemas/worksheets.schema';

const BASE = '/api/lab/worksheets';

export const worksheetsApi = {
  // ===========================================================================
  // Worksheet Templates
  // ===========================================================================

  async listTemplates(params?: { is_active?: boolean }) {
    const response = await apiClient.get(`${BASE}/templates/`, { params });
    return parseResponse(PaginatedWorksheetTemplateSchema, response.data, {
      context: 'worksheetsApi.listTemplates',
    });
  },

  async getTemplate(id: number): Promise<WorksheetTemplate> {
    const response = await apiClient.get(`${BASE}/templates/${id}/`);
    return parseResponse(WorksheetTemplateSchema, response.data, {
      context: 'worksheetsApi.getTemplate',
    });
  },

  async createTemplate(data: WorksheetTemplateCreateData): Promise<WorksheetTemplate> {
    const response = await apiClient.post(`${BASE}/templates/`, data);
    return parseResponse(WorksheetTemplateSchema, response.data, {
      context: 'worksheetsApi.createTemplate',
    });
  },

  async updateTemplate(id: number, data: Partial<WorksheetTemplateCreateData>): Promise<WorksheetTemplate> {
    const response = await apiClient.patch(`${BASE}/templates/${id}/`, data);
    return parseResponse(WorksheetTemplateSchema, response.data, {
      context: 'worksheetsApi.updateTemplate',
    });
  },

  async deleteTemplate(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/templates/${id}/`);
  },

  async seedDefaultTemplates(): Promise<{ created: number; total: number; message: string }> {
    const response = await apiClient.post(`${BASE}/templates/seed_defaults/`);
    return response.data;
  },

  // ===========================================================================
  // Worksheets (Batches)
  // ===========================================================================

  async listWorksheets(params?: { status?: string; template?: number }) {
    const response = await apiClient.get(`${BASE}/batches/`, { params });
    return parseResponse(PaginatedWorksheetSchema, response.data, {
      context: 'worksheetsApi.listWorksheets',
    });
  },

  async getWorksheet(id: number): Promise<Worksheet> {
    const response = await apiClient.get(`${BASE}/batches/${id}/`);
    return parseResponse(WorksheetSchema, response.data, {
      context: 'worksheetsApi.getWorksheet',
    });
  },

  async generateWorksheet(data: WorksheetGenerateData): Promise<Worksheet> {
    const response = await apiClient.post(`${BASE}/batches/generate/`, data);
    return parseResponse(WorksheetSchema, response.data, {
      context: 'worksheetsApi.generateWorksheet',
    });
  },

  async markWorksheetPrinted(id: number): Promise<Worksheet> {
    const response = await apiClient.post(`${BASE}/batches/${id}/mark_printed/`);
    return parseResponse(WorksheetListItemSchema, response.data, {
      context: 'worksheetsApi.markWorksheetPrinted',
    }) as unknown as Worksheet;
  },

  async exportWorksheetCsv(id: number): Promise<Blob> {
    const response = await apiClient.get(`${BASE}/batches/${id}/export_csv/`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ===========================================================================
  // Label Templates
  // ===========================================================================

  async listLabelTemplates(params?: { label_type?: string; is_active?: boolean }) {
    const response = await apiClient.get(`${BASE}/labels/templates/`, { params });
    return parseResponse(PaginatedLabelTemplateSchema, response.data, {
      context: 'worksheetsApi.listLabelTemplates',
    });
  },

  async getLabelTemplate(id: number): Promise<LabelTemplate> {
    const response = await apiClient.get(`${BASE}/labels/templates/${id}/`);
    return parseResponse(LabelTemplateSchema, response.data, {
      context: 'worksheetsApi.getLabelTemplate',
    });
  },

  async createLabelTemplate(data: LabelTemplateCreateData): Promise<LabelTemplate> {
    const response = await apiClient.post(`${BASE}/labels/templates/`, data);
    return parseResponse(LabelTemplateSchema, response.data, {
      context: 'worksheetsApi.createLabelTemplate',
    });
  },

  async updateLabelTemplate(id: number, data: Partial<LabelTemplateCreateData>): Promise<LabelTemplate> {
    const response = await apiClient.patch(`${BASE}/labels/templates/${id}/`, data);
    return parseResponse(LabelTemplateSchema, response.data, {
      context: 'worksheetsApi.updateLabelTemplate',
    });
  },

  async deleteLabelTemplate(id: number): Promise<void> {
    await apiClient.delete(`${BASE}/labels/templates/${id}/`);
  },

  // ===========================================================================
  // Label Print Jobs
  // ===========================================================================

  async listPrintJobs(params?: { status?: string }) {
    const response = await apiClient.get(`${BASE}/labels/jobs/`, { params });
    return parseResponse(PaginatedLabelPrintJobSchema, response.data, {
      context: 'worksheetsApi.listPrintJobs',
    });
  },

  async getPrintJob(id: number): Promise<LabelPrintJob> {
    const response = await apiClient.get(`${BASE}/labels/jobs/${id}/`);
    return parseResponse(LabelPrintJobSchema, response.data, {
      context: 'worksheetsApi.getPrintJob',
    });
  },

  async generateLabels(data: LabelGenerateData): Promise<LabelPrintJob> {
    const response = await apiClient.post(`${BASE}/labels/jobs/generate/`, data);
    return parseResponse(LabelPrintJobSchema, response.data, {
      context: 'worksheetsApi.generateLabels',
    });
  },

  async markPrintJobPrinted(id: number): Promise<void> {
    await apiClient.post(`${BASE}/labels/jobs/${id}/mark_printed/`);
  },
};
