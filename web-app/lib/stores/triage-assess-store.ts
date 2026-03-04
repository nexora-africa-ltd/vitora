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
  completedSections: {
    vitals: boolean;
    history: boolean;
    assessment: boolean;
    route: boolean;
  };
  /** Tracks which tabs the user has navigated to (and then left). */
  visitedSections: {
    vitals: boolean;
    history: boolean;
    assessment: boolean;
    route: boolean;
  };
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

  // Actions - Section Completion
  markSectionComplete: (encounterId: number, section: keyof TriageAssessSession['completedSections']) => void;
  getSectionCompletion: (encounterId: number) => TriageAssessSession['completedSections'] | null;

  // Actions - Section Visited
  markSectionVisited: (encounterId: number, section: keyof TriageAssessSession['visitedSections']) => void;
  getVisitedSections: (encounterId: number) => TriageAssessSession['visitedSections'] | null;

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
          completedSections: {
            vitals: false,
            history: false,
            assessment: false,
            route: false,
          },
          visitedSections: {
            vitals: false,
            history: false,
            assessment: false,
            route: false,
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
              completedSections: {
                vitals: false,
                history: false,
                assessment: false,
                route: false,
              },
              visitedSections: {
                vitals: false,
                history: false,
                assessment: false,
                route: false,
              },
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

  // Section Visited
  markSectionVisited: (encounterId, section) => {
    set((state) => {
      const session = state.sessions[encounterId];
      if (!session) return state;
      // Don't mark as visited if already completed
      if (session.completedSections[section]) return state;
      return {
        sessions: {
          ...state.sessions,
          [encounterId]: {
            ...session,
            visitedSections: {
              ...session.visitedSections,
              [section]: true,
            },
          },
        },
      };
    });
  },

  getVisitedSections: (encounterId) => {
    const session = get().sessions[encounterId];
    return session?.visitedSections || null;
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

// =============================================================================
// Section Validation (pure functions)
// =============================================================================

export type SectionStatus = 'not-started' | 'incomplete' | 'complete';

/**
 * Check whether a section has the minimum required fields populated.
 * Returns:
 * - 'complete'    — section was submitted via markSectionComplete
 * - 'incomplete'  — section was visited but required fields are missing
 * - 'not-started' — section hasn't been visited yet
 */
export function getSectionStatus(
  section: 'vitals' | 'history' | 'assessment' | 'route',
  session: TriageAssessSession | null,
): SectionStatus {
  if (!session) return 'not-started';
  if (session.completedSections[section]) return 'complete';
  if (!session.visitedSections[section]) return 'not-started';

  // Visited but not completed — check if required fields are populated
  switch (section) {
    case 'vitals':
      return isVitalsAdequate(session.vitals) ? 'not-started' : 'incomplete';
    case 'history':
      // History is read-only review — always adequate once visited
      return 'not-started';
    case 'assessment':
      return isAssessmentAdequate(session.assessment) ? 'not-started' : 'incomplete';
    case 'route':
      return isRoutingAdequate(session.routing) ? 'not-started' : 'incomplete';
    default:
      return 'not-started';
  }
}

/** Vitals: at least 2 of the core 5 (HR, SpO2, Temp, RR, BP) must be entered. */
function isVitalsAdequate(vitals: TriageVitals): boolean {
  let count = 0;
  if (vitals.heart_rate != null) count++;
  if (vitals.spo2 != null) count++;
  if (vitals.temperature != null) count++;
  if (vitals.respiratory_rate != null) count++;
  if (vitals.systolic_bp != null && vitals.diastolic_bp != null) count++;
  return count >= 2;
}

/** Assessment: chief complaint + mental status + triage category required. */
function isAssessmentAdequate(assessment: TriageAssessmentData): boolean {
  return (
    !!assessment.chief_complaint?.trim() &&
    !!assessment.mental_status &&
    !!assessment.triage_category
  );
}

/** Route: assigned area must be selected. */
function isRoutingAdequate(routing: TriageRouting): boolean {
  return !!routing.assigned_area;
}
