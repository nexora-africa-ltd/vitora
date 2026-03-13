import type { CommunityScreening, CommunityScreeningCreateData } from '@/lib/types/screening';

function buildResultSummary(data: CommunityScreeningCreateData): string {
  if (data.screening_type === 'MALNUTRITION') {
    const parts = [`MUAC ${data.muac_mm ?? 'n/a'} mm`];
    if (data.edema_present) {
      parts.push('edema present');
    }
    return parts.join(' · ');
  }

  if (data.screening_type === 'TB_CONTACT') {
    const parts = [] as string[];
    if (typeof data.cough_duration_days === 'number') {
      parts.push(`${data.cough_duration_days} day cough`);
    }
    if (data.household_contact_name) {
      parts.push(`contact ${data.household_contact_name}`);
    }
    return parts.join(' · ') || 'TB contact screening recorded';
  }

  return `RDT ${(data.malaria_rdt_result ?? 'not_done').replace(/_/g, ' ')}`;
}

export function buildOfflineScreeningRecord(id: number, data: CommunityScreeningCreateData): CommunityScreening {
  const timestamp = new Date().toISOString();
  return {
    cough_duration_days: data.cough_duration_days ?? null,
    captured_by: null,
    created_at: timestamp,
    chu_name: data.chu_name?.trim() || '',
    edema_present: data.edema_present ?? null,
    fever_present: data.fever_present ?? null,
    household_contact_name: data.household_contact_name?.trim() || '',
    id,
    local_only: true,
    location: data.location ?? null,
    malaria_rdt_result: data.malaria_rdt_result ?? null,
    malaria_treatment_referred: data.malaria_treatment_referred ?? null,
    muac_mm: data.muac_mm ?? null,
    notes: data.notes?.trim() || '',
    patient: data.patient ?? null,
    patient_mrn: data.patient_mrn ?? null,
    patient_name: data.patient_name ?? null,
    photo: data.photo ?? null,
    result_summary: buildResultSummary(data),
    screening_date: data.screening_date ?? timestamp.slice(0, 10),
    screening_type: data.screening_type,
    sync_error: null,
    sync_status: 'pending_upload',
    tb_referral_made: data.tb_referral_made ?? null,
    territory: data.territory?.trim() || '',
    updated_at: timestamp,
  };
}

export function toLocalScreeningRecord(record: Omit<CommunityScreening, 'local_only' | 'sync_error' | 'sync_status'> | CommunityScreening): CommunityScreening {
  const normalized = record as CommunityScreening;
  return {
    ...normalized,
    local_only: false,
    sync_error: null,
    sync_status: 'uploaded',
  };
}

export function sortScreenings(records: CommunityScreening[]): CommunityScreening[] {
  return [...records].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}