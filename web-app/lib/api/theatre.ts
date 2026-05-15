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
  TheatreAvailabilitySchema,
  SurgeryCaseListSchema,
  SurgeryCaseDetailSchema,
  CaseSchedulingContextSchema,
  SurgicalTeamMemberSchema,
  WHOChecklistSchema,
  AnesthesiaRecordSchema,
  IntraOpVitalSchema,
  OperativeNoteSchema,
  TheatreConsumableSchema,
  TheatreReportSummarySchema,
  PACURecordSchema,
  PACUVitalSchema,
  PaginatedOperatingTheatreSchema,
  PaginatedSurgeryCaseSchema,
  TheatreEquipmentTypeListSchema,
  TheatreEquipmentTypeDetailSchema,
  CaseEquipmentRequirementSchema,
  PaginatedTheatreEquipmentTypeSchema,
} from '@/lib/schemas/theatre.schema';
import type {
  OperatingTheatreList,
  OperatingTheatreDetail,
  TheatreAvailability,
  SurgeryCaseList,
  SurgeryCaseDetail,
  CaseSchedulingContext,
  SurgicalTeamMember,
  WHOChecklist,
  AnesthesiaRecord,
  IntraOpVital,
  OperativeNote,
  TheatreConsumable,
  TheatreReportSummary,
  PACURecord,
  PACUVital,
  PaginatedOperatingTheatres,
  PaginatedSurgeryCases,
  TheatreEquipmentTypeList,
  TheatreEquipmentTypeDetail,
  CaseEquipmentRequirement,
  PaginatedTheatreEquipmentTypes,
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
  PACUUpdateData,
  TheatreListParams,
  SurgeryCaseListParams,
  TheatreReportParams,
  TheatreEquipmentTypeCreateData,
  TheatreEquipmentTypeListParams,
  CaseEquipmentCreateData,
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

  async getTheatreAvailability(id: number, date: string): Promise<TheatreAvailability> {
    const response = await apiClient.get(`/api/theatre/operating-theatres/${id}/availability/`, {
      params: { date },
    });
    return parseResponse(TheatreAvailabilitySchema, response.data, {
      context: 'theatreApi.getTheatreAvailability',
    });
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

  async getCaseSchedulingContext(caseNumber: string): Promise<CaseSchedulingContext> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/scheduling-context/`);
    return parseResponse(CaseSchedulingContextSchema, response.data, {
      context: 'theatreApi.getCaseSchedulingContext',
    });
  },

  async createCase(data: SurgeryCaseCreateData): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post('/api/theatre/cases/', data);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.createCase',
    });
  },

  async linkEncounter(caseNumber: string): Promise<SurgeryCaseDetail> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/link-encounter/`);
    return parseResponse(SurgeryCaseDetailSchema, response.data, {
      context: 'theatreApi.linkEncounter',
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

  async getReportSummary(params?: TheatreReportParams): Promise<TheatreReportSummary> {
    const response = await apiClient.get('/api/theatre/cases/reports/summary/', { params });
    return parseResponse(TheatreReportSummarySchema, response.data, {
      context: 'theatreApi.getReportSummary',
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
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/team/add/`, data);
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
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/anesthesia/create/`, data);
    return parseResponse(AnesthesiaRecordSchema, response.data, {
      context: 'theatreApi.createAnesthesiaRecord',
    });
  },

  async updateAnesthesiaRecord(
    caseNumber: string,
    data: Partial<AnesthesiaRecordCreateData>
  ): Promise<AnesthesiaRecord> {
    const response = await apiClient.patch(`/api/theatre/cases/${caseNumber}/anesthesia/update/`, data);
    return parseResponse(AnesthesiaRecordSchema, response.data, {
      context: 'theatreApi.updateAnesthesiaRecord',
    });
  },

  async addIntraOpVital(caseNumber: string, data: Record<string, unknown>): Promise<IntraOpVital> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/anesthesia/vitals/`, data);
    return parseResponse(IntraOpVitalSchema, response.data, {
      context: 'theatreApi.addIntraOpVital',
    });
  },

  async updateIntraOpVital(
    caseNumber: string,
    vitalId: number,
    data: Record<string, unknown>
  ): Promise<IntraOpVital> {
    const response = await apiClient.patch(
      `/api/theatre/cases/${caseNumber}/anesthesia/vitals/${vitalId}/`,
      data
    );
    return parseResponse(IntraOpVitalSchema, response.data, {
      context: 'theatreApi.updateIntraOpVital',
    });
  },

  async deleteIntraOpVital(caseNumber: string, vitalId: number): Promise<void> {
    await apiClient.delete(
      `/api/theatre/cases/${caseNumber}/anesthesia/vitals/${vitalId}/delete/`
    );
  },

  async bulkAddIntraOpVitals(
    caseNumber: string,
    data: Record<string, unknown>[]
  ): Promise<IntraOpVital[]> {
    const response = await apiClient.post(
      `/api/theatre/cases/${caseNumber}/anesthesia/vitals/bulk/`,
      data
    );
    return parseResponse(z.array(IntraOpVitalSchema), response.data, {
      context: 'theatreApi.bulkAddIntraOpVitals',
    });
  },

  async listIntraOpVitals(caseNumber: string): Promise<IntraOpVital[]> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/anesthesia/vitals/`);
    return parseResponse(z.array(IntraOpVitalSchema), response.data, {
      context: 'theatreApi.listIntraOpVitals',
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
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/operative-note/create/`, data);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.createOperativeNote',
    });
  },

  async updateOperativeNote(caseNumber: string, data: Partial<OperativeNoteCreateData>): Promise<OperativeNote> {
    const response = await apiClient.patch(`/api/theatre/cases/${caseNumber}/operative-note/update/`, data);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.updateOperativeNote',
    });
  },

  async signOperativeNote(caseNumber: string): Promise<OperativeNote> {
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/operative-note/sign/`);
    return parseResponse(OperativeNoteSchema, response.data, {
      context: 'theatreApi.signOperativeNote',
    });
  },

  async downloadOperativeNotePdf(caseNumber: string): Promise<Blob> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/operative-note/pdf/`, {
      responseType: 'blob',
    });
    return response.data;
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
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/consumables/add/`, data);
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
    const response = await apiClient.post(`/api/theatre/cases/${caseNumber}/pacu/create/`, data);
    return parseResponse(PACURecordSchema, response.data, {
      context: 'theatreApi.createPACURecord',
    });
  },

  async updatePACURecord(caseNumber: string, data: PACUUpdateData): Promise<PACURecord> {
    const response = await apiClient.patch(`/api/theatre/cases/${caseNumber}/pacu/update/`, data);
    return parseResponse(PACURecordSchema, response.data, {
      context: 'theatreApi.updatePACURecord',
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

  async downloadPACUPdf(caseNumber: string): Promise<Blob> {
    const response = await apiClient.get(`/api/theatre/cases/${caseNumber}/pacu/pdf/`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // =========================================================================
  //  Theatre Equipment Types
  // =========================================================================

  async listEquipmentTypes(params?: TheatreEquipmentTypeListParams): Promise<PaginatedTheatreEquipmentTypes> {
    const response = await apiClient.get('/api/theatre/equipment-types/', { params });
    return parseResponse(PaginatedTheatreEquipmentTypeSchema, response.data, {
      context: 'theatreApi.listEquipmentTypes',
    });
  },

  async getEquipmentType(id: number): Promise<TheatreEquipmentTypeDetail> {
    const response = await apiClient.get(`/api/theatre/equipment-types/${id}/`);
    return parseResponse(TheatreEquipmentTypeDetailSchema, response.data, {
      context: 'theatreApi.getEquipmentType',
    });
  },

  async createEquipmentType(data: TheatreEquipmentTypeCreateData): Promise<TheatreEquipmentTypeDetail> {
    const response = await apiClient.post('/api/theatre/equipment-types/', data);
    return parseResponse(TheatreEquipmentTypeDetailSchema, response.data, {
      context: 'theatreApi.createEquipmentType',
    });
  },

  async updateEquipmentType(id: number, data: Partial<TheatreEquipmentTypeCreateData>): Promise<TheatreEquipmentTypeDetail> {
    const response = await apiClient.patch(`/api/theatre/equipment-types/${id}/`, data);
    return parseResponse(TheatreEquipmentTypeDetailSchema, response.data, {
      context: 'theatreApi.updateEquipmentType',
    });
  },

  async deleteEquipmentType(id: number): Promise<void> {
    await apiClient.delete(`/api/theatre/equipment-types/${id}/`);
  },

  // =========================================================================
  //  Case Equipment Requirements
  // =========================================================================

  async listCaseEquipment(caseId: number): Promise<CaseEquipmentRequirement[]> {
    const response = await apiClient.get(`/api/theatre/cases/${caseId}/equipment/`);
    // API returns paginated response; extract results array
    const data = response.data?.results ?? response.data;
    return parseResponse(z.array(CaseEquipmentRequirementSchema), data, {
      context: 'theatreApi.listCaseEquipment',
    });
  },

  async addCaseEquipment(caseId: number, data: CaseEquipmentCreateData): Promise<CaseEquipmentRequirement> {
    const response = await apiClient.post(`/api/theatre/cases/${caseId}/equipment/`, data);
    return parseResponse(CaseEquipmentRequirementSchema, response.data, {
      context: 'theatreApi.addCaseEquipment',
    });
  },

  async updateCaseEquipment(caseId: number, requirementId: number, data: Partial<CaseEquipmentCreateData>): Promise<CaseEquipmentRequirement> {
    const response = await apiClient.patch(`/api/theatre/cases/${caseId}/equipment/${requirementId}/`, data);
    return parseResponse(CaseEquipmentRequirementSchema, response.data, {
      context: 'theatreApi.updateCaseEquipment',
    });
  },

  async removeCaseEquipment(caseId: number, requirementId: number): Promise<void> {
    await apiClient.delete(`/api/theatre/cases/${caseId}/equipment/${requirementId}/`);
  },

  async checkCaseEquipmentConflicts(caseId: number): Promise<CaseEquipmentRequirement[]> {
    const response = await apiClient.get(`/api/theatre/cases/${caseId}/equipment/check-conflicts/`);
    return parseResponse(z.array(CaseEquipmentRequirementSchema), response.data, {
      context: 'theatreApi.checkCaseEquipmentConflicts',
    });
  },
};
