'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Save, Plus, Trash2, Clock, CheckCircle2, BrainCircuit, Loader2, AlertTriangle, ShieldAlert, Printer, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { MultiDiagnosisInput, type DiagnosisEntry } from '@/components/shared';
import { MarkdownPreview } from '@/components/shared/markdown-preview';
import { emptyDiagnosisCodeValue } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DischargeReadinessPanel } from '@/components/inpatient/discharge-readiness-panel';
import { ClearanceStatusPanel } from '@/components/inpatient/clearance-status-panel';
import { FacilityModuleWarning } from '@/components/shared/facility-module-warning';
import { SectionCard } from '@/components/discharge/section-card';
import { MedicationSuggestions } from '@/components/discharge/medication-suggestions';
import { AdmissionPrescriptionsPicker } from '@/components/discharge/admission-prescriptions-picker';
import { ClinicalReferenceCard } from '@/components/discharge/clinical-reference-card';
import { useAdmission, useCreateDischarge, useAdmissionWardRounds, useAdmissionOrders, useClearanceStatus, useKardexByAdmission, useTemperatureReadings, useFluidBalanceSheets, useBPReadings, useBloodTransfusions, useDefaultDischargeTemplate } from '@/lib/hooks/use-inpatient';
import { useAdmissionPrescriptions, useUpdatePrescription } from '@/lib/hooks/use-pharmacy';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useAIEnabled, useAICDSEvaluate, useStoredCarePlans, useAISuggestionAudit } from '@/lib/hooks/use-ai';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { useOptionalPatientContext } from '@/lib/context/patient-context';
import { useFacility } from '@/lib/context/facility-context';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { printDischargeDocument } from '@/lib/documents';
import type { DischargeType, DischargeMedication, MaternityContinuityAction } from '@/lib/types/inpatient';
import type { AICDSAlertItem, AIPatientContext, AIEncounterContext, ClinicalDocGenerationMode } from '@/lib/types/ai';
import type { DischargeSummarySection, SuggestedMedication } from '@/lib/discharge/types';
import { DEFAULT_SECTION_TEMPLATES, DEDICATED_FIELD_KEYS, DISCHARGE_TYPES, MATERNITY_CONTINUITY_ACTIONS } from '@/lib/discharge/types';
import { createSectionId, assembleSectionsText, buildTemplateAlignedContent, mergeEncounterClinicalText } from '@/lib/discharge/utils';
import { useDischargeAI } from '@/lib/discharge/use-discharge-ai';
import { useDischargeDraft } from '@/lib/discharge/use-discharge-draft';
import { buildAdmissionAIClinicalNotes, getLatestWardRound } from '@/lib/utils/inpatient-ai-context';
import type { WardRound } from '@/lib/types/inpatient';

/**
 * Derive the attending consultant name from available data sources:
 * 1. admission.attending_doctor_username (explicitly set)
 * 2. Most recent CONSULTANT_REVIEW ward round's conducted_by_name
 * 3. Most frequent ward round conductor (majority doctor)
 * 4. Admitting officer as last resort
 */
function deriveConsultantName(
  admission: any,
  wardRoundResults?: WardRound[],
): string {
  // 1. Explicit attending doctor on the admission
  if (admission?.attending_doctor_username) {
    return admission.attending_doctor_username;
  }

  if (wardRoundResults?.length) {
    // 2. Most recent consultant review
    const consultantReview = wardRoundResults.find(
      (wr) => wr.review_type === 'CONSULTANT_REVIEW'
    );
    if (consultantReview?.conducted_by_name) {
      return consultantReview.conducted_by_name;
    }

    // 3. Most frequent conductor (majority doctor)
    const conductorCounts = new Map<string, number>();
    for (const wr of wardRoundResults) {
      const name = wr.conducted_by_name || wr.conducted_by_username;
      if (name) {
        conductorCounts.set(name, (conductorCounts.get(name) || 0) + 1);
      }
    }
    if (conductorCounts.size > 0) {
      const sorted = [...conductorCounts.entries()].sort(
        (a, b) => b[1] - a[1]
      );
      if (sorted[0]) return sorted[0][0];
    }
  }

  // 4. Admitting officer as fallback
  return admission?.admitting_officer_username || '';
}

