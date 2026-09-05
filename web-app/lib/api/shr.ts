// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** API client for DHA Shared Health Record consent lifecycle actions. */

import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';
import { SHRConsentVisitListSchema, SHRConsentVisitSchema } from '@/lib/schemas/shr.schema';
import type { SHRConsentRequest, SHRConsentVisit } from '@/lib/types/shr';

export const shrApi = {
  async listConsents(): Promise<SHRConsentVisit[]> {
    const response = await apiClient.get('/api/shr/consents/');
    return parseResponse(SHRConsentVisitListSchema, response.data, { context: 'shrApi.listConsents' });
  },
  async requestConsent(data: SHRConsentRequest): Promise<SHRConsentVisit> {
    const response = await apiClient.post('/api/shr/consents/', data);
    return parseResponse(SHRConsentVisitSchema, response.data, { context: 'shrApi.requestConsent' });
  },
  async getConsent(id: number): Promise<SHRConsentVisit> {
    const response = await apiClient.get(`/api/shr/consents/${id}/`);
    return parseResponse(SHRConsentVisitSchema, response.data, { context: 'shrApi.getConsent' });
  },
};
