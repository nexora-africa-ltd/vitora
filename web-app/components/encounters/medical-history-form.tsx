'use client';

import { useCallback, useMemo, useState } from 'react';
import { FileText, AlertCircle, Pill, Heart, Users, Briefcase, ChevronRight, ChevronLeft, Sparkles, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SmartSuggestion } from '@/components/shared/smart-suggestion';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { useSmartSuggestions } from '@/lib/hooks/use-smart-suggestions';
import type { SmartSuggestion as SmartSuggestionType } from '@/lib/hooks/use-smart-suggestions';
import type { EncounterFormData } from '@/lib/types/encounter-form';

interface MedicalHistoryFormContentProps {
  data: EncounterFormData;
  onChange: (field: keyof EncounterFormData, value: string) => void;
  disabled?: boolean;
  /** Chief complaint text — used for AI-powered suggestions when smart_autopopulate is on */
  chiefComplaint?: string;
}

/**
 * Content-only version of the Medical History form (no Card wrapper)
 * Used in accordion-based layouts
 */
export function MedicalHistoryFormContent({ data, onChange, disabled = false, chiefComplaint }: MedicalHistoryFormContentProps) {
  const smartAutopopulate = useFeatureFlag('smart_autopopulate');
  const {
    getFieldSuggestions,
    fetchSuggestions,
    accept,
    reject,
    isLoading: isSuggestLoading,
    isAvailable,
  } = useSmartSuggestions();

  // Fetch AI suggestions from chief complaint context
  const handleFetchSuggestions = useCallback(() => {
    if (!chiefComplaint || chiefComplaint.trim().length < 5) return;
    fetchSuggestions({
      chief_complaint: chiefComplaint,
      clinical_notes: [
        data.allergies,
        data.chronic_conditions,
        data.current_medications,
      ].filter(Boolean).join('; '),
    });
  }, [chiefComplaint, data.allergies, data.chronic_conditions, data.current_medications, fetchSuggestions]);

  // Handle accepting a suggestion — append to the target field
  const handleAcceptSuggestion = useCallback((suggestion: SmartSuggestionType) => {
    const fieldMap: Record<string, keyof EncounterFormData> = {
      allergies: 'allergies',
      chronic_conditions: 'chronic_conditions',
      current_medications: 'current_medications',
      assessment: 'assessment',
    };
    const targetField = fieldMap[suggestion.field_name];
    if (!targetField) {
      accept(suggestion.id);
      return;
    }
    const currentValue = (data[targetField] as string) || '';
    const suggestedText = typeof suggestion.value === 'string'
      ? suggestion.value
      : JSON.stringify(suggestion.value);
    const newValue = currentValue
      ? `${currentValue}\n${suggestedText}`
      : suggestedText;
    onChange(targetField, newValue);
    accept(suggestion.id);
  }, [data, onChange, accept]);

  // Helper to render field suggestions below a textarea
  const renderFieldSuggestions = (fieldName: string) => {
    if (!smartAutopopulate || !isAvailable) return null;
    const suggestions = getFieldSuggestions(fieldName);
    if (suggestions.length === 0) return null;
    return (
      <div className="mt-1.5 space-y-1">
        {suggestions.map((s) => (
          <SmartSuggestion
            key={s.id}
            suggestion={s}
            onAccept={() => handleAcceptSuggestion(s)}
            onReject={() => reject(s.id)}
            variant="inline"
            disabled={disabled}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Document the patient&apos;s relevant medical background for this encounter
        </p>
        {smartAutopopulate && isAvailable && chiefComplaint && chiefComplaint.trim().length >= 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFetchSuggestions}
            disabled={disabled || isSuggestLoading}
            className="gap-1.5 text-xs"
          >
            {isSuggestLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isSuggestLoading ? 'Analyzing...' : 'AI Suggest History'}
            </span>
            <span className="sm:hidden">
              {isSuggestLoading ? '...' : 'Suggest'}
            </span>
          </Button>
        )}
      </div>
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
          {renderFieldSuggestions('allergies')}
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
          {renderFieldSuggestions('chronic_conditions')}
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
          {renderFieldSuggestions('current_medications')}
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
