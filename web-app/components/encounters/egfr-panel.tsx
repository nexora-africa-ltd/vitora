/**
 * eGFR Calculator Panel — AI-powered renal function assessment
 *
 * Calculates eGFR using CKD-EPI 2021 (race-free) and Cockcroft-Gault equations.
 * Displays CKD staging, dose adjustment guidance, and clinical action flags.
 * Falls back to local calculation when TibaBot is unavailable.
 *
 * Advisory only — clinician must review and confirm all results.
 *
 * @see docs/egfr-calculator-api-guide.md
 */
'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Calculator,
  Info,
  Loader2,
  ShieldAlert,
  Activity,
  Pill,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAIEGFRCalculate, useStoredEGFRResults } from '@/lib/hooks/use-ai';
import { toast } from 'sonner';
import { AIFeedbackButtons } from '@/components/shared/ai-feedback-buttons';
import type { AIEGFRCalculateResponse } from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface EGFRPanelProps {
  /** Patient ID for persistence */
  patientId?: number;
  /** Encounter ID for persistence */
  encounterId?: number;
  /** Pre-fill patient age */
  patientAge?: number;
  /** Pre-fill patient sex */
  patientSex?: 'male' | 'female';
  /** Pre-fill weight from vitals */
  weightKg?: number;
  /** Pre-fill creatinine from lab results */
  creatinine?: number;
  /** Pre-fill creatinine unit */
  creatinineUnit?: 'mg/dL' | 'umol/L';
  /** Optional class name */
  className?: string;
}

// =============================================================================
// CKD STAGE COLORS
// =============================================================================

