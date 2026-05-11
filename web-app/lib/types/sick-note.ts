/**
 * Sick Note (Medical Certificate) types for Vitora HMIS.
 */

// =============================================================================
// Enums & Constants
// =============================================================================

export type SickNoteStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'REVOKED';

export const SICK_NOTE_STATUS_CONFIG: Record<
  SickNoteStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  ISSUED: { label: 'Issued', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  REVOKED: { label: 'Revoked', variant: 'destructive' },
};

// =============================================================================
// Interfaces
// =============================================================================

/** Full sick note detail */
export interface SickNote {
  id: number;
  note_number: string;
  // Patient
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number;
  // Clinician
  issued_by: number;
  issued_by_name: string;
  // Leave dates
  leave_start_date: string;
  leave_end_date: string;
  leave_days: number;
  // Diagnosis
  diagnosis_text: string;
  diagnosis_code: string;
  // Employer
  employer_name: string;
  employer_contact: string;
  // Clinical
  recommendations: string;
  notes: string;
  // Status
  status: string;
  status_display: string;
  is_active: boolean;
  issued_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoked_by_name: string;
  revoke_reason: string;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_name: string;
  // Timestamps
  created_at: string;
  updated_at: string;
}

/** Compact list item */
export interface SickNoteListItem {
  id: number;
  note_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number;
  status: string;
  status_display: string;
  diagnosis_text: string;
  leave_start_date: string;
  leave_end_date: string;
  leave_days: number;
  issued_by: number;
  issued_by_name: string;
  issued_at: string | null;
  created_at: string;
}

/** Data for creating a sick note */
export interface SickNoteCreateData {
  encounter: number;
  patient?: number;
  leave_start_date: string;
  leave_end_date: string;
  diagnosis_text: string;
  diagnosis_code?: string;
  employer_name?: string;
  employer_contact?: string;
  recommendations?: string;
  notes?: string;
}

/** Query params for listing sick notes */
export interface SickNoteListParams {
  page?: number;
  status?: SickNoteStatus;
  patient?: number;
  encounter?: number;
  issued_by?: number;
  search?: string;
  leave_start_after?: string;
  leave_start_before?: string;
}

/** Paginated response */
export interface PaginatedSickNoteResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SickNoteListItem[];
}

/** Stats response */
export interface SickNoteStats {
  total: number;
  draft: number;
  issued: number;
  cancelled: number;
  revoked: number;
}
