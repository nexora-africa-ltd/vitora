'use client';

import { FileText, Stethoscope, ClipboardList, Target, ChevronRight, ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { EncounterFormData } from '@/lib/types/encounter-form';

interface ClinicalNotesFormProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}

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
          HPI & Clinical Notes
        </CardTitle>
        <CardDescription>
          Document subjective history, objective findings, assessment, and plan (SOAP)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          
          {/* Assessment */}
          <div className="space-y-2">
            <Label htmlFor="assessment" className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-500" />
              Assessment
            </Label>
            <Textarea
              id="assessment"
              placeholder="Clinical assessment and reasoning...&#10;Differential diagnoses, working diagnosis"
              value={data.assessment}
              onChange={(e) => onChange('assessment', e.target.value)}
              disabled={disabled}
              rows={3}
              className="resize-none"
            />
          </div>
          
          {/* Plan note - handled by Treatment Plan, Lab Orders, and Prescriptions */}
          <div className="space-y-2 md:col-span-2 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-purple-500" />
              <span>
                <strong>Plan:</strong> Use the Treatment Plan, Lab Orders, and Prescriptions tabs
                to document the management plan with structured data.
              </span>
            </p>
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
