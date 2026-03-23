import type { DischargeType, MaternityContinuityAction } from '@/lib/types/inpatient';

// ---------------------------------------------------------------------------
// Discharge summary section types
// ---------------------------------------------------------------------------

export interface ParsedSection {
  cleanContent: string;
  advisories: { text: string; severity: 'warning' | 'critical' }[];
}

export interface DischargeSummarySection {
  id: string;
  title: string;
  content: string;
  source: 'template' | 'manual' | 'ai';
  provenance?: string;
  advisories?: ParsedSection['advisories'];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Section IDs that get routed to dedicated form fields instead of summary cards. */
export const ROUTED_SECTION_IDS = new Set([
  'discharge_medications', 'follow_up', 'follow_up_plan',
]);

/** Sections that duplicate existing page UI and should be hidden from cards entirely. */
export const HIDDEN_SECTION_IDS = new Set([
  'patient_information', 'reason_for_admission', 'discharge_diagnosis',
]);

export const DEFAULT_SECTION_TEMPLATES: Omit<DischargeSummarySection, 'id'>[] = [
  { title: 'Hospital Course', content: '', source: 'template' },
  { title: 'Significant Findings', content: '', source: 'template' },
  { title: 'Condition at Discharge', content: '', source: 'template' },
  { title: 'Patient Education', content: '', source: 'template' },
];

export const DISCHARGE_TYPES: { value: DischargeType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal Discharge' },
  { value: 'ROUTINE', label: 'Routine Discharge' },
  { value: 'AGAINST_ADVICE', label: 'Against Medical Advice' },
  { value: 'TRANSFERRED', label: 'Transfer to Another Facility' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'ABSCONDED', label: 'Absconded/Left Without Notice' },
];

export const MATERNITY_CONTINUITY_ACTIONS: { value: MaternityContinuityAction; label: string; description: string }[] = [
  {
    value: 'SCHEDULE_EARLY_PNC',
    label: 'Schedule Early PNC',
    description: 'Book the early postnatal follow-up date before discharge.',
  },
  {
    value: 'ROUTE_TO_PNC_QUEUE',
    label: 'Route Directly To PNC Queue',
    description: 'Send the mother straight to the PNC queue from discharge.',
  },
];

export type SuggestedMedication = {
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string;
};
