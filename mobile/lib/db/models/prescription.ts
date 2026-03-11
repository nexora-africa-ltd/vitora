import type { Prescription } from '@/lib/types/pharmacy';

import type { LocalPrescriptionRecord } from '../schema';

export function toLocalPrescriptionRecord(prescription: Prescription, syncedAt?: string): LocalPrescriptionRecord {
  return {
    ...prescription,
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
    last_synced_at: syncedAt ?? prescription.updated_at,
  };
}

export function sortPrescriptions(records: LocalPrescriptionRecord[]): LocalPrescriptionRecord[] {
  return [...records].sort((left, right) => {
    const rightTime = Date.parse(right.created_at);
    const leftTime = Date.parse(left.created_at);
    return rightTime - leftTime;
  });
}
