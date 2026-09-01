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
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">Suggested Medications</Label>
        <HelpPopover content="TibaBot suggested these based on the patient's stay. Click + to add, then review and adjust dosages." />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {suggestedMeds.map((med, idx) => {
          const alreadyAdded = medications.some(
            (m) => m.drug_name.toLowerCase().trim() === med.drug_name.toLowerCase().trim()
          );
          return (
            <button
              key={idx}
              type="button"
              disabled={alreadyAdded}
              onClick={() => onAddMedication(med)}
              className={`flex max-w-full items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors sm:max-w-none sm:items-center ${
                alreadyAdded
                  ? 'cursor-not-allowed border-muted bg-muted/50 text-muted-foreground'
                  : 'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10'
              }`}
            >
              {!alreadyAdded && (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:mt-0">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              )}
              {alreadyAdded && (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 sm:mt-0" />
              )}
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 sm:flex-nowrap">
                <span className="max-w-[180px] truncate sm:max-w-[200px]">{med.drug_name}</span>
                {med.dosage && (
                  <span className="line-clamp-2 break-words text-xs text-muted-foreground sm:line-clamp-1 sm:max-w-[200px] sm:truncate">
                    {med.dosage}
                  </span>
                )}
              </span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                TibaBot
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
