'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Save, Plus, Trash2, Clock, CheckCircle2, BrainCircuit, Loader2, AlertTriangle, ShieldAlert, Printer, ShieldCheck, Pencil, Eye } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { useAdmission, useCreateDischarge, useAdmissionWardRounds, useAdmissionOrders, useClearanceStatus } from '@/lib/hooks/use-inpatient';
import { useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { useAIEnabled, useAIClinicalDocument, useAICDSEvaluate, useStoredCarePlans } from '@/lib/hooks/use-ai';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { useOptionalPatientContext } from '@/lib/context/patient-context';
import { useFacility } from '@/lib/context/facility-context';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { printDischargeDocument } from '@/lib/documents';
import type { DischargeType, DischargeMedication, MaternityContinuityAction } from '@/lib/types/inpatient';
import type { AICDSAlertItem, AIPatientContext, AIEncounterContext, ClinicalDocAdmissionContext, ClinicalDocPatientContext, ClinicalDocGenerationMode } from '@/lib/types/ai';

// ---------------------------------------------------------------------------
// Advisory extraction — strips AI advisory/meta text from section content
// Catches full lines: "> [AI suggested ...]", "[Not documented]"
// Catches inline: "... [AI suggested — clinician to verify] ..."
// ---------------------------------------------------------------------------

/** Matches a standalone bracket-tagged line (with optional blockquote prefix). */
const BRACKET_LINE_PATTERN = /^\[.*?\].*$|^>\s*\[.*?\].*$/;
/** Matches inline bracket tags anywhere within a line. */
const INLINE_BRACKET_PATTERN = /\[([^\]]*(?:AI|suggested|clinician|verify|review|edit|sign|not documented)[^\]]*)\]/gi;

interface ParsedSection {
  cleanContent: string;
  advisories: { text: string; severity: 'warning' | 'critical' }[];
}

function parseAdvisories(content: string): ParsedSection {
  const advisories: ParsedSection['advisories'] = [];
  const lines = content.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (BRACKET_LINE_PATTERN.test(trimmed)) {
      // Entire line is an advisory
      const text = trimmed.replace(/^>\s*/, '');
      const isCritical = /critical|urgent|immediate|danger/i.test(text);
      advisories.push({ text, severity: isCritical ? 'critical' : 'warning' });
    } else {
      // Strip inline bracket tags and collect them as advisories
      let cleaned = line;
      let inlineMatch: RegExpExecArray | null;
      INLINE_BRACKET_PATTERN.lastIndex = 0;
      while ((inlineMatch = INLINE_BRACKET_PATTERN.exec(line)) !== null) {
        const tag = inlineMatch[0];
        const inner = inlineMatch[1];
        if (inner) {
          const isCritical = /critical|urgent|immediate|danger/i.test(inner);
          advisories.push({ text: tag, severity: isCritical ? 'critical' : 'warning' });
        }
        cleaned = cleaned.replace(tag, '');
      }
      // Clean up any resulting double-spaces or leading/trailing whitespace on the line
      cleaned = cleaned.replace(/  +/g, ' ').trimEnd();
      if (cleaned.trim() || line.trim() === '') {
        cleanLines.push(cleaned);
      }
    }
  }

  // Trim leading/trailing blank lines from the clean content
  const cleanContent = cleanLines.join('\n').replace(/^\n+|\n+$/g, '');
  return { cleanContent, advisories };
}

// Section IDs that get routed to dedicated form fields instead of summary cards
const ROUTED_SECTION_IDS = new Set([
  'discharge_medications', 'follow_up', 'follow_up_plan',
]);

// Sections that duplicate existing page UI and should be hidden from cards entirely
const HIDDEN_SECTION_IDS = new Set([
  'patient_information', 'reason_for_admission', 'discharge_diagnosis',
]);

// ---------------------------------------------------------------------------
// Customizable discharge summary sections
// ---------------------------------------------------------------------------

interface DischargeSummarySection {
  id: string;
  title: string;
  content: string;
  source: 'template' | 'manual' | 'ai';
  provenance?: string;
  advisories?: ParsedSection['advisories'];
}

const DEFAULT_SECTION_TEMPLATES: Omit<DischargeSummarySection, 'id'>[] = [
  { title: 'Hospital Course', content: '', source: 'template' },
  { title: 'Significant Findings', content: '', source: 'template' },
  { title: 'Condition at Discharge', content: '', source: 'template' },
  { title: 'Patient Education', content: '', source: 'template' },
];

