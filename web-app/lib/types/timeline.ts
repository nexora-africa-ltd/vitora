/**
 * Timeline event types for patient history view
 */

export type TimelineEventType =
  | 'encounter'
  | 'lab_result'
  | 'prescription'
  | 'vital_alert'
  | 'diagnosis'
  | 'admission'
  | 'discharge';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: {
    encounterId?: number;
    encounterType?: string;
    status?: string;
    severity?: 'normal' | 'warning' | 'critical';
    provider?: string;
    icd10Code?: string;
    labTestName?: string;
    labResult?: string;
    medicationName?: string;
    [key: string]: unknown;
  };
}

export interface TimelineFilters {
  eventTypes: TimelineEventType[];
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface PatientHistoryParams {
  patientId: number;
  filters?: TimelineFilters;
  page?: number;
  pageSize?: number;
}

export interface PatientHistoryResponse {
  events: TimelineEvent[];
  totalCount: number;
  hasMore: boolean;
  summary: {
    totalEncounters: number;
    totalLabResults: number;
    totalPrescriptions: number;
    lastVisit?: string;
  };
}
