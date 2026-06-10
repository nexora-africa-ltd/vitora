import { useCallback } from 'react';
import { useAIClinicalDocument, useAIClinicalAssist } from '@/lib/hooks/use-ai';
import { useToast } from '@/lib/hooks/use-toast';
import type { ClinicalDocAdmissionContext, ClinicalDocPatientContext, ClinicalDocGenerationMode, AIPatientContext, ClinicalDocSection, ClinicalDocEncounterContext } from '@/lib/types/ai';
import type { Encounter } from '@/lib/types/encounter';
import type { DischargeType, DischargeTemplateLayout, DischargeTemplateSectionConfig, DischargeMedication, AdmissionOrdersResponse, WardRound, TemperatureReading, BPMonitoringReading } from '@/lib/types/inpatient';
import type { DiagnosisEntry } from '@/components/shared';
import type { DischargeSummarySection, ParsedSection, SuggestedMedication } from './types';
import { ROUTED_SECTION_IDS, HIDDEN_SECTION_IDS, DEDICATED_FIELD_KEYS } from './types';
import { buildSourceEncounterClinicalSummary } from '@/lib/utils/inpatient-ai-context';
import {
  parseAdvisories,
  createSectionId,
  fuzzyTitleMatch,
  extractFollowUpDate,
  parseMedicationLines,
  mergeEncounterClinicalText,
} from './utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove lines from ward round 'objective' text that are clearly
 * investigation results (lab values, imaging reports) rather than
 * physical examination findings.
 */
