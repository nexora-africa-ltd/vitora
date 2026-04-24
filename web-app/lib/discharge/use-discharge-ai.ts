import { useCallback } from 'react';
import { useAIClinicalDocument } from '@/lib/hooks/use-ai';
import { useToast } from '@/lib/hooks/use-toast';
import type { ClinicalDocAdmissionContext, ClinicalDocPatientContext, ClinicalDocGenerationMode, AIPatientContext, ClinicalDocSection, ClinicalDocEncounterContext } from '@/lib/types/ai';
import type { Encounter } from '@/lib/types/encounter';
import type { DischargeType, DischargeTemplateLayout, DischargeTemplateSectionConfig, DischargeMedication, AdmissionOrdersResponse, WardRound } from '@/lib/types/inpatient';
import type { DiagnosisEntry } from '@/components/shared';
import type { DischargeSummarySection, ParsedSection, SuggestedMedication } from './types';
import { ROUTED_SECTION_IDS, HIDDEN_SECTION_IDS } from './types';
import { buildSourceEncounterClinicalSummary } from '@/lib/utils/inpatient-ai-context';
import {
  parseAdvisories,
  createSectionId,
  parseFullTextIntoSections,
  fuzzyTitleMatch,
  extractFollowUpDate,
  parseMedicationLines,
} from './utils';

// ---------------------------------------------------------------------------
// Legacy → new section key mapping (for backward compatibility with TibaBot)
// ---------------------------------------------------------------------------

