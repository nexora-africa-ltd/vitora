/**
 * SmartSuggestion — Inline AI/CDS suggestion with Accept/Reject actions
 *
 * Displays a single AI or CDS suggestion adjacent to a form field.
 * The user must explicitly accept or reject the suggestion.
 *
 * Variants:
 * - inline: compact, next to a form field
 * - banner: full-width, for workflow suggestions (e.g., escalate priority)
 *
 * @module components/shared/smart-suggestion
 */
'use client';

import { useState } from 'react';
import { Check, X, Sparkles, ShieldAlert, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { SmartSuggestion as SmartSuggestionType } from '@/lib/hooks/use-smart-suggestions';

// =============================================================================
// Source Icons & Colors
// =============================================================================

const sourceConfig = {
  ai: {
    icon: Sparkles,
    label: 'AI',
    borderColor: 'border-purple-200 dark:border-purple-800',
    bgColor: 'bg-purple-50/50 dark:bg-purple-950/20',
    accentColor: 'text-purple-700 dark:text-purple-400',
    badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  cds: {
    icon: ShieldAlert,
    label: 'CDS',
    borderColor: 'border-amber-200 dark:border-amber-800',
    bgColor: 'bg-amber-50/50 dark:bg-amber-950/20',
    accentColor: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  history: {
    icon: History,
    label: 'History',
    borderColor: 'border-blue-200 dark:border-blue-800',
    bgColor: 'bg-blue-50/50 dark:bg-blue-950/20',
    accentColor: 'text-blue-700 dark:text-blue-400',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
} as const;

// =============================================================================
// Confidence Badge
// =============================================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const colorClass =
    confidence >= 0.85
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : confidence >= 0.6
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

  return (
    <Badge variant="secondary" className={cn('text-[10px] shrink-0 font-mono', colorClass)}>
      {pct}%
    </Badge>
  );
}

// =============================================================================
// SmartSuggestion Component
// =============================================================================

interface SmartSuggestionProps {
  suggestion: SmartSuggestionType;
  /** Called when user accepts — returns the value to apply */
  onAccept: (id: string) => void;
  /** Called when user rejects */
  onReject: (id: string) => void;
  /** Display variant */
  variant?: 'inline' | 'banner';
  /** Format the value for display */
  formatValue?: (value: unknown) => string;
  /** Disable interactions */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function SmartSuggestion({
  suggestion,
  onAccept,
  onReject,
  variant = 'inline',
  formatValue,
  disabled = false,
  className,
}: SmartSuggestionProps) {
  const [showReason, setShowReason] = useState(false);
  const config = sourceConfig[suggestion.source as keyof typeof sourceConfig] ?? sourceConfig.ai;
  const SourceIcon = config.icon;

  const displayValue = formatValue
    ? formatValue(suggestion.value)
    : typeof suggestion.value === 'string'
      ? suggestion.value
      : JSON.stringify(suggestion.value);

  // Truncate long values for inline variant
  const truncatedValue =
    variant === 'inline' && displayValue.length > 120
      ? `${displayValue.slice(0, 120)}…`
      : displayValue;

  if (suggestion.status !== 'pending') return null;

  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 rounded-lg border-2 p-3 transition-all',
          config.borderColor,
          config.bgColor,
          'animate-in slide-in-from-top-2 duration-300',
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <SourceIcon className={cn('h-4 w-4 mt-0.5 shrink-0', config.accentColor)} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={cn('text-[10px]', config.badgeBg)}>
                  {config.label}
                </Badge>
                <ConfidenceBadge confidence={suggestion.confidence} />
              </div>
              <p className="text-sm font-medium mt-1">{truncatedValue}</p>
              {suggestion.reason && (
                <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAccept(suggestion.id)}
              disabled={disabled}
              className="h-7 gap-1 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Accept</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onReject(suggestion.id)}
              disabled={disabled}
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dismiss</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant — compact, next to a form field
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-all',
        config.borderColor,
        config.bgColor,
        'animate-in slide-in-from-right-2 duration-200',
        className
      )}
    >
      <SourceIcon className={cn('h-3.5 w-3.5 shrink-0', config.accentColor)} />
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs truncate">{truncatedValue}</span>
        <ConfidenceBadge confidence={suggestion.confidence} />
      </div>
      {suggestion.reason && (
        <button
          type="button"
          onClick={() => setShowReason(!showReason)}
          className="text-muted-foreground hover:text-foreground"
        >
          {showReason ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
      <div className="flex gap-0.5 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAccept(suggestion.id)}
          disabled={disabled}
          className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReject(suggestion.id)}
          disabled={disabled}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {showReason && suggestion.reason && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md z-10">
          {suggestion.reason}
        </div>
      )}
    </div>
  );
}

export default SmartSuggestion;