const CKD_STAGE_COLORS: Record<string, string> = {
  G1: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  G2: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  G3a: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  G3b: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  G4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  G5: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const DOSE_BAND_COLORS: Record<string, string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  mild: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  moderate: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  severe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  dialysis: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const FLAG_ICONS: Record<string, typeof AlertTriangle> = {
  refer_nephrology: ShieldAlert,
  avoid_nsaids: Pill,
  avoid_nephrotoxins: Pill,
  check_potassium: Activity,
  check_phosphate: Activity,
  discuss_rrt_options: ShieldAlert,
};

// =============================================================================
// COMPONENT
// =============================================================================

export function EGFRPanel({
  patientId,
  encounterId,
  patientAge,
  patientSex,
  weightKg,
  creatinine: initialCreatinine,
  creatinineUnit: initialUnit,
  className,
}: EGFRPanelProps) {
  // Form state
  const [creatinine, setCreatinine] = React.useState(initialCreatinine?.toString() ?? '');
  const [creatinineUnit, setCreatinineUnit] = React.useState<'mg/dL' | 'umol/L'>(initialUnit ?? 'umol/L');
  const [age, setAge] = React.useState(patientAge?.toString() ?? '');
  const [sex, setSex] = React.useState<'male' | 'female' | ''>(patientSex ?? '');
  const [weight, setWeight] = React.useState(weightKg?.toString() ?? '');

  // Result state
  const [result, setResult] = React.useState<AIEGFRCalculateResponse | null>(null);

  // Hooks
  const calculateMutation = useAIEGFRCalculate();
  const { data: storedResults } = useStoredEGFRResults({
    patient_id: patientId,
    encounter_id: encounterId,
  });

  const handleCalculate = () => {
    const creatVal = parseFloat(creatinine);
    const ageVal = parseInt(age, 10);

    if (!creatVal || creatVal <= 0) {
      toast.error('Please enter a valid creatinine value');
      return;
    }
    if (!ageVal || ageVal < 18 || ageVal > 120) {
      toast.error('Age must be between 18 and 120');
      return;
    }
    if (!sex) {
      toast.error('Please select patient sex');
      return;
    }

    calculateMutation.mutate(
      {
        creatinine: creatVal,
        creatinine_unit: creatinineUnit,
        age: ageVal,
        sex,
        weight_kg: weight ? parseFloat(weight) : undefined,
        patient_id: patientId,
        encounter_id: encounterId,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success(`eGFR calculated: ${data.egfr_ckd_epi} mL/min — CKD Stage ${data.ckd_stage}`);
        },
        onError: (error) => {
          toast.error(`eGFR calculation failed: ${error.message}`);
        },
      }
    );
  };

  // Show stored result if available and no fresh result
  const displayResult = result ?? (storedResults?.[0]?.result_data as unknown as AIEGFRCalculateResponse | undefined) ?? null;

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">eGFR Calculator</CardTitle>
          <HelpPopover content="Calculates estimated Glomerular Filtration Rate using CKD-EPI 2021 (race-free) equation with CKD staging and renal dose adjustment guidance. Kenya labs typically report creatinine in µmol/L." />
          {displayResult?.mode === 'fallback' && (
            <Badge variant="outline" className="text-xs">Offline</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Input Form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="egfr-creatinine" className="text-xs">
              Creatinine *
            </Label>
            <Input
              id="egfr-creatinine"
              type="number"
              step="0.01"
              min="0.01"
              placeholder={creatinineUnit === 'umol/L' ? '88.4' : '1.0'}
              value={creatinine}
              onChange={(e) => setCreatinine(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="egfr-unit" className="text-xs">
              Unit
            </Label>
            <Select value={creatinineUnit} onValueChange={(v) => setCreatinineUnit(v as 'mg/dL' | 'umol/L')}>
              <SelectTrigger id="egfr-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="umol/L">µmol/L</SelectItem>
                <SelectItem value="mg/dL">mg/dL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="egfr-age" className="text-xs">
              Age (years) *
            </Label>
            <Input
              id="egfr-age"
              type="number"
              min="18"
              max="120"
              placeholder="55"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="egfr-sex" className="text-xs">
              Sex *
            </Label>
            <Select value={sex} onValueChange={(v) => setSex(v as 'male' | 'female')}>
              <SelectTrigger id="egfr-sex">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="egfr-weight" className="text-xs">
              Weight (kg) <span className="text-muted-foreground">— for Cockcroft-Gault</span>
            </Label>
            <Input
              id="egfr-weight"
              type="number"
              min="1"
              max="500"
              placeholder="70"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={handleCalculate}
          disabled={calculateMutation.isPending}
          className="w-full"
          size="sm"
        >
          {calculateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <Calculator className="mr-2 h-4 w-4" />
              Calculate eGFR
            </>
          )}
        </Button>

        {/* Results */}
        {displayResult && (
          <div className="space-y-3 pt-2 border-t">
            {/* CKD Stage Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={cn('text-sm font-semibold', CKD_STAGE_COLORS[displayResult.ckd_stage] ?? 'bg-muted')}>
                  CKD {displayResult.ckd_stage}
                </Badge>
                <span className="text-sm text-muted-foreground">{displayResult.category}</span>
              </div>
            </div>

            {/* eGFR Values */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-xs text-muted-foreground">CKD-EPI 2021</div>
                <div className="text-lg font-bold">{displayResult.egfr_ckd_epi}</div>
                <div className="text-xs text-muted-foreground">mL/min/1.73m²</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-xs text-muted-foreground">Cockcroft-Gault</div>
                <div className="text-lg font-bold">
                  {displayResult.egfr_cockcroft_gault ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground">mL/min</div>
              </div>
            </div>

            {/* Dose Adjustment Band */}
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Dose Adjustment:</span>
              <Badge className={cn('capitalize', DOSE_BAND_COLORS[displayResult.dose_adjustment_band] ?? 'bg-muted')}>
                {displayResult.dose_adjustment_band}
              </Badge>
            </div>

            {/* Clinical Flags */}
            {displayResult.flags.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Clinical Actions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {displayResult.flags.map((flag) => {
                    const IconComponent = FLAG_ICONS[flag] ?? Info;
                    return (
                      <Badge
                        key={flag}
                        variant="outline"
                        className="text-xs gap-1"
                      >
                        <IconComponent className="h-3 w-3" />
                        {flag.replace(/_/g, ' ')}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interpretation */}
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-sm">{displayResult.interpretation}</p>
            </div>

            {/* Feedback */}
            {result?.stored_id && (
              <AIFeedbackButtons
                messageId={result.stored_id}
                serviceType="egfr_calculator"
              />
            )}
          </div>
        )}

        {/* Advisory Disclaimer */}
        <p className="text-xs text-muted-foreground italic pt-1">
          Advisory only — verify results and correlate clinically before prescribing decisions.
        </p>
      </CardContent>
    </Card>
  );
}
