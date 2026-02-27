/**
 * Encounter Edit Store
 *
 * Zustand store for persisting encounter edit data across the multi-step workflow.
 * Data is keyed by encounterId to avoid conflicts between concurrent edits.
 *
 * Flow:
 * 1. Vitals step saves vital signs
 * 2. History step saves medical history
 * 3. Notes step saves HPI, PE, assessment, clinical template
 * 4. Diagnosis step saves ICD-10 diagnoses
 * 5. Orders step manages lab/imaging/pharmacy orders
 * 6. Referrals step manages referrals
 * 7. Review step shows SOAP summary and allows finalization
 *
 * Each step auto-saves to backend via useAutoSave hook.
 * Store maintains local state for navigation between steps.
 */
import { create } from 'zustand';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { EncounterType } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface EncounterVitals {
  temperature?: number | null;
  pulse?: number | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
}

export interface EncounterHistory {
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  past_surgeries?: string;
  family_history?: string;
  social_history?: string;
}

export interface EncounterNotes {
  history_of_present_illness?: string;
  physical_examination?: string;
  assessment?: string;
  notes?: string;
  clinical_template?: number | null;
  clinical_template_data?: Record<string, Record<string, unknown>> | null;
}

export interface EncounterEditSession {
  encounterId: number;
  patientId: number;
  // Core fields (from initial load)
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;
  status: EncounterFormData['status'];
  // Section data
  vitals: EncounterVitals;
  history: EncounterHistory;
  notes: EncounterNotes;
  diagnoses: DiagnosisFormData[];
  // Tracking
  startedAt: Date;
  lastUpdatedAt: Date;
  isDirty: boolean;
  // Section completion
  completedSections: {
    vitals: boolean;
    history: boolean;
    notes: boolean;
    diagnosis: boolean;
    orders: boolean;
    referrals: boolean;
  };
}

interface EncounterEditState {
  // Session storage keyed by encounterId
  sessions: Record<number, EncounterEditSession>;

  // Current active session
  activeEncounterId: number | null;

  // Actions - Session Management
  initSession: (
    encounterId: number,
    patientId: number,
    initialData: Partial<EncounterFormData>,
    diagnoses?: DiagnosisFormData[]
  ) => void;
  getSession: (encounterId: number) => EncounterEditSession | null;
  clearSession: (encounterId: number) => void;
  setActiveEncounter: (encounterId: number | null) => void;

  // Actions - Vitals
  setVitals: (encounterId: number, vitals: EncounterVitals) => void;
  getVitals: (encounterId: number) => EncounterVitals | null;

  // Actions - History
  setHistory: (encounterId: number, history: EncounterHistory) => void;
  getHistory: (encounterId: number) => EncounterHistory | null;

  // Actions - Notes
  setNotes: (encounterId: number, notes: EncounterNotes) => void;
  getNotes: (encounterId: number) => EncounterNotes | null;

  // Actions - Diagnoses
  setDiagnoses: (encounterId: number, diagnoses: DiagnosisFormData[]) => void;
  getDiagnoses: (encounterId: number) => DiagnosisFormData[];
  addDiagnosis: (encounterId: number, diagnosis: DiagnosisFormData) => void;
  removeDiagnosis: (encounterId: number, index: number) => void;
  updateDiagnosis: (encounterId: number, index: number, diagnosis: DiagnosisFormData) => void;

  // Actions - Section Completion
  markSectionComplete: (encounterId: number, section: keyof EncounterEditSession['completedSections']) => void;
  getSectionCompletion: (encounterId: number) => EncounterEditSession['completedSections'] | null;

  // Actions - Dirty State
  setDirty: (encounterId: number, isDirty: boolean) => void;
  isDirty: (encounterId: number) => boolean;

  // Actions - Get Full Form Data (for API submission)
  getFormData: (encounterId: number) => EncounterFormData | null;
}

// =============================================================================
// Helper: Build full form data from session
// =============================================================================

function buildFormData(session: EncounterEditSession): EncounterFormData {
  return {
    patient: session.patientId,
    encounter_type: session.encounter_type,
    encounter_date: session.encounter_date,
    chief_complaint: session.chief_complaint,
    status: session.status,
    // Vitals
    temperature: session.vitals.temperature ?? null,
    pulse: session.vitals.pulse ?? null,
    blood_pressure_systolic: session.vitals.blood_pressure_systolic ?? null,
    blood_pressure_diastolic: session.vitals.blood_pressure_diastolic ?? null,
    respiratory_rate: session.vitals.respiratory_rate ?? null,
    spo2: session.vitals.spo2 ?? null,
    weight: session.vitals.weight ?? null,
    height: session.vitals.height ?? null,
    // History
    allergies: session.history.allergies ?? '',
    chronic_conditions: session.history.chronic_conditions ?? '',
    current_medications: session.history.current_medications ?? '',
    past_surgeries: session.history.past_surgeries ?? '',
    family_history: session.history.family_history ?? '',
    social_history: session.history.social_history ?? '',
    // Notes
    history_of_present_illness: session.notes.history_of_present_illness ?? '',
    physical_examination: session.notes.physical_examination ?? '',
    assessment: session.notes.assessment ?? '',
    notes: session.notes.notes ?? '',
    clinical_template: session.notes.clinical_template ?? null,
    clinical_template_data: session.notes.clinical_template_data ?? null,
  };
}

