/**
 * Sick Notes API Client
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  SickNoteSchema,
  SickNoteListItemSchema,
  PaginatedSickNoteListSchema,
  SickNoteStatsSchema,
} from '@/lib/schemas/sick-note.schema';
import type {
  SickNote,
  SickNoteListItem,
  SickNoteCreateData,
  SickNoteListParams,
  PaginatedSickNoteResponse,
  SickNoteStats,
} from '@/lib/types/sick-note';
import { z } from 'zod';

const BASE_URL = '/api/sick-notes';

export const sickNotesApi = {
  /** List sick notes with filtering/pagination */
  list: async (params?: SickNoteListParams): Promise<PaginatedSickNoteResponse> => {
    const response = await apiClient.get(`${BASE_URL}/`, { params });
    return parseResponse(PaginatedSickNoteListSchema, response.data, {
      context: 'sickNotesApi.list',
    });
  },

  /** Get single sick note detail */
  get: async (id: number): Promise<SickNote> => {
    const response = await apiClient.get(`${BASE_URL}/${id}/`);
    return parseResponse(SickNoteSchema, response.data, {
      context: 'sickNotesApi.get',
    });
  },

  /** Create a new sick note */
  create: async (data: SickNoteCreateData): Promise<SickNote> => {
    const response = await apiClient.post(`${BASE_URL}/`, data);
    return parseResponse(SickNoteSchema, response.data, {
      context: 'sickNotesApi.create',
    });
  },

  /** Issue a draft sick note (DRAFT → ISSUED) */
  issue: async (id: number): Promise<SickNote> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/issue/`);
    return parseResponse(SickNoteSchema, response.data, {
      context: 'sickNotesApi.issue',
    });
  },

  /** Revoke an issued sick note (ISSUED → REVOKED) */
  revoke: async (id: number, reason: string): Promise<SickNote> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/revoke/`, { reason });
    return parseResponse(SickNoteSchema, response.data, {
      context: 'sickNotesApi.revoke',
    });
  },

  /** Cancel a draft sick note (DRAFT → CANCELLED) */
  cancel: async (id: number): Promise<SickNote> => {
    const response = await apiClient.post(`${BASE_URL}/${id}/cancel/`);
    return parseResponse(SickNoteSchema, response.data, {
      context: 'sickNotesApi.cancel',
    });
  },

  /** Get sick notes for a specific encounter */
  forEncounter: async (encounterId: number): Promise<SickNoteListItem[]> => {
    const response = await apiClient.get(`${BASE_URL}/for_encounter/`, {
      params: { encounter_id: encounterId },
    });
    return parseResponse(z.array(SickNoteListItemSchema), response.data, {
      context: 'sickNotesApi.forEncounter',
    });
  },

  /** Get sick notes for a specific patient */
  forPatient: async (patientId: number): Promise<SickNoteListItem[]> => {
    const response = await apiClient.get(`${BASE_URL}/for_patient/`, {
      params: { patient_id: patientId },
    });
    return parseResponse(z.array(SickNoteListItemSchema), response.data, {
      context: 'sickNotesApi.forPatient',
    });
  },

  /** Get sick note stats */
  stats: async (): Promise<SickNoteStats> => {
    const response = await apiClient.get(`${BASE_URL}/stats/`);
    return parseResponse(SickNoteStatsSchema, response.data, {
      context: 'sickNotesApi.stats',
    });
  },
};
