/**
 * Inpatient (Admissions/IPD) API client.
 */

import { apiClient } from './client';
import type {
  Admission,
  AdmissionListParams,
  AdmissionListResponse,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  AdmissionRecommendationListResponse,
  Bed,
  BedListParams,
  InpatientWard,
} from '@/lib/types/inpatient';

export const inpatientApi = {
  async listWards(): Promise<InpatientWard[]> {
    const response = await apiClient.get<InpatientWard[]>('/api/inpatient/wards/');
    return response.data;
  },

  async listBeds(params?: BedListParams): Promise<Bed[] | { results: Bed[] }> {
    const response = await apiClient.get('/api/inpatient/beds/', { params });
    return response.data as any;
  },

  async listAdmissionRecommendations(
    params?: AdmissionRecommendationListParams
  ): Promise<AdmissionRecommendationListResponse> {
    const response = await apiClient.get<AdmissionRecommendationListResponse>(
      '/api/inpatient/admission-recommendations/',
      { params }
    );
    return response.data;
  },

  async createAdmissionRecommendation(
    data: Partial<AdmissionRecommendation>
  ): Promise<AdmissionRecommendation> {
    const response = await apiClient.post<AdmissionRecommendation>(
      '/api/inpatient/admission-recommendations/',
      data
    );
    return response.data;
  },

  async listAdmissions(params?: AdmissionListParams): Promise<AdmissionListResponse> {
    const response = await apiClient.get<AdmissionListResponse>('/api/inpatient/admissions/', {
      params,
    });
    return response.data;
  },

  async createAdmission(data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.post<Admission>('/api/inpatient/admissions/', data);
    return response.data;
  },
};
