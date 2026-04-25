'use client';

import { useCallback, useMemo, useState } from 'react';
import { FileText, AlertCircle, Pill, Heart, Users, Briefcase, ChevronRight, ChevronLeft, BrainCircuit, Loader2, HeartPulse, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SmartSuggestion } from '@/components/shared/smart-suggestion';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { useSmartSuggestions } from '@/lib/hooks/use-smart-suggestions';
import { usePatientSocialHistory } from '@/lib/hooks/use-social-history';
import { usePatientAllergies } from '@/lib/hooks/use-allergies';
import { usePatientChronicConditions } from '@/lib/hooks/use-chronic-conditions';
import { usePatientCurrentMedications } from '@/lib/hooks/use-current-medications';
import { usePatientPastSurgeries } from '@/lib/hooks/use-past-surgeries';
import { usePatientFamilyHistory } from '@/lib/hooks/use-family-history';
import { SocialHistoryFormDialog } from '@/components/patients/social-history/social-history-form-dialog';
import { AllergyFormDialog } from '@/components/patients/allergies/allergy-form-dialog';
import { ChronicConditionFormDialog } from '@/components/patients/chronic-conditions/chronic-condition-form-dialog';
import { CurrentMedicationFormDialog } from '@/components/patients/current-medications/current-medication-form-dialog';
import { PastSurgeryFormDialog } from '@/components/patients/past-surgeries/past-surgery-form-dialog';
import { FamilyHistoryFormDialog } from '@/components/patients/family-history/family-history-form-dialog';
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
              <BrainCircuit className="h-3.5 w-3.5" />
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
        {/* Allergies — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Known Allergies
          </Label>
          <AllergySummary patientId={data.patient ?? undefined} disabled={disabled} />
          {/* Legacy notes fallback — shown only when there is existing free-text */}
          {data.allergies && (
            <div className="mt-2">
              <Label htmlFor="allergies" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="allergies"
                value={data.allergies}
                onChange={(e) => onChange('allergies', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
        </div>

        {/* Chronic Conditions — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-blue-500" />
            Chronic Conditions
          </Label>
          <ChronicConditionsSummary patientId={data.patient ?? undefined} disabled={disabled} />
          {data.chronic_conditions && (
            <div className="mt-2">
              <Label htmlFor="chronic_conditions" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="chronic_conditions"
                value={data.chronic_conditions}
                onChange={(e) => onChange('chronic_conditions', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
          {renderFieldSuggestions('chronic_conditions')}
        </div>

        {/* Current Medications — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-green-500" />
            Current Medications
          </Label>
          <CurrentMedicationsSummary patientId={data.patient ?? undefined} disabled={disabled} />
          {data.current_medications && (
            <div className="mt-2">
              <Label htmlFor="current_medications" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="current_medications"
                value={data.current_medications}
                onChange={(e) => onChange('current_medications', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
          {renderFieldSuggestions('current_medications')}
        </div>

        {/* Past Surgeries — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-amber-500" />
            Past Surgeries / Procedures
          </Label>
          <PastSurgeriesSummary patientId={data.patient ?? undefined} disabled={disabled} />
          {data.past_surgeries && (
            <div className="mt-2">
              <Label htmlFor="past_surgeries" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="past_surgeries"
                value={data.past_surgeries}
                onChange={(e) => onChange('past_surgeries', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
        </div>

        {/* Family History — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Family History
          </Label>
          <FamilyHistorySummary patientId={data.patient ?? undefined} disabled={disabled} />
          {data.family_history && (
            <div className="mt-2">
              <Label htmlFor="family_history" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="family_history"
                value={data.family_history}
                onChange={(e) => onChange('family_history', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
        </div>

        {/* Social History — Structured from patient record */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-teal-500" />
            Social History
          </Label>
          <SocialHistorySummary patientId={data.patient ?? undefined} disabled={disabled} />
          {/* Legacy notes fallback — shown only when there is existing free-text */}
          {data.social_history && (
            <div className="mt-2">
              <Label htmlFor="social_history" className="text-xs text-muted-foreground">
                Legacy notes
              </Label>
              <Textarea
                id="social_history"
                value={data.social_history}
                onChange={(e) => onChange('social_history', e.target.value)}
                disabled={disabled}
                rows={2}
                className="resize-none text-sm opacity-70"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Inline Allergy Summary (read-only + inline add)
// =============================================================================

const severityColors: Record<string, string> = {
  mild: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  severe: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  life_threatening: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function AllergySummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: allergies, isLoading } = usePatientAllergies(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Select a patient to view allergies.
      </p>
    );
  }

  if (isLoading) {
    return <div className="h-10 bg-muted/40 rounded animate-pulse" />;
  }

  const items = allergies ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No allergies recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((allergy) => (
            <div
              key={allergy.id}
              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm"
            >
              <span className="font-medium truncate">{allergy.substance}</span>
              <Badge className={`${severityColors[allergy.severity] ?? ''} text-xs shrink-0`}>
                {allergy.severity_display || allergy.severity}
              </Badge>
              {allergy.reaction_type && allergy.reaction_type !== 'other' && (
                <span className="text-muted-foreground text-xs truncate">{allergy.reaction_type.replace(/_/g, ' ')}</span>
              )}
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add allergy
            </Button>
          )}
        </>
      )}
      {hasPatient && (
        <AllergyFormDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          patientId={patientId}
        />
      )}
    </div>
  );
}

// =============================================================================
// Inline Social History Summary (read-only + inline add)
// =============================================================================

const socialStatusColors: Record<string, string> = {
  CURRENT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  FORMER: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  NEVER: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

const typeIcons: Record<string, string> = {
  ALCOHOL_USE: '🍺',
  TOBACCO_USE: '🚬',
  OCCUPATION: '💼',
  LIFESTYLE: '🏃',
};

function SocialHistorySummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: observations, isLoading } = usePatientSocialHistory(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Select a patient to view structured social history.
      </p>
    );
  }

  if (isLoading) {
    return <div className="h-10 bg-muted/40 rounded animate-pulse" />;
  }

  const items = observations ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No social history recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((obs) => (
            <div
              key={obs.id}
              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm"
            >
              <span aria-hidden="true">{typeIcons[obs.observation_type] ?? '📝'}</span>
              <span className="font-medium">{obs.observation_type_display}</span>
              <Badge className={`${socialStatusColors[obs.status] ?? ''} text-xs shrink-0`}>
                {obs.status_display}
              </Badge>
              {obs.value_text && (
                <span className="text-muted-foreground truncate">{obs.value_text}</span>
              )}
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add observation
            </Button>
          )}
        </>
      )}
      {hasPatient && (
        <SocialHistoryFormDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          patientId={patientId}
        />
      )}
    </div>
  );
}

