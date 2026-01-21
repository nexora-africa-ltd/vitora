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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
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
    const status: Record<string, SectionStatus> = {
      chiefComplaint: {
        complete: !!formData.chief_complaint?.trim(),
        label: 'Chief Complaint',
        content: formData.chief_complaint ? [formData.chief_complaint] : [],
      },
      hpi: {
        complete: !!formData.history_of_present_illness?.trim(),
        label: 'History of Present Illness',
        content: formData.history_of_present_illness ? [formData.history_of_present_illness] : [],
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
        content: [],
      },
      physicalExam: {
        complete: !!formData.physical_examination?.trim(),
        label: 'Physical Examination',
        content: formData.physical_examination ? [formData.physical_examination] : [],
      },
      assessment: {
        complete: !!formData.assessment?.trim() || diagnoses.length > 0,
        label: 'Assessment & Diagnosis',
        content: [],
      },
      plan: {
        // Plan is complete if there are lab orders, prescriptions, or treatment plan exists
        complete: labOrders.length > 0 || prescriptions.length > 0,
        label: 'Plan',
        content: [],
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
    return diagnoses.map((d, i) => {
      const type = d.diagnosis_type === 'PRIMARY' ? '[PRIMARY]' : d.diagnosis_type === 'SECONDARY' ? '[SECONDARY]' : '[DDx]';
      const code = d.icd10_display || d.free_text_diagnosis || 'Unspecified';
      const certainty = d.certainty !== 'CONFIRMED' ? ` (${d.certainty.toLowerCase()})` : '';
      return `${i + 1}. ${type} ${code}${certainty}`;
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
          const flagStr = result.result_flag && result.result_flag !== 'NORMAL'
            ? ` [${result.result_flag}]`
            : '';

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
    return prescriptions.flatMap((rx) =>
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
    lines.push(`Date: ${encounterDate ? formatDate(encounterDate) : new Date().toLocaleDateString()} | Type: ${formData.encounter_type} | Provider: ${providerName || 'Unknown'}`);
    lines.push(divider);
    lines.push('');

    // SUBJECTIVE
    lines.push('SUBJECTIVE:');
    if (formData.chief_complaint) {
      lines.push(`Chief Complaint: ${formData.chief_complaint}`);
    }
    if (formData.history_of_present_illness) {
      lines.push(`HPI: ${formData.history_of_present_illness}`);
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
    if (!sectionStatus.chiefComplaint?.complete && !sectionStatus.hpi?.complete && !sectionStatus.medicalHistory?.complete) {
      lines.push('[No subjective data recorded]');
    }
    lines.push('');

    // OBJECTIVE
    lines.push('OBJECTIVE:');
    lines.push(`Vitals: ${vitalsString}`);
    if (formData.physical_examination) {
      lines.push(`Physical Exam: ${formData.physical_examination}`);
    }
    if (!sectionStatus.vitals?.complete && !sectionStatus.physicalExam?.complete) {
      lines.push('[No objective data recorded]');
    }
    lines.push('');

    // ASSESSMENT
    lines.push('ASSESSMENT:');
    if (formData.assessment) {
      lines.push(formData.assessment);
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
    if ((!labOrdersString || labOrdersString.length === 0) && (!prescriptionsString || prescriptionsString.length === 0)) {
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

  // Print functionality
  const handlePrint = () => {
    const printContent = generatePlainTextNote();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>SOAP Note - ${patientMrn || 'Unknown'}</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.5;
                padding: 20px;
                white-space: pre-wrap;
              }
              @media print {
                body { margin: 0; padding: 10mm; }
              }
            </style>
          </head>
          <body>${printContent.replace(/\n/g, '<br>')}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              SOAP Note Summary
            </CardTitle>
            <CardDescription>
              Review the complete clinical documentation before finalizing
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={completionStats.percentage === 100 ? 'default' : 'secondary'}
              className={completionStats.percentage === 100 ? 'bg-green-600' : ''}
            >
              {completionStats.complete}/{completionStats.total} sections
            </Badge>
          </div>
        </div>

        {/* Completeness Indicator */}
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(sectionStatus).map(([key, status]) => (
            <Badge
              key={key}
              variant="outline"
              className={
                status.complete
                  ? 'border-green-500 text-green-700 dark:text-green-400'
                  : 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950'
              }
            >
              {status.complete ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <AlertCircle className="h-3 w-3 mr-1" />
              )}
              {status.label}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6" ref={printRef}>
        {/* Header Info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <strong>{patientName || 'Unknown Patient'}</strong>
              {patientMrn && <span className="text-muted-foreground">({patientMrn})</span>}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {encounterDate ? formatDate(encounterDate) : 'Today'}
            </span>
            <Badge variant="outline">{formData.encounter_type}</Badge>
          </div>
          {providerName && (
            <p className="text-muted-foreground">Provider: {providerName}</p>
          )}
        </div>

        <Separator />

        {/* SUBJECTIVE */}
        <div className="space-y-3">
          <h3 className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            SUBJECTIVE
          </h3>
          <div className="pl-6 space-y-2 text-sm">
            {formData.chief_complaint ? (
              <div>
                <span className="font-medium">Chief Complaint:</span>{' '}
                {formData.chief_complaint}
              </div>
            ) : (
              <p className="text-amber-600 dark:text-amber-400 italic">
                ⚠ Chief complaint not recorded
              </p>
            )}

            {formData.history_of_present_illness && (
              <div>
                <span className="font-medium">HPI:</span>{' '}
                {formData.history_of_present_illness}
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
                <span className="font-medium">PMHx:</span>{' '}
                {formData.chronic_conditions}
              </div>
            )}

            {formData.past_surgeries && (
              <div>
                <span className="font-medium">PSHx:</span>{' '}
                {formData.past_surgeries}
              </div>
            )}

            {formData.family_history && (
              <div>
                <span className="font-medium">FHx:</span>{' '}
                {formData.family_history}
              </div>
            )}

            {formData.social_history && (
              <div>
                <span className="font-medium">SHx:</span>{' '}
                {formData.social_history}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* OBJECTIVE */}
        <div className="space-y-3">
          <h3 className="font-semibold text-green-600 dark:text-green-400 flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            OBJECTIVE
          </h3>
          <div className="pl-6 space-y-2 text-sm">
            <div>
              <span className="font-medium">Vitals:</span>{' '}
              {sectionStatus.vitals?.complete ? (
                vitalsString
              ) : (
                <span className="text-amber-600 dark:text-amber-400 italic">
                  ⚠ No vitals recorded
                </span>
              )}
            </div>

            {formData.physical_examination ? (
              <div>
                <span className="font-medium">Physical Examination:</span>{' '}
                {formData.physical_examination}
              </div>
            ) : (
              <p className="text-amber-600 dark:text-amber-400 italic">
                ⚠ Physical examination not recorded
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* ASSESSMENT */}
        <div className="space-y-3">
          <h3 className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Target className="h-4 w-4" />
            ASSESSMENT
          </h3>
          <div className="pl-6 space-y-2 text-sm">
            {formData.assessment && (
              <div>
                <span className="font-medium">Clinical Assessment:</span>{' '}
                {formData.assessment}
              </div>
            )}

            {diagnosesString && diagnosesString.length > 0 ? (
              <div>
                <span className="font-medium">Diagnoses:</span>
                <ul className="mt-1 space-y-1">
                  {diagnosesString.map((d, i) => (
                    <li key={i} className="pl-2">{d}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-amber-600 dark:text-amber-400 italic">
                ⚠ No diagnoses recorded
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* PLAN */}
        <div className="space-y-3">
          <h3 className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            PLAN
          </h3>
          <div className="pl-6 space-y-3 text-sm">
            {formData.plan && (
              <div>
                <span className="font-medium">Treatment Plan:</span>{' '}
                {formData.plan}
              </div>
            )}

            {labOrdersString && labOrdersString.length > 0 ? (
              <div>
                <span className="font-medium flex items-center gap-1">
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
              <p className="text-muted-foreground italic text-xs">No lab orders</p>
            )}

            {prescriptionsString && prescriptionsString.length > 0 ? (
              <div>
                <span className="font-medium flex items-center gap-1">
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
              <p className="text-muted-foreground italic text-xs">No prescriptions</p>
            )}

            {formData.notes && (
              <div>
                <span className="font-medium">Additional Notes:</span>{' '}
                {formData.notes}
              </div>
            )}

            {!formData.plan && (!labOrdersString || labOrdersString.length === 0) && (!prescriptionsString || prescriptionsString.length === 0) && (
              <p className="text-amber-600 dark:text-amber-400 italic">
                ⚠ No plan recorded
              </p>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t pt-4 flex flex-col sm:flex-row gap-3">
        <Button variant="outline" onClick={handleCopy} className="flex-1">
          <Copy className="h-4 w-4 mr-2" />
          Copy Note
        </Button>
        <Button variant="outline" onClick={handlePrint} className="flex-1">
          <Printer className="h-4 w-4 mr-2" />
          Print Note
        </Button>
      </CardFooter>
    </Card>
  );
}

export default SOAPNoteSummary;
