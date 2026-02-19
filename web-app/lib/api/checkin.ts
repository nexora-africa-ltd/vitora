/**
 * Check-in API client for Vitora HMIS
 *
 * Sprint: Returning Patient Workflow - Sprint 1
 *
 * All responses are validated with Zod schemas.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PatientLookupResponseSchema,
  PatientSearchResponseSchema,
  CheckInResponseSchema,
  TodayCheckinsResponseSchema,
} from '@/lib/schemas/checkin.schema';
import type {
  PatientLookupResponse,
  PatientSearchResponse,
  CheckInRequest,
  CheckInResponse,
  TodayCheckinsResponse,
} from '@/lib/types/checkin';

export const checkinApi = {
  /**
   * Search for patients by MRN, phone, national ID, or name.
   *
   * Returns a list of matching patients for selection.
   * Clinical snapshot is loaded separately after selection via lookupPatient.
   *
   * @param query - Search query (MRN, phone, ID, or name)
   * @param limit - Maximum number of results (default: 10, max: 50)
   * @returns List of matching patients
   */
  async searchPatients(query: string, limit?: number): Promise<PatientSearchResponse> {
    const response = await apiClient.get<PatientSearchResponse>(
      `/api/checkin/search/`,
      { params: { q: query, limit } }
    );
    return parseResponse(PatientSearchResponseSchema, response.data, {
      context: 'checkinApi.searchPatients',
    }) as PatientSearchResponse;
  },

  /**
   * Look up a patient by MRN, phone, national ID, or name.
   *
   * Returns patient details with clinical snapshot and suggested visit context.
   *
   * @param query - Search query (MRN, phone, ID, or name)
   * @returns Patient lookup response with clinical snapshot
   */
  async lookupPatient(query: string): Promise<PatientLookupResponse> {
    const response = await apiClient.get<PatientLookupResponse>(
      `/api/checkin/lookup/`,
      { params: { q: query } }
    );
    return parseResponse(PatientLookupResponseSchema, response.data, {
      context: 'checkinApi.lookupPatient',
    }) as PatientLookupResponse;
  },

  /**
   * Check in a patient to triage or directly to a clinic.
   *
   * Creates:
   * - CheckIn record
   * - Encounter (if not exists)
   * - WaitingQueue entry (if going to triage)
   * - ClinicVisit entry (if direct to clinic)
   *
   * @param patientId - Patient ID
   * @param data - Check-in request data
   * @returns Check-in response with queue info
   */
  async checkinPatient(patientId: number, data: CheckInRequest): Promise<CheckInResponse> {
    const response = await apiClient.post<CheckInResponse>(
      `/api/checkin/patients/${patientId}/checkin/`,
      data
    );
    return parseResponse(CheckInResponseSchema, response.data, {
      context: 'checkinApi.checkinPatient',
    }) as CheckInResponse;
  },

  /**
   * Get today's check-ins list for front desk display.
   *
   * @param params - Optional filters (destination_clinic, status, page)
   * @returns Paginated list of today's check-ins
   */
  async getTodayCheckins(params?: {
    destination_clinic?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<TodayCheckinsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.destination_clinic) {
      searchParams.set('destination_clinic', String(params.destination_clinic));
    }
    if (params?.status) {
      searchParams.set('status', params.status);
    }
    if (params?.page) {
      searchParams.set('page', String(params.page));
    }
    if (params?.page_size) {
      searchParams.set('page_size', String(params.page_size));
    }

    const response = await apiClient.get<TodayCheckinsResponse>(
      `/api/checkin/today/?${searchParams.toString()}`
    );
    return parseResponse(TodayCheckinsResponseSchema, response.data, {
      context: 'checkinApi.getTodayCheckins',
    }) as TodayCheckinsResponse;
  },
};
