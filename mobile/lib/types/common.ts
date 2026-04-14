export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Gender = 'M' | 'F' | 'O';

export type ReferralSource = 'self' | 'clinic' | 'other_facility';

export type EncounterStatus =
  | 'CREATED'
  | 'CHECKED_IN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'ORDERS_PLACED'
  | 'RESULTS_PENDING'
  | 'READY_TO_CLOSE'
  | 'CLOSED'
  | 'COMPLETED'
  | 'CANCELLED';