export default function DischargePage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const { data: wardRounds } = useAdmissionWardRounds(admissionId);
  const { data: orders } = useAdmissionOrders(admissionId);
  const { data: kardex } = useKardexByAdmission(admissionId);
  const { data: temperatureData } = useTemperatureReadings(admissionId);
  const { data: fluidBalanceData } = useFluidBalanceSheets(admissionId);
  const { data: bpData } = useBPReadings(admissionId);
  const { data: transfusionData } = useBloodTransfusions(admissionId);
  const { facility, facilityDetail } = useFacility();
  const { data: defaultTemplate } = useDefaultDischargeTemplate();
  const patientContext = useOptionalPatientContext();
  const createDischarge = useCreateDischarge();
  const isAIEnabled = useAIEnabled();
  const cdsEvaluate = useAICDSEvaluate();

  // Fetch prescriptions for this admission
  const { data: admissionPrescriptions = [] } = useAdmissionPrescriptions(admissionId);
  const updatePrescription = useUpdatePrescription();

  // Fetch encounter diagnoses for pre-population suggestions
  const sourceEncounterId = admission?.source_encounter || admission?.opd_encounter || 0;
  const ipdEncounterId = admission?.ipd_encounter || 0;
  const { data: sourceEncounter } = useEncounter(sourceEncounterId);
  const { data: ipdEncounter } = useEncounter(ipdEncounterId);
  const { data: encounterDiagnoses } = useEncounterDiagnoses(sourceEncounterId);
  const { data: storedCarePlans } = useStoredCarePlans({ encounter_id: sourceEncounterId || undefined, admission_id: admissionId });
  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;

  const [dischargeType, setDischargeType] = useState<DischargeType>('NORMAL');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [patientInstructions, setPatientInstructions] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [medications, setMedications] = useState<DischargeMedication[]>([]);
  const [maternityContinuityAction, setMaternityContinuityAction] = useState<MaternityContinuityAction>('NONE');

  // Selected prescription IDs for discharge medications + dispensing type overrides
  const [selectedRxIds, setSelectedRxIds] = useState<Set<number>>(new Set());
  const [rxDispensingTypes, setRxDispensingTypes] = useState<Record<number, 'INTERNAL' | 'EXTERNAL'>>({});

  // Auto-select prescriptions already marked as discharge medications
  useEffect(() => {
    if (admissionPrescriptions.length > 0) {
      const alreadyMarked = admissionPrescriptions
        .filter((rx) => rx.is_discharge_medication)
        .map((rx) => rx.id);
      if (alreadyMarked.length > 0) {
        setSelectedRxIds((prev) => {
          const next = new Set(prev);
          alreadyMarked.forEach((id) => next.add(id));
          return next;
        });
        const types: Record<number, 'INTERNAL' | 'EXTERNAL'> = {};
        admissionPrescriptions
          .filter((rx) => rx.is_discharge_medication)
          .forEach((rx) => { types[rx.id] = rx.dispensing_type; });
        setRxDispensingTypes((prev) => ({ ...prev, ...types }));
      }
    }
  }, [admissionPrescriptions]);

  // Automated clearance status (live from backend)
  const { data: clearanceStatus } = useClearanceStatus(admissionId);

  // CDS safety check dialog state
  const [cdsAlerts, setCdsAlerts] = useState<AICDSAlertItem[]>([]);

  const [instructionsGenerated, setInstructionsGenerated] = useState(false);
  const [showCdsDialog, setShowCdsDialog] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // AI generation mode: 'generate' = strict facts-only (default), 'suggest' = experimental rich drafts
  const AI_MODE_STORAGE_KEY = 'vitora_ai_generation_mode';
  const [generationMode, setGenerationModeRaw] = useState<ClinicalDocGenerationMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(AI_MODE_STORAGE_KEY);
      if (stored === 'suggest' || stored === 'generate') return stored;
    }
    return 'generate';
  });
  const setGenerationMode = useCallback((mode: ClinicalDocGenerationMode) => {
    setGenerationModeRaw(mode);
    try { localStorage.setItem(AI_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, []);
  const [showSuggestModeDialog, setShowSuggestModeDialog] = useState(false);
  const suggestionAudit = useAISuggestionAudit();

  // Customizable discharge summary sections — initialized from template or defaults
  const [sections, setSections] = useState<DischargeSummarySection[]>(() =>
    DEFAULT_SECTION_TEMPLATES.map((s) => ({ ...s, id: createSectionId() }))
  );
  const [sectionsInitFromTemplate, setSectionsInitFromTemplate] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [generatingSectionId, setGeneratingSectionId] = useState<string | null>(null);

  // AI medication suggestions and follow-up generation
  const [suggestedMeds, setSuggestedMeds] = useState<{ drug_name: string; dosage: string; frequency: string; duration: string }[]>([]);
  const [generatingMeds, setGeneratingMeds] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [generatingPatientInstructions, setGeneratingPatientInstructions] = useState(false);

  // ---- Draft auto-save / restore ----
  const draftSetters = useMemo(() => ({
    setDischargeType,
    setSections,
    setDiagnoses,
    setPatientInstructions,
    setFollowUpInstructions,
    setFollowUpDate,
    setMedications,
    setMaternityContinuityAction,
    setGenerationMode,
  }), [setGenerationMode]);

  const draftValues = useMemo(() => ({
    dischargeType,
    sections,
    diagnoses,
    patientInstructions,
    followUpInstructions,
    followUpDate,
    medications,
    maternityContinuityAction,
    generationMode,
  }), [dischargeType, sections, diagnoses, patientInstructions, followUpInstructions, followUpDate, medications, maternityContinuityAction, generationMode]);

  const { clearDraft, hasDraft } = useDischargeDraft(admissionId, draftValues, draftSetters);

  // Show restored-draft toast once
  useEffect(() => {
    if (hasDraft) {
      toast({
        title: 'Draft Restored',
        description: 'Your previous discharge form progress has been restored.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft]);

  // Derive editable form sections from the facility's discharge template.
  // Runs once when the template loads, skipped if a draft was restored.
  useEffect(() => {
    if (sectionsInitFromTemplate) return;   // Already done
    if (hasDraft) return;                   // Draft restored — keep those sections
    if (!defaultTemplate?.sections?.length) return;

    const templateSections = defaultTemplate.sections
      .filter((s) => s.enabled && !DEDICATED_FIELD_KEYS.has(s.key))
      .map((s) => ({
        id: createSectionId(),
        title: s.label,
        content: '',
        source: 'template' as const,
        templateKey: s.key,
      }));

    if (templateSections.length > 0) {
      setSections(templateSections);
    }
    setSectionsInitFromTemplate(true);
  }, [defaultTemplate, hasDraft, sectionsInitFromTemplate]);

  // Pre-fill data-sourced sections from encounter, ward rounds, and orders (no AI needed).
  // Re-runs as data sources arrive; only fills empty sections so it never overwrites.
  useEffect(() => {
    if (!sectionsInitFromTemplate) return;
    if (hasDraft) return;
    if (!sourceEncounter && !ipdEncounter && !orders && !wardRounds?.results?.length) return;

    setSections((prev) => {
      let updated = [...prev];
      let changed = false;

      const fillIfEmpty = (key: string, content: string | null | undefined) => {
        if (!content || !content.trim()) return;
        updated = updated.map((s) => {
          if (s.templateKey === key && !s.content) {
            changed = true;
            return { ...s, content: content.trim(), source: 'template' as const };
          }
          return s;
        });
      };

      // Ward rounds (oldest first) for subjective/objective fallbacks
      const rounds = wardRounds?.results ?? [];
      const firstRound = rounds.length ? rounds[rounds.length - 1] : null;
      const latestRound = rounds.length ? rounds[0] : null;

      // Complaints → OPD chief complaint merged with IPD chief complaint → first ward round subjective.
      // Never fall back to admitting_diagnosis_text — that is a DIAGNOSIS, not a complaint.
      fillIfEmpty(
        'complaints',
        mergeEncounterClinicalText(sourceEncounter?.chief_complaint, ipdEncounter?.chief_complaint)
          || firstRound?.subjective
      );

      // Physical Examination → encounter physical_examination → latest ward round objective (stripped of lab/imaging lines)
      const stripInvestigations = (text: string) => {
        const patterns = [
          /^\s*[\w\s-]+:\s*[\d.]+\s*(?:x?\s*10[\^⁹⁶³]?\/?[Ll]|[mµμ]?(?:g|mol|IU|U|mmol|mg|mcg)\/(?:[dDlL]|mL)|%|mm\/h|mEq\/L)/i,
          /^\s*[\w\s-]+:\s*(?:COMPLETED|CANCELLED|PENDING|REPORTED|ORDERED|COLLECTED)/i,
          /^\s*(?:ultrasound|CT|MRI|X-?ray|echo|ECG|EEG)\b/i,
        ];
        return text.split('\n').filter((l) => !patterns.some((p) => p.test(l))).join('\n').trim();
      };
      fillIfEmpty(
        'physical_examination',
        mergeEncounterClinicalText(sourceEncounter?.physical_examination, ipdEncounter?.physical_examination)
          || (latestRound?.objective ? stripInvestigations(latestRound.objective) : null)
      );

      // History → OPD HPI merged with IPD HPI → first ward round subjective
      fillIfEmpty(
        'history',
        mergeEncounterClinicalText(sourceEncounter?.history_of_present_illness, ipdEncounter?.history_of_present_illness)
          || firstRound?.subjective
      );

      // Investigations → lab and imaging results from orders
      if (orders) {
        const lines: string[] = [];
        const cleanValue = (v: string) => v.replace(/(\d+\.\d*?)0+(\s)/g, '$1$2').replace(/\.(\s)/g, '$1');
        if (orders.lab_orders) {
          for (const lo of orders.lab_orders) {
            if (lo.status === 'CANCELLED') continue;
            for (const item of lo.items) {
              if (item.status === 'CANCELLED') continue;
              const r = item.result;
              if (r?.formatted_value) {
                lines.push(`${item.test_name}: ${cleanValue(r.formatted_value)}${r.is_critical_result ? ' [CRITICAL]' : ''}`);
              } else {
                lines.push(`${item.test_name}: ${lo.status}`);
              }
            }
          }
        }
        if (orders.imaging_orders) {
          for (const io of orders.imaging_orders) {
            if (io.status === 'CANCELLED') continue;
            for (const item of io.items) {
              const report = io.report_summary;
              if (report && (report.findings || report.impression)) {
                const content = report.impression || report.findings;
                lines.push(`${item.procedure_name} (${item.modality}): ${content}`);
              } else {
                lines.push(`${item.procedure_name} (${item.modality}): ${io.status}`);
              }
            }
          }
        }
        fillIfEmpty('investigations', lines.join('\n'));
      }

      return changed ? updated : prev;
    });
  }, [sectionsInitFromTemplate, hasDraft, sourceEncounter, ipdEncounter, orders, wardRounds?.results]);

  // Computed discharge summary from sections (for form submission and validation)
  const dischargeSummary = useMemo(() => assembleSectionsText(sections), [sections]);

  // Print-only version: aligns form data to the facility's discharge template layout.
  // When no template is configured, falls back to simple section assembly.
  const printableSummary = useMemo(() => {
    if (!defaultTemplate?.sections?.length) {
      return assembleSectionsText(sections, true);
    }

    // Build dedicated content for template sections that map to structured data
    const dedicatedContent: Record<string, string> = {};

    // Diagnoses — always provide dedicated content to prevent fuzzy-match cross-contamination
    if (diagnoses.length > 0) {
      const primary = diagnoses.find((d) => d.role === 'PRIMARY');
      const secondary = diagnoses.filter((d) => d.role !== 'PRIMARY');
      const parts: string[] = [];
      if (primary) {
        const display = primary.code.icd11Display || primary.code.icd10Display || '';
        if (display) parts.push(`**Primary Diagnosis:** ${display}`);
      }
      if (secondary.length > 0) {
        parts.push('**Other Diagnoses:**');
        secondary.forEach((d) => {
          const display = d.code.icd11Display || d.code.icd10Display || '';
          if (display) parts.push(`- ${display}`);
        });
      }
      if (parts.length) dedicatedContent['diagnosis'] = parts.join('\n');
    } else {
      // Fallback: use admitting diagnosis text so the slot never fuzzy-matches
      // a form section like "Condition at Discharge"
      const admittingDx = admission?.admitting_diagnosis_text || admission?.admitting_diagnosis;
      if (admittingDx) dedicatedContent['diagnosis'] = admittingDx;
    }

    // Chief complaint / complaints — SSOT is OPD + IPD encounters merged
    const complaint = mergeEncounterClinicalText(
      sourceEncounter?.chief_complaint,
      ipdEncounter?.chief_complaint,
    );
    if (complaint) dedicatedContent['complaints'] = complaint;

    // Investigations from admission orders
    if (orders) {
      const lines: string[] = [];
      // Helper: trim trailing zeros from numeric values (e.g. "11.8000 g/dL" → "11.8 g/dL")
      const cleanValue = (v: string) => v.replace(/(\d+\.\d*?)0+(\s)/g, '$1$2').replace(/\.(\s)/g, '$1');
      if (orders.lab_orders) {
        for (const lo of orders.lab_orders) {
          for (const item of lo.items) {
            const r = item.result;
            if (r?.formatted_value) {
              lines.push(`- ${item.test_name}: ${cleanValue(r.formatted_value)}${r.is_critical_result ? ' **[CRITICAL]**' : ''}`);
            } else {
              lines.push(`- ${item.test_name}: ${lo.status}`);
            }
          }
        }
      }
      if (orders.imaging_orders) {
        for (const io of orders.imaging_orders) {
          if (io.status === 'CANCELLED') continue;
          for (const item of io.items) {
            const report = io.report_summary;
            if (report && (report.findings || report.impression)) {
              const content = report.impression || report.findings;
              lines.push(`- ${item.procedure_name} (${item.modality}): ${content}`);
            } else {
              lines.push(`- ${item.procedure_name} (${item.modality}): ${io.status}`);
            }
          }
        }
      }
      if (lines.length) dedicatedContent['investigations'] = lines.join('\n');
    }

    // Discharge medications — merge manual meds + selected admission prescriptions
    const medEntries: { drug_name: string; dosage: string; frequency: string; duration: string }[] = [
      ...medications.filter((m) => m.drug_name),
    ];
    for (const rx of admissionPrescriptions) {
      if (selectedRxIds.has(rx.id)) {
        const activeItems = (rx.items || []).filter((item: any) => !item.is_cancelled);
        for (const item of activeItems) {
          medEntries.push({
            drug_name: item.drug_name || '',
            dosage: item.dosage || '',
            frequency: item.frequency || '',
            duration: item.duration || '',
          });
        }
      }
    }
    if (medEntries.length > 0) {
      const header = '| Medication | Dosage | Frequency | Duration |\n| --- | --- | --- | --- |';
      const rows = medEntries.map((m) => `| ${m.drug_name} | ${m.dosage} | ${m.frequency} | ${m.duration || ''} |`);
      dedicatedContent['discharge_medications'] = [header, ...rows].join('\n');
    }

    // Follow-up
    const followUpParts: string[] = [];
    if (followUpDate) {
      try {
        followUpParts.push(`**Return Date:** ${format(parseISO(followUpDate), 'dd MMM yyyy')}`);
      } catch {
        followUpParts.push(`**Return Date:** ${followUpDate}`);
      }
    }
    if (followUpInstructions) followUpParts.push(followUpInstructions);
    if (followUpParts.length) dedicatedContent['follow_up'] = followUpParts.join('\n\n');

    // Patient instructions / discharge instructions
    if (patientInstructions) dedicatedContent['discharge_instructions'] = patientInstructions;

    return buildTemplateAlignedContent(defaultTemplate.sections, sections, dedicatedContent, true);
  }, [sections, defaultTemplate, diagnoses, medications, admissionPrescriptions, selectedRxIds, orders, followUpDate, followUpInstructions, patientInstructions, admission]);

  // Calculate length of stay
  const lengthOfStay = useMemo(() => {
    if (!admission?.admission_date) return 0;
    const admissionDate = new Date(admission.admission_date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - admissionDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [admission?.admission_date]);

  // Check if all clearances are complete (automated from live department data)
  const allClearancesComplete = clearanceStatus?.all_cleared ?? false;
  // Clearances are bypassed for non-standard discharges (AMA, deceased, absconded)
  const CLEARANCE_BYPASS_TYPES: DischargeType[] = ['AGAINST_ADVICE', 'DECEASED', 'ABSCONDED'];
  const clearanceRequired = !CLEARANCE_BYPASS_TYPES.includes(dischargeType);
  const clearanceSatisfied = !clearanceRequired || allClearancesComplete;
  const requiresMaternityContinuityAction = !!admission?.mch_registration && ['NORMAL', 'TRANSFERRED'].includes(dischargeType);
  const requiresScheduledFollowUpDate = requiresMaternityContinuityAction && maternityContinuityAction === 'SCHEDULE_EARLY_PNC';

  useEffect(() => {
    if (admission?.mch_registration && maternityContinuityAction === 'NONE') {
      setMaternityContinuityAction('SCHEDULE_EARLY_PNC');
    }
  }, [admission?.mch_registration, maternityContinuityAction]);

  // Build rich clinical context from admission data + full patient record for AI calls
  const patientCtx = useMemo((): AIPatientContext => {
    const allergies: string[] = [];
    const comorbidities: string[] = [];
    const currentMeds: string[] = [];

    // Enrich from PatientContext clinical summary fields
    const fullPatient = patientContext?.patient;
    if (fullPatient?.allergy_summary?.length) {
      allergies.push(...fullPatient.allergy_summary);
    }
    if (fullPatient?.chronic_conditions_summary) {
      comorbidities.push(
        ...fullPatient.chronic_conditions_summary.split(',').map((c: string) => c.trim()).filter(Boolean)
      );
    }
    if (sourceEncounter?.allergies) {
      allergies.push(
        ...sourceEncounter.allergies.split(/[\n,]/).map((item: string) => item.trim()).filter(Boolean)
      );
    }
    if (sourceEncounter?.chronic_conditions) {
      comorbidities.push(
        ...sourceEncounter.chronic_conditions.split(/[\n,]/).map((item: string) => item.trim()).filter(Boolean)
      );
    }

    // Gather current medications from prescriptions
    if (orders?.prescriptions) {
      for (const rx of orders.prescriptions) {
        if (rx.status !== 'CANCELLED' && rx.status !== 'EXPIRED') {
          for (const item of rx.items) {
            currentMeds.push(`${item.drug_name} ${item.dosage} ${item.frequency}`);
          }
        }
      }
    }
    if (sourceEncounter?.current_medications) {
      currentMeds.push(
        ...sourceEncounter.current_medications.split(/[\n,]/).map((item: string) => item.trim()).filter(Boolean)
      );
    }

    return {
      patient_age: admission?.patient_age ?? 0,
      patient_sex: admission?.patient_gender === 'M' ? 'male' : 'female',
      allergies: Array.from(new Set(allergies)),
      comorbidities: Array.from(new Set(comorbidities)),
      current_medications: Array.from(new Set(currentMeds)),
    };
  }, [admission, orders, patientContext?.patient, sourceEncounter]);

  const latestWardRound = useMemo(() => getLatestWardRound(wardRounds?.results ?? []), [wardRounds?.results]);

  const admissionClinicalNotes = useMemo(() => {
    return buildAdmissionAIClinicalNotes({
      sourceEncounter,
      wardRounds: wardRounds?.results ?? [],
      wardRoundLimit: 5,
    });
  }, [sourceEncounter, wardRounds?.results]);

  const encounterCtx = useMemo((): AIEncounterContext => {
    const latestRound = latestWardRound;
    const vitals = latestRound?.vital_signs;

    return {
      chief_complaint: sourceEncounter?.chief_complaint || admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || undefined,
      clinical_notes: admissionClinicalNotes || undefined,
      admission_diagnosis: admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || undefined,
      ward_name: admission?.ward_name || undefined,
      bed_number: admission?.bed_number || undefined,
      admission_status: admission?.admission_status,
      length_of_stay_days: lengthOfStay,
      condition_status: latestRound?.condition_status,
      diet: latestRound?.diet_orders || admission?.diet || undefined,
      special_instructions: admission?.special_instructions || undefined,
      vitals: vitals ? {
        temperature: vitals.temperature ?? undefined,
        pulse: vitals.pulse ?? undefined,
        spo2: vitals.spo2 ?? undefined,
        rr: vitals.respiratory_rate ?? undefined,
      } : undefined,
    };
  }, [admission, latestWardRound, lengthOfStay, sourceEncounter, admissionClinicalNotes]);

  // Build supplementary text for AI prompts with investigations, prescriptions, ward round progress
  const clinicalHistoryText = useMemo(() => {
    const parts: string[] = [];

    if (sourceEncounter) {
      const sourceParts = [
        sourceEncounter.chief_complaint ? `Chief complaint: ${sourceEncounter.chief_complaint}` : null,
        sourceEncounter.history_of_present_illness ? `HPI: ${sourceEncounter.history_of_present_illness}` : null,
        sourceEncounter.assessment ? `Assessment: ${sourceEncounter.assessment}` : null,
      ].filter(Boolean);
      if (sourceParts.length > 0) {
        parts.push(`Source OPD encounter: ${sourceParts.join('. ')}`);
      }
    }

    // Ward rounds summary (last 3)
    if (wardRounds?.results && wardRounds.results.length > 0) {
      const recentRounds = wardRounds.results.slice(0, 3);
      const roundsSummary = recentRounds.map((wr) =>
        `${wr.round_date}: Condition ${wr.condition_status}. S: ${wr.subjective || 'N/A'}. A: ${wr.assessment || 'N/A'}. P: ${wr.plan || 'N/A'}.`
      ).join(' | ');
      parts.push(`Ward rounds: ${roundsSummary}`);
    }

    // Lab orders summary
    if (orders?.lab_orders && orders.lab_orders.length > 0) {
      const labSummary = orders.lab_orders.map((lo) => {
        const tests = lo.items.map((item) => {
          const r = item.result;
          if (r?.formatted_value) return `${item.test_name}: ${r.formatted_value}${r.is_critical_result ? ' [CRITICAL]' : ''}`;
          return `${item.test_name}: ${lo.status}`;
        }).join(', ');
        return tests;
      }).join('; ');
      parts.push(`Lab results: ${labSummary}`);
    }

    // Imaging orders summary
    if (orders?.imaging_orders && orders.imaging_orders.length > 0) {
      const imagingSummary = orders.imaging_orders.map((io) => {
        const procs = io.items.map((item) => `${item.procedure_name} (${item.modality})`).join(', ');
        return `${procs}: ${io.status}`;
      }).join('; ');
      parts.push(`Imaging: ${imagingSummary}`);
    }

    // Prescriptions summary
    if (orders?.prescriptions && orders.prescriptions.length > 0) {
      const rxSummary = orders.prescriptions
        .filter((rx) => rx.status !== 'CANCELLED')
        .map((rx) => rx.items.map((item) => `${item.drug_name} ${item.dosage} ${item.frequency}`).join(', '))
        .join('; ');
      if (rxSummary) parts.push(`Prescriptions during stay: ${rxSummary}`);
    }

    // Nursing Kardex summary
    if (kardex) {
      const kardexParts: string[] = [];
      if (kardex.mobility_status) kardexParts.push(`Mobility: ${kardex.mobility_status}`);
      if (kardex.dietary_requirements || kardex.diet) kardexParts.push(`Diet: ${kardex.dietary_requirements || kardex.diet}`);
      if (kardex.iv_access) kardexParts.push(`IV: ${kardex.iv_access}`);
      if (kardex.fall_risk && kardex.fall_risk !== 'LOW') kardexParts.push(`Fall risk: ${kardex.fall_risk}`);
      if (kardex.pressure_sore_risk && kardex.pressure_sore_risk !== 'LOW') kardexParts.push(`Pressure sore risk: ${kardex.pressure_sore_risk}`);
      if (kardex.isolation_required) kardexParts.push(`Isolation: ${kardex.isolation_type || 'Yes'}`);
      // Active nursing care plan entries
      const activeEntries = (kardex.care_plan_entries || []).filter((e) => e.status === 'ACTIVE' || e.status === 'ONGOING');
      if (activeEntries.length > 0) {
        const cpSummary = activeEntries.slice(0, 3).map((e) => `${e.nursing_diagnosis} (${e.evaluation || e.implementation || 'ongoing'})`).join('; ');
        kardexParts.push(`Active nursing problems: ${cpSummary}`);
      }
      if (kardexParts.length > 0) parts.push(`Nursing kardex: ${kardexParts.join('. ')}`);
    }

    // Observation charts — recent TPR
    const temps = temperatureData?.results;
    if (temps && temps.length > 0) {
      const tprSummary = temps.slice(0, 3).map((t) => {
        const bits = [`${t.temperature}°C`];
        if (t.pulse != null) bits.push(`HR ${t.pulse}`);
        if (t.respiratory_rate != null) bits.push(`RR ${t.respiratory_rate}`);
        return bits.join('/');
      }).join(', ');
      parts.push(`Recent TPR: ${tprSummary}`);
    }

    // BP monitoring
    const bps = bpData?.results;
    if (bps && bps.length > 0) {
      const bpSummary = bps.slice(0, 3).map((bp) => bp.bp_display || `${bp.systolic}/${bp.diastolic}`).join(', ');
      parts.push(`Recent BP: ${bpSummary}`);
    }

    // Fluid balance
    const fluids = fluidBalanceData?.results;
    if (fluids && fluids.length > 0) {
      const latest = fluids[0]!;
      const fluidParts: string[] = [];
      if (latest.total_intake_ml != null) fluidParts.push(`Intake ${latest.total_intake_ml}ml`);
      if (latest.total_output_ml != null) fluidParts.push(`Output ${latest.total_output_ml}ml`);
      if (latest.net_balance_ml != null) fluidParts.push(`Net ${latest.net_balance_ml > 0 ? '+' : ''}${latest.net_balance_ml}ml`);
      if (fluidParts.length > 0) parts.push(`Fluid balance (${latest.chart_date}): ${fluidParts.join(', ')}`);
    }

    // Blood transfusions
    const transfusions = transfusionData?.results;
    if (transfusions && transfusions.length > 0) {
      const txSummary = transfusions.map((t) =>
        `${t.blood_product_display || t.blood_product} ${t.amount_ml}ml${t.reaction_occurred ? ' [REACTION]' : ''}`
      ).join('; ');
      parts.push(`Blood transfusions: ${txSummary}`);
    }

    return parts.join(' \n');
  }, [sourceEncounter, wardRounds, orders, kardex, temperatureData, bpData, fluidBalanceData, transfusionData]);

  // Build suggested diagnoses from admission data + encounter + AI care plans
  const suggestedDiagnoses = useMemo(() => {
    const suggestions: { label: string; source: string; entry: DiagnosisEntry }[] = [];
    const seenCodes = new Set<string>();

    // 1. Admitting diagnosis
    if (admission?.admitting_diagnosis || admission?.admitting_diagnosis_text) {
      const code = admission.admitting_diagnosis || '';
      const text = admission.admitting_diagnosis_text || '';
      const key = code || text;
      if (key && !seenCodes.has(key)) {
        seenCodes.add(key);
        const codeVal: DiagnosisCodeValue = {
          ...emptyDiagnosisCodeValue(),
          icd10Display: code ? `${code} - ${text}` : text,
        };
        suggestions.push({
          label: code ? `${code} — ${text}` : text,
          source: 'Admitting',
          entry: { role: suggestions.length === 0 ? 'PRIMARY' : 'SECONDARY', code: codeVal },
        });
      }
    }

    // 2. Encounter diagnoses (from the source OPD encounter)
    if (encounterDiagnoses && Array.isArray(encounterDiagnoses)) {
      for (const d of encounterDiagnoses as any[]) {
        let key = '';
        let codeVal: DiagnosisCodeValue = emptyDiagnosisCodeValue();

        if (d.icd11_code) {
          key = d.icd11_code;
          codeVal = { ...codeVal, icd11Code: d.icd11_code, icd11Display: `${d.icd11_code} - ${d.icd11_display || d.free_text_diagnosis || ''}` };
        } else if (d.icd10_code || d.icd10_display) {
          const display = d.icd10_display || '';
          const codeStr = display.split(' - ')[0] || String(d.icd10_code || '');
          key = codeStr;
          const text = display.split(' - ').slice(1).join(' - ') || d.free_text_diagnosis || '';
          codeVal = { ...codeVal, icd10Code: d.icd10_code || null, icd10Display: `${codeStr} - ${text}` };
        } else if (d.free_text_diagnosis) {
          key = d.free_text_diagnosis;
          codeVal = { ...codeVal, icd10Display: d.free_text_diagnosis };
        }

        if (key && !seenCodes.has(key)) {
          seenCodes.add(key);
          const label = codeVal.icd11Display || codeVal.icd10Display || key;
          suggestions.push({
            label: label.replace(' - ', ' — '),
            source: d.diagnosis_type === 'PRIMARY' ? 'Primary Dx' : 'Encounter',
            entry: { role: suggestions.length === 0 ? 'PRIMARY' : 'SECONDARY', code: codeVal },
          });
        }
      }
    }

    // 3. AI Care Plan conditions (if stored)
    if (storedCarePlans && Array.isArray(storedCarePlans)) {
      for (const cp of storedCarePlans as any[]) {
        const condition = cp.condition || cp.primary_diagnosis || '';
        if (condition && !seenCodes.has(condition)) {
          seenCodes.add(condition);
          suggestions.push({
            label: condition,
            source: 'TibaBot',
            entry: { role: 'SECONDARY', code: { ...emptyDiagnosisCodeValue(), icd10Display: condition } },
          });
        }
      }
    }

    return suggestions;
  }, [admission, encounterDiagnoses, storedCarePlans]);

  const handleAddSuggestion = useCallback((entry: DiagnosisEntry) => {
    setDiagnoses((prev) => {
      // If adding a PRIMARY and one already exists, add as SECONDARY instead
      const hasPrimary = prev.some((d) => d.role === 'PRIMARY');
      const role = entry.role === 'PRIMARY' && hasPrimary ? 'SECONDARY' : entry.role;
      return [...prev, { ...entry, role }];
    });
  }, []);

  // Wire TibaBot context so the AI chat widget is admission-aware
  useEffect(() => {
    if (!setEncounterAwareContext || !admission) return;

    setEncounterAwareContext(
      patientCtx,
      encounterCtx
    );

    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [admission, setEncounterAwareContext, patientCtx, encounterCtx]);

  const addMedication = () => {
    const newMed: DischargeMedication = {
      drug_name: '',
      dosage: '',
      frequency: '',
      duration: '',
      instructions: '',
      dispensing_type: 'INTERNAL',
    };
    setMedications([...medications, newMed]);
  };

  const toggleRxSelection = (rxId: number) => {
    setSelectedRxIds((prev) => {
      const next = new Set(prev);
      if (next.has(rxId)) {
        next.delete(rxId);
      } else {
        next.add(rxId);
      }
      return next;
    });
  };

  const changeRxDispensingType = (rxId: number, type: 'INTERNAL' | 'EXTERNAL') => {
    setRxDispensingTypes((prev) => ({ ...prev, [rxId]: type }));
  };

  const updateMedication = (index: number, field: keyof DischargeMedication, value: string) => {
    const updated: DischargeMedication[] = medications.map((med, i) => {
      if (i === index) {
        return { ...med, [field]: value };
      }
      return med;
    });
    setMedications(updated);
  };

  const removeMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  // AI generation (delegated to hook)
  const {
    clinicalDocument,
    handleGenerateAll,
    handleGenerateSection,
    handleGenerateFollowUp,
    handleGeneratePatientInstructions,
    handleGenerateMedSuggestions,
  } = useDischargeAI({
    admission,
    diagnoses,
    medications,
    lengthOfStay,
    dischargeType,
    patientCtx,
    sourceEncounter,
    ipdEncounter,
    clinicalHistoryText,
    generationMode,
    orders,
    wardRounds,
    storedCarePlans: storedCarePlans as any[] | undefined,
    temperatureReadings: temperatureData?.results,
    bpReadings: bpData?.results,
    templateLayout: defaultTemplate?.layout,
    templateSections: defaultTemplate?.sections,
    followUpInstructions,
    followUpDate,
    patientInstructions,
    setSections,
    setEditingSectionId,
    setGeneratingSectionId,
    setSuggestedMeds,
    setGeneratingMeds,
    setGeneratingFollowUp,
    setGeneratingPatientInstructions,
    setFollowUpInstructions,
    setFollowUpDate,
    setPatientInstructions,
    setInstructionsGenerated,
    sections,
  });

  // Section management handlers
  const updateSection = useCallback((sectionId: string, newContent: string) => {
    setSections((prev) =>
      prev.map((s) => s.id === sectionId ? { ...s, content: newContent, advisories: undefined } : s)
    );
  }, []);

  const handleAddSection = useCallback(() => {
    const newSection: DischargeSummarySection = {
      id: createSectionId(),
      title: 'New Section',
      content: '',
      source: 'manual',
    };
    setSections((prev) => [...prev, newSection]);
    setEditingSectionId(newSection.id);
  }, []);

  const handleRemoveSection = useCallback((sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    if (editingSectionId === sectionId) setEditingSectionId(null);
  }, [editingSectionId]);

  const handleRenameSection = useCallback((sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) => s.id === sectionId ? { ...s, title: newTitle } : s)
    );
  }, []);

  // Helper to extract code string from DiagnosisEntry
  const getDiagCode = (entry: DiagnosisEntry) =>
    entry.code.icd11Code || entry.code.icd10Display?.split(' - ')[0] || '';
  const getDiagDescription = (entry: DiagnosisEntry) =>
    entry.code.icd11Display?.split(' - ').slice(1).join(' - ') ||
    entry.code.icd10Display?.split(' - ').slice(1).join(' - ') || '';

  // Execute the actual discharge submission
  const executeDischarge = async () => {
    if (!admission) return;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryCode = primaryEntry ? getDiagCode(primaryEntry) : admission.admitting_diagnosis || '';
    const primaryText = primaryEntry ? getDiagDescription(primaryEntry) : admission.admitting_diagnosis_text || '';
    try {
      // Mark selected prescriptions as discharge medications on the server
      const rxUpdatePromises = Array.from(selectedRxIds).map((rxId) => {
        const dispensingType = rxDispensingTypes[rxId] ?? 'INTERNAL';
        return updatePrescription.mutateAsync({
          id: rxId,
          data: { is_discharge_medication: true, dispensing_type: dispensingType },
        });
      });
      // Also unmark prescriptions that were previously marked but are now deselected
      const previouslyMarked = admissionPrescriptions.filter((rx) => rx.is_discharge_medication);
      const unmarkPromises = previouslyMarked
        .filter((rx) => !selectedRxIds.has(rx.id))
        .map((rx) =>
          updatePrescription.mutateAsync({
            id: rx.id,
            data: { is_discharge_medication: false },
          })
        );
      await Promise.all([...rxUpdatePromises, ...unmarkPromises]);

      // Build discharge_medications list from selected prescriptions + manual entries
      const rxMeds: DischargeMedication[] = admissionPrescriptions
        .filter((rx) => selectedRxIds.has(rx.id))
        .flatMap((rx) =>
          rx.items
            .filter((item) => !item.is_cancelled)
            .map((item) => ({
              drug_name: item.drug_name || `Drug #${item.drug}`,
              dosage: item.dosage,
              frequency: item.frequency,
              duration: item.duration,
              instructions: item.instructions || '',
              prescription_id: rx.id,
              dispensing_type: rxDispensingTypes[rx.id] ?? rx.dispensing_type ?? 'INTERNAL',
            }))
        );
      const manualMeds = medications
        .filter((m) => m.drug_name)
        .map((m) => ({ ...m, dispensing_type: m.dispensing_type ?? 'EXTERNAL' as const }));
      const allDischargeMeds = [...rxMeds, ...manualMeds];

      const result = await createDischarge.mutateAsync({
        admission: admissionId,
        discharge_type: dischargeType,
        discharge_date: new Date().toISOString(),
        discharged_by: user?.id || 0,
        admission_diagnosis: admission.admitting_diagnosis || '',
        final_diagnosis: primaryCode,
        final_diagnosis_text: primaryText,
        diagnoses: diagnoses
          .filter((d) => getDiagCode(d))
          .map((d) => ({
            role: d.role,
            code: getDiagCode(d),
            description: getDiagDescription(d),
          })),
        treatment_summary: dischargeSummary,
        patient_instructions: patientInstructions,
        maternity_continuity_action: admission.mch_registration ? maternityContinuityAction : undefined,
        follow_up_date: followUpDate || undefined,
        follow_up_instructions: followUpInstructions || undefined,
        discharge_medications: allDischargeMeds,
      });
      clearDraft();

      // Redirect to Last Office for deceased discharges so clinician can complete
      // cause of death, certification, and morgue details
      if (dischargeType === 'DECEASED' && result.death_record_id) {
        toast({ title: 'Patient Deceased', description: 'Redirecting to Last Office to complete death record...' });
        router.push(`/last-office/${result.death_record_id}`);
      } else {
        toast({ title: 'Success', description: 'Patient discharged successfully' });
        router.push('/admissions');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to discharge patient', variant: 'destructive' });
      console.error(error);
    }
  };

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);

    if (!admission || !dischargeSummary || !patientInstructions) {
      const missing: string[] = [];
      if (!dischargeSummary) missing.push('Discharge Summary');
      if (!patientInstructions) missing.push('Patient Instructions');
      toast({
        title: 'Required Fields Missing',
        description: `Please complete: ${missing.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    if (requiresMaternityContinuityAction && maternityContinuityAction === 'NONE') {
      toast({
        title: 'Maternity Continuity Required',
        description: 'Choose whether to schedule early PNC or route directly to the PNC queue.',
        variant: 'destructive',
      });
      return;
    }

    if (requiresScheduledFollowUpDate && !followUpDate) {
      toast({
        title: 'Follow-up Date Required',
        description: 'Scheduling early PNC requires a follow-up date.',
        variant: 'destructive',
      });
      return;
    }

    if (!clearanceSatisfied) {
      toast({
        title: 'Clearances Required',
        description: 'All department clearances must be completed before discharge',
        variant: 'destructive',
      });
      return;
    }

    // Run CDS safety checks if AI is enabled
    if (isAIEnabled) {
      try {
        const allDiagTexts = diagnoses
          .map((d) => d.code.icd11Display || d.code.icd10Display || '')
          .filter(Boolean);
        if (allDiagTexts.length === 0 && (admission.admitting_diagnosis_text || admission.admitting_diagnosis)) {
          allDiagTexts.push(admission.admitting_diagnosis_text || admission.admitting_diagnosis || '');
        }
        const medNames = medications.filter((m) => m.drug_name).map((m) => m.drug_name);
        const cdsResult = await cdsEvaluate.mutateAsync({
          medications: medNames,
          diagnoses: allDiagTexts,
          patient_age: admission.patient_age,
          patient_sex: admission.patient_gender === 'M' ? 'male' : admission.patient_gender === 'F' ? 'female' : null,
        });
        if (cdsResult.alerts && cdsResult.alerts.length > 0) {
          setCdsAlerts(cdsResult.alerts);
          setShowCdsDialog(true);
          return; // Wait for clinician to acknowledge
        }
      } catch {
        // CDS check failed — proceed without blocking discharge
      }
    }

    await executeDischarge();
  };

  /** Print helper — shows a helpful toast if no discharge template is configured. */
  const handlePrint = (content: string, title: string) => {
    if (!defaultTemplate) {
      toast({
        title: 'Using default print layout',
        description: 'No discharge template configured for this facility. Go to Settings → Facility → Discharge Templates to set one up.',
      });
    }
    printDischargeDocument({
      documentTitle: defaultTemplate?.header_title || title,
      content,
      patientName: admission?.patient_name || '',
      patientMRN: patientContext?.patient?.mrn,
      patientAge: admission?.patient_age ? `${admission.patient_age} Years` : undefined,
      patientSex: admission?.patient_gender === 'M' ? 'Male' : admission?.patient_gender === 'F' ? 'Female' : admission?.patient_gender === 'O' ? 'Other' : undefined,
      admissionNumber: admission?.admission_number,
      wardName: admission?.ward_name || '',
      admissionDate: admission?.admission_date,
      admittingDiagnosis: admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || '',
      facilityName: facility?.name,
      facilityMflCode: facility?.mfl_code,
      facilityLocation: facilityDetail ? `${facilityDetail.sub_county_name}, ${facilityDetail.county_name}` : undefined,
      facilityLogoUrl: facilityDetail?.effective_logo_url,
      consultantName: deriveConsultantName(admission, wardRounds?.results),
      departmentName: admission?.ward_name || '',
      layout: defaultTemplate?.layout,
      showSignatureLines: defaultTemplate?.show_signature_lines,
      showQrCode: defaultTemplate?.show_qr_code,
    });
  };

  if (isLoading) {
    return <DischargeSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot discharge a patient without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (admission.admission_status !== 'ACTIVE') {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Patient Already Discharged</p>
        <p className="text-muted-foreground mt-2">
          This admission has already been discharged or is inactive.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission Details
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 lg:px-8 space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      <PageHeader
        title="Discharge Patient"
        helpContent={`Discharging ${admission.patient_name} from ${admission.ward_name}. Complete the discharge summary, medications, and clearances.`}
      />

      {/* Patient Summary with LOS */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Admission Summary</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {patientContext?.hasSHA && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">SHA</Badge>
              )}
              {patientContext?.isVerified && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">CR Verified</Badge>
              )}
              {patientContext?.isSensitive && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">Sensitive</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: compact key-value list; sm+: grid */}
          <div className="hidden sm:grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-sm text-muted-foreground">Admission Number</p>
              <p className="font-medium">{admission.admission_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
              {patientContext?.patient?.mrn && (
                <p className="text-xs text-muted-foreground">{patientContext.patient.mrn}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admitting Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Length of Stay</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {lengthOfStay} days
              </p>
            </div>
          </div>
          {/* Mobile compact layout */}
          <div className="sm:hidden space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Patient</span>
              <span className="font-medium text-right">{admission.patient_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Admission #</span>
              <span className="font-medium text-right break-all">{admission.admission_number}</span>
            </div>
            {patientContext?.patient?.mrn && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">MRN</span>
                <span className="font-medium text-right">{patientContext.patient.mrn}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Ward / Bed</span>
              <span className="font-medium text-right">{admission.ward_name} - {admission.bed_number}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Diagnosis</span>
              <span className="font-medium text-right">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Length of Stay</span>
              <span className="font-medium flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {lengthOfStay} days
              </span>
            </div>
          </div>
          {admission.mch_registration && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">Maternity Episode</p>
              <p className="mt-1 text-amber-900">
                Linked to {admission.mch_registration_number || `MCH #${admission.mch_registration}`}. Choose whether discharge should schedule early PNC or send the mother directly to the PNC queue.
              </p>
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-amber-900">
                <Link href={`/mch/${admission.mch_registration}`}>Open MCH registration</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Discharge Readiness Assessment */}
      {isAIEnabled && (
        <DischargeReadinessPanel
          admissionId={admissionId}
          patientAge={admission.patient_age ?? 0}
          primaryDiagnosis={admission.admitting_diagnosis_text || admission.admitting_diagnosis || ''}
          daysAdmitted={lengthOfStay}
          vitalsHistory={wardRounds?.results?.map((wr) => {
            const v = wr.vital_signs;
            const bpStr = v?.blood_pressure || wr.blood_pressure;
            const bp = bpStr?.split('/').map(Number);
            return {
              timestamp: `${wr.round_date}T${wr.round_time}`,
              heart_rate: v?.pulse ?? wr.pulse ?? null,
              systolic_bp: bp?.[0] ?? null,
              diastolic_bp: bp?.[1] ?? null,
              temperature: v?.temperature ?? wr.temperature ?? null,
              respiratory_rate: v?.respiratory_rate ?? wr.respiratory_rate ?? null,
              oxygen_saturation: v?.spo2 ?? wr.spo2 ?? null,
            };
          }).filter((v) =>
            v.heart_rate != null || v.temperature != null || v.oxygen_saturation != null ||
            v.systolic_bp != null || v.respiratory_rate != null
          )}
          labResults={orders?.lab_orders?.flatMap((lo) =>
            lo.items
              .filter((item) => item.has_result && item.result)
              .map((item) => ({
                test_name: item.test_name || 'Unknown',
                value: item.result?.numeric_value ?? 0,
                unit: item.result?.result_unit || '',
              }))
          )}
          currentMedications={patientCtx.current_medications}
          hasFollowUpArranged={!!followUpDate}
          hasNhifOrSha={patientContext?.hasSHA ?? null}
        />
      )}

      {/* Discharge Type — positioned early so clearance logic reacts to the selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discharge Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Select value={dischargeType} onValueChange={(v) => setDischargeType(v as DischargeType)}>
              <SelectTrigger id="discharge-type" aria-label="Discharge Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCHARGE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!clearanceRequired && (
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Department clearances are bypassed for {DISCHARGE_TYPES.find((t) => t.value === dischargeType)?.label?.toLowerCase()} discharges.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Automated Department Clearances */}
      <ClearanceStatusPanel admissionId={admissionId} />

      {/* Facility module warnings for discharge workflows */}
      <FacilityModuleWarning
        module="pharmacy"
        label="Pharmacy"
        message="Pharmacy module is not enabled at this facility. Discharge medications will need to be dispensed through an external pharmacy."
      />
      <FacilityModuleWarning
        module="laboratory"
        label="Laboratory"
        message="Laboratory module is not enabled at this facility. Ensure pending lab results from referral facilities are reviewed before discharge."
      />

      {/* Clinical Reference — collapsed card with ward rounds, labs, kardex, observation charts */}
      <ClinicalReferenceCard
        wardRounds={wardRounds}
        orders={orders}
        kardex={kardex}
        temperatureReadings={temperatureData?.results}
        fluidBalanceSheets={fluidBalanceData?.results}
        bpReadings={bpData?.results}
        bloodTransfusions={transfusionData?.results}
      />

      {/* Discharge Form */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Discharge Summary</CardTitle>
              <CardDescription>
                Complete the discharge summary and follow-up instructions
              </CardDescription>
            </div>
            {printableSummary && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePrint(printableSummary, 'Discharge Summary')}
                className="gap-1.5 text-xs shrink-0 w-full sm:w-auto"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Discharge Diagnoses — Suggestions + Manual Add */}
          <div className="space-y-3">
            {/* Suggested diagnoses from admission / encounter / AI */}
            {suggestedDiagnoses.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Suggested Diagnoses</Label>
                  <HelpPopover content="Quick-add diagnoses from the admitting diagnosis, encounter record, or TibaBot care plans. Click + to add them to the discharge diagnoses below." />
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                  {suggestedDiagnoses.map((suggestion, idx) => {
                    // Check if already added
                    const alreadyAdded = diagnoses.some((d) => {
                      const existingKey = d.code.icd11Code || d.code.icd10Display || d.code.snomedCode || '';
                      const suggestionKey = suggestion.entry.code.icd11Code || suggestion.entry.code.icd10Display || suggestion.entry.code.snomedCode || '';
                      return existingKey === suggestionKey;
                    });
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddSuggestion(suggestion.entry)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors max-w-full ${
                          alreadyAdded
                            ? 'border-muted bg-muted/50 text-muted-foreground cursor-not-allowed'
                            : 'border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40'
                        }`}
                      >
                        {!alreadyAdded && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {alreadyAdded && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                        <span className="truncate min-w-0">{suggestion.label}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {suggestion.source}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <MultiDiagnosisInput
              value={diagnoses}
              onChange={setDiagnoses}
              label={<><span className="sm:hidden">Discharge Dx(s)</span><span className="hidden sm:inline">Discharge Diagnoses</span></>}
            />
          </div>

          {/* Summary Sections */}
          <div className={`space-y-3 rounded-lg p-3 -m-3 transition-colors ${hasAttemptedSubmit && !dischargeSummary ? 'ring-2 ring-destructive/50 bg-destructive/5' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="shrink-0">Summary Sections *</Label>
                {hasAttemptedSubmit && !dischargeSummary && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Required</Badge>
                )}
                <HelpPopover content="Add, remove, and customize sections. Use 'Generate with TibaBot' per section or 'Generate All' to draft the entire summary at once." />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAIEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateAll}
                    disabled={clinicalDocument.isPending}
                    className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    {clinicalDocument.isPending && !generatingSectionId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Generate All</span>
                  </Button>
                )}
              </div>
            </div>

            {/* AI Mode Toggle */}
            {isAIEnabled && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">TibaBot Mode</span>
                </div>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 w-fit cursor-default">
                        <Switch
                          checked={generationMode === 'suggest'}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setShowSuggestModeDialog(true);
                            } else {
                              setGenerationMode('generate');
                            }
                          }}
                        />
                        <span className="text-sm font-medium">
                          {generationMode === 'suggest' ? (
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              Suggest Mode
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-300">Experimental</Badge>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                              Strict Mode
                            </span>
                          )}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {generationMode === 'suggest'
                        ? 'Switch to Strict mode — facts-only output safe for audit trails and legal records'
                        : 'Switch to Suggest mode — experimental rich drafts with AI-synthesised narratives (requires acknowledgement)'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* Info: patient details are auto-included */}
            <p className="text-xs text-muted-foreground">
              Patient details, admission info, and diagnoses are included automatically — no need to add those as sections.
            </p>

            {/* Section Cards */}
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isEditing={editingSectionId === section.id}
                isGenerating={generatingSectionId === section.id}
                isAIEnabled={isAIEnabled}
                isAIPending={clinicalDocument.isPending}
                hasActiveGeneration={!!generatingSectionId}
                onContentChange={(content) => updateSection(section.id, content)}
                onRename={(title) => handleRenameSection(section.id, title)}
                onToggleEdit={() => setEditingSectionId(editingSectionId === section.id ? null : section.id)}
                onRemove={() => handleRemoveSection(section.id)}
                onClear={() => updateSection(section.id, '')}
                onGenerate={() => handleGenerateSection(section.id)}
                onTogglePrintable={() => setSections((prev) =>
                  prev.map((s) => s.id === section.id ? { ...s, printable: s.printable === false ? true : false } : s)
                )}
              />
            ))}

            {/* Add Section */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSection}
              className="w-full border-dashed"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Section</span>
            </Button>
          </div>

          {/* Patient Instructions */}
          <div className={`space-y-2 rounded-lg p-3 -m-3 transition-colors ${hasAttemptedSubmit && !patientInstructions ? 'ring-2 ring-destructive/50 bg-destructive/5' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Label htmlFor="patient-instructions" className="shrink-0">Patient Instructions *</Label>
                {hasAttemptedSubmit && !patientInstructions && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Required</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {patientInstructions && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePrint(patientInstructions, 'Patient Discharge Instructions')}
                    className="gap-1.5 text-xs"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                )}
                {isAIEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGeneratePatientInstructions}
                    disabled={generatingPatientInstructions || clinicalDocument.isPending}
                    className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    {generatingPatientInstructions ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{patientInstructions ? 'Regenerate' : 'Generate'}</span>
                  </Button>
                )}
              </div>
            </div>
            {instructionsGenerated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <BrainCircuit className="h-3 w-3 text-purple-400" />
                Auto-populated from TibaBot discharge summary. Edit below.
              </p>
            )}
            {clinicalDocument.isPending && !patientInstructions ? (
              <div className="rounded-md border bg-muted/30 p-4 space-y-2 animate-pulse">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : instructionsGenerated ? (
              <MarkdownPreview
                value={patientInstructions}
                onChange={setPatientInstructions}
                placeholder="Discharge instructions for patient..."
                rows={3}
              />
            ) : (
              <Textarea
                id="patient-instructions"
                value={patientInstructions}
                onChange={(e) => setPatientInstructions(e.target.value)}
                placeholder="Discharge instructions for patient..."
                rows={3}
              />
            )}
          </div>

          {admission.mch_registration && (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="space-y-1">
                <Label htmlFor="maternity-continuity-action">Postpartum Continuity Action *</Label>
                <p className="text-sm text-amber-900">
                  Make early PNC part of the discharge workflow instead of documenting follow-up only.
                </p>
              </div>
              <Select
                value={maternityContinuityAction}
                onValueChange={(value) => setMaternityContinuityAction(value as MaternityContinuityAction)}
              >
                <SelectTrigger id="maternity-continuity-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERNITY_CONTINUITY_ACTIONS.map((action) => (
                    <SelectItem key={action.value} value={action.value} title={action.description}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground dark:text-amber-300">
                {MATERNITY_CONTINUITY_ACTIONS.find((action) => action.value === maternityContinuityAction)?.description}
              </p>
            </div>
          )}

          {/* Follow-up */}
          <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <div className="space-y-2">
              <Label htmlFor="follow-up-date">
                {requiresScheduledFollowUpDate ? 'Early PNC Date *' : 'Follow-up Date'}
              </Label>
              <DatePicker
                value={followUpDate ? parseISO(followUpDate) : undefined}
                onChange={(date) => setFollowUpDate(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder={requiresScheduledFollowUpDate ? 'Select early PNC date' : admission.mch_registration ? 'Optional when routing directly to PNC' : 'Select follow-up date'}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="follow-up-instructions">Follow-up Instructions</Label>
                {isAIEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateFollowUp}
                    disabled={generatingFollowUp || clinicalDocument.isPending}
                    className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 h-auto py-0.5"
                  >
                    {generatingFollowUp ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Generate</span>
                  </Button>
                )}
              </div>
              <Input
                id="follow-up-instructions"
                value={followUpInstructions}
                onChange={(e) => setFollowUpInstructions(e.target.value)}
                placeholder={admission.mch_registration ? 'e.g., Escort mother to PNC queue after pharmacy clearance' : 'e.g., Return to OPD in 2 weeks'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discharge Medications */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Discharge Medications</CardTitle>
              <CardDescription>
                Select from existing prescriptions or add new take-home medications
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isAIEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateMedSuggestions}
                  disabled={generatingMeds || clinicalDocument.isPending}
                  className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 w-full sm:w-auto"
                >
                  {generatingMeds ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BrainCircuit className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Suggest with TibaBot</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addMedication} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add New</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing admission prescriptions to select from */}
          <AdmissionPrescriptionsPicker
            prescriptions={admissionPrescriptions}
            selectedIds={selectedRxIds}
            dispensingTypes={rxDispensingTypes}
            onToggle={toggleRxSelection}
            onDispensingTypeChange={changeRxDispensingType}
          />

          {/* AI medication suggestions */}
          <MedicationSuggestions
            suggestedMeds={suggestedMeds}
            medications={medications}
            onAddMedication={(med) => {
              setMedications((prev) => [...prev, {
                drug_name: med.drug_name,
                dosage: med.dosage,
                frequency: med.frequency,
                duration: med.duration,
                instructions: '',
                dispensing_type: 'EXTERNAL',
              }]);
            }}
          />

          {/* Manual medication entries */}
          {medications.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <Label className="text-sm font-medium">Additional Medications</Label>
              {medications.map((med, index) => (
                <div key={index} className="p-3 sm:p-4 border rounded-lg space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm sm:text-base">Medication {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedication(index)}
                      className="text-destructive h-7 w-7 p-0 sm:h-8 sm:w-auto sm:px-3"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2.5 sm:gap-4 grid-cols-2 sm:grid-cols-3">
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <Label className="text-xs sm:text-sm">Medication Name *</Label>
                      <Input
                        value={med.drug_name}
                        onChange={(e) => updateMedication(index, 'drug_name', e.target.value)}
                        placeholder="e.g., Amoxicillin"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs sm:text-sm">Dosage *</Label>
                      <Input
                        value={med.dosage}
                        onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                        placeholder="e.g., 500mg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs sm:text-sm">Frequency *</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                        placeholder="e.g., 8 hourly"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:gap-4 grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs sm:text-sm">Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs sm:text-sm">Instructions</Label>
                      <Input
                        value={med.instructions || ''}
                        onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                        placeholder="e.g., After meals"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {medications.length === 0 && selectedRxIds.size === 0 && suggestedMeds.length === 0 && admissionPrescriptions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No discharge medications added. Click &quot;Add New&quot; to add manually.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createDischarge.isPending || cdsEvaluate.isPending || !dischargeSummary || !patientInstructions || !clearanceSatisfied || (requiresScheduledFollowUpDate && !followUpDate)}
          className="w-full sm:w-auto"
        >
          {cdsEvaluate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {createDischarge.isPending ? 'Discharging...' : cdsEvaluate.isPending ? 'Running safety checks...' : 'Confirm Discharge'}
        </Button>
      </div>

      {/* CDS Safety Check Dialog */}
      <AlertDialog open={showCdsDialog} onOpenChange={setShowCdsDialog}>
        <AlertDialogContent className="max-w-lg mx-4 sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Safety Alerts
            </AlertDialogTitle>
            <AlertDialogDescription>
              TibaBot identified the following concerns. Review before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cdsAlerts.map((alert, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 space-y-1 ${
                  alert.severity === 'critical'
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    : alert.severity === 'high'
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${
                    alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                  <span className="text-sm font-medium">{alert.title}</span>
                  <Badge variant="outline" className="ml-auto text-xs">{alert.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                {alert.recommendation && (
                  <p className="text-xs text-muted-foreground italic">{alert.recommendation}</p>
                )}
              </div>
            ))}
          </div>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel>Go Back & Review</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDischarge}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Acknowledge & Discharge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suggest Mode Disclaimer Dialog */}
      <AlertDialog open={showSuggestModeDialog} onOpenChange={setShowSuggestModeDialog}>
        <AlertDialogContent className="max-w-lg mx-4 sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Suggest Mode is Experimental
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Suggest mode uses AI to generate rich narrative drafts with synthesised clinical content.
                  This content <strong>may contain inaccuracies, hallucinated details, or missing information</strong>.
                </p>
                <p>
                  You are responsible for verifying every section before filing.
                  For audit-safe, facts-only output, use <strong>Strict Mode</strong> (default).
                </p>
                <p className="text-xs text-muted-foreground">
                  Your acknowledgement will be logged for accountability.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel>Stay on Strict Mode</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setGenerationMode('suggest');
                // Audit-log the mode change acknowledgement
                suggestionAudit.mutate({
                  suggestion_type: 'mode_change',
                  event_type: 'acknowledged',
                  suggestions: [{
                    field_name: 'generation_mode',
                    source: 'ai',
                    accepted_value: 'suggest',
                  }],
                });
              }}
            >
              I Understand — Enable Suggest Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DischargeSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-96" />
    </div>
  );
}
