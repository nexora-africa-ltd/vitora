// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Types for browser-safe DHA Shared Health Record consent state. */

export type SHRVisitType = 'OP' | 'IP';
export type SHRRequestKind = 'STANDARD' | 'EMERGENCY' | 'DEPENDANT';
export type SHRVisitStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLOSURE_PENDING' | 'CLOSED' | 'FAILED';

export interface SHRConsentVisit {
  id: number;
  patient: number;
  encounter: number | null;
  consent_id: string;
  visit_id: string;
  visit_type: SHRVisitType;
  request_kind: SHRRequestKind;
  status: SHRVisitStatus;
  otp_record: string;
  requested_by: string;
  practitioner_id: string;
  representative_cr_id: string;
  representative_relationship: string;
  patient_capable: boolean;
  emergency: boolean;
  incapacity_reason: string;
  start_date: string;
  end_date: string | null;
  approved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SHRConsentRequest {
  patient_id: number;
  requested_by: string;
  visit_type: SHRVisitType;
  request_kind?: SHRRequestKind;
  practitioner_id?: string;
}
