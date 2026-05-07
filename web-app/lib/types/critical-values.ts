/**
 * Critical Value Notification type definitions.
 * Phase L6.2: Critical Value Management
 */

// =============================================================================
// Enums
// =============================================================================

export type CriticalNotificationStatus =
  | 'PENDING' | 'NOTIFIED' | 'READ_BACK'
  | 'ACKNOWLEDGED' | 'ESCALATED' | 'FAILED';

export type CriticalNotificationSeverity = 'CRITICAL' | 'PANIC';

export type CriticalNotificationMethod =
  | 'PHONE_CALL' | 'IN_PERSON' | 'SECURE_MESSAGE' | 'PAGER';

// =============================================================================
// Critical Value Range
// =============================================================================

export interface CriticalValueRange {
  id: number;
  test: number;
  test_name: string;
  test_code: string;
  critical_low: number | null;
  critical_high: number | null;
  panic_low: number | null;
  panic_high: number | null;
  unit: string;
  notification_deadline_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CriticalValueRangeCreateData {
  test: number;
  critical_low?: number | null;
  critical_high?: number | null;
  panic_low?: number | null;
  panic_high?: number | null;
  unit?: string;
  notification_deadline_minutes?: number;
}

// =============================================================================
// Critical Value Notification
// =============================================================================

export interface CriticalValueNotification {
  id: number;
  result: number;
  critical_range: number | null;
  status: CriticalNotificationStatus;
  severity: CriticalNotificationSeverity;
  test_name: string;
  critical_value: string;
  patient_name: string;
  patient_mrn: string;
  notification_method: CriticalNotificationMethod | null;
  notified_to: number | null;
  notified_to_name: string;
  notified_by: number | null;
  notified_by_name: string;
  detected_at: string;
  notified_at: string | null;
  read_back_at: string | null;
  read_back_value: string;
  read_back_verified: boolean;
  acknowledged_at: string | null;
  escalated_to: number | null;
  escalation_notes: string;
  is_overdue: boolean;
  minutes_elapsed: number | null;
  notification_time_minutes: number | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Action Data
// =============================================================================

export interface CriticalNotifyData {
  notified_to?: number;
  notified_to_name?: string;
  method?: CriticalNotificationMethod;
}

export interface CriticalReadBackData {
  read_back_value: string;
}

export interface CriticalEscalateData {
  escalated_to?: number;
  notes?: string;
}

// =============================================================================
// Compliance Stats
// =============================================================================

export interface CriticalValueCompliance {
  total_notifications: number;
  notified_within_deadline: number;
  compliance_rate: number;
  average_notification_minutes: number;
  overdue_count: number;
  acknowledged_count: number;
  pending_count: number;
  read_back_verified_count: number;
  read_back_rate: number;
}
