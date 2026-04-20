/**
 * Theatre API Client for Vitora HMIS
 *
 * Implements all theatre-related API operations including:
 * - Operating theatre management
 * - Surgery case workflow
 * - Surgical team management
 * - WHO Safety Checklist (3 phases)
 * - Anesthesia records
 * - Operative notes
 * - PACU records
 *
 * @see backend/hmis/apps/theatre/
 */
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  OperatingTheatreListSchema,
  OperatingTheatreDetailSchema,
  SurgeryCaseListSchema,
  SurgeryCaseDetailSchema,
  SurgicalTeamMemberSchema,
  WHOChecklistSchema,
  AnesthesiaRecordSchema,
  IntraOpVitalSchema,
  OperativeNoteSchema,
  TheatreConsumableSchema,
  PACURecordSchema,
  PACUVitalSchema,
  PaginatedOperatingTheatreSchema,
  PaginatedSurgeryCaseSchema,
} from '@/lib/schemas/theatre.schema';
import type {
  OperatingTheatreList,
  OperatingTheatreDetail,
  SurgeryCaseList,
  SurgeryCaseDetail,
  SurgicalTeamMember,
  WHOChecklist,
  AnesthesiaRecord,
  IntraOpVital,
  OperativeNote,
  TheatreConsumable,
  PACURecord,
  PACUVital,
  PaginatedOperatingTheatres,
  PaginatedSurgeryCases,
  OperatingTheatreCreateData,
  SurgeryCaseCreateData,
  CaseScheduleData,
  CaseCancelData,
  CasePostponeData,
  TeamMemberCreateData,
  WHOSignInData,
  WHOTimeOutData,
  WHOSignOutData,
  AnesthesiaRecordCreateData,
  OperativeNoteCreateData,
  PACUDischargeData,
  TheatreListParams,
  SurgeryCaseListParams,
} from '@/lib/types/theatre';
import { z } from 'zod';

