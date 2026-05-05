/**
 * HL7 v2 messaging type definitions.
 *
 * Types for HL7 endpoint CRUD and message monitoring.
 * Based on backend model at hmis/apps/hl7/models.py
 */

// HL7 endpoint type
export type HL7EndpointType = 'LIS' | 'RIS' | 'PAS' | 'PHARMACY' | 'OTHER';

// HL7 message direction
export type HL7MessageDirection = 'IN' | 'OUT';

// HL7 message status
export type HL7MessageStatus =
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'ACK'
  | 'FAILED'
  | 'DEAD';

/**
 * HL7 Endpoint (facility-scoped connection config)
 */
export interface HL7Endpoint {
  id: number;
  name: string;
  endpoint_type: HL7EndpointType;
  mllp_host: string;
  mllp_port: number;
  receiving_application: string;
  receiving_facility: string;
  sending_application: string;
  sending_facility: string;
  lis_code_system: string;
  is_active: boolean;
  use_ssl: boolean;
  timeout: number;
  max_retries: number;
  notes: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/**
 * HL7 Endpoint list item (lightweight)
 */
export interface HL7EndpointListItem {
  id: number;
  name: string;
  endpoint_type: HL7EndpointType;
  mllp_host: string;
  mllp_port: number;
  receiving_facility: string;
  is_active: boolean;
  created_at: string;
  message_count: number;
}

/**
 * HL7 Endpoint create/update payload
 */
export interface HL7EndpointPayload {
  name: string;
  endpoint_type: HL7EndpointType;
  mllp_host: string;
  mllp_port: number;
  receiving_application?: string;
  receiving_facility?: string;
  sending_application?: string;
  sending_facility?: string;
  lis_code_system?: string;
  is_active?: boolean;
  use_ssl?: boolean;
  timeout?: number;
  max_retries?: number;
  notes?: string;
}

/**
 * HL7 Endpoint connection test result
 */
export interface HL7EndpointTestResult {
  success: boolean;
  latency_ms: number;
  error: string;
}

/**
 * HL7 Endpoint list params
 */
export interface HL7EndpointListParams {
  page?: number;
  page_size?: number;
  endpoint_type?: HL7EndpointType;
  is_active?: boolean;
  search?: string;
  ordering?: string;
}

/**
 * HL7 message detail (full serializer)
 */
export interface HL7Message {
  id: number;
  message_type: string;
  direction: HL7MessageDirection;
  raw_message: string;
  message_control_id: string;
  status: HL7MessageStatus;
  retry_count: number;
  max_retries: number;
  last_error: string;
  ack_code: string;
  resource_type: string;
  resource_id: number | null;
  destination_host: string;
  destination_port: number | null;
  next_retry_at: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
  is_retryable: boolean;
}

/**
 * HL7 message list item (lightweight serializer)
 */
export interface HL7MessageListItem {
  id: number;
  message_type: string;
  direction: HL7MessageDirection;
  message_control_id: string;
  status: HL7MessageStatus;
  retry_count: number;
  last_error: string;
  ack_code: string;
  resource_type: string;
  resource_id: number | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  is_retryable: boolean;
}

/**
 * HL7 message list params
 */
export interface HL7MessageListParams {
  page?: number;
  page_size?: number;
  message_type?: string;
  direction?: HL7MessageDirection;
  status?: HL7MessageStatus;
  resource_type?: string;
  created_after?: string;
  created_before?: string;
  search?: string;
  ordering?: string;
}

/**
 * HL7 message statistics
 */
export interface HL7MessageStats {
  total: number;
  pending: number;
  sent: number;
  acknowledged: number;
  failed: number;
  dead_letter: number;
}
