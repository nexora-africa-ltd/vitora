/**
 * Lab Results Grid — batch entry for numeric panel tests.
 *
 * Displays all panel items in a spreadsheet-like grid where techs can
 * tab through cells, type values, and submit all results in one batch.
 * Auto-computes flags from reference ranges in real time.
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, Save, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAddLabResultsBatch } from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import type { LabOrderItem, LabResultCreateData, ResultFlag } from '@/lib/types/laboratory';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface RowData {
  itemId: number;
  testName: string;
  testCode: string;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string;
  value: string;
  flag: ResultFlag | '';
  isCritical: boolean;
  hasExistingResult: boolean;
}

interface LabResultsGridProps {
  orderNumber: string;
  items: LabOrderItem[];
  onComplete?: () => void;
  onResultAdded?: () => void;
  patientGender?: string;
  patientAge?: number;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

const FLAG_COLORS: Record<string, string> = {
  NORMAL: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400',
  LOW: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  HIGH: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400',
  CRITICAL_LOW: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  CRITICAL_HIGH: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  ABNORMAL: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400',
};

function parseRange(rangeStr: string): [number, number] | null {
  if (!rangeStr || !rangeStr.includes('-')) return null;
  const parts = rangeStr.split('-');
  if (parts.length !== 2) return null;
  const lowStr = parts[0];
  const highStr = parts[1];
  if (!lowStr || !highStr) return null;
  const low = parseFloat(lowStr.trim());
  const high = parseFloat(highStr.trim());
  if (isNaN(low) || isNaN(high)) return null;
  return [low, high];
}

function computeFlag(value: number, low: number | null, high: number | null): ResultFlag | '' {
  if (low === null || high === null) return '';
  if (value < low) {
    // Critical if >20% below lower bound
    const criticalThreshold = low - (high - low) * 0.5;
    return value < criticalThreshold ? 'CRITICAL_LOW' : 'LOW';
  }
  if (value > high) {
    const criticalThreshold = high + (high - low) * 0.5;
    return value > criticalThreshold ? 'CRITICAL_HIGH' : 'HIGH';
  }
  return 'NORMAL';
}

function getReferenceRange(
  item: LabOrderItem,
  patientGender?: string,
  patientAge?: number
): { low: number | null; high: number | null; text: string } {
  let rangeStr = '';
  if (patientAge !== undefined && patientAge < 18 && item.normal_range_child) {
    rangeStr = item.normal_range_child;
  } else if (patientGender === 'M' && item.normal_range_male) {
    rangeStr = item.normal_range_male;
  } else if (patientGender === 'F' && item.normal_range_female) {
    rangeStr = item.normal_range_female;
  } else {
    rangeStr = item.normal_range_male || item.normal_range_female || '';
  }

  const parsed = parseRange(rangeStr);
  return {
    low: parsed ? parsed[0] : null,
    high: parsed ? parsed[1] : null,
    text: rangeStr,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

export function LabResultsGrid({
  orderNumber,
  items,
  onComplete,
  onResultAdded,
  patientGender,
  patientAge,
}: LabResultsGridProps) {
  const { toast } = useToast();
  const batchMutation = useAddLabResultsBatch();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Filter to resultable items (non-panel-headers without existing results)
  const resultableItems = useMemo(() => {
    const hasChildren = (item: LabOrderItem) =>
      items.some(child => child.panel_parent === item.id);
    return items.filter(item => !(item.is_panel && hasChildren(item)));
  }, [items]);

  // Initialize grid rows
  const [rows, setRows] = useState<RowData[]>(() =>
    resultableItems.map(item => {
      const ref = getReferenceRange(item, patientGender, patientAge);
      return {
        itemId: item.id,
        testName: item.test_name,
        testCode: item.test_code,
        unit: item.result_unit || '',
        referenceLow: ref.low,
        referenceHigh: ref.high,
        referenceText: ref.text,
        value: item.has_result && item.result?.numeric_value != null
          ? String(item.result.numeric_value)
          : '',
        flag: item.has_result && item.result?.result_flag
          ? item.result.result_flag
          : '',
        isCritical: false,
        hasExistingResult: item.has_result,
      };
    })
  );

  // Track interpretation (shared across all results in this batch)
  const [interpretation, setInterpretation] = useState('');

  // Update flag when value changes
  const updateValue = useCallback((index: number, newValue: string) => {
    setRows(prev => {
      const updated = [...prev];
      const current = updated[index];
      if (!current) return prev;
      const row: RowData = { ...current, value: newValue };

      const numVal = parseFloat(newValue);
      if (!isNaN(numVal) && newValue.trim() !== '') {
        const flag = computeFlag(numVal, row.referenceLow ?? null, row.referenceHigh ?? null);
        row.flag = flag;
        row.isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
      } else {
        row.flag = '';
        row.isCritical = false;
      }

      updated[index] = row;
      return updated;
    });
  }, []);

  // Handle keyboard navigation (Tab/Enter to next row)
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const nextIndex = index + 1;
      // Skip rows with existing results
      let target = nextIndex;
      while (target < rows.length && rows[target]?.hasExistingResult) {
        target++;
      }
      if (target < rows.length) {
        inputRefs.current[target]?.focus();
        inputRefs.current[target]?.select();
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      let target = index - 1;
      while (target >= 0 && rows[target]?.hasExistingResult) {
        target--;
      }
      if (target >= 0) {
        inputRefs.current[target]?.focus();
        inputRefs.current[target]?.select();
      }
    }
  }, [rows]);

  // Focus the first empty input on mount
  useEffect(() => {
    const firstEmpty = rows.findIndex(r => !r.hasExistingResult && r.value === '');
    if (firstEmpty >= 0) {
      setTimeout(() => inputRefs.current[firstEmpty]?.focus(), 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed stats
  const filledRows = rows.filter(r => !r.hasExistingResult && r.value.trim() !== '');
  const pendingRows = rows.filter(r => !r.hasExistingResult);
  const criticalCount = rows.filter(r => r.isCritical).length;
  const canSubmit = filledRows.length > 0 && !batchMutation.isPending;

  // Reset all unfilled values
  const handleReset = () => {
    setRows(prev => prev.map(row => {
      if (row.hasExistingResult) return row;
      return { ...row, value: '', flag: '', isCritical: false };
    }));
    setInterpretation('');
  };

  // Submit batch
  const handleSubmit = async () => {
    const results: LabResultCreateData[] = [];
    for (const row of filledRows) {
      const numVal = parseFloat(row.value);
      if (isNaN(numVal)) continue;
      results.push({
        order_item: row.itemId,
        numeric_value: numVal,
        result_unit: row.unit || undefined,
        reference_low: row.referenceLow ?? undefined,
        reference_high: row.referenceHigh ?? undefined,
        reference_range_text: row.referenceText || undefined,
        result_flag: row.flag || undefined,
        interpretation: interpretation || undefined,
      });
    }

    if (results.length === 0) {
      toast({ title: 'No valid results', description: 'Enter numeric values before saving.', variant: 'destructive' });
      return;
    }

    try {
      await batchMutation.mutateAsync({ orderNumber, results });
      toast({
        title: 'Results saved',
        description: `${results.length} result${results.length > 1 ? 's' : ''} recorded successfully.`,
      });
      // Mark submitted rows as having results
      setRows(prev => prev.map(row => {
        if (results.some(r => r.order_item === row.itemId)) {
          return { ...row, hasExistingResult: true };
        }
        return row;
      }));
      onResultAdded?.();
      // If all done, call onComplete
      const allDone = rows.every(r => r.hasExistingResult || results.some(res => res.order_item === r.itemId));
      if (allDone) {
        onComplete?.();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save results';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            Results Entry Grid
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {filledRows.length}/{pendingRows.length} filled
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {criticalCount} critical
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={batchMutation.isPending}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {/* Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pl-4 sm:pl-0 font-medium text-muted-foreground w-[30%]">Test</th>
                <th className="pb-2 font-medium text-muted-foreground w-[20%]">Value</th>
                <th className="pb-2 font-medium text-muted-foreground w-[12%]">Unit</th>
                <th className="pb-2 font-medium text-muted-foreground w-[20%]">Ref Range</th>
                <th className="pb-2 font-medium text-muted-foreground w-[18%] pr-4 sm:pr-0">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.itemId}
                  className={cn(
                    'border-b last:border-0',
                    row.isCritical && 'bg-red-50 dark:bg-red-950/20',
                    row.hasExistingResult && 'opacity-60'
                  )}
                >
                  <td className="py-2 pl-4 sm:pl-0">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium text-xs sm:text-sm truncate block max-w-[180px]">
                            {row.testName}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{row.testCode}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="py-2 pr-2">
                    {row.hasExistingResult ? (
                      <span className="text-sm flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {row.value || '—'}
                      </span>
                    ) : (
                      <Input
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="number"
                        step="any"
                        value={row.value}
                        onChange={(e) => updateValue(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        placeholder="—"
                        className={cn(
                          'h-8 w-full text-sm',
                          row.isCritical && 'border-red-500 ring-1 ring-red-500'
                        )}
                        disabled={batchMutation.isPending}
                      />
                    )}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{row.unit}</td>
                  <td className="py-2 text-xs text-muted-foreground font-mono">
                    {row.referenceText || '—'}
                  </td>
                  <td className="py-2 pr-4 sm:pr-0">
                    {row.flag && (
                      <Badge className={cn('text-xs', FLAG_COLORS[row.flag] || '')}>
                        {row.flag.replace('_', ' ')}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Interpretation (optional, shared) */}
        <div className="mt-4 px-4 sm:px-0">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Interpretation / Comments (optional)
          </label>
          <Textarea
            value={interpretation}
            onChange={(e) => setInterpretation(e.target.value)}
            placeholder="Overall interpretation for this panel..."
            rows={2}
            className="text-sm"
            disabled={batchMutation.isPending}
          />
        </div>

        {/* Submit bar */}
        <div className="mt-4 flex items-center justify-between px-4 sm:px-0">
          <div className="text-xs text-muted-foreground">
            {pendingRows.length === 0 ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                All results recorded
              </span>
            ) : (
              <span>
                Tab/Enter to navigate • {pendingRows.length - filledRows.length} remaining
              </span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {batchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save All ({filledRows.length})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
