import { apiClient } from './client';
import { PaginatedPatientSchema, PatientEncounterArraySchema, PatientSchema } from '@/lib/schemas/patient.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { PaginatedResponse } from '@/lib/types/common';
import type { Patient, PatientCreateData, PatientEncounter, PatientListParams } from '@/lib/types/patient';

export const patientsApi = {
  async list(params: PatientListParams = {}): Promise<PaginatedResponse<Patient>> {
    const response = await apiClient.get('/api/patients/', { params });
    return parseResponse(PaginatedPatientSchema, response.data, { context: 'patients.list' });
  },

  async get(id: number): Promise<Patient> {
    const response = await apiClient.get(`/api/patients/${id}/`);
    return parseResponse(PatientSchema, response.data, { context: 'patients.get' });
  },

  async create(data: PatientCreateData): Promise<Patient> {
    const response = await apiClient.post('/api/patients/', data);
    return parseResponse(PatientSchema, response.data, { context: 'patients.create' });
  },

  async getEncounters(patientId: number): Promise<PatientEncounter[]> {
    const response = await apiClient.get('/api/encounters/', { params: { patient: patientId } });
    const parsed = parseResponse(PatientEncounterArraySchema, response.data, { context: 'patients.getEncounters' });
    return parsed.results;
  },

  async getQRCode(patientId: number): Promise<{ qr_data_uri: string; qr_payload: string; mrn: string; patient_name: string }> {
    const response = await apiClient.get(`/api/patients/${patientId}/qr-code/`);
    return response.data;
  },
};