/**
 * Clinical Flow Accordion Component
 * Renders the encounter clinical sections in an accordion format.
 * Replaces the tab-based navigation with a more visual accordion.
 *
 * Sections:
 * 1. Medical History (Hx)
 * 2. History of Present Illness (HPI)
 * 3. Clinical Template
 * 4. Diagnosis (Dx)
 * 5. Lab Orders
 * 6. Prescriptions (Rx)
 */
'use client';

import * as React from 'react';
import {
  FileText,
  ClipboardList,
  LayoutTemplate,
  Stethoscope,
  Beaker,
  Pill,
} from 'lucide-react';
import { FormAccordion, type FormAccordionSection } from '@/components/ui/form-accordion';
import { MedicalHistoryFormContent } from '@/components/encounters/medical-history-form';
import { ClinicalNotesFormContent } from '@/components/encounters/clinical-notes-form';
import { DiagnosisFormContent } from '@/components/encounters/diagnosis-form';
import { EncounterLabOrdersContent } from '@/components/encounters/encounter-lab-orders';
import { EncounterPrescriptionsContent } from '@/components/encounters/encounter-prescriptions';
import { ClinicalTemplateFormContent } from '@/components/encounters/clinical-template-section';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';
import type { LabOrder } from '@/lib/types/laboratory';
import type { Prescription } from '@/lib/types/pharmacy';

// Helper functions to check if sections have data
function hasMedicalHistory(data: EncounterFormData): boolean {
  return !!(
    data.allergies?.trim() ||
    data.chronic_conditions?.trim() ||
    data.current_medications?.trim() ||
    data.past_surgeries?.trim() ||
    data.family_history?.trim() ||
    data.social_history?.trim()
  );
}

function hasClinicalNotes(data: EncounterFormData): boolean {
  return !!(
    data.history_of_present_illness?.trim() ||
    data.physical_examination?.trim() ||
    data.assessment?.trim() ||
    data.notes?.trim()
  );
}

interface ClinicalFlowAccordionProps {
  /** Encounter form data */
  formData: EncounterFormData;
  /** Handler for form field changes */
  onFieldChange: (field: keyof EncounterFormData, value: unknown) => void;
  /** Current diagnoses */
  diagnoses: DiagnosisFormData[];
  /** Handler for adding diagnosis */
  onAddDiagnosis: (diagnosis: DiagnosisFormData) => void;
  /** Handler for removing diagnosis */
  onRemoveDiagnosis: (index: number) => void;
  /** Currently selected clinical template */
  selectedTemplate: ClinicalTemplate | null;
  /** Handler for template selection */
  onTemplateSelect: (template: ClinicalTemplate) => void;
  /** Handler for template data changes */
  onTemplateDataChange: (data: Record<string, Record<string, unknown>>) => void;
  /** Handler to save template as attachment */
  onSaveTemplateSnapshot?: () => void;
  /** Encounter ID for lab orders and prescriptions */
  encounterId: number;
  /** Patient ID for lab orders and prescriptions */
  patientId: number;
  /** Lab orders for this encounter */
  labOrders?: LabOrder[];
  /** Prescriptions for this encounter */
  prescriptions?: Prescription[];
  /** Whether the form is editable */
  disabled?: boolean;
  /** Handler called before navigating away */
  onBeforeNavigate?: () => Promise<void>;
  /** Currently open section(s) */
  openSections?: string[];
  /** Handler when open sections change */
  onSectionChange?: (sections: string[]) => void;
}

