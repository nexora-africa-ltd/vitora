import type { County, SubCounty, Ward } from '@/lib/types/location';
import type { Patient, PatientCreateData } from '@/lib/types/patient';

import type { LocalPatientRecord } from '../schema';

function getLocalMrn(localId: number): string {
  return `OFFLINE-${Math.abs(localId)}`;
}

export function toLocalPatientRecord(patient: Patient, syncedAt?: string): LocalPatientRecord {
  return {
    ...patient,
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
    last_synced_at: syncedAt ?? patient.updated_at,
  };
}

export function buildOfflinePatientRecord(
  id: number,
  data: PatientCreateData,
  options: {
    county?: County | null;
    subCounty?: SubCounty | null;
    ward?: Ward | null;
  } = {}
): LocalPatientRecord {
  const timestamp = new Date().toISOString();

  return {
    id,
    mrn: getLocalMrn(id),
    cr_number: null,
    sha_number: null,
    first_name: data.first_name.trim(),
    middle_name: data.middle_name?.trim() || null,
    last_name: data.last_name.trim(),
    full_name: [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    date_of_birth: data.date_of_birth,
    age: null,
    gender: data.gender,
    identification_type: data.identification_type?.trim() || null,
    identification_number: data.identification_number?.trim() || null,
    phone_number: data.phone_number?.trim() || null,
    email: null,
    address: null,
    county: data.county,
    county_name: options.county?.name,
    sub_county: data.sub_county,
    sub_county_name: options.subCounty?.name,
    ward: data.ward ?? null,
    ward_name: options.ward?.name ?? null,
    village: data.village?.trim() || null,
    is_sensitive: false,
    consent_given: false,
    consent_date: null,
    sha_coverage_status: null,
    sha_checked_at: null,
    sha_eligible_until: null,
    sha_benefit_balance: null,
    sha_ineligibility_reason: null,
    sha_result: null,
    referral_source: data.referral_source ?? 'self',
    emergency_contact_name: data.emergency_contact_name?.trim() || null,
    emergency_contact_phone: data.emergency_contact_phone?.trim() || null,
    emergency_contact_relationship: data.emergency_contact_relationship?.trim() || null,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync_error: null,
    sync_state: 'pending_create',
    last_synced_at: null,
  };
}

export function matchesPatientSearch(patient: LocalPatientRecord, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystack = [
    patient.mrn,
    patient.first_name,
    patient.middle_name,
    patient.last_name,
    patient.full_name,
    patient.identification_number,
    patient.phone_number,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

export function sortPatients(records: LocalPatientRecord[]): LocalPatientRecord[] {
  return [...records].sort((left, right) => {
    const rightTime = Date.parse(right.created_at || right.updated_at);
    const leftTime = Date.parse(left.created_at || left.updated_at);
    return rightTime - leftTime;
  });
}