export const theatreApi = {
  // =========================================================================
  //  Operating Theatres
  // =========================================================================

  async listTheatres(params?: TheatreListParams): Promise<PaginatedOperatingTheatres> {
    const response = await apiClient.get('/api/theatre/operating-theatres/', { params });
    return parseResponse(PaginatedOperatingTheatreSchema, response.data, {
      context: 'theatreApi.listTheatres',
    });
  },

  async getTheatre(id: number): Promise<OperatingTheatreDetail> {
    const response = await apiClient.get(`/api/theatre/operating-theatres/${id}/`);
    return parseResponse(OperatingTheatreDetailSchema, response.data, {
      context: 'theatreApi.getTheatre',
    });
  },

  async createTheatre(data: OperatingTheatreCreateData): Promise<OperatingTheatreDetail> {
    const response = await apiClient.post('/api/theatre/operating-theatres/', data);
    return parseResponse(OperatingTheatreDetailSchema, response.data, {
      context: 'theatreApi.createTheatre',
    });
  },

  async updateTheatre(id: number, data: Partial<OperatingTheatreCreateData>): Promise<OperatingTheatreDetail> {
    const response = await apiClient.patch(`/api/theatre/operating-theatres/${id}/`, data);
    return parseResponse(OperatingTheatreDetailSchema, response.data, {
      context: 'theatreApi.updateTheatre',
    });
  },

  async getTheatreAvailability(id: number, date: string): Promise<{ slots: string[] }> {
    const response = await apiClient.get(`/api/theatre/operating-theatres/${id}/availability/`, {
      params: { date },
    });
    return response.data;
  },

  // =========================================================================
  //  Surgery Cases
  // =========================================================================

  async listCases(params?: SurgeryCaseListParams): Promise<PaginatedSurgeryCases> {
    const response = await apiClient.get('/api/theatre/cases/', { params });
    return parseResponse(PaginatedSurgeryCaseSchema, response.data, {
      context: 'theatreApi.listCases',
    });
  },

  async getCase(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.getCase',
    });
  },

  async createCase(data: SurgeryCaseCreateData): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post('/api/theatre/cases/', data);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.createCase',
    });
  },

  async getDailyList(date: string): Promise<SurgeryCaseList[]> {
    const response = await apiClient.get('/api/theatre/cases/daily-list/', {
      params: { date },
    });
    return parseResponse(z.array(SurgeryCaseListSchema), response.data, {
      context: 'theatreApi.getDailyList',
    });
  },

  // =========================================================================
  //  Case Workflow Actions
  // =========================================================================

  async scheduleCase(caseNumber: string, data?: CaseScheduleData): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/schedule/`, data ?? {});
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.scheduleCase',
    });
  },

  async startPreOp(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/start-pre-op/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.startPreOp',
    });
  },

  async enterTheatre(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/enter-theatre/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.enterTheatre',
    });
  },

  async startSurgery(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/start-surgery/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.startSurgery',
    });
  },

  async endSurgery(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/end-surgery/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.endSurgery',
    });
  },

  async enterPACU(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/enter-pacu/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.enterPACU',
    });
  },

  async dischargeCase(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/discharge/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.dischargeCase',
    });
  },

  async cancelCase(caseNumber: string, data: CaseCancelData): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/cancel/`, data);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.cancelCase',
    });
  },

  async postponeCase(caseNumber: string, data: CasePostponeData): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/postpone/`, data);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.postponeCase',
    });
  },

  // =========================================================================
  //  Surgical Team
  // =========================================================================

  async listTeam(caseNumber: string): Promise<SurgicalTeamMember[]> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/team/`);
    return parseResponse(z.array(SurgicalTeamMemberSchema), response.data, {
      context: 'theatreApi.listTeam',
    });
  },

  async addTeamMember(caseNumber: string, data: TeamMemberCreateData): Promise<SurgicalTeamMember> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/team/`, data);
    return parseResponse(SurgicalTeamMemberSchema, response.data, {
      context: 'theatreApi.addTeamMember',
    });
  },

  async removeTeamMember(caseNumber: string, memberId: number): Promise<void> {
    await apiClient.delete(`/api/theatre/cases/${caseNumber}/team/${memberId}/`);
  },

  // =========================================================================
  //  WHO Safety Checklist
  // =========================================================================

  async getWHOChecklist(caseNumber: string): Promise<WHOChecklist> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/who-checklist/`);
    return parseResponse(WHOChecklistSchema, response.data, {
      context: 'theatreApi.getWHOChecklist',
    });
  },

  async completeSignIn(caseNumber: string, data: WHOSignInData): Promise<WHOChecklist> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/who-checklist/sign-in/`, data);
    return parseResponse(WHOChecklistSchema, response.data, {
      context: 'theatreApi.completeSignIn',
    });
  },

  async completeTimeOut(caseNumber: string, data: WHOTimeOutData): Promise<WHOChecklist> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/who-checklist/time-out/`, data);
    return parseResponse(WHOChecklistSchema, response.data, {
      context: 'theatreApi.completeTimeOut',
    });
  },

  async completeSignOut(caseNumber: string, data: WHOSignOutData): Promise<WHOChecklist> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/who-checklist/sign-out/`, data);
    return parseResponse(WHOChecklistSchema, response.data, {
      context: 'theatreApi.completeSignOut',
    });
  },

  // =========================================================================
  //  Anesthesia Record
  // =========================================================================

  async getAnesthesiaRecord(caseNumber: string): Promise<AnesthesiaRecord> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/anesthesia/`);
    return parseResponse(AnesthesiaRecordSchema, response.data, {
      context: 'theatreApi.getAnesthesiaRecord',
    });
  },

  async createAnesthesiaRecord(caseNumber: string, data: AnesthesiaRecordCreateData): Promise<AnesthesiaRecord> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/anesthesia/`, data);
    return parseResponse(AnesthesiaRecordSchema, response.data, {
      context: 'theatreApi.createAnesthesiaRecord',
    });
  },

  async addIntraOpVital(caseNumber: string, data: Record<string, unknown>): Promise<IntraOpVital> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/anesthesia/vitals/`, data);
    return parseResponse(IntraOpVitalSchema, response.data, {
      context: 'theatreApi.addIntraOpVital',
    });
  },

  // =========================================================================
  //  Operative Note
  // =========================================================================

  async getOperativeNote(caseNumber: string): Promise<OperativeNote> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/operative-note/`);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.getOperativeNote',
    });
  },

  async createOperativeNote(caseNumber: string, data: OperativeNoteCreateData): Promise<OperativeNote> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/operative-note/`, data);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.createOperativeNote',
    });
  },

  async signOperativeNote(caseNumber: string): Promise<OperativeNote> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/operative-note/sign/`);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.signOperativeNote',
    });
  },

  // =========================================================================
  //  Consumables
  // =========================================================================

  async listConsumables(caseNumber: string): Promise<TheatreConsumable[]> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/consumables/`);
    return parseResponse(z.array(TheatreConsumableSchema), response.data, {
      context: 'theatreApi.listConsumables',
    });
  },

  async addConsumable(caseNumber: string, data: Record<string, unknown>): Promise<TheatreConsumable> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/consumables/`, data);
    return parseResponse(TheatreConsumableSchema, response.data, {
      context: 'theatreApi.addConsumable',
    });
  },

  async removeConsumable(caseNumber: string, consumableId: number): Promise<void> {
    await apiClient.delete(`/api/theatre/cases/${caseNumber}/consumables/${consumableId}/`);
  },

  // =========================================================================
  //  PACU Record
  // =========================================================================

  async getPACURecord(caseNumber: string): Promise<PACURecord> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/pacu/`);
    return parseResponse(PACURecordSchema, response.data, {
      context: 'theatreApi.getPACURecord',
    });
  },

  async createPACURecord(caseNumber: string, data: Record<string, unknown>): Promise<PACURecord> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/pacu/`, data);
    return parseResponse(PACURecordSchema, response.data, {
      context: 'theatreApi.createPACURecord',
    });
  },

  async addPACUVital(caseNumber: string, data: Record<string, unknown>): Promise<PACUVital> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/pacu/vitals/`, data);
    return parseResponse(PACUVitalSchema, response.data, {
      context: 'theatreApi.addPACUVital',
    });
  },

  async dischargePACU(caseNumber: string, data: PACUDischargeData): Promise<PACURecord> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/pacu/discharge/`, data);
    return parseResponse(PACURecordSchema, response.data, {
      context: 'theatreApi.dischargePACU',
    });
  },
};