function stripInvestigationLines(text: string): string {
  const investigationPatterns = [
    // Lab values with units: "WBC 15.6 x10^9/L", "CRP: 42 mg/L"
    /^\s*[\w\s-]+:\s*[\d.]+\s*(?:x?\s*10[\^⁹⁶³]?\/?[Ll]|[mµμ]?(?:g|mol|IU|U|mmol|mg|mcg)\/(?:[dDlL]|mL)|%|mm\/h|mEq\/L)/i,
    // Lab status lines: "Full Blood Count: COMPLETED", "Urinalysis: CANCELLED"
    /^\s*[\w\s-]+:\s*(?:COMPLETED|CANCELLED|PENDING|REPORTED|ORDERED|COLLECTED)/i,
    // Imaging reports: "Ultrasound: ...", "CT scan: ...", "X-ray: ..."
    /^\s*(?:ultrasound|CT|MRI|X-?ray|echo|ECG|EEG)\b/i,
  ];

  return text
    .split('\n')
    .filter((line) => !investigationPatterns.some((p) => p.test(line)))
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Legacy → new section key mapping (for backward compatibility with TibaBot)
// ---------------------------------------------------------------------------

const LEGACY_KEY_MAP: Record<string, string> = {
  reason_for_admission: 'history',
  presenting_complaint: 'history',
  chief_complaint: 'history',
  complaints: 'history',
  history_of_present_illness: 'history',
  clinical_history: 'history',
  significant_findings: 'investigations',
  investigations_done: 'investigations',
  patient_education: 'discharge_instructions',
  discharge_diagnosis: 'diagnosis',
  follow_up_plan: 'follow_up',
  treatment: 'management',
  treatment_given: 'management',
  medications_given: 'management',
  medications_given_during_admission: 'management',
  medications_administered_during_admission: 'management',
  medications_administered: 'management',
  procedures: 'management',
  nursing_interventions: 'management',
  clinical_notes_events: 'hospital_course',
  clinical_notes: 'hospital_course',
  clinical_events: 'hospital_course',
  complications: 'hospital_course',
  physical_findings: 'physical_examination',
  examination: 'physical_examination',
};

function normalizeSectionKey(key: string): string {
  return LEGACY_KEY_MAP[key] ?? key;
}

function normalizeSections(sections: ClinicalDocSection[]): ClinicalDocSection[] {
  return sections.map((s) => ({
    ...s,
    section_id: normalizeSectionKey(s.section_id),
  }));
}

// ---------------------------------------------------------------------------
// Types for the hook
// ---------------------------------------------------------------------------

interface UseDischargeAIParams {
  admission: any;
  diagnoses: DiagnosisEntry[];
  medications: DischargeMedication[];
  lengthOfStay: number;
  dischargeType: DischargeType;
  patientCtx: AIPatientContext;
  sourceEncounter?: Encounter | null;
  /** The IPD encounter created on admission (co-SSOT for complaints/HPI/exam) */
  ipdEncounter?: Encounter | null;
  clinicalHistoryText: string;
  generationMode: ClinicalDocGenerationMode;
  /** Admission orders (labs, imaging, prescriptions) for context enrichment */
  orders?: AdmissionOrdersResponse | null;
  /** Ward rounds for condition-at-discharge and complication extraction */
  wardRounds?: { results: WardRound[] } | null;
  /** Stored AI care plans for management/follow-up context */
  storedCarePlans?: any[] | null;
  /** Observation chart: temperature/pulse/RR readings */
  temperatureReadings?: TemperatureReading[] | null;
  /** Observation chart: BP readings */
  bpReadings?: BPMonitoringReading[] | null;
  /** Facility's active discharge template layout */
  templateLayout?: DischargeTemplateLayout;
  /** Facility's active discharge template sections */
  templateSections?: DischargeTemplateSectionConfig[];
  // Current form state (read-only, for conditional logic)
  followUpInstructions: string;
  followUpDate: string;
  patientInstructions: string;
  // Setters
  setSections: React.Dispatch<React.SetStateAction<DischargeSummarySection[]>>;
  setEditingSectionId: React.Dispatch<React.SetStateAction<string | null>>;
  setGeneratingSectionId: React.Dispatch<React.SetStateAction<string | null>>;
  setSuggestedMeds: React.Dispatch<React.SetStateAction<SuggestedMedication[]>>;
  setGeneratingMeds: React.Dispatch<React.SetStateAction<boolean>>;
  setGeneratingFollowUp: React.Dispatch<React.SetStateAction<boolean>>;
  setGeneratingPatientInstructions: React.Dispatch<React.SetStateAction<boolean>>;
  setFollowUpInstructions: React.Dispatch<React.SetStateAction<string>>;
  setFollowUpDate: React.Dispatch<React.SetStateAction<string>>;
  setPatientInstructions: React.Dispatch<React.SetStateAction<string>>;
  setInstructionsGenerated: React.Dispatch<React.SetStateAction<boolean>>;
  sections: DischargeSummarySection[];
}

export function useDischargeAI(params: UseDischargeAIParams) {
  const {
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
    storedCarePlans,
    temperatureReadings,
    bpReadings,
    templateLayout,
    templateSections,
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
  } = params;

  const clinicalDocument = useAIClinicalDocument();
  const clinicalAssist = useAIClinicalAssist();
  const { toast } = useToast();

  // Build shared AI request context
  const buildAIContext = useCallback(() => {
    if (!admission) return null;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryDisplay = primaryEntry?.code.icd11Display || primaryEntry?.code.icd10Display || '';
    const diagnosis = primaryDisplay || admission.admitting_diagnosis_text || admission.admitting_diagnosis || '';
    const sourceEncounterSummary = buildSourceEncounterClinicalSummary(sourceEncounter);

    // Extract ICD-10 code from the primary diagnosis entry
    const icd10Code = primaryEntry?.code.icd10Code
      ? String(primaryEntry.code.icd10Code)
      : (primaryEntry?.code.icd10Display?.split(' - ')[0]) || '';

    // Secondary diagnoses
    const secondaryDiagnoses = diagnoses
      .filter((d) => d.role !== 'PRIMARY')
      .map((d) => d.code.icd11Display || d.code.icd10Display || '')
      .filter(Boolean);

    // Medications given during stay (from prescriptions) — structured objects
    const medicationsGiven: { drug_name: string; dose: string; route: string; frequency: string; duration: string }[] = [];
    if (orders?.prescriptions) {
      for (const rx of orders.prescriptions) {
        if (rx.status !== 'CANCELLED') {
          for (const item of rx.items) {
            medicationsGiven.push({
              drug_name: item.drug_name || '',
              dose: item.dosage || '',
              route: (item as any).route || 'PO',
              frequency: item.frequency || '',
              duration: item.duration || '',
            });
          }
        }
      }
    }

    // Key investigations from lab and imaging orders (exclude cancelled)
    const keyInvestigations: string[] = [];
    if (orders?.lab_orders) {
      for (const lo of orders.lab_orders) {
        if (lo.status === 'CANCELLED') continue;
        for (const item of lo.items) {
          if (item.status === 'CANCELLED') continue;
          const r = item.result;
          if (r?.formatted_value) {
            const dateStr = r.entered_at?.slice(0, 10) || lo.ordered_at?.slice(0, 10) || '';
            const dateSuffix = dateStr ? ` (${dateStr})` : '';
            keyInvestigations.push(`${item.test_name}: ${r.formatted_value}${r.is_critical_result ? ' [CRITICAL]' : ''}${dateSuffix}`);
          } else {
            keyInvestigations.push(`${item.test_name}: ${lo.status}`);
          }
        }
      }
    }
    if (orders?.imaging_orders) {
      for (const io of orders.imaging_orders) {
        if (io.status === 'CANCELLED') continue;
        for (const item of io.items) {
          const dateStr = io.completed_at?.slice(0, 10) || io.ordered_at?.slice(0, 10) || '';
          const dateSuffix = dateStr ? ` (${dateStr})` : '';
          // Use actual report content if available
          const report = io.report_summary;
          if (report && (report.findings || report.impression)) {
            const content = report.impression || report.findings;
            keyInvestigations.push(`${item.procedure_name} (${item.modality}): ${content}${dateSuffix}`);
          } else {
            keyInvestigations.push(`${item.procedure_name} (${item.modality}): ${io.status}${dateSuffix}`);
          }
        }
      }
    }

    // Condition at discharge from the most recent ward round
    const latestRound = wardRounds?.results?.[0];
    const conditionAtDischarge = latestRound
      ? `${latestRound.condition_status_display || latestRound.condition_status || 'Stable'}. ${latestRound.assessment || ''}`.trim()
      : '';

    // Clinical notes from ward rounds (chronological)
    const clinicalNotes: string[] = [];
    if (wardRounds?.results) {
      for (const round of [...wardRounds.results].reverse()) {
        const parts = [
          round.subjective ? `S: ${round.subjective}` : '',
          round.objective ? `O: ${round.objective}` : '',
          round.assessment ? `A: ${round.assessment}` : '',
          round.plan ? `P: ${round.plan}` : '',
        ].filter(Boolean);
        if (parts.length) clinicalNotes.push(parts.join('\n'));
      }
    }
    if (sourceEncounterSummary) {
      clinicalNotes.unshift(sourceEncounterSummary);
    }

    const docPatientCtx: ClinicalDocPatientContext = {
      patient_age: admission.patient_age ?? 0,
      patient_sex: admission.patient_gender === 'M' ? 'male' : 'female',
      allergies: patientCtx.allergies || [],
      comorbidities: patientCtx.comorbidities || [],
      current_medications: patientCtx.current_medications || [],
    };

    // Structured discharge medications
    const dischargeMedsStructured = medications.filter((m) => m.drug_name).map((m) => ({
      drug_name: m.drug_name,
      dose: m.dosage || '',
      route: 'PO',
      frequency: m.frequency || '',
      duration: (m as any).duration || '',
    }));

    const admissionCtx: ClinicalDocAdmissionContext = {
      primary_diagnosis: diagnosis,
      icd10_code: icd10Code || undefined,
      secondary_diagnoses: secondaryDiagnoses.length > 0 ? secondaryDiagnoses : undefined,
      admission_date: admission.admission_date || '',
      discharge_date: new Date().toISOString(),
      length_of_stay_days: lengthOfStay,
      ward: admission.ward_name || '',
      discharge_type: ({'ROUTINE': 'NORMAL', 'ABSCONDED': 'NORMAL', 'AGAINST_ADVICE': 'AMA', 'TRANSFERRED': 'TRANSFER', 'DECEASED': 'DEATH'} as Record<string, ClinicalDocAdmissionContext['discharge_type']>)[dischargeType] ?? dischargeType as ClinicalDocAdmissionContext['discharge_type'],
      medications_given: medicationsGiven.length > 0 ? medicationsGiven : undefined,
      discharge_medications: dischargeMedsStructured.length > 0 ? dischargeMedsStructured : undefined,
      key_investigations: keyInvestigations.length > 0 ? keyInvestigations : undefined,
      condition_at_discharge: conditionAtDischarge || undefined,
      follow_up_instructions: followUpInstructions || undefined,
      clinical_notes: (() => {
        const notes = clinicalNotes.length > 0 ? [...clinicalNotes] : [];
        // Append supplementary clinical history (labs, imaging, prescriptions, kardex, vitals)
        if (clinicalHistoryText) notes.push(clinicalHistoryText);
        // Append AI care plan summary (goals, interventions, discharge criteria)
        if (storedCarePlans?.length) {
          const latestPlan = storedCarePlans[0]?.result_data as any;
          if (latestPlan?.goals?.length || latestPlan?.interventions?.length) {
            const parts: string[] = [`Care Plan (${storedCarePlans[0].primary_diagnosis || 'admission'}):`];
            if (latestPlan.goals?.length) {
              parts.push(`Goals: ${latestPlan.goals.map((g: any) => g.description || g.goal || g).join('; ')}`);
            }
            if (latestPlan.interventions?.length) {
              const interventionItems = latestPlan.interventions.flatMap((cat: any) =>
                (cat.items || [cat]).map((i: any) => i.action || i.description || i.name || String(i))
              );
              if (interventionItems.length) parts.push(`Interventions: ${interventionItems.slice(0, 10).join('; ')}`);
            }
            if (latestPlan.discharge_criteria?.length) {
              parts.push(`Discharge criteria: ${latestPlan.discharge_criteria.join('; ')}`);
            }
            notes.push(parts.join(' '));
          }
        }
        return notes.length > 0 ? notes : undefined;
      })(),
    };

    // Encounter context — SSOT for Complaints, HPI, and Physical Findings is the
    // pair of (OPD/ER source encounter, IPD encounter). Ward rounds are a fallback.
    const mergedComplaint = mergeEncounterClinicalText(
      sourceEncounter?.chief_complaint,
      ipdEncounter?.chief_complaint,
    );
    const encounterCtx: ClinicalDocEncounterContext = {
      chief_complaint: mergedComplaint || '',
    };

    // HPI from OPD + IPD encounters; fall back to earliest ward round subjective.
    const mergedHpi = mergeEncounterClinicalText(
      sourceEncounter?.history_of_present_illness,
      ipdEncounter?.history_of_present_illness,
    );
    if (mergedHpi) {
      encounterCtx.hpi = mergedHpi;
    } else if (wardRounds?.results?.length) {
      const earliest = wardRounds.results[wardRounds.results.length - 1];
      if (earliest?.subjective) encounterCtx.hpi = earliest.subjective;
    }

    // Examination findings from OPD + IPD encounters; fall back to recent ward
    // round objectives (stripped of lab/imaging lines to keep PE clean).
    const mergedExam = mergeEncounterClinicalText(
      sourceEncounter?.physical_examination,
      ipdEncounter?.physical_examination,
    );
    if (mergedExam) {
      encounterCtx.examination_findings = mergedExam;
    } else if (wardRounds?.results?.length) {
      const objectiveFindings = wardRounds.results
        .filter((r) => r.objective)
        .map((r) => stripInvestigationLines(r.objective!))
        .filter(Boolean)
        .slice(0, 3); // Latest 3 rounds
      if (objectiveFindings.length) {
        encounterCtx.examination_findings = objectiveFindings.join('\n\n');
      }
    }

    // Vitals — prefer most recent observation chart data, fall back to source encounter
    const latestBP = bpReadings?.[0];
    const latestTPR = temperatureReadings?.[0];
    const wardRoundVitals = wardRounds?.results?.[0]?.vital_signs;

    const systolic = latestBP?.systolic
      ?? (wardRoundVitals?.blood_pressure ? Number(wardRoundVitals.blood_pressure.split('/')[0]) : null)
      ?? sourceEncounter?.systolic_bp
      ?? null;
    const diastolic = latestBP?.diastolic
      ?? (wardRoundVitals?.blood_pressure ? Number(wardRoundVitals.blood_pressure.split('/')[1]) : null)
      ?? sourceEncounter?.diastolic_bp
      ?? null;
    const heartRate = latestBP?.pulse ?? latestTPR?.pulse
      ?? wardRoundVitals?.pulse
      ?? sourceEncounter?.pulse
      ?? null;
    const temperature = (latestTPR?.temperature != null ? Number(latestTPR.temperature) : undefined)
      ?? wardRoundVitals?.temperature
      ?? sourceEncounter?.temperature
      ?? null;
    const respiratoryRate = latestTPR?.respiratory_rate
      ?? wardRoundVitals?.respiratory_rate
      ?? sourceEncounter?.respiratory_rate
      ?? null;
    const spo2 = wardRoundVitals?.spo2
      ?? sourceEncounter?.spo2
      ?? null;

    if (systolic || diastolic || heartRate || temperature || respiratoryRate || spo2) {
      encounterCtx.vitals = {
        blood_pressure_systolic: systolic,
        blood_pressure_diastolic: diastolic,
        heart_rate: heartRate,
        temperature,
        respiratory_rate: respiratoryRate,
        spo2,
      };
    }

    return { docPatientCtx, admissionCtx, encounterCtx };
  }, [admission, diagnoses, medications, lengthOfStay, dischargeType, patientCtx, sourceEncounter, ipdEncounter, orders, wardRounds, storedCarePlans, followUpInstructions, clinicalHistoryText, temperatureReadings, bpReadings]);

  // Build template-alignment fields for TibaBot requests
  const templateFields = useCallback(() => {
    const fields: Record<string, unknown> = {};
    if (templateLayout) fields.discharge_layout = templateLayout;
    if (templateSections?.length) {
      // Only send sections TibaBot should generate — exclude data-sourced and dedicated-field sections
      const aiSections = templateSections.filter(
        (s: any) => s.enabled && !HIDDEN_SECTION_IDS.has(s.key) && !DEDICATED_FIELD_KEYS.has(s.key)
      );
      // Re-add routed sections that TibaBot should still produce content for
      const routedSections = templateSections.filter(
        (s: any) => s.enabled && ROUTED_SECTION_IDS.has(s.key)
      );
      fields.template_sections = [...aiSections, ...routedSections];
    }
    return fields;
  }, [templateLayout, templateSections]);

  // Generate ALL sections — fires one focused TibaBot call per section,
  // run in parallel with a small concurrency cap. This avoids the batch-merge
  // problems (sections collapsing into one, "Document" wrappers, duplication)
  // by giving each section a single-purpose prompt.
  const handleGenerateAll = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;

    // Build a focused prompt for a narrative section based on its title.
    const promptFor = (title: string): string => {
      const t = title.toLowerCase();
      const hints: string[] = [
        `Generate ONLY the "${title}" section of a discharge summary. Return focused, detailed content for this section only — do NOT include other sections.`,
      ];
      if (t.includes('complaint')) {
        hints.push(
          'This section must contain the patient\'s presenting SYMPTOMS and COMPLAINTS — what the patient reported (e.g. "abdominal pain for 2 days", "fever and vomiting").',
          'NEVER put the medical diagnosis here (e.g. "Acute Appendicitis" is a DIAGNOSIS, not a complaint).',
          'If chief_complaint is empty in the context, infer symptoms from the HPI or ward round subjective notes.',
        );
      }
      if (t.includes('hospital course')) {
        hints.push('Write a flowing clinical narrative that synthesizes ward round findings into a coherent story of the admission. Mention key dates and clinical inflection points. Do NOT list medications or treatments here — those belong in Management.');
      }
      if (t.includes('management') || t.includes('treatment')) {
        hints.push('List specific treatments administered: medications given during admission, procedures performed, nursing interventions. Do NOT repeat the hospital course narrative.');
      }
      if (t.includes('condition') && t.includes('discharge')) {
        hints.push("Describe the patient's clinical state at time of discharge: vitals, mobility, mental status, residual symptoms.");
      }
      if (t.includes('physical') || t.includes('examination')) {
        hints.push('This section must contain ONLY physical examination findings (inspection, palpation, auscultation, percussion, vital signs on examination). Never place laboratory results or investigation values here.');
      }
      if (t.includes('investigation')) {
        hints.push(
          'List ALL investigations done during the admission with their results.',
          'Use the key_investigations from the admission context as your primary data source.',
          'Format as a list: "- Investigation: Result (Date)". Include ALL available results, not just abnormal ones.',
          'If no investigation results are available in the context, state "No investigations recorded during this admission."',
        );
      }
      hints.push('Only include documented clinical facts. No advisory notes or placeholders.');
      return hints.join(' ');
    };

    // Narrative sections to generate (excludes routed/dedicated/hidden keys).
    const narrativeSections = sections.filter((s) => {
      const key = s.templateKey ?? '';
      return !ROUTED_SECTION_IDS.has(key)
        && !DEDICATED_FIELD_KEYS.has(key)
        && !HIDDEN_SECTION_IDS.has(key);
    });

    type TaskResult = { ok: boolean; label: string };

    const generateNarrativeTask = async (section: DischargeSummarySection): Promise<TaskResult> => {
      try {
        const result = await clinicalDocument.mutateAsync({
          document_type: 'discharge_summary',
          patient_context: ctx.docPatientCtx,
          admission_context: ctx.admissionCtx,
          encounter_context: ctx.encounterCtx,
          output_format: 'structured',
          generation_mode: generationMode,
          ...templateFields(),
          additional_instructions: promptFor(section.title),
        });

        let content = '';
        let advisories: ParsedSection['advisories'] = [];
        let provenance: string | undefined;

        if (result.sections?.length) {
          const normalized = normalizeSections(result.sections);
          const match = normalized.find((s: any) =>
            (section.templateKey && s.section_id === section.templateKey) ||
            fuzzyTitleMatch(s.title, section.title)
          ) ?? normalized[0];
          if (match) {
            const parsed = parseAdvisories(match.content);
            content = parsed.cleanContent;
            advisories = parsed.advisories;
            provenance = result.section_provenance?.[match.section_id] || 'llm_generated';
          }
        } else if (result.full_text) {
          const parsed = parseAdvisories(result.full_text);
          content = parsed.cleanContent;
          advisories = parsed.advisories;
          provenance = 'llm_generated';
        }

        if (content) {
          setSections((prev) =>
            prev.map((s) =>
              s.id === section.id
                ? { ...s, content, source: 'ai' as const, provenance, advisories }
                : s
            )
          );
        }
        return { ok: !!content, label: section.title };
      } catch {
        return { ok: false, label: section.title };
      }
    };

    const generateMedsTask = async (): Promise<TaskResult> => {
      try {
        const result = await clinicalDocument.mutateAsync({
          document_type: 'discharge_summary',
          patient_context: ctx.docPatientCtx,
          admission_context: ctx.admissionCtx,
          encounter_context: ctx.encounterCtx,
          output_format: 'structured',
          generation_mode: 'generate',
          ...templateFields(),
          additional_instructions: [
            'Generate ONLY the Discharge Medications section.',
            'For each medication, provide the drug name, suggested dosage, frequency, and duration on separate lines.',
            'Format each medication as: "- Drug Name | Dosage | Frequency | Duration".',
            'Only include medications that are clinically appropriate for discharge continuity.',
          ].join(' '),
        });

        let medText = '';
        if (result.sections?.length) {
          const match = result.sections.find((s: any) => /medication/i.test(s.title)) || result.sections[0];
          if (match) medText = parseAdvisories(match.content).cleanContent;
        } else if (result.full_text) {
          medText = parseAdvisories(result.full_text).cleanContent;
        }

        if (medText) {
          const lines = medText.split('\n').filter((l) => l.trim());
          const parsed = parseMedicationLines(lines);
          if (parsed.length > 0) setSuggestedMeds(parsed);
        }
        return { ok: true, label: 'Discharge Medications' };
      } catch {
        return { ok: false, label: 'Discharge Medications' };
      }
    };

    const generateInstructionsTask = async (): Promise<TaskResult> => {
      try {
        const result = await clinicalDocument.mutateAsync({
          document_type: 'discharge_summary',
          patient_context: ctx.docPatientCtx,
          admission_context: ctx.admissionCtx,
          encounter_context: ctx.encounterCtx,
          output_format: 'structured',
          generation_mode: generationMode,
          ...templateFields(),
          additional_instructions: [
            'Generate concise, actionable patient discharge instructions — NOT patient education.',
            'Format as a short numbered list of 4-8 practical instructions the patient must follow at home.',
            'Each item should be one sentence. Examples: "Take Paracetamol 1g every 8 hours for 3 days.", "Return to clinic if fever exceeds 38.5°C or wound becomes red/swollen.", "Avoid heavy lifting for 2 weeks."',
            'Do NOT explain what the condition is, how vaccines work, or why treatment was given — that belongs in Patient Education, not here.',
            'Focus on: medications to take, activity restrictions, warning signs requiring return, follow-up appointments, and wound/site care.',
          ].join(' '),
        });

        let content = '';
        if (result.sections?.length) {
          const match = result.sections.find((s: any) => /patient|education|instruction|discharge/i.test(s.title)) || result.sections[0];
          if (match) content = parseAdvisories(match.content).cleanContent;
        } else if (result.full_text) {
          content = parseAdvisories(result.full_text).cleanContent;
        }

        if (content) {
          setPatientInstructions(content);
          setInstructionsGenerated(true);
        }
        return { ok: true, label: 'Patient Instructions' };
      } catch {
        return { ok: false, label: 'Patient Instructions' };
      }
    };

    const generateFollowUpTask = async (): Promise<TaskResult> => {
      try {
        const result = await clinicalDocument.mutateAsync({
          document_type: 'discharge_summary',
          patient_context: ctx.docPatientCtx,
          admission_context: ctx.admissionCtx,
          encounter_context: ctx.encounterCtx,
          output_format: 'structured',
          generation_mode: generationMode,
          ...templateFields(),
          additional_instructions: [
            'Generate ONLY the Follow-up Plan section. Include specific follow-up appointments, timeline, warning signs to watch for, and when to return to hospital.',
            'Be specific with timing (e.g., "Return in 2 weeks" or "Follow-up on 2026-04-06").',
          ].join(' '),
        });

        let content = '';
        if (result.sections?.length) {
          const match = result.sections.find((s: any) => /follow.?up|plan/i.test(s.title)) || result.sections[0];
          if (match) content = parseAdvisories(match.content).cleanContent;
        } else if (result.full_text) {
          content = parseAdvisories(result.full_text).cleanContent;
        }

        if (content) {
          if (!followUpInstructions) {
            const firstLine = content.split('\n').find((l) => l.trim());
            if (firstLine) setFollowUpInstructions(firstLine.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim());
          }
          if (!followUpDate) {
            const extractedDate = extractFollowUpDate(content);
            if (extractedDate) setFollowUpDate(extractedDate);
          }
        }
        return { ok: true, label: 'Follow-up' };
      } catch {
        return { ok: false, label: 'Follow-up' };
      }
    };

    // Simple concurrency-limited task runner (cap = 2 in-flight calls).
    // Kept low so dev SQLite (single writer) doesn't hit "database is locked".
    const runWithLimit = async <T,>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> => {
      const results: T[] = new Array(tasks.length);
      let idx = 0;
      const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (true) {
          const myIdx = idx++;
          if (myIdx >= tasks.length) return;
          const task = tasks[myIdx]!;
          results[myIdx] = await task();
        }
      });
      await Promise.all(workers);
      return results;
    };

    setEditingSectionId(null);

    const allTasks: Array<() => Promise<TaskResult>> = [
      ...narrativeSections.map((s) => () => generateNarrativeTask(s)),
      () => generateMedsTask(),
      () => generateInstructionsTask(),
      () => generateFollowUpTask(),
    ];

    if (allTasks.length === 0) {
      toast({ title: 'Nothing to generate', description: 'All sections are pre-filled or hidden.' });
      return;
    }

    const results = await runWithLimit(allTasks, 2);
    const failed = results.filter((r) => !r.ok);
    const success = results.length - failed.length;

    if (failed.length === 0) {
      toast({
        title: generationMode === 'generate' ? 'Strict Draft Generated' : 'Draft Generated',
        description: `TibaBot generated ${success} section(s). Review and edit as needed.`,
      });
    } else if (success === 0) {
      toast({
        title: 'Generation Failed',
        description: 'Could not generate any sections. Please write them manually.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Partial Generation',
        description: `${success} succeeded, ${failed.length} failed (${failed.map((r) => r.label).join(', ')}).`,
        variant: 'destructive',
      });
    }
  }, [
    admission,
    sections,
    buildAIContext,
    clinicalDocument,
    toast,
    generationMode,
    followUpInstructions,
    followUpDate,
    setSections,
    setEditingSectionId,
    setSuggestedMeds,
    setFollowUpInstructions,
    setFollowUpDate,
    setPatientInstructions,
    setInstructionsGenerated,
  ]);

  // Generate a single section
  const handleGenerateSection = useCallback(async (sectionId: string) => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    setGeneratingSectionId(sectionId);
    try {
      const result = await clinicalDocument.mutateAsync({
        document_type: 'discharge_summary',
        patient_context: ctx.docPatientCtx,
        admission_context: ctx.admissionCtx,
        encounter_context: ctx.encounterCtx,
        output_format: 'structured',
        generation_mode: generationMode,
        ...templateFields(),
        additional_instructions: [
          `Generate ONLY the "${section.title}" section of a discharge summary. Return focused, detailed content for this section only.`,
          section.title.toLowerCase().includes('hospital course')
            ? 'Write a flowing clinical narrative that synthesizes ward round findings into a coherent story of the admission. Mention key dates and clinical inflection points.'
            : '',
          section.title.toLowerCase().includes('physical') || section.title.toLowerCase().includes('examination')
            ? 'This section must contain ONLY physical examination findings (inspection, palpation, auscultation, percussion, vital signs on examination). Never place laboratory results or investigation values here.'
            : '',
          section.title.toLowerCase().includes('investigation')
            ? 'Present results in a table with columns: Investigation, Result, Date. Exclude CANCELLED orders. Group component results under their parent order (e.g. WBC under Full Blood Count).'
            : '',
        ].filter(Boolean).join(' '),
      });

      // Normalize legacy keys
      if (result.sections?.length) {
        result.sections = normalizeSections(result.sections);
      }

      let content = '';
      let advisories: ParsedSection['advisories'] = [];
      let provenance: string | undefined;

      if (result.sections?.length) {
        const match = result.sections.find((s: any) =>
          fuzzyTitleMatch(s.title, section.title)
        ) ?? result.sections[0];
        if (match) {
          const parsed = parseAdvisories(match.content);
          content = parsed.cleanContent;
          advisories = parsed.advisories;
          provenance = result.section_provenance?.[match.section_id] || 'llm_generated';
        }
      } else if (result.full_text) {
        const parsed = parseAdvisories(result.full_text);
        content = parsed.cleanContent;
        advisories = parsed.advisories;
        provenance = 'llm_generated';
      }

      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, content, source: 'ai' as const, provenance, advisories }
            : s
        )
      );
      toast({
        title: 'Section Generated',
        description: `"${section.title}" generated by TibaBot. Review and edit as needed.`,
      });
    } catch {
      toast({
        title: 'Generation Failed',
        description: `Could not generate "${section.title}". Please write it manually.`,
        variant: 'destructive',
      });
    } finally {
      setGeneratingSectionId(null);
    }
  }, [admission, sections, buildAIContext, clinicalDocument, toast, generationMode, setSections, setGeneratingSectionId]);

  // Generate follow-up instructions
  const handleGenerateFollowUp = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingFollowUp(true);
    try {
      const diagnosis = ctx.admissionCtx.primary_diagnosis || 'unspecified';
      const los = ctx.admissionCtx.length_of_stay_days ?? 0;
      const ward = ctx.admissionCtx.ward || '';
      const dischargeTypeStr = ctx.admissionCtx.discharge_type || 'NORMAL';

      const query = [
        `Generate a brief follow-up plan for a patient being discharged after ${los} days for ${diagnosis}.`,
        ward ? `Ward: ${ward}.` : '',
        dischargeTypeStr !== 'NORMAL' ? `Discharge type: ${dischargeTypeStr}.` : '',
        'Include: specific follow-up appointment timing, what to monitor at home, and warning signs that require immediate return.',
        'Be specific with timing (e.g., "Return in 2 weeks" or "Review in 7 days").',
        'Keep it concise — 2-4 actionable sentences. Do NOT include disease pathophysiology or textbook explanations.',
      ].filter(Boolean).join(' ');

      const result = await clinicalAssist.mutateAsync({
        query,
        patient_context: {
          patient_age: ctx.docPatientCtx.patient_age,
          patient_sex: ctx.docPatientCtx.patient_sex,
          allergies: ctx.docPatientCtx.allergies,
          comorbidities: ctx.docPatientCtx.comorbidities,
          current_medications: ctx.docPatientCtx.current_medications,
        },
        verbosity: 'concise',
      });

      const content = result.response?.trim();
      if (content && content.length > 10) {
        // Strip markdown headers if any
        const cleaned = content
          .split('\n')
          .filter((l) => !l.trim().startsWith('#'))
          .join('\n')
          .trim();
        const firstLine = cleaned.split('\n').find((l) => l.trim());
        if (firstLine) setFollowUpInstructions(firstLine.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim());
        const extractedDate = extractFollowUpDate(cleaned);
        if (extractedDate && !followUpDate) setFollowUpDate(extractedDate);
        toast({ title: 'Follow-up Generated', description: 'Follow-up instructions generated. Review and adjust as needed.' });
      } else {
        toast({ title: 'No Content', description: 'TibaBot returned no follow-up instructions.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate follow-up instructions.', variant: 'destructive' });
    } finally {
      setGeneratingFollowUp(false);
    }
  }, [admission, buildAIContext, clinicalAssist, toast, followUpDate, setGeneratingFollowUp, setFollowUpInstructions, setFollowUpDate]);

  // Generate patient instructions
  const handleGeneratePatientInstructions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingPatientInstructions(true);
    try {
      const diagnosis = ctx.admissionCtx.primary_diagnosis || 'unspecified';
      const los = ctx.admissionCtx.length_of_stay_days ?? 0;
      const medsGiven = ctx.admissionCtx.medications_given
        ?.map((m: any) => m.drug_name).filter(Boolean).slice(0, 5).join(', ') || '';

      const query = [
        `Generate concise patient discharge instructions for a patient discharged after ${los} days for ${diagnosis}.`,
        medsGiven ? `Key medications: ${medsGiven}.` : '',
        'Format as a numbered list of 4-8 practical home-care instructions.',
        'Each item should be one actionable sentence.',
        'Focus on: medications to take, activity restrictions, wound/site care, warning signs requiring return, and dietary advice.',
        'Do NOT explain disease pathophysiology, how treatments work, or include textbook information.',
        'Write in patient-friendly language.',
      ].filter(Boolean).join(' ');

      const result = await clinicalAssist.mutateAsync({
        query,
        patient_context: {
          patient_age: ctx.docPatientCtx.patient_age,
          patient_sex: ctx.docPatientCtx.patient_sex,
          allergies: ctx.docPatientCtx.allergies,
          comorbidities: ctx.docPatientCtx.comorbidities,
          current_medications: ctx.docPatientCtx.current_medications,
        },
        verbosity: 'concise',
      });

      const content = result.response?.trim();
      if (content && content.length > 10) {
        // Strip markdown headers if any
        const cleaned = content
          .split('\n')
          .filter((l) => !l.trim().startsWith('#'))
          .join('\n')
          .trim();
        setPatientInstructions(cleaned);
        setInstructionsGenerated(true);
        toast({ title: 'Instructions Generated', description: 'Patient instructions generated. Review and edit as needed.' });
      } else {
        toast({ title: 'No Content', description: 'TibaBot returned no patient instructions.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate patient instructions.', variant: 'destructive' });
    } finally {
      setGeneratingPatientInstructions(false);
    }
  }, [admission, buildAIContext, clinicalAssist, toast, setGeneratingPatientInstructions, setPatientInstructions, setInstructionsGenerated]);

  // Generate medication suggestions
  const handleGenerateMedSuggestions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingMeds(true);
    try {
      // Build a focused medication context string
      const medsGivenDuringStay = ctx.admissionCtx.medications_given
        ?.map((m: any) => `${m.drug_name} ${m.dose} ${m.route} ${m.frequency}`.trim())
        .filter(Boolean) ?? [];
      const currentMeds = ctx.docPatientCtx.current_medications ?? [];
      const diagnosis = ctx.admissionCtx.primary_diagnosis || 'unspecified';
      const los = ctx.admissionCtx.length_of_stay_days ?? 0;

      const query = [
        `Suggest 3-8 discharge (take-home) medications for a patient admitted for ${diagnosis} (${los} days).`,
        medsGivenDuringStay.length > 0 ? `Medications given during admission: ${medsGivenDuringStay.join('; ')}.` : '',
        currentMeds.length > 0 ? `Pre-admission medications: ${currentMeds.join('; ')}.` : '',
        'For each medication use EXACTLY this format on its own line: "- Drug Name | Dosage | Frequency | Duration"',
        'Example: "- Amoxicillin | 500mg | TDS | 7 days"',
        'If IV medications were given during stay, suggest equivalent oral step-down.',
        'Return ONLY the medication list. No headers, no explanations, no disease information.',
      ].filter(Boolean).join(' ');

      const result = await clinicalAssist.mutateAsync({
        query,
        patient_context: {
          patient_age: ctx.docPatientCtx.patient_age,
          patient_sex: ctx.docPatientCtx.patient_sex,
          allergies: ctx.docPatientCtx.allergies,
          comorbidities: ctx.docPatientCtx.comorbidities,
          current_medications: ctx.docPatientCtx.current_medications,
        },
        verbosity: 'concise',
      });

      const content = result.response?.trim();
      if (content && content.length > 5) {
        // Strip markdown headers and non-medication lines
        const lines = content
          .split('\n')
          .filter((l) => {
            const t = l.trim();
            if (!t) return false;
            if (t.startsWith('#')) return false;
            // Keep lines that look like medication entries (bullets or pipe-delimited)
            if (t.startsWith('-') || t.startsWith('*') || t.includes('|') || /^\d+[.)]\s/.test(t)) return true;
            return false;
          });

        if (lines.length > 0) {
          const parsed = parseMedicationLines(lines);
          if (parsed.length > 0) {
            setSuggestedMeds(parsed);
            toast({ title: 'Medications Suggested', description: `TibaBot suggested ${parsed.length} medication(s). Click + to add them.` });
          } else {
            toast({ title: 'No Suggestions', description: 'TibaBot could not extract specific medications. Add them manually.', variant: 'destructive' });
          }
        } else {
          // Fallback: try parsing the whole response through parseMedicationLines
          const allLines = content.split('\n').filter((l) => l.trim());
          const parsed = parseMedicationLines(allLines);
          if (parsed.length > 0) {
            setSuggestedMeds(parsed);
            toast({ title: 'Medications Suggested', description: `TibaBot suggested ${parsed.length} medication(s). Click + to add them.` });
          } else {
            toast({ title: 'No Suggestions', description: 'TibaBot returned no medication data. Add medications manually.', variant: 'destructive' });
          }
        }
      } else {
        toast({ title: 'No Suggestions', description: 'TibaBot returned no medication data. Add medications manually.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate medication suggestions.', variant: 'destructive' });
    } finally {
      setGeneratingMeds(false);
    }
  }, [admission, buildAIContext, clinicalAssist, toast, setGeneratingMeds, setSuggestedMeds]);

  return {
    clinicalDocument,
    handleGenerateAll,
    handleGenerateSection,
    handleGenerateFollowUp,
    handleGeneratePatientInstructions,
    handleGenerateMedSuggestions,
  };
}
