import type { PaginatedResponse } from '@/lib/types/common';

export interface AuditLogEntry {
  action: string;
  details: Record<string, unknown>;
  id: number;
  ip_address: string | null;
  patient_id: number | null;
  resource_id: number | null;
  resource_type: string;
  timestamp: string;
  user: number | null;
  user_agent: string | null;
  user_name: string;
  username: string;
}

export interface AuditLogListParams {
  action?: string;
  end_date?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  resource_type?: string;
  start_date?: string;
  user?: number;
}

export type PaginatedAuditLogResponse = PaginatedResponse<AuditLogEntry>;
