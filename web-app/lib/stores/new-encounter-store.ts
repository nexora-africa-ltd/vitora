/**
 * New Encounter Store
 *
 * Zustand store for persisting new encounter data across the multi-step workflow.
 * Similar to EncounterEditStore but for creating new encounters.
 *
 * Flow:
 * 1. Patient step - select patient
 * 2. Details step - encounter type, date, chief complaint
 * 3. History step - medical history (optional)
 * 4. Notes step - HPI, clinical notes (optional)
 * 5. Diagnosis step - ICD-10 diagnoses (optional)
 * 6. Review step - summary and create
 *
 * Data is persisted to localStorage for crash recovery.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { EncounterType } from '@/lib/types/encounter';
import type { Patient } from '@/lib/types/patient';

// =============================================================================
// Types
// =============================================================================

export interface NewEncounterVitals {
  temperature?: number | null;
  pulse?: number | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  weight?: number | null;
  height?: number | null;
}

export interface NewEncounterHistory {
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  past_surgeries?: string;
  family_history?: string;
  social_history?: string;
}

export interface NewEncounterNotes {
  history_of_present_illness?: string;
  physical_examination?: string;
  assessment?: string;
  notes?: string;
  clinical_template?: number | null;
  clinical_template_data?: Record<string, Record<string, unknown>> | null;
}

export interface NewEncounterSession {
  // Session ID (unique per session)
  sessionId: string;

  // Patient info
  patientId: number | null;
  patientData: Patient | null;

  // Core fields
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;

  // Section data
  vitals: NewEncounterVitals;
  history: NewEncounterHistory;
  notes: NewEncounterNotes;
  diagnoses: DiagnosisFormData[];

  // Tracking
  startedAt: Date;
  lastUpdatedAt: Date;
  isDirty: boolean;

  // Section completion
  completedSections: {
    patient: boolean;
    details: boolean;
    history: boolean;
    notes: boolean;
    diagnosis: boolean;
  };
}

interface NewEncounterState {
  // Current session
  session: NewEncounterSession | null;

  // Actions - Session Management
  initSession: () => string;
  getSession: () => NewEncounterSession | null;
  clearSession: () => void;
  hasSession: () => boolean;

  // Actions - Patient
  setPatient: (patientId: number | null, patientData: Patient | null) => void;
  getPatient: () => { id: number | null; data: Patient | null };

  // Actions - Details
  setDetails: (details: {
    encounter_type?: EncounterType;
    encounter_date?: string;
    chief_complaint?: string;
  }) => void;
  getDetails: () => {
    encounter_type: EncounterType;
    encounter_date: string;
    chief_complaint: string;
  };

  // Actions - History
  setHistory: (history: NewEncounterHistory) => void;
  getHistory: () => NewEncounterHistory;

  // Actions - Notes
  setNotes: (notes: NewEncounterNotes) => void;
  getNotes: () => NewEncounterNotes;

  // Actions - Diagnoses
  setDiagnoses: (diagnoses: DiagnosisFormData[]) => void;
  getDiagnoses: () => DiagnosisFormData[];
  addDiagnosis: (diagnosis: DiagnosisFormData) => void;
  removeDiagnosis: (index: number) => void;
  updateDiagnosis: (index: number, diagnosis: DiagnosisFormData) => void;

  // Actions - Section Completion
  markSectionComplete: (section: keyof NewEncounterSession['completedSections']) => void;
  getSectionCompletion: () => NewEncounterSession['completedSections'] | null;

  // Actions - Dirty State
  setDirty: (isDirty: boolean) => void;
  isDirtyState: () => boolean;

  // Actions - Get Full Form Data (for API submission)
  getFormData: () => EncounterFormData | null;
}

// =============================================================================
// Helper: Generate session ID
// =============================================================================

function generateSessionId(): string {
  return `new-enc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// Helper: Create initial session
// =============================================================================

function createInitialSession(): NewEncounterSession {
  const now = new Date();
  return {
    sessionId: generateSessionId(),
    patientId: null,
    patientData: null,
    encounter_type: 'OPD',
    encounter_date: new Date().toISOString().split('T')[0] || '',
    chief_complaint: '',
    vitals: {},
    history: {},
    notes: {},
    diagnoses: [],
    startedAt: now,
    lastUpdatedAt: now,
    isDirty: false,
    completedSections: {
      patient: false,
      details: false,
      history: false,
      notes: false,
      diagnosis: false,
    },
  };
}

// =============================================================================
// Helper: Build full form data from session
// =============================================================================

function buildFormData(session: NewEncounterSession): EncounterFormData {
  return {
    patient: session.patientId,
    encounter_type: session.encounter_type,
    encounter_date: session.encounter_date,
    chief_complaint: session.chief_complaint,
    status: 'CREATED',
    // Vitals (usually empty for new - handled by triage)
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

export const useNewEncounterStore = create<NewEncounterState>()(
  persist(
    (set, get) => ({
      session: null,

      // Session Management
      initSession: () => {
        const existingSession = get().session;
        if (existingSession) {
          return existingSession.sessionId;
        }
        const newSession = createInitialSession();
        set({ session: newSession });
        return newSession.sessionId;
      },

      getSession: () => get().session,

      clearSession: () => set({ session: null }),

      hasSession: () => get().session !== null,

      // Patient
      setPatient: (patientId, patientData) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              patientId,
              patientData,
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      getPatient: () => {
        const session = get().session;
        return {
          id: session?.patientId ?? null,
          data: session?.patientData ?? null,
        };
      },

      // Details
      setDetails: (details) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              ...(details.encounter_type !== undefined && { encounter_type: details.encounter_type }),
              ...(details.encounter_date !== undefined && { encounter_date: details.encounter_date }),
              ...(details.chief_complaint !== undefined && { chief_complaint: details.chief_complaint }),
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      getDetails: () => {
        const session = get().session;
        return {
          encounter_type: session?.encounter_type ?? 'OPD',
          encounter_date: (session?.encounter_date ?? new Date().toISOString().split('T')[0]) || '',
          chief_complaint: session?.chief_complaint ?? '',
        };
      },

      // History
      setHistory: (history) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              history: { ...state.session.history, ...history },
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      getHistory: () => {
        const session = get().session;
        return session?.history ?? {};
      },

      // Notes
      setNotes: (notes) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              notes: { ...state.session.notes, ...notes },
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      getNotes: () => {
        const session = get().session;
        return session?.notes ?? {};
      },

      // Diagnoses
      setDiagnoses: (diagnoses) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              diagnoses,
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      getDiagnoses: () => {
        const session = get().session;
        return session?.diagnoses ?? [];
      },

      addDiagnosis: (diagnosis) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              diagnoses: [...state.session.diagnoses, diagnosis],
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      removeDiagnosis: (index) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              diagnoses: state.session.diagnoses.filter((_, i) => i !== index),
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      updateDiagnosis: (index, diagnosis) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              diagnoses: state.session.diagnoses.map((d, i) => (i === index ? diagnosis : d)),
              lastUpdatedAt: new Date(),
              isDirty: true,
            },
          };
        });
      },

      // Section Completion
      markSectionComplete: (section) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              completedSections: {
                ...state.session.completedSections,
                [section]: true,
              },
              lastUpdatedAt: new Date(),
            },
          };
        });
      },

      getSectionCompletion: () => {
        const session = get().session;
        return session?.completedSections ?? null;
      },

      // Dirty State
      setDirty: (isDirty) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              isDirty,
              lastUpdatedAt: new Date(),
            },
          };
        });
      },

      isDirtyState: () => {
        const session = get().session;
        return session?.isDirty ?? false;
      },

      // Get Full Form Data
      getFormData: () => {
        const session = get().session;
        if (!session) return null;
        return buildFormData(session);
      },
    }),
    {
      name: 'vitora-new-encounter',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
      }),
    }
  )
);

// =============================================================================
// Exports
// =============================================================================

export default useNewEncounterStore;
