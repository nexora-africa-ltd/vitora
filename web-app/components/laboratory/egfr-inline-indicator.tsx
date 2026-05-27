'use client';

import { Calculator, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { useStoredEGFRResults } from '@/lib/hooks/use-ai';
import type { AIEGFRCalculateResponse } from '@/lib/types/ai';

const CKD_STAGE_COLORS: Record<string, string> = {
  G1: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  G2: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  G3a: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  G3b: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  G4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  G5: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

interface EGFRInlineIndicatorProps {
  patientId?: number;
  encounterId?: number;
}

/**
 * Compact inline eGFR indicator shown after creatinine result is filed.
 * The backend auto-calculates eGFR via signal when creatinine is saved —
 * this component polls stored results and displays them inline.
 */
export function EGFRInlineIndicator({ patientId, encounterId }: EGFRInlineIndicatorProps) {
  const { data: storedResults, isLoading } = useStoredEGFRResults({
    patient_id: patientId,
    encounter_id: encounterId,
  });

  const latest = storedResults?.[0]?.result_data as unknown as AIEGFRCalculateResponse | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-muted">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Computing eGFR...</span>
      </div>
    );
  }

  if (!latest) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
      <Calculator className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">eGFR:</span>
        <span className="font-bold">{latest.egfr_ckd_epi} mL/min</span>
        <Badge className={cn('text-xs', CKD_STAGE_COLORS[latest.ckd_stage] ?? 'bg-muted')}>
          CKD {latest.ckd_stage}
        </Badge>
        <span className="text-muted-foreground">• {latest.category}</span>
        {latest.dose_adjustment_band !== 'normal' && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
            Dose: {latest.dose_adjustment_band}
          </Badge>
        )}
      </div>
    </div>
  );
}
