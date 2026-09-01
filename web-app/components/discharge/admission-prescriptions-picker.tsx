'use client';

import { CheckCircle2, Circle, Building2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { HelpPopover } from '@/components/shared/help-popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Prescription } from '@/lib/types/pharmacy';

interface AdmissionPrescriptionsPickerProps {
  prescriptions: Prescription[];
  selectedIds: Set<number>;
  dispensingTypes: Record<number, 'INTERNAL' | 'EXTERNAL'>;
  onToggle: (prescriptionId: number) => void;
  onDispensingTypeChange: (prescriptionId: number, type: 'INTERNAL' | 'EXTERNAL') => void;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  PARTIAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DISPENSED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  EXPIRED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function AdmissionPrescriptionsPicker({
  prescriptions,
  selectedIds,
  dispensingTypes,
  onToggle,
  onDispensingTypeChange,
}: AdmissionPrescriptionsPickerProps) {
  if (prescriptions.length === 0) return null;

  // Only show active prescriptions (not cancelled/expired)
  const activePrescriptions = prescriptions.filter(
    (rx) => rx.effective_status !== 'CANCELLED' && rx.effective_status !== 'EXPIRED'
  );

  if (activePrescriptions.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">From Current Admission</Label>
        <HelpPopover content="Select prescriptions from this admission to include as discharge take-home medications. Choose Internal if the hospital pharmacy will dispense, or External if the patient will fill at an outside pharmacy." />
      </div>
      <div className="space-y-2">
        {activePrescriptions.map((rx) => {
          const isSelected = selectedIds.has(rx.id);
          const dispensingType = dispensingTypes[rx.id] ?? rx.dispensing_type ?? 'INTERNAL';
          const activeItems = rx.items.filter((item) => !item.is_cancelled);

          return (
            <div
              key={rx.id}
              className={`cursor-pointer rounded-lg border transition-colors ${
                isSelected
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => onToggle(rx.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(rx.id);
                }
              }}
            >
              {/* Header: checkbox + Rx number + status + dispensing type */}
              <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:p-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="shrink-0">
                    {isSelected ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="truncate text-sm font-medium">{rx.prescription_number}</span>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${STATUS_COLORS[rx.effective_status] || ''}`}
                  >
                    {rx.effective_status}
                  </Badge>
                  {rx.dispensing_type === 'EXTERNAL' && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      <ExternalLink className="mr-0.5 h-2.5 w-2.5" />
                      External
                    </Badge>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Dispensing type selector (only when selected) */}
                {isSelected && (
                  <div
                    className="ml-6 flex items-center gap-3 sm:ml-0 sm:shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RadioGroup
                      value={dispensingType}
                      onValueChange={(v) =>
                        onDispensingTypeChange(rx.id, v as 'INTERNAL' | 'EXTERNAL')
                      }
                      className="flex items-center gap-3"
                    >
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <RadioGroupItem value="INTERNAL" />
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">Internal</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <RadioGroupItem value="EXTERNAL" />
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">External</span>
                      </label>
                    </RadioGroup>
                  </div>
                )}
              </div>

              {/* Items list: one row per drug */}
              <div className="space-y-1 border-t px-2.5 py-2 sm:px-3">
                {activeItems.map((item) => (
                  <div key={item.id} className="flex items-baseline gap-x-2 text-sm">
                    <span className="shrink-0 font-medium">
                      {item.drug_name || `Drug #${item.drug}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.dosage} · {item.frequency} · {item.duration}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
