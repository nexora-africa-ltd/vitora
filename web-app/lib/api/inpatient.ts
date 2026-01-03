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

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export const inpatientApi = {
  async listWards(): Promise<InpatientWard[]> {
    const response = await apiClient.get<InpatientWard[]>('/api/inpatient/wards/');
    return response.data;
  },

  async getWard(wardId: number): Promise<InpatientWard> {
    const response = await apiClient.get<InpatientWard>(`/api/inpatient/wards/${wardId}/`);
    return response.data;
  },

  async listWardBeds(
    wardId: number,
    params?: Omit<BedListParams, 'ward'> & { page?: number; page_size?: number }
  ): Promise<Paginated<Bed> | Bed[]> {
    const response = await apiClient.get(`/api/inpatient/wards/${wardId}/beds/`, { params });
    return response.data as any;
  },

  async listBeds(params?: BedListParams): Promise<Bed[] | { results: Bed[] }> {
    const response = await apiClient.get('/api/inpatient/beds/', { params });
    return response.data as any;
  },

  async updateBed(bedId: number, data: Partial<Bed>): Promise<Bed> {
    const response = await apiClient.patch<Bed>(`/api/inpatient/beds/${bedId}/`, data);
    return response.data;
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

  async acceptAdmissionRecommendation(recommendationId: number, userId: number) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/accept/`,
      { user: userId }
    );
    return response.data;
  },

  async declineAdmissionRecommendation(recommendationId: number, userId: number, reason: string) {
    const response = await apiClient.post<AdmissionRecommendation>(
      `/api/inpatient/admission-recommendations/${recommendationId}/decline/`,
      { user: userId, reason }
    );
    return response.data;
  },

  async listAdmissions(params?: AdmissionListParams): Promise<AdmissionListResponse> {
    const response = await apiClient.get<AdmissionListResponse>('/api/inpatient/admissions/', {
      params,
    });
    return response.data;
  },

  async getAdmission(admissionId: number): Promise<Admission> {
    const response = await apiClient.get<Admission>(`/api/inpatient/admissions/${admissionId}/`);
    return response.data;
  },

  async createAdmission(data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.post<Admission>('/api/inpatient/admissions/', data);
    return response.data;
  },

  async updateAdmission(admissionId: number, data: Partial<Admission>): Promise<Admission> {
    const response = await apiClient.patch<Admission>(`/api/inpatient/admissions/${admissionId}/`, data);
    return response.data;
  },
};
