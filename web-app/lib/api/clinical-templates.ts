/**
 * Clinical Templates API Client
 * API functions for clinical assessment templates
 */

import { apiClient } from './client';
import { PaginatedResponse } from '@/lib/types';
import {
  ClinicalTemplate,
  ClinicalTemplateListParams,
  ClinicalTemplateCreateData,
} from '@/lib/types/clinical-template';

export const clinicalTemplatesApi = {
  /**
   * Get paginated list of clinical templates.
   */
  async list(params?: ClinicalTemplateListParams): Promise<PaginatedResponse<ClinicalTemplate>> {
    const response = await apiClient.get<PaginatedResponse<ClinicalTemplate>>(
      '/api/clinical-templates/',
      { params }
    );
    return response.data;
  },

  /**
   * Get a single clinical template by ID.
   */
  async get(id: number): Promise<ClinicalTemplate> {
    const response = await apiClient.get<ClinicalTemplate>(
      `/api/clinical-templates/${id}/`
    );
    return response.data;
  },

  /**
   * Search clinical templates.
   */
  async search(query: string, templateType?: string): Promise<ClinicalTemplate[]> {
    const response = await apiClient.get<PaginatedResponse<ClinicalTemplate>>(
      '/api/clinical-templates/',
      { params: { search: query, template_type: templateType, is_active: true } }
    );
    return response.data.results;
  },

  /**
   * Get templates for a specific specialty.
   */
  async getBySpecialty(specialty: string): Promise<ClinicalTemplate[]> {
    const response = await apiClient.get<PaginatedResponse<ClinicalTemplate>>(
      '/api/clinical-templates/',
      { params: { specialty, is_active: true } }
    );
    return response.data.results;
  },

  /**
   * Get suggested templates based on encounter context.
   */
  async getSuggested(params: {
    encounter_type?: string;
    chief_complaint?: string;
  }): Promise<ClinicalTemplate[]> {
    // For now, return active templates sorted by usage
    // In the future, this could use ML or rules to suggest relevant templates
    const response = await apiClient.get<PaginatedResponse<ClinicalTemplate>>(
      '/api/clinical-templates/',
      {
        params: {
          is_active: true,
          ordering: '-usage_count',
          page_size: 10,
        },
      }
    );
    return response.data.results;
  },

  /**
   * Create a new clinical template.
   */
  async create(data: ClinicalTemplateCreateData): Promise<ClinicalTemplate> {
    const response = await apiClient.post<ClinicalTemplate>(
      '/api/clinical-templates/',
      data
    );
    return response.data;
  },

  /**
   * Update a clinical template.
   */
  async update(
    id: number,
    data: Partial<ClinicalTemplateCreateData>
  ): Promise<ClinicalTemplate> {
    const response = await apiClient.patch<ClinicalTemplate>(
      `/api/clinical-templates/${id}/`,
      data
    );
    return response.data;
  },

  /**
   * Delete a clinical template.
   */
  async delete(id: number): Promise<void> {
    await apiClient.delete(`/api/clinical-templates/${id}/`);
  },

  /**
   * Record template usage (increments usage_count).
   */
  async recordUsage(id: number): Promise<void> {
    await apiClient.post(`/api/clinical-templates/${id}/record_usage/`);
  },
};
