'use client';

import { useCallback } from 'react';
import { FileText, Stethoscope, ClipboardList, ChevronRight, ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/hooks/use-toast';
import type { EncounterFormData } from '@/lib/types/encounter-form';

interface ClinicalNotesFormContentProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
  showRequiredIndicators?: boolean;
}

/**
 * Validates clinical notes mandatory fields and returns missing fields
 */
export function validateClinicalNotes(data: EncounterFormData): string[] {
  const missingFields: string[] = [];
  
  if (!data.history_of_present_illness?.trim()) {
    missingFields.push('History of Present Illness (HPI)');
  }
  if (!data.physical_examination?.trim()) {
    missingFields.push('Physical Examination');
  }
  if (!data.assessment?.trim()) {
    missingFields.push('Assessment / Clinical Impression');
  }
  
  return missingFields;
}

/**
 * Content-only version of the Clinical Notes form (no Card wrapper)
 * Used in accordion-based layouts
 */
export function ClinicalNotesFormContent({ 
  data, 
  onChange, 
  disabled = false,
  showRequiredIndicators = true 
}: ClinicalNotesFormContentProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Document subjective history, objective findings, and assessment
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {/* History of Present Illness */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="history_of_present_illness" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-500" />
            History of Present Illness (HPI)
            {showRequiredIndicators && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="history_of_present_illness"
            placeholder="Detailed history of the current illness...&#10;Include: onset, duration, location, character, aggravating/relieving factors, associated symptoms"
            value={data.history_of_present_illness}
            onChange={(e) => onChange('history_of_present_illness', e.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Physical Examination */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="physical_examination" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-green-500" />
            Physical Examination
            {showRequiredIndicators && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="physical_examination"
            placeholder="Physical examination findings...&#10;Include: general appearance, systems review (cardiovascular, respiratory, abdomen, etc.)"
            value={data.physical_examination}
            onChange={(e) => onChange('physical_examination', e.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Assessment / Clinical Impression */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="assessment" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-purple-500" />
            Assessment / Clinical Impression
            {showRequiredIndicators && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="assessment"
            placeholder="Clinical reasoning and impression...&#10;Include: severity assessment, prognosis, key findings summary, clinical decision-making rationale&#10;(Note: Formal diagnoses with ICD codes are entered in the Diagnosis tab)"
            value={data.assessment}
            onChange={(e) => onChange('assessment', e.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Additional Notes */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes" className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Additional Notes
          </Label>
          <Textarea
            id="notes"
            placeholder="Any other relevant clinical notes, patient education provided, or special instructions..."
            value={data.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>
    </div>
  );
}

interface ClinicalNotesFormProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  validateOnNext?: boolean;
}

/**
 * Hook to validate clinical notes and show toast for missing fields
 */
export function useClinicalNotesValidation() {
  const { toast } = useToast();

  const validate = useCallback((data: EncounterFormData): boolean => {
    const missingFields = validateClinicalNotes(data);
    
    if (missingFields.length > 0) {
      toast({
        title: 'Required Fields Missing',
        description: `Please complete the following fields: ${missingFields.join(', ')}`,
        variant: 'destructive',
      });
      return false;
    }
    
    return true;
  }, [toast]);

  return { validate, validateClinicalNotes };
}

/**
 * Card-wrapped version of the Clinical Notes form
 * Used in tab-based layouts (legacy)
 */
export function ClinicalNotesForm({
  data,
  onChange,
  disabled = false,
  onNext,
  onPrevious,
  validateOnNext = false,
}: ClinicalNotesFormProps) {
  const { validate } = useClinicalNotesValidation();

  const handleNext = useCallback(() => {
    if (validateOnNext) {
      if (!validate(data)) {
        return;
      }
    }
    onNext?.();
  }, [validateOnNext, validate, data, onNext]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Clinical Notes
        </CardTitle>
        <CardDescription>
          Document subjective history, objective findings, assessment, and plan (SOAP)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ClinicalNotesFormContent data={data} onChange={onChange} disabled={disabled} />
      </CardContent>

      {/* Navigation Footer */}
      {(onNext || onPrevious) && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-between w-full">
            {onPrevious ? (
              <Button onClick={onPrevious} variant="secondary">
                ← Back to Hx
              </Button>
            ) : <div />}
            {onNext && (
              <Button onClick={handleNext} variant="secondary">
                Continue to Dx →
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default ClinicalNotesForm;