const LEGACY_KEY_MAP: Record<string, string> = {
  reason_for_admission: 'history',
  significant_findings: 'investigations',
  patient_education: 'discharge_instructions',
  discharge_diagnosis: 'diagnosis',
  follow_up_plan: 'follow_up',
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
  clinicalHistoryText: string;
  generationMode: ClinicalDocGenerationMode;
  /** Admission orders (labs, imaging, prescriptions) for context enrichment */
  orders?: AdmissionOrdersResponse | null;
  /** Ward rounds for condition-at-discharge and complication extraction */
  wardRounds?: { results: WardRound[] } | null;
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
    clinicalHistoryText,
    generationMode,
    orders,
    wardRounds,
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

    // Key investigations from lab and imaging orders
    const keyInvestigations: string[] = [];
    if (orders?.lab_orders) {
      for (const lo of orders.lab_orders) {
        for (const item of lo.items) {
          const r = item.result;
          if (r?.formatted_value) {
            keyInvestigations.push(`${item.test_name}: ${r.formatted_value}${r.is_critical_result ? ' [CRITICAL]' : ''}`);
          } else {
            keyInvestigations.push(`${item.test_name}: ${lo.status}`);
          }
        }
      }
    }
    if (orders?.imaging_orders) {
      for (const io of orders.imaging_orders) {
        for (const item of io.items) {
          keyInvestigations.push(`${item.procedure_name} (${item.modality}): ${io.status}`);
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
      clinical_notes: clinicalNotes.length > 0 ? clinicalNotes : undefined,
    };

    // Encounter context — enrich with ward round data for Complaints & Physical Findings
    const encounterCtx: ClinicalDocEncounterContext = {
      chief_complaint:
        sourceEncounter?.chief_complaint
        || admission.admitting_diagnosis_text
        || admission.admitting_diagnosis
        || '',
    };

    // HPI from the earliest ward round's subjective (presenting complaint detail)
    if (sourceEncounter?.history_of_present_illness) {
      encounterCtx.hpi = sourceEncounter.history_of_present_illness;
    } else if (wardRounds?.results?.length) {
      const earliest = wardRounds.results[wardRounds.results.length - 1];
      if (earliest?.subjective) encounterCtx.hpi = earliest.subjective;
    }

    // Examination findings from ward round objectives (most recent)
    if (sourceEncounter?.physical_examination) {
      encounterCtx.examination_findings = sourceEncounter.physical_examination;
    } else if (wardRounds?.results?.length) {
      const objectiveFindings = wardRounds.results
        .filter((r) => r.objective)
        .map((r) => r.objective!)
        .slice(0, 3); // Latest 3 rounds
      if (objectiveFindings.length) {
        encounterCtx.examination_findings = objectiveFindings.join('\n\n');
      }
    }

    return { docPatientCtx, admissionCtx, encounterCtx };
  }, [admission, diagnoses, medications, lengthOfStay, dischargeType, patientCtx, sourceEncounter, orders, wardRounds, followUpInstructions]);

  // Build template-alignment fields for TibaBot requests
  const templateFields = useCallback(() => {
    const fields: Record<string, unknown> = {};
    if (templateLayout) fields.discharge_layout = templateLayout;
    if (templateSections?.length) fields.template_sections = templateSections;
    return fields;
  }, [templateLayout, templateSections]);

  // Generate ALL sections
  const handleGenerateAll = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;

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
          'For the Hospital Course section, write a flowing clinical narrative that synthesizes the ward round findings into a coherent story of the admission.',
          'Mention key dates and clinical inflection points (e.g. when symptoms improved, when antibiotics were changed, when a complication arose) but do NOT list each ward round as separate S/O/A/P entries.',
          'Omit advisory notes, placeholder text like "Not documented", and parenthetical instructions — only include documented clinical facts.',
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      // Normalize legacy section keys in the response
      if (result.sections?.length) {
        result.sections = normalizeSections(result.sections);
        for (const section of result.sections) {
          const { cleanContent } = parseAdvisories(section.content);
          const sid = section.section_id;

          if ((sid === 'follow_up' || sid === 'follow_up_plan') && cleanContent) {
            if (!followUpInstructions) {
              const firstLine = cleanContent.split('\n').find((l) => l.trim());
              if (firstLine) setFollowUpInstructions(firstLine.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim());
            }
            if (!followUpDate) {
              const extractedDate = extractFollowUpDate(cleanContent);
              if (extractedDate) setFollowUpDate(extractedDate);
            }
          }

          if (sid === 'discharge_medications' && cleanContent) {
            const medLines = cleanContent.split('\n').filter((l) => l.trim());
            const medParsed = parseMedicationLines(medLines);
            if (medParsed.length > 0) setSuggestedMeds(medParsed);
          }

          if (sid === 'discharge_instructions' && cleanContent && !patientInstructions) {
            setPatientInstructions(cleanContent);
            setInstructionsGenerated(true);
          }
        }

        const aiNarrativeSections = result.sections.filter(
          (s: any) => !ROUTED_SECTION_IDS.has(s.section_id) && !HIDDEN_SECTION_IDS.has(s.section_id)
        );

        setSections((prev) => {
          let updated = [...prev];
          const matchedIds = new Set<string>();

          for (const aiSection of aiNarrativeSections) {
            const { cleanContent, advisories } = parseAdvisories(aiSection.content);
            const provenance = result.section_provenance?.[aiSection.section_id];

            const match = updated.find((s) =>
              !matchedIds.has(s.id) && fuzzyTitleMatch(s.title, aiSection.title)
            );

            if (match) {
              matchedIds.add(match.id);
              updated = updated.map((s) =>
                s.id === match.id
                  ? { ...s, content: cleanContent, source: 'ai' as const, provenance, advisories }
                  : s
              );
            } else {
              updated.push({
                id: createSectionId(),
                title: aiSection.title,
                content: cleanContent,
                source: 'ai',
                provenance,
                advisories,
              });
            }
          }
          return updated;
        });

        setEditingSectionId(null);
        toast({
          title: generationMode === 'generate' ? 'Strict Draft Generated' : 'Draft Generated',
          description: generationMode === 'generate'
            ? 'Facts-only discharge summary generated. Audit-safe — review before filing.'
            : 'TibaBot drafted all sections. Edit individually as needed.',
        });
      } else if (result.full_text) {
        const parsedSections = parseFullTextIntoSections(result.full_text);
        setSections((prev) => {
          let updated = [...prev];
          const matchedIds = new Set<string>();

          for (const parsed of parsedSections) {
            const match = updated.find((s) =>
              !matchedIds.has(s.id) && fuzzyTitleMatch(s.title, parsed.title)
            );
            if (match) {
              matchedIds.add(match.id);
              updated = updated.map((s) =>
                s.id === match.id ? { ...s, content: parsed.content, source: 'ai' as const } : s
              );
            } else {
              updated.push(parsed);
            }
          }
          return updated;
        });
        toast({
          title: generationMode === 'generate' ? 'Strict Draft Generated' : 'Draft Generated',
          description: 'TibaBot generated a discharge summary. Review and edit sections as needed.',
        });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate discharge summary. Please write sections manually.', variant: 'destructive' });
    }
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, patientInstructions, followUpInstructions, followUpDate, setSections, setEditingSectionId, setSuggestedMeds, setFollowUpInstructions, setFollowUpDate, setPatientInstructions, setInstructionsGenerated]);

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
          clinicalHistoryText || '',
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
  }, [admission, sections, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, setSections, setGeneratingSectionId]);

  // Generate follow-up instructions
  const handleGenerateFollowUp = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingFollowUp(true);
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
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let content = '';
      if (result.sections?.length) {
        const match = result.sections.find((s: any) =>
          /follow.?up|plan/i.test(s.title)
        ) || result.sections[0];
        if (match) {
          const parsed = parseAdvisories(match.content);
          content = parsed.cleanContent;
        }
      } else if (result.full_text) {
        const parsed = parseAdvisories(result.full_text);
        content = parsed.cleanContent;
      }

      if (content) {
        const firstLine = content.split('\n').find((l) => l.trim());
        if (firstLine) setFollowUpInstructions(firstLine.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim());
        const extractedDate = extractFollowUpDate(content);
        if (extractedDate && !followUpDate) setFollowUpDate(extractedDate);
        toast({ title: 'Follow-up Generated', description: 'Follow-up instructions generated. Review and adjust as needed.' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate follow-up instructions.', variant: 'destructive' });
    } finally {
      setGeneratingFollowUp(false);
    }
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, followUpDate, setGeneratingFollowUp, setFollowUpInstructions, setFollowUpDate]);

  // Generate patient instructions
  const handleGeneratePatientInstructions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingPatientInstructions(true);
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
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let content = '';
      if (result.sections?.length) {
        const match = result.sections.find((s: any) =>
          /patient|education|instruction|discharge/i.test(s.title)
        ) || result.sections[0];
        if (match) {
          const parsed = parseAdvisories(match.content);
          content = parsed.cleanContent;
        }
      } else if (result.full_text) {
        const parsed = parseAdvisories(result.full_text);
        content = parsed.cleanContent;
      }

      if (content) {
        setPatientInstructions(content);
        setInstructionsGenerated(true);
        toast({ title: 'Instructions Generated', description: 'Patient instructions generated. Review and edit as needed.' });
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate patient instructions.', variant: 'destructive' });
    } finally {
      setGeneratingPatientInstructions(false);
    }
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, setGeneratingPatientInstructions, setPatientInstructions, setInstructionsGenerated]);

  // Generate medication suggestions
  const handleGenerateMedSuggestions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingMeds(true);
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
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let medText = '';
      if (result.sections?.length) {
        const match = result.sections.find((s: any) =>
          /medication/i.test(s.title)
        ) || result.sections[0];
        if (match) {
          const parsed = parseAdvisories(match.content);
          medText = parsed.cleanContent;
        }
      } else if (result.full_text) {
        const parsed = parseAdvisories(result.full_text);
        medText = parsed.cleanContent;
      }

      if (medText) {
        const lines = medText.split('\n').filter((l) => l.trim());
        const parsed = parseMedicationLines(lines);
        if (parsed.length > 0) {
          setSuggestedMeds(parsed);
          toast({ title: 'Medications Suggested', description: `TibaBot suggested ${parsed.length} medication(s). Click + to add them.` });
        } else {
          toast({ title: 'No Suggestions', description: 'TibaBot could not extract specific medications. Add them manually.', variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Generation Failed', description: 'Could not generate medication suggestions.', variant: 'destructive' });
    } finally {
      setGeneratingMeds(false);
    }
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, setGeneratingMeds, setSuggestedMeds]);

  return {
    clinicalDocument,
    handleGenerateAll,
    handleGenerateSection,
    handleGenerateFollowUp,
    handleGeneratePatientInstructions,
    handleGenerateMedSuggestions,
  };
}
