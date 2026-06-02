/**
 * ProactiveInsightCard — Dismissible insight card for proactive AI suggestions.
 *
 * Displays a single proactive insight with severity indicator, confidence badge,
 * source label, and dismiss action. Distinct from chat messages.
 *
 * Used in the encounter layout or the AI widget's insights section.
 */
'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Info,
  ShieldAlert,
  X,
  Cpu,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { ProactiveInsight } from '@/lib/types/ai';

// =============================================================================
// Severity styling
// =============================================================================

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    iconColor: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  warning: {
    icon: ShieldAlert,
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  info: {
    icon: Info,
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
};

const sourceConfig = {
  rules_engine: { icon: Cpu, label: 'Rules' },
  pattern_engine: { icon: Lightbulb, label: 'Pattern' },
  tibabot_llm: { icon: BrainCircuit, label: 'AI' },
};

// =============================================================================
// Component
// =============================================================================

interface ProactiveInsightCardProps {
  insight: ProactiveInsight;
  onDismiss: (id: string) => void;
  className?: string;
}

export function ProactiveInsightCard({
  insight,
  onDismiss,
  className,
}: ProactiveInsightCardProps) {
  const [isExiting, setIsExiting] = useState(false);
  const severity = severityConfig[insight.severity] || severityConfig.info;
  const source = sourceConfig[insight.source as keyof typeof sourceConfig] || sourceConfig.rules_engine;
  const SeverityIcon = severity.icon;
  const SourceIcon = source.icon;

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(insight.id), 200);
  };

  return (
    <div
      className={cn(
        'relative rounded-lg border p-3 transition-all duration-200',
        severity.border,
        severity.bg,
        isExiting && 'opacity-0 scale-95',
        className,
      )}
      role="alert"
      aria-label={`${insight.severity} insight: ${insight.title}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <SeverityIcon className={cn('h-4 w-4 mt-0.5 shrink-0', severity.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium leading-tight">
              {insight.title}
            </span>
            {/* Source badge */}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <SourceIcon className="h-2.5 w-2.5" />
              {source.label}
            </Badge>
            {/* Confidence badge (only for non-deterministic) */}
            {insight.confidence < 1.0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {Math.round(insight.confidence * 100)}%
              </Badge>
            )}
          </div>
          {/* Message */}
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {insight.message}
          </p>
        </div>
        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Dismiss insight"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Panel (renders a list of insight cards)
// =============================================================================

interface ProactiveInsightsPanelProps {
  insights: ProactiveInsight[];
  onDismiss: (id: string) => void;
  onDismissAll?: () => void;
  onGenerate?: () => void;
  isLoading?: boolean;
  error?: string | null;
  noInsightsFound?: boolean;
  className?: string;
}

export function ProactiveInsightsPanel({
  insights,
  onDismiss,
  onDismissAll,
  onGenerate,
  isLoading,
  error,
  noInsightsFound,
  className,
}: ProactiveInsightsPanelProps) {
  // Loading skeleton
  if (isLoading && insights.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          Analyzing encounter
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        </span>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-muted p-3 animate-pulse"
          >
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 rounded bg-muted mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state: no insights found after generation
  if (insights.length === 0 && !isLoading) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2.5 py-1.5">
            {error}
          </p>
        )}
        {noInsightsFound && !error && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2.5 py-1.5">
            No clinical insights found for this encounter context. Insights are generated based on vitals, complaints, diagnoses, and medications.
          </p>
        )}
        {onGenerate && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs w-fit"
            onClick={onGenerate}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {noInsightsFound ? 'Retry Insights' : 'Generate TibaBot Insights'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      {insights.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Clinical Insights
            {isLoading && (
              <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            )}
          </span>
          {insights.length > 1 && onDismissAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5 text-muted-foreground"
              onClick={onDismissAll}
            >
              Dismiss all
            </Button>
          )}
        </div>
      )}
      {/* Cards */}
      {insights.map((insight) => (
        <ProactiveInsightCard
          key={insight.id}
          insight={insight}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
