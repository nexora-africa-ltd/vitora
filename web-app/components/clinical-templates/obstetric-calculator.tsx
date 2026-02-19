'use client';

/**
 * Obstetric Calculator Component
 *
 * A clinical tool for calculating pregnancy dates based on LMP.
 * Auto-populates EDD, gestational age, and trimester fields.
 */

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { Calculator, Calendar, Baby, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  calculateFromLMP,
  calculateLMPFromEDD,
  formatObstetricDate,
  formatDateForInput,
  getMilestones,
  type ObstetricCalculation,
} from '@/lib/utils/obstetric-calculator';

export interface ObstetricCalculatorProps {
  /** Current LMP value from form */
  lmpValue?: string;
  /** Current EDD value from form */
  eddValue?: string;
  /** Callback when LMP changes */
  onLMPChange?: (lmp: string) => void;
  /** Callback when EDD changes */
  onEDDChange?: (edd: string) => void;
  /** Callback when gestational age changes */
  onGestationalAgeChange?: (weeks: number) => void;
  /** Callback when trimester changes */
  onTrimesterChange?: (trimester: number) => void;
  /** Callback to apply all calculated values */
  onApplyAll?: (values: {
    lmp: string;
    edd: string;
    gestational_age_weeks: number;
    trimester: number;
  }) => void;
  /** Whether the calculator is disabled */
  disabled?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
}

