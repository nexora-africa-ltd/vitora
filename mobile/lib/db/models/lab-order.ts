import type { LabOrder } from '@/lib/types/laboratory';

import type { LocalLabOrderRecord } from '../schema';

export function toLocalLabOrderRecord(order: LabOrder, syncedAt?: string): LocalLabOrderRecord {
  return {
    ...order,
    local_only: false,
    sync_error: null,
    sync_state: 'synced',
    last_synced_at: syncedAt ?? order.updated_at,
  };
}

export function sortLabOrders(records: LocalLabOrderRecord[]): LocalLabOrderRecord[] {
  return [...records].sort((left, right) => {
    const rightTime = Date.parse(right.created_at);
    const leftTime = Date.parse(left.created_at);
    return rightTime - leftTime;
  });
}
