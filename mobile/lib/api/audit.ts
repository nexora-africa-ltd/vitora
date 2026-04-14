import { PaginatedAuditLogSchema } from '@/lib/schemas/audit.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { AuditLogListParams, PaginatedAuditLogResponse } from '@/lib/types/audit';

import { apiClient } from './client';

export const auditApi = {
  async listAuditLogs(params: AuditLogListParams = {}): Promise<PaginatedAuditLogResponse> {
    const response = await apiClient.get('/api/auditlogs/', { params });
    return parseResponse(PaginatedAuditLogSchema, response.data, { context: 'audit.listAuditLogs' });
  },
};
