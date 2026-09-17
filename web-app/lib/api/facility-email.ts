// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Facility email API client for SMTP provider presets and configuration upserts. */
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import { FacilityEmailConfigSchema, SMTPProviderPresetsSchema } from '@/lib/schemas/facility-email.schema';

export const facilityEmailApi = {
  async current() { const response = await apiClient.get('/api/core/facility-email-config/current/'); return response.status === 204 ? null : parseResponse(FacilityEmailConfigSchema, response.data, { context: 'facilityEmailApi.current' }); },
  async providers() { const response = await apiClient.get('/api/core/facility-email-config/providers/'); return parseResponse(SMTPProviderPresetsSchema, response.data, { context: 'facilityEmailApi.providers' }); },
  async save(data: Record<string, unknown>) { const response = await apiClient.post('/api/core/facility-email-config/', data); return parseResponse(FacilityEmailConfigSchema, response.data, { context: 'facilityEmailApi.save' }); },
  async testConnection(id: number) { const response = await apiClient.post(`/api/core/facility-email-config/${id}/test-connection/`); return parseResponse(FacilityEmailConfigSchema, response.data, { context: 'facilityEmailApi.testConnection' }); },
};
