import { apiClient } from './client';
import {
  CheckInPatientLookupSchema,
  CheckInPatientSearchResultsSchema,
  CheckInResponseSchema,
} from '@/lib/schemas/checkin.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  CheckInPatientLookup,
  CheckInPatientSearchResult,
  CheckInRequest,
  CheckInResponse,
} from '@/lib/types/checkin';

export const checkinApi = {
  async searchPatients(query: string, limit = 10): Promise<CheckInPatientSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const response = await apiClient.get('/api/checkin/search/', {
      params: { q: trimmed, limit },
    });
    const parsed = parseResponse(CheckInPatientSearchResultsSchema, response.data, { context: 'checkin.searchPatients' });
    return parsed.results;
  },

  async lookupPatient(query: string): Promise<CheckInPatientLookup> {
    const response = await apiClient.get('/api/checkin/lookup/', {
      params: { q: query.trim() },
    });
    return parseResponse(CheckInPatientLookupSchema, response.data, { context: 'checkin.lookupPatient' });
  },

  async create(patientId: number, data: CheckInRequest): Promise<CheckInResponse> {
    const response = await apiClient.post(`/api/checkin/patients/${patientId}/checkin/`, data);
    return parseResponse(CheckInResponseSchema, response.data, { context: 'checkin.create' });
  },
};