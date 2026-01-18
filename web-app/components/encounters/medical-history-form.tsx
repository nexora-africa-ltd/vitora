'use client';

import { FileText, AlertCircle, Pill, Heart, Users, Briefcase, ChevronRight, ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { EncounterFormData } from '@/lib/types/encounter-form';

interface MedicalHistoryFormContentProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
}

/**
 * Content-only version of the Medical History form (no Card wrapper)
 * Used in accordion-based layouts
 */
export function MedicalHistoryFormContent({ data, onChange, disabled = false }: MedicalHistoryFormContentProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Document the patient&apos;s relevant medical background for this encounter
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Allergies */}
        <div className="space-y-2">
          <Label htmlFor="allergies" className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Known Allergies
          </Label>
          <Textarea
            id="allergies"
            placeholder="Drug allergies, food allergies, environmental allergies...&#10;Example: Penicillin (anaphylaxis), Shellfish (hives)"
            value={data.allergies}
            onChange={(e) => onChange('allergies', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
        
        {/* Chronic Conditions */}
        <div className="space-y-2">
          <Label htmlFor="chronic_conditions" className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-blue-500" />
            Chronic Conditions
          </Label>
          <Textarea
            id="chronic_conditions"
            placeholder="Ongoing medical conditions...&#10;Example: Type 2 Diabetes (since 2020), Hypertension (controlled)"
            value={data.chronic_conditions}
            onChange={(e) => onChange('chronic_conditions', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
        
        {/* Current Medications */}
        <div className="space-y-2">
          <Label htmlFor="current_medications" className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-green-500" />
            Current Medications
          </Label>
          <Textarea
            id="current_medications"
            placeholder="Current medications with dosage...&#10;Example: Metformin 500mg BD, Lisinopril 10mg OD"
            value={data.current_medications}
            onChange={(e) => onChange('current_medications', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
        
        {/* Past Surgeries */}
        <div className="space-y-2">
          <Label htmlFor="past_surgeries" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-amber-500" />
            Past Surgeries / Procedures
          </Label>
          <Textarea
            id="past_surgeries"
            placeholder="Previous surgical procedures with dates...&#10;Example: Appendectomy (2018), C-Section (2021)"
            value={data.past_surgeries}
            onChange={(e) => onChange('past_surgeries', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
        
        {/* Family History */}
        <div className="space-y-2">
          <Label htmlFor="family_history" className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Family History
          </Label>
          <Textarea
            id="family_history"
            placeholder="Relevant family medical history...&#10;Example: Father - MI at 55, Mother - Type 2 DM, Sibling - Asthma"
            value={data.family_history}
            onChange={(e) => onChange('family_history', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
        
        {/* Social History */}
        <div className="space-y-2">
          <Label htmlFor="social_history" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-teal-500" />
            Social History
          </Label>
          <Textarea
            id="social_history"
            placeholder="Lifestyle factors (smoking, alcohol, occupation)...&#10;Example: Non-smoker, Occasional alcohol, Teacher"
            value={data.social_history}
            onChange={(e) => onChange('social_history', e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>
    </div>
  );
}

interface MedicalHistoryFormProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}

/**
 * Card-wrapped version of the Medical History form
 * Used in tab-based layouts (legacy)
 */
export function MedicalHistoryForm({ data, onChange, disabled = false, onNext, onPrevious }: MedicalHistoryFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Medical History (Hx)
        </CardTitle>
        <CardDescription>
          Document the patient&apos;s relevant medical background for this encounter
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MedicalHistoryFormContent data={data} onChange={onChange} disabled={disabled} />
      </CardContent>
      
      {/* Navigation Footer */}
      {onNext && (
        <CardFooter className="border-t pt-4">
          <div className="flex justify-end w-full">
            <Button onClick={onNext} variant="secondary">
              Continue to HPI →
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export default MedicalHistoryForm;