export function ObstetricCalculator({
  lmpValue,
  eddValue,
  onLMPChange,
  onEDDChange,
  onGestationalAgeChange,
  onTrimesterChange,
  onApplyAll,
  disabled = false,
  compact = false,
}: ObstetricCalculatorProps) {
  const [isOpen, setIsOpen] = useState(!compact);
  const [calculation, setCalculation] = useState<ObstetricCalculation | null>(null);
  const [inputMode, setInputMode] = useState<'lmp' | 'edd'>('lmp');

  // Calculate from LMP when it changes
  useEffect(() => {
    if (lmpValue) {
      const result = calculateFromLMP(lmpValue);
      setCalculation(result);
    } else if (eddValue) {
      const lmpFromEdd = calculateLMPFromEDD(eddValue);
      if (lmpFromEdd) {
        const result = calculateFromLMP(lmpFromEdd);
        setCalculation(result);
      }
    } else {
      setCalculation(null);
    }
  }, [lmpValue, eddValue]);

  const handleLMPChange = useCallback(
    (date?: Date) => {
      if (date && isValid(date)) {
        const lmpStr = formatDateForInput(date);
        onLMPChange?.(lmpStr);

        const result = calculateFromLMP(date);
        if (result) {
          setCalculation(result);
          // Auto-populate EDD
          onEDDChange?.(formatDateForInput(result.edd));
          onGestationalAgeChange?.(result.gestationalAgeWeeks);
          onTrimesterChange?.(result.trimester);
        }
      } else {
        onLMPChange?.('');
        setCalculation(null);
      }
    },
    [onLMPChange, onEDDChange, onGestationalAgeChange, onTrimesterChange]
  );

  const handleEDDChange = useCallback(
    (date?: Date) => {
      if (date && isValid(date)) {
        const eddStr = formatDateForInput(date);
        onEDDChange?.(eddStr);

        const lmpFromEdd = calculateLMPFromEDD(date);
        if (lmpFromEdd) {
          onLMPChange?.(formatDateForInput(lmpFromEdd));
          const result = calculateFromLMP(lmpFromEdd);
          if (result) {
            setCalculation(result);
            onGestationalAgeChange?.(result.gestationalAgeWeeks);
            onTrimesterChange?.(result.trimester);
          }
        }
      } else {
        onEDDChange?.('');
      }
    },
    [onEDDChange, onLMPChange, onGestationalAgeChange, onTrimesterChange]
  );

  const handleApplyAll = useCallback(() => {
    if (calculation && onApplyAll) {
      onApplyAll({
        lmp: formatDateForInput(calculation.lmp),
        edd: formatDateForInput(calculation.edd),
        gestational_age_weeks: calculation.gestationalAgeWeeks,
        trimester: calculation.trimester,
      });
    }
  }, [calculation, onApplyAll]);

  const milestones = calculation ? getMilestones(calculation.lmp) : null;

  const getTrimesterColor = (trimester: number) => {
    switch (trimester) {
      case 1:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 2:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 3:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (compact) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Obstetric Calculator
            </span>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <CalculatorContent
            calculation={calculation}
            milestones={milestones}
            inputMode={inputMode}
            setInputMode={setInputMode}
            lmpValue={lmpValue}
            eddValue={eddValue}
            handleLMPChange={handleLMPChange}
            handleEDDChange={handleEDDChange}
            handleApplyAll={handleApplyAll}
            getTrimesterColor={getTrimesterColor}
            disabled={disabled}
            onApplyAll={onApplyAll}
            compact
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Obstetric Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CalculatorContent
          calculation={calculation}
          milestones={milestones}
          inputMode={inputMode}
          setInputMode={setInputMode}
          lmpValue={lmpValue}
          eddValue={eddValue}
          handleLMPChange={handleLMPChange}
          handleEDDChange={handleEDDChange}
          handleApplyAll={handleApplyAll}
          getTrimesterColor={getTrimesterColor}
          disabled={disabled}
          onApplyAll={onApplyAll}
        />
      </CardContent>
    </Card>
  );
}

interface CalculatorContentProps {
  calculation: ObstetricCalculation | null;
  milestones: ReturnType<typeof getMilestones>;
  inputMode: 'lmp' | 'edd';
  setInputMode: (mode: 'lmp' | 'edd') => void;
  lmpValue?: string;
  eddValue?: string;
  handleLMPChange: (date?: Date) => void;
  handleEDDChange: (date?: Date) => void;
  handleApplyAll: () => void;
  getTrimesterColor: (trimester: number) => string;
  disabled: boolean;
  onApplyAll?: ObstetricCalculatorProps['onApplyAll'];
  compact?: boolean;
}

function CalculatorContent({
  calculation,
  milestones,
  inputMode,
  setInputMode,
  lmpValue,
  eddValue,
  handleLMPChange,
  handleEDDChange,
  handleApplyAll,
  getTrimesterColor,
  disabled,
  onApplyAll,
  compact,
}: CalculatorContentProps) {
  return (
    <div className="space-y-4">
      {/* Input Mode Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={inputMode === 'lmp' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setInputMode('lmp')}
          disabled={disabled}
        >
          From LMP
        </Button>
        <Button
          type="button"
          variant={inputMode === 'edd' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setInputMode('edd')}
          disabled={disabled}
        >
          From EDD
        </Button>
      </div>

      {/* Date Input */}
      <div className="space-y-2">
        <Label>{inputMode === 'lmp' ? 'Last Menstrual Period (LMP)' : 'Expected Date of Delivery (EDD)'}</Label>
        <DatePicker
          value={
            inputMode === 'lmp'
              ? lmpValue
                ? parseISO(lmpValue)
                : undefined
              : eddValue
                ? parseISO(eddValue)
                : undefined
          }
          onChange={inputMode === 'lmp' ? handleLMPChange : handleEDDChange}
          disabled={disabled}
          placeholder={`Select ${inputMode.toUpperCase()} date`}
          allowFuture={inputMode === 'edd'}
          allowPast={inputMode === 'lmp'}
        />
      </div>

      {/* Results */}
      {calculation && (
        <div className="space-y-3 pt-2 border-t">
          {/* Summary Cards */}
          <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
            <div className="rounded-lg border p-2 text-center">
              <Calendar className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">EDD</p>
              <p className="font-medium text-sm">{formatObstetricDate(calculation.edd)}</p>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <Baby className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Gestational Age</p>
              <p className="font-medium text-sm">{calculation.gestationalAgeDisplay}</p>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <Badge className={cn('text-xs', getTrimesterColor(calculation.trimester))}>
                {calculation.trimesterDisplay}
              </Badge>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Weeks Left</p>
              <p className="font-medium text-sm">{calculation.weeksRemaining}</p>
            </div>
          </div>

          {/* Alerts */}
          {calculation.isAtTerm && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Patient is at term ({calculation.gestationalAgeWeeks} weeks)
            </div>
          )}
          {calculation.isPostTerm && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Post-term pregnancy - urgent attention required
            </div>
          )}

          {/* Milestones (non-compact only) */}
          {!compact && milestones && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Key Milestones:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span>End 1st Trimester: {format(milestones.endFirstTrimester, 'dd MMM')}</span>
                <span>Anatomy Scan: {format(milestones.anatomyScanStart, 'dd MMM')} - {format(milestones.anatomyScanEnd, 'dd MMM')}</span>
                <span>Viability (24w): {format(milestones.viability, 'dd MMM')}</span>
                <span>Term (37w): {format(milestones.term, 'dd MMM')}</span>
              </div>
            </div>
          )}

          {/* Apply Button */}
          {onApplyAll && (
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleApplyAll}
              disabled={disabled}
            >
              Apply to Form
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default ObstetricCalculator;