export function ClinicalFlowAccordion({
  formData,
  onFieldChange,
  diagnoses,
  onAddDiagnosis,
  onRemoveDiagnosis,
  selectedTemplate,
  onTemplateSelect,
  onTemplateDataChange,
  onSaveTemplateSnapshot,
  encounterId,
  patientId,
  labOrders = [],
  prescriptions = [],
  disabled = false,
  onBeforeNavigate,
  openSections,
  onSectionChange,
}: ClinicalFlowAccordionProps) {
  // Build sections array
  const sections: FormAccordionSection[] = React.useMemo(() => [
    {
      id: 'history',
      title: 'Medical History',
      abbreviation: 'Hx',
      icon: <FileText className="h-4 w-4" />,
      isComplete: hasMedicalHistory(formData),
      tooltipTitle: 'Medical History (Hx)',
      tooltipDescription: 'Allergies, chronic conditions, medications, past surgeries, family & social history',
      children: (
        <MedicalHistoryFormContent
          data={formData}
          onChange={onFieldChange}
          disabled={disabled}
        />
      ),
    },
    {
      id: 'hpi',
      title: 'History of Present Illness',
      abbreviation: 'HPI',
      icon: <ClipboardList className="h-4 w-4" />,
      isComplete: hasClinicalNotes(formData),
      tooltipTitle: 'History of Present Illness (HPI)',
      tooltipDescription: 'Detailed narrative of the current complaint, physical examination, and assessment',
      children: (
        <ClinicalNotesFormContent
          data={formData}
          onChange={onFieldChange}
          disabled={disabled}
        />
      ),
    },
    {
      id: 'template',
      title: 'Clinical Template',
      icon: <LayoutTemplate className="h-4 w-4" />,
      isComplete: !!selectedTemplate && !!formData.clinical_template_data,
      badge: selectedTemplate?.name,
      tooltipTitle: 'Clinical Template',
      tooltipDescription: 'Structured templates for focused assessments (e.g., Pediatric, ANC, Diabetes). Guides documentation and ensures completeness.',
      children: (
        <ClinicalTemplateFormContent
          encounterId={encounterId}
          encounterType={formData.encounter_type}
          chiefComplaint={formData.chief_complaint}
          selectedTemplate={selectedTemplate}
          templateData={formData.clinical_template_data || null}
          onTemplateSelect={onTemplateSelect}
          onTemplateDataChange={onTemplateDataChange}
          onSaveSnapshot={onSaveTemplateSnapshot}
          disabled={disabled}
        />
      ),
    },
    {
      id: 'diagnosis',
      title: 'Diagnosis',
      abbreviation: 'Dx',
      icon: <Stethoscope className="h-4 w-4" />,
      isComplete: diagnoses.length > 0,
      badge: diagnoses.length > 0 ? diagnoses.length : undefined,
      tooltipTitle: 'Diagnosis (Dx)',
      tooltipDescription: 'ICD-10/ICD-11 coded diagnoses and clinical impressions',
      children: (
        <DiagnosisFormContent
          diagnoses={diagnoses}
          onAdd={onAddDiagnosis}
          onRemove={onRemoveDiagnosis}
          disabled={disabled}
        />
      ),
    },
    {
      id: 'labs',
      title: 'Laboratory Orders',
      abbreviation: 'Labs',
      icon: <Beaker className="h-4 w-4" />,
      isComplete: labOrders.length > 0,
      badge: labOrders.length > 0 ? labOrders.length : undefined,
      tooltipTitle: 'Laboratory Orders (Labs)',
      tooltipDescription: 'Order lab tests and view results',
      children: (
        <EncounterLabOrdersContent
          encounterId={encounterId}
          patientId={patientId}
          disabled={disabled}
          onBeforeNavigate={onBeforeNavigate}
        />
      ),
    },
    {
      id: 'rx',
      title: 'Prescriptions',
      abbreviation: 'Rx',
      icon: <Pill className="h-4 w-4" />,
      isComplete: prescriptions.length > 0,
      badge: prescriptions.length > 0 ? prescriptions.length : undefined,
      tooltipTitle: 'Prescriptions (Rx)',
      tooltipDescription: 'Medications and pharmacy orders',
      children: (
        <EncounterPrescriptionsContent
          encounterId={encounterId}
          patientId={patientId}
          disabled={disabled}
          onBeforeNavigate={onBeforeNavigate}
        />
      ),
    },
  ], [
    formData,
    onFieldChange,
    diagnoses,
    onAddDiagnosis,
    onRemoveDiagnosis,
    selectedTemplate,
    onTemplateSelect,
    onTemplateDataChange,
    onSaveTemplateSnapshot,
    encounterId,
    patientId,
    labOrders,
    prescriptions,
    disabled,
    onBeforeNavigate,
  ]);

  return (
    <FormAccordion
      sections={sections}
      allowMultiple={false}
      onSectionChange={onSectionChange}
      disabled={disabled}
    />
  );
}

export default ClinicalFlowAccordion;
