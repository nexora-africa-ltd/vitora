export type CommunityScreeningType = 'MALNUTRITION' | 'TB_CONTACT' | 'MALARIA_RDT';
export type CommunityScreeningSyncStatus = 'pending_upload' | 'upload_failed' | 'uploaded';
export type MalariaRdtResult = 'positive' | 'negative' | 'invalid' | 'not_done';

export interface ScreeningPhotoAttachment {
  uri: string;
  width?: number | null;
  height?: number | null;
  captured_at: string;
}

export interface ScreeningLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  captured_at: string;
}

export interface CommunityScreening {
  id: number;
  patient: number | null;
  patient_name: string | null;
  patient_mrn: string | null;
  screening_type: CommunityScreeningType;
  screening_date: string;
  chu_name: string;
  territory: string;
  result_summary: string;
  notes: string;
  muac_mm: number | null;
  edema_present: boolean | null;
  fever_present: boolean | null;
  cough_duration_days: number | null;
  household_contact_name: string;
  malaria_rdt_result: MalariaRdtResult | null;
  malaria_treatment_referred: boolean | null;
  tb_referral_made: boolean | null;
  location: ScreeningLocation | null;
  photo: ScreeningPhotoAttachment | null;
  captured_by?: number | null;
  created_at: string;
  updated_at: string;
  local_only: boolean;
  sync_status: CommunityScreeningSyncStatus;
  sync_error: string | null;
}

export interface CommunityScreeningCreateData {
  patient?: number | null;
  patient_name?: string | null;
  patient_mrn?: string | null;
  screening_type: CommunityScreeningType;
  screening_date?: string;
  chu_name?: string;
  territory?: string;
  notes?: string;
  muac_mm?: number | null;
  edema_present?: boolean | null;
  fever_present?: boolean | null;
  cough_duration_days?: number | null;
  household_contact_name?: string;
  malaria_rdt_result?: MalariaRdtResult | null;
  malaria_treatment_referred?: boolean | null;
  tb_referral_made?: boolean | null;
  location?: ScreeningLocation | null;
  photo?: ScreeningPhotoAttachment | null;
}

export interface CommunityScreeningListParams {
  modified_after?: string;
  page?: number;
  page_size?: number;
  patient?: number;
  screening_type?: CommunityScreeningType;
  sync_status?: CommunityScreeningSyncStatus;
}