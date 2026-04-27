'use client';

import { Check, X, Minus, ShoppingCart, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AIAdvisoryOrderLink, AIAdvisoryOrderLinkActionRequest } from '@/lib/types/ai';

interface SuggestionActionChipProps {
  /** The advisory link for this suggestion (undefined if not seeded yet). */
  link: AIAdvisoryOrderLink | undefined;
  /** Callback to action the link. */
  onAction: (linkId: number, data: AIAdvisoryOrderLinkActionRequest) => Promise<AIAdvisoryOrderLink | null>;
  /** Whether this category is orderable (medications, investigations). */
  orderable?: boolean;
  /** Callback when user wants to create an order for this suggestion. */
  onCreateOrder?: (link: AIAdvisoryOrderLink) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SUGGESTED: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'Pending' },
  ORDERED: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'Ordered' },
  DECLINED: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', label: 'Declined' },
  NOT_APPLICABLE: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'N/A' },
};

const STATUS_ICONS: Record<string, typeof Check> = {
  ORDERED: Check,
  DECLINED: X,
  NOT_APPLICABLE: Minus,
};

/**
 * Inline action chip for a single AI advisory suggestion.
 *
 * Shows current status badge + action buttons (Order / Decline / N/A).
 * When status is SUGGESTED, shows action buttons. Otherwise shows the status badge.
 */
export function SuggestionActionChip({
  link,
  onAction,
  orderable = false,
  onCreateOrder,
}: SuggestionActionChipProps) {
  const [acting, setActing] = useState(false);

  if (!link) return null;

  const defaultStyle = { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'Pending' };
  const style = STATUS_STYLES[link.status] ?? defaultStyle;
  const Icon = STATUS_ICONS[link.status] as typeof Check | undefined;

  // Already actioned — show status badge
  if (link.status !== 'SUGGESTED') {
    return (
      <Badge variant="secondary" className={`ml-auto shrink-0 gap-1 text-[10px] ${style.bg} ${style.text}`}>
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {style.label}
        {link.order_number ? ` • ${link.order_number}` : ''}
      </Badge>
    );
  }

  // SUGGESTED — show action buttons
  const handleAction = async (status: 'DECLINED' | 'NOT_APPLICABLE') => {
    setActing(true);
    await onAction(link.id, { status });
    setActing(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {orderable && onCreateOrder ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                disabled={acting}
                onClick={() => onCreateOrder(link)}
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Create order</p></TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-600 hover:bg-red-500/10 dark:text-red-400"
              disabled={acting}
              onClick={() => void handleAction('DECLINED')}
            >
              {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Decline</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:bg-muted"
              disabled={acting}
              onClick={() => void handleAction('NOT_APPLICABLE')}
            >
              {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Not applicable</p></TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}
