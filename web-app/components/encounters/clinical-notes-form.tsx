'use client';

import { FileText, Stethoscope, ClipboardList, ChevronRight, ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { EncounterFormData } from '@/lib/types/encounter-form';

interface ClinicalNotesFormContentProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
}

/**
 * Content-only version of the Clinical Notes form (no Card wrapper)
 * Used in accordion-based layouts
 */
export function ClinicalNotesFormContent({ data, onChange, disabled = false }: ClinicalNotesFormContentProps) {
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
  onPrevious
}: ClinicalNotesFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          History of Present Illness (HPI)
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
              <Button onClick={onNext} variant="secondary">
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
