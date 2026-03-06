/**
 * TibaBot Status Indicator
 *
 * A reusable component that displays the TibaBot AI assistant status
 * with animated icons and visual indicators:
 *
 * 1. **Available** — Green pulsing halo + `Bot` icon (LLM + RAG active)
 * 2. **Degraded** — Amber pulsing halo + `Bot` icon (RAG only, no LLM)
 * 3. **Unavailable** — Red pulsing halo + `BotOff` icon
 * 4. **Unread** — Green dot badge overlay
 *
 * Each state shows a hover tooltip explaining the current AI capability level.
 *
 * Used by:
 * - `AIChatWidget` (floating button in dashboard)
 * - Can be reused in nav items, headers, or status bars
 */
'use client';

import React from 'react';
import { Bot, BotMessageSquare, BotOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TibaBotAvailability } from '@/lib/types/ai';

// =============================================================================
// Types
// =============================================================================

export interface TibaBotStatusIndicatorProps {
  /** TibaBot service availability */
  availability: TibaBotAvailability;
  /** Number of unread messages/suggestions */
  unreadCount?: number;
  /** Icon size in pixels (default: 24) */
  size?: number;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether to show the pulsing halo animation (default: true) */
  showHalo?: boolean;
  /** Accessible label override */
  'aria-label'?: string;
}

// =============================================================================
// Halo animation styles
// =============================================================================

const haloStyles: Record<TibaBotAvailability, string> = {
  available: 'shadow-[0_0_12px_3px_rgba(34,197,94,0.4)]',
  degraded: 'shadow-[0_0_12px_3px_rgba(245,158,11,0.4)]',
  unavailable: 'shadow-[0_0_12px_3px_rgba(239,68,68,0.4)]',
  loading: 'shadow-[0_0_12px_3px_rgba(156,163,175,0.3)]',
};

const haloPulseStyles: Record<TibaBotAvailability, string> = {
  available: 'animate-[tibabot-pulse-green_2s_ease-in-out_infinite]',
  degraded: 'animate-[tibabot-pulse-amber_2s_ease-in-out_infinite]',
  unavailable: 'animate-[tibabot-pulse-red_2s_ease-in-out_infinite]',
  loading: 'animate-pulse',
};

const iconColorStyles: Record<TibaBotAvailability, string> = {
  available: 'text-green-500',
  degraded: 'text-amber-500',
  unavailable: 'text-red-500',
  loading: 'text-muted-foreground',
};

// =============================================================================
// Tooltip text per availability state
// =============================================================================

const tooltipText: Record<TibaBotAvailability, string> = {
  available: 'TibaBot is available — using advanced AI models for clinical assistance.',
  degraded:
    'TibaBot is using a less advanced implementation (rule-based / RAG only) due to AI model unavailability.',
  unavailable:
    'TibaBot is currently unavailable. Clinical AI features are offline.',
  loading: 'Checking TibaBot availability…',
};

// =============================================================================
// Component
// =============================================================================

export function TibaBotStatusIndicator({
  availability,
  unreadCount = 0,
  size = 24,
  className,
  showHalo = true,
  'aria-label': ariaLabel,
}: TibaBotStatusIndicatorProps) {
  const hasUnread = unreadCount > 0;

  // Determine which icon to render
  const IconComponent = (() => {
    if (availability === 'unavailable') return BotOff;
    if (hasUnread) return BotMessageSquare;
    return Bot;
  })();

  // Build accessibility label
  const defaultLabel = (() => {
    if (availability === 'loading') return 'TibaBot loading';
    if (availability === 'degraded') return 'TibaBot degraded mode';
    if (availability === 'unavailable' && hasUnread)
      return `TibaBot unavailable, ${unreadCount} unread`;
    if (availability === 'unavailable') return 'TibaBot unavailable';
    if (hasUnread) return `TibaBot available, ${unreadCount} unread`;
    return 'TibaBot available';
  })();

  const indicator = (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="status"
      aria-label={ariaLabel ?? defaultLabel}
    >
      {/* Pulsing halo ring */}
      {showHalo && (
        <span
          className={cn(
            'absolute inset-0 rounded-full',
            haloStyles[availability],
            haloPulseStyles[availability]
          )}
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <IconComponent
        size={size}
        className={cn('relative z-10', iconColorStyles[availability])}
        aria-hidden="true"
      />

      {/* Unread green dot badge */}
      {hasUnread && (
        <span
          className={cn(
            'absolute z-20 rounded-full bg-green-500 ring-2 ring-background',
            // Position at top-right
            '-top-0.5 -right-0.5',
            // Size scales with icon size
            size >= 24 ? 'h-3 w-3' : 'h-2.5 w-2.5'
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {indicator}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-center">
          <p>{tooltipText[availability]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// =============================================================================
// Global keyframe styles
// =============================================================================

/**
 * CSS keyframes for the pulsing halos.
 * Inject these into your global CSS or use the <TibaBotStatusStyles /> component.
 */
export const TIBABOT_KEYFRAMES = `
@keyframes tibabot-pulse-green {
  0%, 100% {
    box-shadow: 0 0 8px 2px rgba(34, 197, 94, 0.3);
  }
  50% {
    box-shadow: 0 0 16px 6px rgba(34, 197, 94, 0.5);
  }
}
@keyframes tibabot-pulse-amber {
  0%, 100% {
    box-shadow: 0 0 8px 2px rgba(245, 158, 11, 0.3);
  }
  50% {
    box-shadow: 0 0 16px 6px rgba(245, 158, 11, 0.5);
  }
}
@keyframes tibabot-pulse-red {
  0%, 100% {
    box-shadow: 0 0 8px 2px rgba(239, 68, 68, 0.3);
  }
  50% {
    box-shadow: 0 0 16px 6px rgba(239, 68, 68, 0.5);
  }
}
`;

/**
 * Component that injects the TibaBot keyframe styles into the page.
 * Mount once, typically in a layout.
 */
export function TibaBotStatusStyles() {
  return <style dangerouslySetInnerHTML={{ __html: TIBABOT_KEYFRAMES }} />;
}
