import type { EncounterType } from '@/lib/types/encounter';
import type { EncounterStatus } from '@/lib/types/common';

type FinalizeGuidanceArgs = {
  hasDiagnosis: boolean;
  hasTreatmentPlan: boolean;
  hasPrescription?: boolean;
  disposition?: string | null;
  dispositionNotes?: string | null;
};

export type FinalizeGuidance = {
  ready: boolean;
  title: string;
  message: string;
};

const DISPOSITIONS_ALLOWING_CLOSE = new Set([
  'ADVICE_ONLY',
  'REFERRED',
  'ADMITTED',
  'FOLLOW_UP_SCHEDULED',
  'LEFT_AMA',
  'TREATED_DISCHARGED',
]);

const DISPOSITIONS_REQUIRING_NOTES = new Set(['ADVICE_ONLY', 'LEFT_AMA']);

type EncounterStatusPreview = {
  status: EncounterStatus;
  has_critical_vitals?: boolean;
};

export const ENCOUNTER_TYPE_OPTIONS: { label: string; value: EncounterType }[] = [
  { label: 'Outpatient (Walk-in)', value: 'OPD' },
  { label: 'Emergency', value: 'EMERGENCY' },
  { label: 'Inpatient', value: 'IPD' },
  { label: 'Antenatal Clinic', value: 'ANC' },
  { label: 'Paediatric Clinic', value: 'PAEDIATRIC' },
  { label: 'Dialysis Unit', value: 'DIALYSIS' },
  { label: 'Oncology Clinic', value: 'ONCOLOGY' },
  { label: 'Scheduled Outpatient', value: 'SCHEDULED_OPD' },
  { label: 'Follow-up Visit', value: 'FOLLOW_UP' },
  { label: 'Consultant Review', value: 'CONSULTANT_REVIEW' },
  { label: 'Stable Chronic Care', value: 'CHRONIC_STABLE' },
  { label: 'Specialist Clinic', value: 'SPECIALIST_CLINIC' },
  { label: 'Scheduled Procedure', value: 'PROCEDURE' },
  { label: 'Day Case', value: 'DAY_CASE' },
  { label: 'Ward Round', value: 'WARD_ROUND' },
  { label: 'Discharge Review', value: 'DISCHARGE_REVIEW' },
];

const VALID_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  CREATED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['TRIAGED', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'ORDERS_PLACED', 'READY_TO_CLOSE', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  ORDERS_PLACED: ['RESULTS_PENDING', 'READY_TO_CLOSE'],
  RESULTS_PENDING: ['READY_TO_CLOSE'],
  READY_TO_CLOSE: ['CLOSED'],
  CLOSED: [],
  COMPLETED: [],
  CANCELLED: [],
};

const STATUS_LABELS: Record<EncounterStatus, string> = {
  CREATED: 'Created',
  CHECKED_IN: 'Checked In',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  ORDERS_PLACED: 'Orders Placed',
  RESULTS_PENDING: 'Results Pending',
  READY_TO_CLOSE: 'Ready to Close',
  CLOSED: 'Closed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function getEncounterStatusLabel(status: EncounterStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function canTransitionTo(status: EncounterStatus, targetStatus: EncounterStatus): boolean {
  return VALID_TRANSITIONS[status]?.includes(targetStatus) ?? false;
}

export function canStartProgress(status: EncounterStatus): boolean {
  return canTransitionTo(status, 'IN_PROGRESS');
}

export function canCancel(status: EncounterStatus): boolean {
  return canTransitionTo(status, 'CANCELLED');
}

export function canFinalize(status: EncounterStatus): boolean {
  return status !== 'CLOSED' && status !== 'COMPLETED' && status !== 'CANCELLED';
}

export function hasTerminalStatus(status: EncounterStatus): boolean {
  return status === 'CLOSED' || status === 'COMPLETED' || status === 'CANCELLED';
}

export function getFinalizeGuidance({
  hasDiagnosis,
  hasTreatmentPlan,
  hasPrescription = false,
  disposition,
  dispositionNotes,
}: FinalizeGuidanceArgs): FinalizeGuidance {
  const hasDocumentation = hasDiagnosis || hasTreatmentPlan || hasPrescription;
  if (hasDocumentation) {
    return {
      ready: true,
      title: 'Ready to finalize',
      message: 'Clinical documentation is present, so the backend should allow encounter closure.',
    };
  }

  if (!disposition) {
    return {
      ready: false,
      title: 'Disposition or documentation required',
      message:
        'Add a diagnosis, treatment plan, or prescription, or set a closing disposition such as Advice Only, Referred, or Treated & Discharged.',
    };
  }

  if (!DISPOSITIONS_ALLOWING_CLOSE.has(disposition)) {
    return {
      ready: false,
      title: 'Disposition not sufficient',
      message: `Disposition '${disposition}' cannot close the encounter without clinical documentation.`,
    };
  }

  if (DISPOSITIONS_REQUIRING_NOTES.has(disposition) && !dispositionNotes?.trim()) {
    return {
      ready: false,
      title: 'Disposition notes required',
      message: `${disposition.replace(/_/g, ' ')} requires disposition notes documenting the advice given.`,
    };
  }

  if (disposition === 'REFERRED' && !dispositionNotes?.trim()) {
    return {
      ready: false,
      title: 'Referral details required',
      message: 'Referred encounters require disposition notes that specify the referral details.',
    };
  }

  return {
    ready: true,
    title: 'Ready to finalize',
    message: 'Disposition requirements are satisfied for mobile encounter closure.',
  };
}

export function mapEncounterTransitionError(message: string): string {
  if (message.includes('Cannot close encounter without clinical documentation')) {
    return 'This encounter cannot be finalized yet. Add a diagnosis, treatment plan, prescription, or a valid closing disposition.';
  }
  if (message.includes('requires disposition notes')) {
    return `${message} Update the encounter documentation and try finalizing again.`;
  }
  if (message.includes('Referred encounters require disposition notes')) {
    return `${message} Open Edit Encounter and capture the referral destination in disposition notes.`;
  }
  if (message.includes('already closed')) {
    return 'This encounter is already closed and cannot be finalized again from mobile.';
  }
  if (message.includes('cancelled encounter')) {
    return 'Cancelled encounters are terminal. Start a new encounter if the patient is returning.';
  }

  return message;
}

export function getEncounterPillTone(encounter: EncounterStatusPreview): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (encounter.has_critical_vitals) {
    return 'danger';
  }
  if (encounter.status === 'IN_PROGRESS' || encounter.status === 'TRIAGED') {
    return 'primary';
  }
  if (encounter.status === 'CANCELLED') {
    return 'danger';
  }
  if (encounter.status === 'CREATED' || encounter.status === 'CHECKED_IN') {
    return 'warning';
  }
  return 'neutral';
}

export function buildBloodPressure(systolic?: string, diastolic?: string): string | undefined {
  const sys = systolic?.trim();
  const dia = diastolic?.trim();

  if (!sys && !dia) {
    return undefined;
  }

  if (!sys || !dia) {
    return undefined;
  }

  return `${sys}/${dia}`;
}

export function splitBloodPressure(value?: string | null): { systolic: string; diastolic: string } {
  if (!value || !value.includes('/')) {
    return { systolic: '', diastolic: '' };
  }

  const [systolic, diastolic] = value.split('/');
  return {
    systolic: systolic ?? '',
    diastolic: diastolic ?? '',
  };
}
