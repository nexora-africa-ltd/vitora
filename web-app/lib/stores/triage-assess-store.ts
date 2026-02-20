/**
 * Triage Assess Store
 *
 * Zustand store for persisting triage assessment data across the multi-tab workflow.
 * Data is keyed by encounterId to avoid conflicts between concurrent assessments.
 *
 * Flow:
 * 1. Vitals tab saves vital signs
 * 2. History tab saves patient history notes
 * 3. Assessment tab calculates and saves triage category
 * 4. Route tab completes the assessment and submits to backend
 * 5. Store is cleared after successful submission
 */
import { create } from 'zustand';
import type { TriageCategory, AVPUStatus, MobilityStatus, ArrivalMode, ChiefComplaintCategory, AssignedArea } from '@/lib/types/triage';

// =============================================================================
// Types
// =============================================================================

export interface TriageVitals {
  temperature?: number;
  heart_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  spo2?: number;
  respiratory_rate?: number;
  weight?: number;
  height?: number;
}

export interface TriageHistory {
  allergies_noted?: string;
  current_medications?: string;
  past_medical_history?: string;
  notes?: string;
}

export interface TriageAssessmentData {
  arrival_mode?: ArrivalMode;
  referring_facility_name?: string;
  arrival_time?: string;
  chief_complaint_category?: ChiefComplaintCategory;
  chief_complaint?: string;
  pain_score?: number;
  mental_status?: AVPUStatus;
  mobility?: MobilityStatus;
  triage_category?: TriageCategory;
  auto_calculated_category?: TriageCategory;
  category_override_reason?: string;
}

export interface TriageRouting {
  assigned_area?: AssignedArea | '';
  assigned_clinic?: number;
  assigned_clinician?: number;
}

export interface TriageAssessSession {
  encounterId: number;
  patientId: number;
  vitals: TriageVitals;
  history: TriageHistory;
  assessment: TriageAssessmentData;
  routing: TriageRouting;
  startedAt: Date;
  lastUpdatedAt: Date;
}

interface TriageAssessState {
  // Session storage keyed by encounterId
  sessions: Record<number, TriageAssessSession>;

  // Current active session
  activeEncounterId: number | null;

  // Actions - Session Management
  startSession: (encounterId: number, patientId: number) => void;
  getSession: (encounterId: number) => TriageAssessSession | null;
  clearSession: (encounterId: number) => void;
  setActiveEncounter: (encounterId: number | null) => void;

  // Actions - Vitals
  setVitals: (encounterId: number, vitals: TriageVitals) => void;
  getVitals: (encounterId: number) => TriageVitals | null;

  // Actions - History
  setHistory: (encounterId: number, history: TriageHistory) => void;
  getHistory: (encounterId: number) => TriageHistory | null;

  // Actions - Assessment
  setAssessment: (encounterId: number, assessment: TriageAssessmentData) => void;
  getAssessment: (encounterId: number) => TriageAssessmentData | null;

  // Actions - Routing
  setRouting: (encounterId: number, routing: TriageRouting) => void;
  getRouting: (encounterId: number) => TriageRouting | null;

  // Actions - Complete Assessment
  getCompleteAssessment: (encounterId: number) => TriageAssessSession | null;
}

// =============================================================================
// Store
// =============================================================================

export const useTriageAssessStore = create<TriageAssessState>()((set, get) => ({
  sessions: {},
  activeEncounterId: null,

  // Session Management
  startSession: (encounterId, patientId) => {
    const now = new Date();
    set((state) => ({
      sessions: {
        ...state.sessions,
        [encounterId]: {
          encounterId,
          patientId,
          vitals: {},
          history: {},
          assessment: {},
          routing: {},
          startedAt: now,
          lastUpdatedAt: now,
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
      if (!session) {
        // Auto-create session if not exists
        return {
          sessions: {
            ...state.sessions,
            [encounterId]: {
              encounterId,
              patientId: 0, // Will be set properly when session starts
              vitals,
              history: {},
              assessment: {},
              routing: {},
              startedAt: new Date(),
              lastUpdatedAt: new Date(),
            },
          },
        };
      }
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            vitals: { ...session.vitals, ...vitals },
            lastUpdatedAt: new Date(),
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
          },
        },
      };
    });
  },

  getHistory: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.history || null;
  },

  // Assessment
  setAssessment: (encounterId, assessment) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            assessment: { ...session.assessment, ...assessment },
            lastUpdatedAt: new Date(),
          },
        },
      };
    });
  },

  getAssessment: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.assessment || null;
  },

  // Routing
  setRouting: (encounterId, routing) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            routing: { ...session.routing, ...routing },
            lastUpdatedAt: new Date(),
          },
        },
      };
    });
  },

  getRouting: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.routing || null;
  },

  // Complete Assessment
  getCompleteAssessment: (encounterId) => {
    return get().sessions[encounterId] || null;
  },
}));

// =============================================================================
// Exports
// =============================================================================

export default useTriageAssessStore;
