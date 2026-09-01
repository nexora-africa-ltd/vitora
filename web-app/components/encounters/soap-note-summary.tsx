/**
 * SOAP Note Summary Component
 * Aggregates all encounter data into a standardized SOAP format
 * Provides copy-to-clipboard and print functionality
 * Sprint 1.5-1.6: Clinical Documentation Enhancement
 */
'use client';

import { useMemo, useRef } from 'react';
import {
  FileText,
  Copy,
  Printer,
  CheckCircle2,
  AlertCircle,
  User,
  Calendar,
  Stethoscope,
  ClipboardList,
  Target,
  Pill,
  Beaker,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { buildPrintDocument, openPrintWindow, escapeHtml } from '@/lib/documents';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { LabOrder } from '@/lib/types/laboratory';
import type { Prescription } from '@/lib/types/pharmacy';

interface SOAPNoteSummaryProps {
  formData: EncounterFormData;
  diagnoses: DiagnosisFormData[];
  labOrders?: LabOrder[];
  prescriptions?: Prescription[];
  patientName?: string;
  patientMrn?: string;
  encounterDate?: string;
  providerName?: string;
  disabled?: boolean;
}

interface SectionStatus {
  complete: boolean;
  label: string;
  shortLabel: string;
  content: string[];
}

export function SOAPNoteSummary({
  formData,
  diagnoses,
  labOrders = [],
  prescriptions = [],
  patientName,
  patientMrn,
  encounterDate,
  providerName,
  disabled = false,
}: SOAPNoteSummaryProps) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  // Calculate section completeness
  const sectionStatus = useMemo(() => {
    // Helper: flatten clinical_template_data section into readable text
    const flattenTemplateSection = (sectionName: string): string => {
      const section = formData.clinical_template_data?.[sectionName];
      if (!section || typeof section !== 'object') return '';
      return Object.entries(section)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join('\n');
    };

    // Use template data for HPI/PE/Assessment when template is active and flat fields are empty
    const hpiText =
      formData.history_of_present_illness?.trim() ||
      flattenTemplateSection('History of Present Illness');
    const peText =
      formData.physical_examination?.trim() || flattenTemplateSection('Physical Examination');
    const assessmentText = formData.assessment?.trim() || flattenTemplateSection('Assessment');
    const planText = flattenTemplateSection('Plan');

    const status: Record<string, SectionStatus> = {
      chiefComplaint: {
        complete: !!formData.chief_complaint?.trim(),
        label: 'Chief Complaint',
        shortLabel: 'CC',
        content: formData.chief_complaint ? [formData.chief_complaint] : [],
      },
      hpi: {
        complete: !!hpiText,
        label: 'History of Present Illness',
        shortLabel: 'HPI',
        content: hpiText ? [hpiText] : [],
      },
      medicalHistory: {
        complete: !!(
          formData.allergies?.trim() ||
          formData.chronic_conditions?.trim() ||
          formData.current_medications?.trim() ||
          formData.past_surgeries?.trim() ||
          formData.family_history?.trim() ||
          formData.social_history?.trim()
        ),
        label: 'Medical History',
        shortLabel: 'Hx',
        content: [
          formData.allergies && `Allergies: ${formData.allergies}`,
          formData.chronic_conditions && `Chronic Conditions: ${formData.chronic_conditions}`,
          formData.current_medications && `Current Medications: ${formData.current_medications}`,
          formData.past_surgeries && `Past Surgeries: ${formData.past_surgeries}`,
          formData.family_history && `Family History: ${formData.family_history}`,
          formData.social_history && `Social History: ${formData.social_history}`,
        ].filter(Boolean) as string[],
      },
      vitals: {
        complete: !!(
          formData.temperature ||
          formData.pulse ||
          formData.blood_pressure_systolic ||
          formData.respiratory_rate ||
          formData.spo2
        ),
        label: 'Vital Signs',
        shortLabel: 'VS',
        content: [],
      },
      physicalExam: {
        complete: !!peText,
        label: 'Physical Examination',
        shortLabel: 'PE',
        content: peText ? [peText] : [],
      },
      assessment: {
        complete: !!assessmentText || diagnoses.length > 0,
        label: 'Assessment & Diagnosis',
        shortLabel: 'Dx',
        content: assessmentText ? [assessmentText] : [],
      },
      plan: {
        // Plan is complete if there are lab orders, prescriptions, or template plan data
        complete: labOrders.length > 0 || prescriptions.length > 0 || !!planText,
        label: 'Plan',
        shortLabel: 'Rx',
        content: planText ? [planText] : [],
      },
    };

    return status;
  }, [formData, diagnoses, labOrders, prescriptions]);

  // Calculate overall completeness
  const completionStats = useMemo(() => {
    const sections = Object.values(sectionStatus);
    const complete = sections.filter((s) => s.complete).length;
    return {
      complete,
      total: sections.length,
      percentage: Math.round((complete / sections.length) * 100),
    };
  }, [sectionStatus]);

  // Build vitals string
  const vitalsString = useMemo(() => {
    const parts: string[] = [];
    if (formData.temperature) parts.push(`T ${formData.temperature}°C`);
    if (formData.pulse) parts.push(`P ${formData.pulse}`);
    if (formData.blood_pressure_systolic && formData.blood_pressure_diastolic) {
      parts.push(`BP ${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`);
    }
    if (formData.respiratory_rate) parts.push(`RR ${formData.respiratory_rate}`);
    if (formData.spo2) parts.push(`SpO2 ${formData.spo2}%`);
    if (formData.weight) parts.push(`Wt ${formData.weight}kg`);
    if (formData.height) parts.push(`Ht ${formData.height}cm`);

    // Calculate BMI if both weight and height available
    if (formData.weight && formData.height) {
      const heightM = Number(formData.height) / 100;
      const bmi = Number(formData.weight) / (heightM * heightM);
      parts.push(`BMI ${bmi.toFixed(1)}`);
    }

    return parts.join(', ') || 'No vitals recorded';
  }, [formData]);

  // Build diagnoses string
  const diagnosesString = useMemo(() => {
    if (diagnoses.length === 0) return null;
    return diagnoses.map((d) => {
      const type =
        d.diagnosis_type === 'PRIMARY'
          ? 'Primary'
          : d.diagnosis_type === 'SECONDARY'
            ? 'Secondary'
            : 'DDx';
      const display =
        d.icd10_display ||
        d.icd11_display ||
        d.snomed_display ||
        d.free_text_diagnosis ||
        'Unspecified';
      const certainty = d.certainty !== 'confirmed' ? ` (${d.certainty})` : '';
      return `${display} — ${type}${certainty}`;
    });
  }, [diagnoses]);

  // Build lab orders/results string
  const labOrdersString = useMemo(() => {
    if (labOrders.length === 0) return null;
    return labOrders.flatMap((order) => {
      const orderLines: string[] = [];

      order.items?.forEach((item) => {
        if (item.result && order.status === 'COMPLETED') {
          // Show actual result
          const result = item.result;
          let resultStr = '';

          if (result.numeric_value !== undefined && result.numeric_value !== null) {
            resultStr = `${result.numeric_value}`;
            if (result.result_unit) resultStr += ` ${result.result_unit}`;
            if (result.reference_range_text) {
              resultStr += ` (ref: ${result.reference_range_text})`;
            } else if (result.reference_low !== undefined && result.reference_high !== undefined) {
              resultStr += ` (ref: ${result.reference_low}-${result.reference_high})`;
            }
          } else if (result.text_value) {
            resultStr = result.text_value;
          } else if (result.option_value) {
            resultStr = result.option_value;
          }

          // Add flag if abnormal
          const flagStr =
            result.result_flag && result.result_flag !== 'NORMAL' ? ` [${result.result_flag}]` : '';

          orderLines.push(`- ${item.test_name}: ${resultStr}${flagStr}`);
        } else {
          // Show pending status
          const status = item.status !== 'COMPLETED' ? ` [${item.status}]` : '';
          orderLines.push(`- ${item.test_name}${status}`);
        }
      });

      return orderLines;
    });
  }, [labOrders]);

  // Build prescriptions string
  const prescriptionsString = useMemo(() => {
    if (prescriptions.length === 0) return null;
    return prescriptions.flatMap(
      (rx) =>
        rx.items?.map((item) => {
          const dosage = item.dosage || '';
          const frequency = item.frequency || '';
          const duration = item.duration ? `x ${item.duration}` : '';
          return `- ${item.drug_name} ${dosage} ${frequency} ${duration}`.trim();
        }) || []
    );
  }, [prescriptions]);

  // Generate plain text SOAP note for copying
  const generatePlainTextNote = () => {
    const lines: string[] = [];
    const divider = '═'.repeat(60);

    lines.push(divider);
    lines.push(`CLINICAL NOTE - ${patientMrn || 'Unknown MRN'}`);
    lines.push(`Patient: ${patientName || 'Unknown'}`);
    lines.push(
      `Date: ${encounterDate ? formatDate(encounterDate) : new Date().toLocaleDateString()} | Type: ${formData.encounter_type} | Provider: ${providerName || 'Unknown'}`
    );
    lines.push(divider);
    lines.push('');

    // SUBJECTIVE
    lines.push('SUBJECTIVE:');
    if (formData.chief_complaint) {
      lines.push(`Chief Complaint: ${formData.chief_complaint}`);
    }
    if (sectionStatus.hpi?.content?.[0]) {
      lines.push(`HPI: ${sectionStatus.hpi.content[0]}`);
    }
    if (formData.allergies) {
      lines.push(`Allergies: ${formData.allergies}`);
    }
    if (formData.current_medications) {
      lines.push(`Current Medications: ${formData.current_medications}`);
    }
    if (formData.chronic_conditions) {
      lines.push(`PMHx: ${formData.chronic_conditions}`);
    }
    if (formData.past_surgeries) {
      lines.push(`PSHx: ${formData.past_surgeries}`);
    }
    if (formData.family_history) {
      lines.push(`FHx: ${formData.family_history}`);
    }
    if (formData.social_history) {
      lines.push(`SHx: ${formData.social_history}`);
    }
    if (
      !sectionStatus.chiefComplaint?.complete &&
      !sectionStatus.hpi?.complete &&
      !sectionStatus.medicalHistory?.complete
    ) {
      lines.push('[No subjective data recorded]');
    }
    lines.push('');

    // OBJECTIVE
    lines.push('OBJECTIVE:');
    lines.push(`Vitals: ${vitalsString}`);
    if (sectionStatus.physicalExam?.content?.[0]) {
      lines.push(`Physical Exam: ${sectionStatus.physicalExam.content[0]}`);
    }
    if (!sectionStatus.vitals?.complete && !sectionStatus.physicalExam?.complete) {
      lines.push('[No objective data recorded]');
    }
    lines.push('');

    // ASSESSMENT
    lines.push('ASSESSMENT:');
    if (sectionStatus.assessment?.content?.[0]) {
      lines.push(sectionStatus.assessment.content[0]);
    }
    if (diagnosesString && diagnosesString.length > 0) {
      diagnosesString.forEach((d) => lines.push(d));
    }
    if (!formData.assessment && (!diagnosesString || diagnosesString.length === 0)) {
      lines.push('[No assessment recorded]');
    }
    lines.push('');

    // PLAN
    lines.push('PLAN:');
    if (sectionStatus.plan?.content?.[0]) {
      lines.push(`Plan: ${sectionStatus.plan.content[0]}`);
    }
    if (labOrdersString && labOrdersString.length > 0) {
      lines.push('Labs:');
      labOrdersString.forEach((l) => lines.push(l));
    }
    if (prescriptionsString && prescriptionsString.length > 0) {
      lines.push('Medications:');
      prescriptionsString.forEach((p) => lines.push(p));
    }
    if (formData.notes) {
      lines.push(`Notes: ${formData.notes}`);
    }
    if (
      (!labOrdersString || labOrdersString.length === 0) &&
      (!prescriptionsString || prescriptionsString.length === 0)
    ) {
      lines.push('[No plan recorded]');
    }
    lines.push('');
    lines.push(divider);
    lines.push(`Generated: ${new Date().toLocaleString()}`);

    return lines.join('\n');
  };

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      const text = generatePlainTextNote();
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied to Clipboard',
        description: 'SOAP note has been copied to your clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Unable to copy to clipboard. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Build structured HTML for printing
  const generatePrintHtml = () => {
    const e = escapeHtml;
    const sections: string[] = [];

    // Header
    sections.push(`
      <div class="header">
        <h1>Clinical SOAP Note</h1>
        <table class="meta-table">
          <tr><td><strong>Patient:</strong></td><td>${e(patientName || 'Unknown')} ${patientMrn ? `(${e(patientMrn)})` : ''}</td></tr>
          <tr><td><strong>Date:</strong></td><td>${encounterDate ? formatDate(encounterDate) : new Date().toLocaleDateString()}</td></tr>
          <tr><td><strong>Type:</strong></td><td>${e(formData.encounter_type)}</td></tr>
          ${providerName ? `<tr><td><strong>Provider:</strong></td><td>${e(providerName)}</td></tr>` : ''}
        </table>
      </div>
    `);

    // SUBJECTIVE
    const subjectiveItems: string[] = [];
    if (formData.chief_complaint)
      subjectiveItems.push(
        `<p><strong>Chief Complaint:</strong> ${e(formData.chief_complaint)}</p>`
      );
    if (sectionStatus.hpi?.content?.[0])
      subjectiveItems.push(
        `<p><strong>HPI:</strong> ${e(sectionStatus.hpi.content[0]).replace(/\n/g, '<br>')}</p>`
      );
    if (formData.allergies)
      subjectiveItems.push(`<p><strong>Allergies:</strong> ${e(formData.allergies)}</p>`);
    if (formData.current_medications)
      subjectiveItems.push(
        `<p><strong>Current Medications:</strong> ${e(formData.current_medications)}</p>`
      );
    if (formData.chronic_conditions)
      subjectiveItems.push(`<p><strong>PMHx:</strong> ${e(formData.chronic_conditions)}</p>`);
    if (formData.past_surgeries)
      subjectiveItems.push(`<p><strong>PSHx:</strong> ${e(formData.past_surgeries)}</p>`);
    if (formData.family_history)
      subjectiveItems.push(`<p><strong>FHx:</strong> ${e(formData.family_history)}</p>`);
    if (formData.social_history)
      subjectiveItems.push(`<p><strong>SHx:</strong> ${e(formData.social_history)}</p>`);
    sections.push(
      `<div class="section"><h2>SUBJECTIVE</h2>${subjectiveItems.join('') || '<p class="empty">No subjective data recorded</p>'}</div>`
    );

    // OBJECTIVE
    const objectiveItems: string[] = [];
    objectiveItems.push(`<p><strong>Vitals:</strong> ${e(vitalsString)}</p>`);
    if (sectionStatus.physicalExam?.content?.[0])
      objectiveItems.push(
        `<p><strong>Physical Examination:</strong> ${e(sectionStatus.physicalExam.content[0]).replace(/\n/g, '<br>')}</p>`
      );
    sections.push(`<div class="section"><h2>OBJECTIVE</h2>${objectiveItems.join('')}</div>`);

    // ASSESSMENT
    const assessmentItems: string[] = [];
    if (sectionStatus.assessment?.content?.[0])
      assessmentItems.push(
        `<p>${e(sectionStatus.assessment.content[0]).replace(/\n/g, '<br>')}</p>`
      );
    if (diagnosesString && diagnosesString.length > 0) {
      assessmentItems.push(
        `<p><strong>Diagnoses:</strong></p><ol>${diagnosesString.map((d) => `<li>${e(d)}</li>`).join('')}</ol>`
      );
    }
    sections.push(
      `<div class="section"><h2>ASSESSMENT</h2>${assessmentItems.join('') || '<p class="empty">No assessment recorded</p>'}</div>`
    );

    // PLAN
    const planItems: string[] = [];
    if (sectionStatus.plan?.content?.[0])
      planItems.push(
        `<p><strong>Plan:</strong> ${e(sectionStatus.plan.content[0]).replace(/\n/g, '<br>')}</p>`
      );
    if (labOrdersString && labOrdersString.length > 0) {
      planItems.push(
        `<p><strong>Lab Orders:</strong></p><ul>${labOrdersString.map((l) => `<li>${e(l)}</li>`).join('')}</ul>`
      );
    }
    if (prescriptionsString && prescriptionsString.length > 0) {
      planItems.push(
        `<p><strong>Medications:</strong></p><ul>${prescriptionsString.map((p) => `<li>${e(p)}</li>`).join('')}</ul>`
      );
    }
    if (formData.notes)
      planItems.push(`<p><strong>Additional Notes:</strong> ${e(formData.notes)}</p>`);
    sections.push(
      `<div class="section"><h2>PLAN</h2>${planItems.join('') || '<p class="empty">No plan recorded</p>'}</div>`
    );

    // Footer
    sections.push(
      `<div class="footer"><p>Generated: ${new Date().toLocaleString()}</p><div class="sig">Signature &amp; Stamp</div></div>`
    );

    return sections.join('');
  };

  // Print using the centralized document renderer
  const handlePrint = () => {
    const bodyHtml = generatePrintHtml();
    const title = `SOAP Note - ${patientMrn || 'Unknown'}`;
    const soapCSS = `
      .header { margin-bottom: 1.5em; padding-bottom: 1em; border-bottom: 2px solid var(--primary-color, #1a365d); }
      .header h1 { font-size: 1.4em; margin: 0 0 0.5em; }
      .meta-table { font-size: 0.9em; border: none; }
      .meta-table td { padding: 2px 12px 2px 0; border: none; }
      .section { margin-bottom: 1.5em; }
      .section h2 { font-size: 1.1em; color: var(--primary-color, #1a365d); border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 0.5em; }
      .section p { margin: 0.3em 0; font-size: 0.9em; line-height: 1.5; }
      .section ul { margin: 0.3em 0 0.3em 1.5em; font-size: 0.9em; }
      .section li { margin: 0.2em 0; }
      .empty { color: #888; font-style: italic; }
      .footer { margin-top: 2em; padding-top: 1em; border-top: 1px solid #ddd; font-size: 0.8em; color: #666; }
      .sig { margin-top: 3em; padding-top: 1em; border-top: 1px dashed #aaa; width: 250px; text-align: center; font-size: 0.85em; color: #666; }
    `;
    const fullHtml = buildPrintDocument(bodyHtml, title, 'a4', 'default', soapCSS);
    openPrintWindow(fullHtml);
  };

  return (
    <Card>
      <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
              SOAP Note
            </CardTitle>
            <HelpPopover content="Review the complete clinical documentation before finalizing. Copy or print for records." />
          </div>
          <Badge
            variant={completionStats.percentage === 100 ? 'default' : 'secondary'}
            className={`${completionStats.percentage === 100 ? 'bg-green-600' : ''} w-fit shrink-0 self-start sm:self-auto`}
          >
            {completionStats.complete}/{completionStats.total} sections
          </Badge>
        </div>

        {/* Completeness Indicator - Scrollable on mobile */}
        <div className="-mx-3 mt-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <div className="flex gap-2 pb-2 sm:flex-wrap sm:pb-0">
            {Object.entries(sectionStatus).map(([key, status]) => (
              <Badge
                key={key}
                variant="outline"
                className={`shrink-0 text-xs ${
                  status.complete
                    ? 'border-green-500 text-green-700 dark:text-green-400'
                    : 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                }`}
              >
                {status.complete ? (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                <span className="hidden sm:inline">{status.label}</span>
                <span className="sm:hidden">{status.shortLabel}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-3 sm:space-y-6 sm:px-6" ref={printRef}>
        {/* Header Info */}
        <div className="rounded-lg bg-muted/50 p-3 text-sm sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{patientName || 'Unknown Patient'}</span>
              {patientMrn && <span className="text-muted-foreground">({patientMrn})</span>}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              {encounterDate ? formatDate(encounterDate) : 'Today'}
            </span>
            <Badge variant="outline" className="w-fit">
              {formData.encounter_type}
            </Badge>
          </div>
          {providerName && (
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
              Provider: {providerName}
            </p>
          )}
        </div>

        <Separator />

        {/* SUBJECTIVE */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 sm:text-base">
            <ClipboardList className="h-4 w-4" />
            SUBJECTIVE
          </h3>
          <div className="space-y-2 pl-4 text-sm sm:pl-6">
            {formData.chief_complaint ? (
              <div>
                <span className="font-medium">Chief Complaint:</span> {formData.chief_complaint}
              </div>
            ) : (
              <p className="italic text-amber-600 dark:text-amber-400">
                ⚠ Chief complaint not recorded
              </p>
            )}

            {sectionStatus.hpi?.content?.[0] && (
              <div>
                <span className="font-medium">HPI:</span>{' '}
                <span className="whitespace-pre-line">{sectionStatus.hpi.content[0]}</span>
              </div>
            )}

            {formData.allergies && (
              <div>
                <span className="font-medium text-red-600 dark:text-red-400">Allergies:</span>{' '}
                {formData.allergies}
              </div>
            )}

            {formData.current_medications && (
              <div>
                <span className="font-medium">Current Medications:</span>{' '}
                {formData.current_medications}
              </div>
            )}

            {formData.chronic_conditions && (
              <div>
                <span className="font-medium">PMHx:</span> {formData.chronic_conditions}
              </div>
            )}

            {formData.past_surgeries && (
              <div>
                <span className="font-medium">PSHx:</span> {formData.past_surgeries}
              </div>
            )}

            {formData.family_history && (
              <div>
                <span className="font-medium">FHx:</span> {formData.family_history}
              </div>
            )}

            {formData.social_history && (
              <div>
                <span className="font-medium">SHx:</span> {formData.social_history}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* OBJECTIVE */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400 sm:text-base">
            <Stethoscope className="h-4 w-4" />
            OBJECTIVE
          </h3>
          <div className="space-y-2 pl-4 text-sm sm:pl-6">
            <div>
              <span className="font-medium">Vitals:</span>{' '}
              {sectionStatus.vitals?.complete ? (
                vitalsString
              ) : (
                <span className="italic text-amber-600 dark:text-amber-400">
                  ⚠ No vitals recorded
                </span>
              )}
            </div>

            {sectionStatus.physicalExam?.content?.[0] ? (
              <div>
                <span className="font-medium">Physical Examination:</span>{' '}
                <span className="whitespace-pre-line">{sectionStatus.physicalExam.content[0]}</span>
              </div>
            ) : (
              <p className="italic text-amber-600 dark:text-amber-400">
                ⚠ Physical examination not recorded
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* ASSESSMENT */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400 sm:text-base">
            <Target className="h-4 w-4" />
            ASSESSMENT
          </h3>
          <div className="space-y-2 pl-4 text-sm sm:pl-6">
            {sectionStatus.assessment?.content?.[0] && (
              <div className="whitespace-pre-line">{sectionStatus.assessment.content[0]}</div>
            )}

            {diagnosesString && diagnosesString.length > 0 ? (
              <div>
                <span className="font-medium">Diagnoses:</span>
                <ol className="mt-1 list-inside list-decimal space-y-1">
                  {diagnosesString.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="italic text-amber-600 dark:text-amber-400">⚠ No diagnoses recorded</p>
            )}
          </div>
        </div>

        <Separator />

        {/* PLAN */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400 sm:text-base">
            <ClipboardList className="h-4 w-4" />
            PLAN
          </h3>
          <div className="space-y-3 pl-4 text-sm sm:pl-6">
            {sectionStatus.plan?.content?.[0] && (
              <div>
                <span className="font-medium">Treatment Plan:</span>{' '}
                <span className="whitespace-pre-line">{sectionStatus.plan.content[0]}</span>
              </div>
            )}

            {labOrdersString && labOrdersString.length > 0 ? (
              <div>
                <span className="flex items-center gap-1 font-medium">
                  <Beaker className="h-4 w-4 text-blue-500" />
                  Lab Orders:
                </span>
                <ul className="mt-1 space-y-1 pl-2">
                  {labOrdersString.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">No lab orders</p>
            )}

            {prescriptionsString && prescriptionsString.length > 0 ? (
              <div>
                <span className="flex items-center gap-1 font-medium">
                  <Pill className="h-4 w-4 text-green-500" />
                  Medications:
                </span>
                <ul className="mt-1 space-y-1 pl-2">
                  {prescriptionsString.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">No prescriptions</p>
            )}

            {formData.notes && (
              <div>
                <span className="font-medium">Additional Notes:</span> {formData.notes}
              </div>
            )}

            {!formData.plan &&
              (!labOrdersString || labOrdersString.length === 0) &&
              (!prescriptionsString || prescriptionsString.length === 0) && (
                <p className="italic text-amber-600 dark:text-amber-400">⚠ No plan recorded</p>
              )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
        <Button variant="outline" size="sm" onClick={handleCopy} className="w-full sm:w-auto">
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} className="w-full sm:w-auto">
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </CardFooter>
    </Card>
  );
}

export default SOAPNoteSummary;
