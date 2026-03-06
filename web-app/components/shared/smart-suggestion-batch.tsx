/**
 * SmartSuggestionBatch — Review and selectively apply multiple AI/CDS suggestions
 *
 * Used by the "AI Autopopulate" button on the encounter review step.
 * Shows a dialog with all suggested field values and per-field accept/reject toggles.
 *
 * @module components/shared/smart-suggestion-batch
 */
'use client';

import { useState, useMemo } from 'react';
import { Check, X, Sparkles, ShieldAlert, History, CheckCircle, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import type { SmartSuggestion } from '@/lib/hooks/use-smart-suggestions';

// =============================================================================
// Helpers
// =============================================================================

const sourceIcons = {
  ai: Sparkles,
  cds: ShieldAlert,
  history: History,
} as const;

const sourceLabels = {
  ai: 'AI',
  cds: 'CDS Rule',
  history: 'Patient History',
} as const;

function formatFieldName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    // Handle structured values like { icd10_code, description }
    const obj = value as Record<string, unknown>;
    if (obj.description) return String(obj.description);
    if (obj.icd10_code) return `${obj.icd10_code} - ${obj.description || ''}`;
    return JSON.stringify(value, null, 2);
  }
  return String(value ?? '');
}

// =============================================================================
// Component
// =============================================================================

interface SmartSuggestionBatchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: SmartSuggestion[];
  /** Called with the list of accepted suggestions */
  onApply: (accepted: Array<{ id: string; field_name: string; value: unknown }>) => void;
  /** Optional title */
  title?: string;
}

export function SmartSuggestionBatch({
  open,
  onOpenChange,
  suggestions,
  onApply,
  title = 'AI Suggestions',
}: SmartSuggestionBatchProps) {
  const pendingSuggestions = useMemo(
    () => suggestions.filter((s) => s.status === 'pending'),
    [suggestions]
  );

  // Track which suggestions are toggled on (default: all pending)
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(pendingSuggestions.map((s) => s.id))
  );

  // Reset selection when dialog opens with new suggestions
  const [lastCount, setLastCount] = useState(pendingSuggestions.length);
  if (pendingSuggestions.length !== lastCount) {
    setLastCount(pendingSuggestions.length);
    setSelected(new Set(pendingSuggestions.map((s) => s.id)));
  }

  const selectedCount = selected.size;
  const totalCount = pendingSuggestions.length;

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCount === totalCount) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingSuggestions.map((s) => s.id)));
    }
  };

  const handleApply = () => {
    const accepted = pendingSuggestions
      .filter((s) => selected.has(s.id))
      .map((s) => ({ id: s.id, field_name: s.field_name, value: s.value }));
    onApply(accepted);
    onOpenChange(false);
  };

  if (pendingSuggestions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>
            Review AI and CDS suggestions below. Toggle off any you don&apos;t want to apply.
          </DialogDescription>
        </DialogHeader>

        {/* Select All Toggle */}
        <div className="flex items-center justify-between px-1 py-1 border-b">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedCount === totalCount ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedCount}/{totalCount} selected
          </span>
        </div>

        {/* Suggestion List */}
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2 pr-3">
            {pendingSuggestions.map((suggestion) => {
              const isSelected = selected.has(suggestion.id);
              const SourceIcon =
                sourceIcons[suggestion.source as keyof typeof sourceIcons] ?? Sparkles;
              const sourceLabel =
                sourceLabels[suggestion.source as keyof typeof sourceLabels] ?? 'AI';

              return (
                <div
                  key={suggestion.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    isSelected
                      ? 'border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20'
                      : 'border-muted bg-muted/20 opacity-60'
                  )}
                >
                  <Switch
                    checked={isSelected}
                    onCheckedChange={() => handleToggle(suggestion.id)}
                    className="mt-0.5"
                    aria-label={`Toggle ${suggestion.field_name}`}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {formatFieldName(suggestion.field_name)}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] gap-1"
                      >
                        <SourceIcon className="h-2.5 w-2.5" />
                        {sourceLabel}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] font-mono',
                          suggestion.confidence >= 0.85
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : suggestion.confidence >= 0.6
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        )}
                      >
                        {Math.round(suggestion.confidence * 100)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground line-clamp-3">
                      {formatDisplayValue(suggestion.value)}
                    </p>
                    {suggestion.reason && (
                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedCount === 0}
            className="w-full sm:w-auto gap-1.5"
          >
            <CheckCircle className="h-4 w-4" />
            Apply {selectedCount} {selectedCount === 1 ? 'Suggestion' : 'Suggestions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SmartSuggestionBatch;