function createSectionId(): string {
  return crypto.randomUUID();
}

/** Assemble sections into flat markdown text for submission and printing. */
function assembleSectionsText(secs: DischargeSummarySection[]): string {
  return secs
    .filter((s) => s.content.trim())
    .map((s) => `## ${s.title}\n${s.content}`)
    .join('\n\n');
}

/** Parse flat AI text (with ## headings) into sections. */
function parseFullTextIntoSections(text: string): DischargeSummarySection[] {
  const lines = text.split('\n');
  const result: DischargeSummarySection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      if (currentTitle) {
        result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
      }
      currentTitle = headingMatch[1]!.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
  }
  if (result.length === 0 && text.trim()) {
    result.push({ id: createSectionId(), title: 'Discharge Summary', content: text.trim(), source: 'ai' });
  }
  return result;
}

/** Case-insensitive fuzzy title match with keyword awareness. */
function fuzzyTitleMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  // Keyword-based matching for common clinical section titles
  const keywords = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
  const ka = keywords(a);
  const kb = keywords(b);
  // If any keyword from one appears in any keyword of the other
  return ka.some((w) => kb.some((k) => w.includes(k) || k.includes(w)));
}

/** Render advisory text with bracket tags converted to italics. */
function formatAdvisoryText(text: string): React.ReactNode {
  const match = text.match(/^\[([^\]]+)\]\s*(.*)/);
  if (!match) return text;
  return (
    <>
      <em className="font-medium">{match[1]}</em>{match[2] ? ` ${match[2]}` : ''}
    </>
  );
}

/**
 * Extract a follow-up date from AI-generated text.
 * Handles relative expressions ("in 2 weeks", "after 14 days", "in 1 month")
 * and explicit dates ("2026-04-06", "April 6, 2026", "6th April 2026").
 * Returns yyyy-MM-dd string or null.
 */
