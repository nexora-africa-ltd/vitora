/**
 * Auto-save and restore discharge form drafts via localStorage.
 *
 * Persists user input (discharge type, sections, diagnoses, medications,
 * instructions, follow-up) so that work is not lost on power failure,
 * accidental navigation, or browser crash.
 *
 * - Draft is keyed by admission ID
 * - Saves are debounced (2 s) to avoid excessive writes
 * - Draft is cleared on successful discharge submission
 * - Shows a toast when a saved draft is restored
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { DiagnosisEntry } from '@/components/shared';
import type { DischargeMedication, DischargeType, MaternityContinuityAction } from '@/lib/types/inpatient';
import type { DischargeSummarySection } from '@/lib/discharge/types';
import type { ClinicalDocGenerationMode } from '@/lib/types/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DischargeDraftData {
  dischargeType: DischargeType;
  sections: DischargeSummarySection[];
  diagnoses: DiagnosisEntry[];
  patientInstructions: string;
  followUpInstructions: string;
  followUpDate: string;
  medications: DischargeMedication[];
  maternityContinuityAction: MaternityContinuityAction;
  generationMode: ClinicalDocGenerationMode;
  savedAt: string; // ISO timestamp
}

interface DischargeDraftSetters {
  setDischargeType: (v: DischargeType) => void;
  setSections: (v: DischargeSummarySection[]) => void;
  setDiagnoses: (v: DiagnosisEntry[]) => void;
  setPatientInstructions: (v: string) => void;
  setFollowUpInstructions: (v: string) => void;
  setFollowUpDate: (v: string) => void;
  setMedications: (v: DischargeMedication[]) => void;
  setMaternityContinuityAction: (v: MaternityContinuityAction) => void;
  setGenerationMode: (v: ClinicalDocGenerationMode) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'vitora:discharge-draft:';
const DEBOUNCE_MS = 2_000;

function storageKey(admissionId: number) {
  return `${STORAGE_PREFIX}${admissionId}`;
}

function readDraft(admissionId: number): DischargeDraftData | null {
  try {
    const raw = localStorage.getItem(storageKey(admissionId));
    if (!raw) return null;
    return JSON.parse(raw) as DischargeDraftData;
  } catch {
    return null;
  }
}

function writeDraft(admissionId: number, data: DischargeDraftData) {
  try {
    localStorage.setItem(storageKey(admissionId), JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDischargeDraft(
  admissionId: number,
  currentValues: Omit<DischargeDraftData, 'savedAt'>,
  setters: DischargeDraftSetters,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const hasDraftRef = useRef(false);

  // ---- Restore draft on mount (once) ----
  useEffect(() => {
    if (restoredRef.current || !admissionId) return;
    restoredRef.current = true;

    const draft = readDraft(admissionId);
    if (!draft) return;

    // Only restore if draft has meaningful content
    const hasContent =
      draft.sections.some((s) => s.content.trim()) ||
      draft.patientInstructions.trim() ||
      draft.diagnoses.length > 0 ||
      draft.medications.length > 0 ||
      draft.followUpInstructions.trim();

    if (!hasContent) return;

    setters.setDischargeType(draft.dischargeType);
    setters.setSections(draft.sections);
    setters.setDiagnoses(draft.diagnoses);
    setters.setPatientInstructions(draft.patientInstructions);
    setters.setFollowUpInstructions(draft.followUpInstructions);
    setters.setFollowUpDate(draft.followUpDate);
    setters.setMedications(draft.medications);
    setters.setMaternityContinuityAction(draft.maternityContinuityAction);
    if (draft.generationMode) setters.setGenerationMode(draft.generationMode);
    hasDraftRef.current = true;
  }, [admissionId, setters]);

  // ---- Debounced auto-save on value changes ----
  useEffect(() => {
    if (!admissionId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const data: DischargeDraftData = {
        ...currentValues,
        savedAt: new Date().toISOString(),
      };
      writeDraft(admissionId, data);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [admissionId, currentValues]);

  // ---- Clear draft (call on successful submission) ----
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(admissionId));
    } catch {
      // ignore
    }
  }, [admissionId]);

  return { clearDraft, hasDraft: hasDraftRef.current };
}
