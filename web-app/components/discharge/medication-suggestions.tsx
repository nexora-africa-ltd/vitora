'use client';

import { Plus, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { HelpPopover } from '@/components/shared/help-popover';
import type { DischargeMedication } from '@/lib/types/inpatient';
import type { SuggestedMedication } from '@/lib/discharge/types';

interface MedicationSuggestionsProps {
  suggestedMeds: SuggestedMedication[];
  medications: DischargeMedication[];
  onAddMedication: (med: SuggestedMedication) => void;
}

export function MedicationSuggestions({
  suggestedMeds,
  medications,
  onAddMedication,
}: MedicationSuggestionsProps) {
  if (suggestedMeds.length === 0) return null;

  return (
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
              onClick={() => onAddMedication(med)}
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
  );
}