// =============================================================================
// Inline Chronic Conditions Summary (read-only + inline add)
// =============================================================================

const conditionStatusColors: Record<string, string> = {
  ACTIVE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  REMISSION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

function ChronicConditionsSummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: conditions, isLoading } = usePatientChronicConditions(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return <p className="text-sm text-muted-foreground italic">Select a patient to view chronic conditions.</p>;
  }
  if (isLoading) return <div className="h-10 bg-muted/40 rounded animate-pulse" />;

  const items = conditions ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No chronic conditions recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
              <span className="font-medium truncate">{c.condition_name}</span>
              {c.icd10_code && <span className="text-xs text-muted-foreground shrink-0">({c.icd10_code})</span>}
              <Badge className={`${conditionStatusColors[c.status] ?? ''} text-xs shrink-0`}>{c.status_display}</Badge>
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add condition
            </Button>
          )}
        </>
      )}
      {hasPatient && <ChronicConditionFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />}
    </div>
  );
}

// =============================================================================
// Inline Current Medications Summary (read-only + inline add)
// =============================================================================

const medicationStatusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ON_HOLD: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  STOPPED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

function CurrentMedicationsSummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: medications, isLoading } = usePatientCurrentMedications(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return <p className="text-sm text-muted-foreground italic">Select a patient to view current medications.</p>;
  }
  if (isLoading) return <div className="h-10 bg-muted/40 rounded animate-pulse" />;

  const items = medications ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No current medications recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
              <span className="font-medium truncate">{m.medication_name}</span>
              {m.dosage && <span className="text-xs text-muted-foreground shrink-0">{m.dosage}</span>}
              {m.frequency && <span className="text-xs text-muted-foreground shrink-0">{m.frequency}</span>}
              <Badge className={`${medicationStatusColors[m.status] ?? ''} text-xs shrink-0`}>{m.status_display}</Badge>
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add medication
            </Button>
          )}
        </>
      )}
      {hasPatient && <CurrentMedicationFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />}
    </div>
  );
}

// =============================================================================
// Inline Past Surgeries Summary (read-only + inline add)
// =============================================================================

const outcomeColors: Record<string, string> = {
  SUCCESSFUL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  COMPLICATED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

function PastSurgeriesSummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: surgeries, isLoading } = usePatientPastSurgeries(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return <p className="text-sm text-muted-foreground italic">Select a patient to view past surgeries.</p>;
  }
  if (isLoading) return <div className="h-10 bg-muted/40 rounded animate-pulse" />;

  const items = surgeries ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No past surgeries recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
              <span className="font-medium truncate">{s.procedure_name}</span>
              {s.procedure_date && <span className="text-xs text-muted-foreground shrink-0">({s.procedure_date})</span>}
              <Badge className={`${outcomeColors[s.outcome] ?? ''} text-xs shrink-0`}>{s.outcome_display}</Badge>
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add surgery
            </Button>
          )}
        </>
      )}
      {hasPatient && <PastSurgeryFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />}
    </div>
  );
}

// =============================================================================
// Inline Family History Summary (read-only + inline add)
// =============================================================================

function FamilyHistorySummary({ patientId, disabled }: { patientId?: number; disabled?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: history, isLoading } = usePatientFamilyHistory(patientId ?? 0);
  const hasPatient = !!patientId;

  if (!hasPatient) {
    return <p className="text-sm text-muted-foreground italic">Select a patient to view family history.</p>;
  }
  if (isLoading) return <div className="h-10 bg-muted/40 rounded animate-pulse" />;

  const items = history ?? [];

  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-dashed text-sm text-muted-foreground">
          <span>No family history recorded</span>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
      ) : (
        <>
          {items.map((f) => (
            <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
              <Badge variant="outline" className="text-xs shrink-0">{f.relationship_display}</Badge>
              <span className="font-medium truncate">{f.condition_name}</span>
              {f.age_at_onset && <span className="text-xs text-muted-foreground shrink-0">onset ~{f.age_at_onset}</span>}
              {f.deceased && <Badge variant="secondary" className="text-xs shrink-0">Deceased</Badge>}
            </div>
          ))}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-3 w-3" /> Add family history
            </Button>
          )}
        </>
      )}
      {hasPatient && <FamilyHistoryFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />}
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