// =============================================================================
// Store
// =============================================================================

export const useEncounterEditStore = create<EncounterEditState>()((set, get) => ({
  sessions: {},
  activeEncounterId: null,

  // Session Management
  initSession: (encounterId, patientId, initialData, diagnoses = []) => {
    const now = new Date();
    set((state) => ({
      sessions: {
        ...state.sessions,
        [encounterId]: {
          encounterId,
          patientId,
          encounter_type: initialData.encounter_type || 'OPD',
          encounter_date: initialData.encounter_date || new Date().toISOString().split('T')[0] || '',
          chief_complaint: initialData.chief_complaint || '',
          status: initialData.status || 'CREATED',
          vitals: {
            temperature: initialData.temperature,
            pulse: initialData.pulse,
            blood_pressure_systolic: initialData.blood_pressure_systolic,
            blood_pressure_diastolic: initialData.blood_pressure_diastolic,
            respiratory_rate: initialData.respiratory_rate,
            spo2: initialData.spo2,
            weight: initialData.weight,
            height: initialData.height,
          },
          history: {
            allergies: initialData.allergies,
            chronic_conditions: initialData.chronic_conditions,
            current_medications: initialData.current_medications,
            past_surgeries: initialData.past_surgeries,
            family_history: initialData.family_history,
            social_history: initialData.social_history,
          },
          notes: {
            history_of_present_illness: initialData.history_of_present_illness,
            physical_examination: initialData.physical_examination,
            assessment: initialData.assessment,
            notes: initialData.notes,
            clinical_template: initialData.clinical_template,
            clinical_template_data: initialData.clinical_template_data,
          },
          diagnoses,
          startedAt: now,
          lastUpdatedAt: now,
          isDirty: false,
          completedSections: {
            vitals: false,
            history: false,
            notes: false,
            diagnosis: false,
            orders: false,
            referrals: false,
          },
        },
      },
      activeEncounterId: encounterId,
    }));
  },

  getSession: (encounterId) => {
    return get().sessions[encounterId] || null;
  },

  clearSession: (encounterId) => {
    set((state) => {
      const { [encounterId]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        activeEncounterId:
          state.activeEncounterId === encounterId ? null : state.activeEncounterId,
      };
    });
  },

  setActiveEncounter: (encounterId) => {
    set({ activeEncounterId: encounterId });
  },

  // Vitals
  setVitals: (encounterId, vitals) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            vitals: { ...session.vitals, ...vitals },
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  getVitals: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.vitals || null;
  },

  // History
  setHistory: (encounterId, history) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            history: { ...session.history, ...history },
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  getHistory: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.history || null;
  },

  // Notes
  setNotes: (encounterId, notes) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            notes: { ...session.notes, ...notes },
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  getNotes: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.notes || null;
  },

  // Diagnoses
  setDiagnoses: (encounterId, diagnoses) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            diagnoses,
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  getDiagnoses: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.diagnoses || [];
  },

  addDiagnosis: (encounterId, diagnosis) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            diagnoses: [...session.diagnoses, diagnosis],
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  removeDiagnosis: (encounterId, index) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            diagnoses: session.diagnoses.filter((_, i) => i !== index),
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  updateDiagnosis: (encounterId, index, diagnosis) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            diagnoses: session.diagnoses.map((d, i) => (i === index ? diagnosis : d)),
            lastUpdatedAt: new Date(),
            isDirty: true,
          },
        },
      };
    });
  },

  // Section Completion
  markSectionComplete: (encounterId, section) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            completedSections: {
              ...session.completedSections,
              [section]: true,
            },
            lastUpdatedAt: new Date(),
          },
        },
      };
    });
  },

  getSectionCompletion: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.completedSections || null;
  },

  // Dirty State
  setDirty: (encounterId, isDirty) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            isDirty,
            lastUpdatedAt: new Date(),
          },
        },
      };
    });
  },

  isDirty: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.isDirty ?? false;
  },

  // Get Full Form Data
  getFormData: (encounterId) => {
    const session = get().sessions[encounterId];
    if (!session) return null;
    return buildFormData(session);
  },
}));

// =============================================================================
// Exports
// =============================================================================

export default useEncounterEditStore;
