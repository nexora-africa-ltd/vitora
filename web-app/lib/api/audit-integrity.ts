/**
 * Audit Integrity API client.
 *
 * Provides methods for audit log chain verification and integrity monitoring.
 * DHA Compliance: Gap #31 — Tamper-Resistant Audit Log (Sprint 3.C)
 *
 * All responses are validated with Zod schemas.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  AuditChainStatusSchema,
  AuditIntegrityResultSchema,
} from '@/lib/schemas/security.schema';
import type {
  AuditChainStatus,
  AuditIntegrityResult,
} from '@/lib/types/security';

export const auditIntegrityApi = {
  /**
   * Get the current audit chain integrity status.
   */
  getChainStatus: async (): Promise<AuditChainStatus> => {
    const response = await apiClient.get<AuditChainStatus>('/api/core/auditlogs/chain_status/');
    return parseResponse(AuditChainStatusSchema, response.data, {
      context: 'auditIntegrityApi.getChainStatus',
    });
  },

  /**
   * Trigger an on-demand integrity verification (admin only).
   */
  verifyIntegrity: async (): Promise<AuditIntegrityResult> => {
    const response = await apiClient.post<AuditIntegrityResult>('/api/core/auditlogs/verify_integrity/');
    return parseResponse(AuditIntegrityResultSchema, response.data, {
      context: 'auditIntegrityApi.verifyIntegrity',
    });
  },
};