function extractFollowUpDate(text: string): string | null {
  // 1. Try explicit ISO date (yyyy-MM-dd)
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  // 2. Try "Month Day, Year" or "Day Month Year"
  const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const namedMatch = text.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'))
    || text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months}),?\\s+(\\d{4})\\b`, 'i'));
  if (namedMatch?.[0]) {
    const parsed = new Date(namedMatch[0].replace(/(\d+)(st|nd|rd|th)/i, '$1'));
    if (!isNaN(parsed.getTime())) {
      return format(parsed, 'yyyy-MM-dd');
    }
  }

  // 3. Try relative: "in/after/within X day(s)/week(s)/month(s)" or bare "X weeks/months"
  const relMatch = text.match(/\b(?:in|after|within)\s+(\d+)\s*(day|week|month)s?\b/i)
    || text.match(/\b(\d+)\s*(day|week|month)s?\b/i);
  if (relMatch?.[1] && relMatch[2]) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() + n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() + n);
    return format(d, 'yyyy-MM-dd');
  }

  return null;
}

const DISCHARGE_TYPES: { value: DischargeType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal Discharge' },
  { value: 'ROUTINE', label: 'Routine Discharge' },
  { value: 'AGAINST_ADVICE', label: 'Against Medical Advice' },
  { value: 'TRANSFERRED', label: 'Transfer to Another Facility' },
  { value: 'DECEASED', label: 'Deceased' },
  { value: 'ABSCONDED', label: 'Absconded/Left Without Notice' },
];

const MATERNITY_CONTINUITY_ACTIONS: { value: MaternityContinuityAction; label: string; description: string }[] = [
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

export default function DischargePage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  const { data: admission, isLoading } = useAdmission(admissionId);
  const { data: wardRounds } = useAdmissionWardRounds(admissionId);
  const { data: orders } = useAdmissionOrders(admissionId);
  const { facility } = useFacility();
  const patientContext = useOptionalPatientContext();
  const createDischarge = useCreateDischarge();
  const isAIEnabled = useAIEnabled();
  const clinicalDocument = useAIClinicalDocument();
  const cdsEvaluate = useAICDSEvaluate();

  // Fetch encounter diagnoses for pre-population suggestions
  const sourceEncounterId = admission?.source_encounter || admission?.opd_encounter || 0;
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

  // Automated clearance status (live from backend)
  const { data: clearanceStatus } = useClearanceStatus(admissionId);

  // CDS safety check dialog state
  const [cdsAlerts, setCdsAlerts] = useState<AICDSAlertItem[]>([]);

  const [instructionsGenerated, setInstructionsGenerated] = useState(false);
  const [showCdsDialog, setShowCdsDialog] = useState(false);

  // AI generation mode: 'suggest' = rich draft, 'generate' = strict facts-only
  const [generationMode, setGenerationMode] = useState<ClinicalDocGenerationMode>('suggest');

  // Customizable discharge summary sections
  const [sections, setSections] = useState<DischargeSummarySection[]>(() =>
    DEFAULT_SECTION_TEMPLATES.map((s) => ({ ...s, id: createSectionId() }))
  );
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [generatingSectionId, setGeneratingSectionId] = useState<string | null>(null);

  // AI medication suggestions and follow-up generation
  const [suggestedMeds, setSuggestedMeds] = useState<{ drug_name: string; dosage: string; frequency: string; duration: string }[]>([]);
  const [generatingMeds, setGeneratingMeds] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [generatingPatientInstructions, setGeneratingPatientInstructions] = useState(false);

  // Computed discharge summary from sections (for form submission and validation)
  const dischargeSummary = useMemo(() => assembleSectionsText(sections), [sections]);

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

    return {
      patient_age: admission?.patient_age ?? 0,
      patient_sex: admission?.patient_gender === 'M' ? 'male' : 'female',
      allergies,
      comorbidities,
      current_medications: currentMeds,
    };
  }, [admission, orders, patientContext?.patient]);

  const encounterCtx = useMemo((): AIEncounterContext => {
    const latestRound = wardRounds?.results?.[0];
    const vitals = latestRound?.vital_signs;

    return {
      chief_complaint: admission?.admitting_diagnosis_text || admission?.admitting_diagnosis || undefined,
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
  }, [admission, wardRounds, lengthOfStay]);

  // Build supplementary text for AI prompts with investigations, prescriptions, ward round progress
  const clinicalHistoryText = useMemo(() => {
    const parts: string[] = [];

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

    return parts.join(' \n');
  }, [wardRounds, orders]);

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
      instructions: ''
    };
    setMedications([...medications, newMed]);
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

  // Build shared AI request context (used by both generateAll and generateSection)
  const buildAIContext = useCallback(() => {
    if (!admission) return null;
    const primaryEntry = diagnoses.find((d) => d.role === 'PRIMARY');
    const primaryDisplay = primaryEntry?.code.icd11Display || primaryEntry?.code.icd10Display || '';
    const diagnosis = primaryDisplay || admission.admitting_diagnosis_text || admission.admitting_diagnosis || '';
    const medsText = medications.filter((m) => m.drug_name).map((m) => `${m.drug_name} ${m.dosage} ${m.frequency}`);

    const docPatientCtx: ClinicalDocPatientContext = {
      patient_age: admission.patient_age ?? 0,
      patient_sex: admission.patient_gender === 'M' ? 'male' : 'female',
      allergies: patientCtx.allergies || [],
      comorbidities: patientCtx.comorbidities || [],
      current_medications: patientCtx.current_medications || [],
    };

    const admissionCtx: ClinicalDocAdmissionContext = {
      primary_diagnosis: diagnosis,
      admission_date: admission.admission_date || '',
      length_of_stay_days: lengthOfStay,
      ward: admission.ward_name || '',
      discharge_type: dischargeType === 'ROUTINE' || dischargeType === 'ABSCONDED' ? 'NORMAL' : dischargeType as ClinicalDocAdmissionContext['discharge_type'],
      discharge_medications: medsText,
      condition_at_discharge: '',
    };

    return { docPatientCtx, admissionCtx };
  }, [admission, diagnoses, medications, lengthOfStay, dischargeType, patientCtx]);

  // Generate ALL sections with TibaBot (merges AI sections into existing user sections)
  const handleGenerateAll = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;

    try {
      const result = await clinicalDocument.mutateAsync({
        document_type: 'discharge_summary',
        patient_context: ctx.docPatientCtx,
        admission_context: ctx.admissionCtx,
        encounter_context: {
          chief_complaint: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
        },
        output_format: 'structured',
        generation_mode: generationMode,
        additional_instructions: [
          'For the Hospital Course section, write a flowing clinical narrative that synthesizes the ward round findings into a coherent story of the admission.',
          'Mention key dates and clinical inflection points (e.g. when symptoms improved, when antibiotics were changed, when a complication arose) but do NOT list each ward round as separate S/O/A/P entries.',
          'Omit advisory notes, placeholder text like "Not documented", and parenthetical instructions — only include documented clinical facts.',
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      if (result.sections?.length) {
        // Route specific sections to dedicated form fields
        const instructionParts: string[] = [];
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

          // Collect patient-facing content for Patient Instructions
          if ((sid === 'patient_education' || sid === 'condition_at_discharge') && cleanContent) {
            instructionParts.push(cleanContent);
          }

          // Route discharge_medications to suggested meds chips
          if (sid === 'discharge_medications' && cleanContent) {
            const medParsed: typeof suggestedMeds = [];
            const medLines = cleanContent.split('\n').filter((l) => l.trim());
            for (const line of medLines) {
              const pipeMatch = line.match(/^[-*\d.]*\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(.+?))?\s*$/);
              if (pipeMatch) {
                medParsed.push({
                  drug_name: pipeMatch[1]!.replace(/\*\*/g, '').trim(),
                  dosage: pipeMatch[2]!.trim(),
                  frequency: pipeMatch[3]!.trim(),
                  duration: pipeMatch[4]?.trim() || '',
                });
              } else {
                // Construct regex at runtime to prevent Tailwind CSS scanner from
                // misinterpreting the character class as an arbitrary-value utility
                const sepChars = '\\-:,';
                const bulletRe = new RegExp('^[-*\\d.]*\\s*\\**(.+?)\\**(?:\\s*[' + sepChars + ']|\\s+\\d|$)');
                const bulletMatch = line.match(bulletRe);
                if (bulletMatch && bulletMatch[1]!.trim().length > 2) {
                  medParsed.push({
                    drug_name: bulletMatch[1]!.replace(/\*\*/g, '').trim(),
                    dosage: '',
                    frequency: '',
                    duration: '',
                  });
                }
              }
            }
            if (medParsed.length > 0) setSuggestedMeds(medParsed);
          }
        }

        // Auto-populate Patient Instructions from patient-facing sections
        if (instructionParts.length > 0 && !patientInstructions) {
          setPatientInstructions(instructionParts.join('\n\n'));
          setInstructionsGenerated(true);
        }

        // Merge narrative sections into user's section list
        const aiNarrativeSections = result.sections.filter(
          (s) => !ROUTED_SECTION_IDS.has(s.section_id) && !HIDDEN_SECTION_IDS.has(s.section_id)
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
        // Parse markdown headings into sections and merge
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
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, patientInstructions, followUpInstructions, followUpDate]);

  // Generate a single section with TibaBot
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
        encounter_context: {
          chief_complaint: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
        },
        output_format: 'structured',
        generation_mode: generationMode,
        additional_instructions: [
          `Generate ONLY the "${section.title}" section of a discharge summary. Return focused, detailed content for this section only.`,
          section.title.toLowerCase().includes('hospital course')
            ? 'Write a flowing clinical narrative that synthesizes ward round findings into a coherent story of the admission. Mention key dates and clinical inflection points.'
            : '',
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let content = '';
      let advisories: ParsedSection['advisories'] = [];
      let provenance: string | undefined;

      if (result.sections?.length) {
        const match = result.sections.find((s) =>
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
  }, [admission, sections, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode]);

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

  // Generate follow-up instructions with TibaBot
  const handleGenerateFollowUp = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingFollowUp(true);
    try {
      const result = await clinicalDocument.mutateAsync({
        document_type: 'discharge_summary',
        patient_context: ctx.docPatientCtx,
        admission_context: ctx.admissionCtx,
        encounter_context: {
          chief_complaint: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
        },
        output_format: 'structured',
        generation_mode: generationMode,
        additional_instructions: [
          'Generate ONLY the Follow-up Plan section. Include specific follow-up appointments, timeline, warning signs to watch for, and when to return to hospital.',
          'Be specific with timing (e.g., "Return in 2 weeks" or "Follow-up on 2026-04-06").',
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let content = '';
      if (result.sections?.length) {
        const match = result.sections.find((s) =>
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
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode, followUpDate]);

  // Generate patient instructions with TibaBot
  const handleGeneratePatientInstructions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingPatientInstructions(true);
    try {
      const result = await clinicalDocument.mutateAsync({
        document_type: 'discharge_summary',
        patient_context: ctx.docPatientCtx,
        admission_context: ctx.admissionCtx,
        encounter_context: {
          chief_complaint: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
        },
        output_format: 'structured',
        generation_mode: generationMode,
        additional_instructions: [
          'Generate ONLY the Patient Education / Discharge Instructions section.',
          'Include: condition explained in lay terms, warning signs to watch for, activity restrictions, dietary advice, wound care if applicable, and when to seek emergency care.',
          'Write in simple language suitable for patients and caregivers.',
          clinicalHistoryText || '',
        ].filter(Boolean).join(' '),
      });

      let content = '';
      if (result.sections?.length) {
        const match = result.sections.find((s) =>
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
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText, generationMode]);

  // Generate medication suggestions with TibaBot
  const handleGenerateMedSuggestions = useCallback(async () => {
    const ctx = buildAIContext();
    if (!ctx || !admission) return;
    setGeneratingMeds(true);
    try {
      const result = await clinicalDocument.mutateAsync({
        document_type: 'discharge_summary',
        patient_context: ctx.docPatientCtx,
        admission_context: ctx.admissionCtx,
        encounter_context: {
          chief_complaint: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
        },
        output_format: 'structured',
        generation_mode: 'generate',
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
        const match = result.sections.find((s) =>
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
        const parsed: typeof suggestedMeds = [];
        const lines = medText.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          // Try structured format: "- Drug Name | Dosage | Frequency | Duration"
          const pipeMatch = line.match(/^[-*\d.]*\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(.+?))?\s*$/);
          if (pipeMatch) {
            parsed.push({
              drug_name: pipeMatch[1]!.replace(/\*\*/g, '').trim(),
              dosage: pipeMatch[2]!.trim(),
              frequency: pipeMatch[3]!.trim(),
              duration: pipeMatch[4]?.trim() || '',
            });
          } else {
            // Fallback: extract drug name from bullet line
            // Use RegExp constructor to prevent Tailwind CSS scanner from misinterpreting char class
            const medBulletRe = new RegExp('^[-*\\d.]*\\s*\\**(.+?)\\**(?:\\s*[' + '\\-:' + ']|$)');
            const bulletMatch = line.match(medBulletRe);
            if (bulletMatch && bulletMatch[1]!.trim().length > 2) {
              parsed.push({
                drug_name: bulletMatch[1]!.replace(/\*\*/g, '').trim(),
                dosage: '',
                frequency: '',
                duration: '',
              });
            }
          }
        }
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
  }, [admission, buildAIContext, clinicalDocument, toast, clinicalHistoryText]);

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
      await createDischarge.mutateAsync({
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
        follow_up_date: requiresScheduledFollowUpDate ? followUpDate || undefined : undefined,
        follow_up_instructions: followUpInstructions || undefined,
        discharge_medications: medications.filter((m) => m.drug_name),
      });
      toast({ title: 'Success', description: 'Patient discharged successfully' });
      router.push('/admissions');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to discharge patient', variant: 'destructive' });
      console.error(error);
    }
  };

  const handleSubmit = async () => {
    if (!admission || !dischargeSummary || !patientInstructions) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
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

    if (!allClearancesComplete) {
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
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Discharge Patient"
        helpContent={`Discharging ${admission.patient_name} from ${admission.ward_name}. Complete the discharge summary, medications, and clearances.`}
      />

      {/* Patient Summary with LOS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Admission Summary</CardTitle>
            <div className="flex items-center gap-2">
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
          <div className="grid gap-4 md:grid-cols-5">
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
          hasFollowUpArranged={!!followUpDate}
        />
      )}

      {/* Automated Department Clearances */}
      <ClearanceStatusPanel admissionId={admissionId} />

      {/* Discharge Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discharge Summary</CardTitle>
          <CardDescription>
            Complete the discharge summary and follow-up instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Discharge Type */}
          <div className="space-y-2">
            <Label htmlFor="discharge-type">Discharge Type *</Label>
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
          </div>

          {/* Discharge Diagnoses — Suggestions + Manual Add */}
          <div className="space-y-3">
            {/* Suggested diagnoses from admission / encounter / AI */}
            {suggestedDiagnoses.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Suggested Diagnoses</Label>
                  <HelpPopover content="Quick-add diagnoses from the admitting diagnosis, encounter record, or TibaBot care plans. Click + to add them to the discharge diagnoses below." />
                </div>
                <div className="flex flex-wrap gap-2">
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
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
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
                        <span className="truncate max-w-[240px]">{suggestion.label}</span>
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
              label="Discharge Diagnoses"
            />
          </div>

          {/* Summary Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Summary Sections *</Label>
                <HelpPopover content="Add, remove, and customize sections. Use 'Generate with TibaBot' per section or 'Generate All' to draft the entire summary at once." />
              </div>
              <div className="flex items-center gap-2">
                {dischargeSummary && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => printDischargeDocument({
                      documentTitle: 'Discharge Summary',
                      content: dischargeSummary,
                      patientName: admission.patient_name || '',
                      admissionNumber: admission.admission_number,
                      wardName: admission.ward_name || '',
                      admissionDate: admission.admission_date,
                      admittingDiagnosis: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
                      facilityName: facility?.name,
                      facilityMflCode: facility?.mfl_code,
                    })}
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
                    onClick={handleGenerateAll}
                    disabled={clinicalDocument.isPending}
                    className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    {clinicalDocument.isPending && !generatingSectionId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                    Generate All
                  </Button>
                )}
              </div>
            </div>

            {/* AI Mode Toggle */}
            {isAIEnabled && (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
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
                          onCheckedChange={(checked) => setGenerationMode(checked ? 'suggest' : 'generate')}
                        />
                        <span className="text-sm font-medium">
                          {generationMode === 'suggest' ? (
                            'Suggest Mode'
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
                        : 'Switch to Suggest mode — rich drafts with AI-synthesised narratives for clinician review'}
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
            {sections.map((section) => {
              const isEditing = editingSectionId === section.id;
              const isGenerating = generatingSectionId === section.id;
              const hasContent = !!section.content.trim();
              const hasCritical = section.advisories?.some((a) => a.severity === 'critical');
              const hasAdvisories = (section.advisories?.length ?? 0) > 0;
              const borderColor = hasCritical
                ? 'border-red-400 dark:border-red-500'
                : hasAdvisories
                  ? 'border-amber-400 dark:border-amber-500'
                  : '';

              return (
                <div key={section.id} className={`rounded-lg border bg-card ${borderColor}`}>
                  <div className="flex items-center justify-between border-b px-3 py-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        value={section.title}
                        onChange={(e) => handleRenameSection(section.id, e.target.value)}
                        className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded px-1 -mx-1 w-full min-w-0"
                        placeholder="Section title"
                      />
                      {section.source === 'ai' && section.provenance && (
                        <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                          {section.provenance === 'from_input' ? 'From input'
                            : section.provenance === 'llm_generated' ? 'AI generated'
                            : section.provenance === 'llm_suggested' ? 'AI suggested'
                            : section.provenance === 'guideline_rag' ? 'Guideline'
                            : section.provenance === 'not_documented' ? 'Not documented'
                            : section.provenance === 'skeleton' ? 'Template'
                            : section.provenance}
                        </Badge>
                      )}
                      {hasAdvisories && (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 cursor-default ${
                                hasCritical ? 'border-red-400 text-red-700 dark:text-red-400' : 'border-amber-400 text-amber-700 dark:text-amber-400'
                              }`}>
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                {section.advisories!.length}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {section.advisories!.length} AI {section.advisories!.length === 1 ? 'advisory' : 'advisories'} — review flagged items below
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isAIEnabled && (
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleGenerateSection(section.id)}
                                disabled={isGenerating || (clinicalDocument.isPending && !generatingSectionId)}
                                className="h-7 w-7 p-0 text-purple-500 hover:text-purple-600"
                              >
                                {isGenerating ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <BrainCircuit className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Generate this section with TibaBot</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingSectionId(isEditing ? null : section.id)}
                              className="h-7 w-7 p-0 shrink-0"
                            >
                              {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isEditing ? 'Preview' : 'Edit'}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSection(section.id)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove section</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="p-3">
                    {isGenerating ? (
                      <div className="space-y-2 animate-pulse">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                    ) : isEditing ? (
                      <Textarea
                        value={section.content}
                        onChange={(e) => updateSection(section.id, e.target.value)}
                        rows={4}
                        className="text-sm"
                        placeholder={`Write ${section.title.toLowerCase()} content...`}
                      />
                    ) : hasContent ? (
                      <div className="tibabot-markdown prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden">
                        <Markdown remarkPlugins={[remarkGfm]}>{section.content}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No content — click edit to write or generate with TibaBot.
                      </p>
                    )}
                  </div>
                  {/* Advisory banners */}
                  {section.advisories && section.advisories.length > 0 && !isEditing && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
                      {section.advisories.map((adv, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                            adv.severity === 'critical'
                              ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                          }`}
                        >
                          <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                            adv.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                          }`} />
                          <span>{formatAdvisoryText(adv.text)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Section */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSection}
              className="w-full border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          </div>

          {/* Patient Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="patient-instructions">Patient Instructions *</Label>
              <div className="flex items-center gap-1">
                {patientInstructions && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => printDischargeDocument({
                      documentTitle: 'Patient Discharge Instructions',
                      content: patientInstructions,
                      patientName: admission.patient_name || '',
                      admissionNumber: admission.admission_number,
                      wardName: admission.ward_name || '',
                      admissionDate: admission.admission_date,
                      admittingDiagnosis: admission.admitting_diagnosis_text || admission.admitting_diagnosis || '',
                      facilityName: facility?.name,
                      facilityMflCode: facility?.mfl_code,
                    })}
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
                    {patientInstructions ? 'Regenerate' : 'Generate'}
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
              <p className="text-sm text-muted-foreground">
                {MATERNITY_CONTINUITY_ACTIONS.find((action) => action.value === maternityContinuityAction)?.description}
              </p>
            </div>
          )}

          {/* Follow-up */}
          <div className="grid gap-4 md:grid-cols-2">
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
                    Generate
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Discharge Medications</CardTitle>
              <CardDescription>
                Medications to be taken at home after discharge
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isAIEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateMedSuggestions}
                  disabled={generatingMeds || clinicalDocument.isPending}
                  className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  {generatingMeds ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BrainCircuit className="h-3.5 w-3.5" />
                  )}
                  Suggest with TibaBot
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addMedication}>
                <Plus className="h-4 w-4 mr-2" />
                Add Medication
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* AI-suggested medications */}
          {suggestedMeds.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Suggested Medications</Label>
                <HelpPopover content="TibaBot suggested these based on the patient's stay. Click + to add, then review and adjust dosages." />
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestedMeds.map((med, idx) => {
                  const alreadyAdded = medications.some((m) =>
                    m.drug_name.toLowerCase().trim() === med.drug_name.toLowerCase().trim()
                  );
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => {
                        setMedications((prev) => [...prev, {
                          drug_name: med.drug_name,
                          dosage: med.dosage,
                          frequency: med.frequency,
                          duration: med.duration,
                          instructions: '',
                        }]);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
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
                      <span className="truncate max-w-[200px]">{med.drug_name}</span>
                      {med.dosage && (
                        <span className="text-muted-foreground text-xs">{med.dosage}</span>
                      )}
                      <Badge variant="secondary" className="text-[10px] shrink-0">TibaBot</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {medications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No discharge medications added. Click &quot;Add Medication&quot; to add.
            </p>
          ) : (
            <div className="space-y-4">
              {medications.map((med, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Medication {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedication(index)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Medication Name *</Label>
                      <Input
                        value={med.drug_name}
                        onChange={(e) => updateMedication(index, 'drug_name', e.target.value)}
                        placeholder="e.g., Amoxicillin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dosage *</Label>
                      <Input
                        value={med.dosage}
                        onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                        placeholder="e.g., 500mg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency *</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                        placeholder="e.g., 8 hourly"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Instructions</Label>
                      <Input
                        value={med.instructions || ''}
                        onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                        placeholder="e.g., Take after meals"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createDischarge.isPending || cdsEvaluate.isPending || !dischargeSummary || !patientInstructions || !allClearancesComplete || (requiresScheduledFollowUpDate && !followUpDate)}
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
        <AlertDialogContent className="max-w-lg">
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
          <AlertDialogFooter>
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
