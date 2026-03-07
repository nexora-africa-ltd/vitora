/**
 * AI Feedback Buttons — reusable thumbs up/down for any AI panel
 *
 * Sends service-typed feedback to TibaBot via the unified feedback API.
 * Includes service_type and metadata for quality analytics.
 */
'use client';

import * as React from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAIFeedback } from '@/lib/hooks/use-ai';
import type { AIFeedbackDirection } from '@/lib/types/ai';

export interface AIFeedbackButtonsProps {
  /** Unique ID for the response being rated */
  messageId: string;
  /** Which TibaBot service generated this (care_plan, lab_assist, etc.) */
  serviceType: string;
  /** Optional conversation/session ID */
  conversationId?: string;
  /** Summary of the user's input (for analytics) */
  userQuery?: string;
  /** Summary of the AI response (truncated, for analytics) */
  botResponse?: string;
  /** Service-specific metadata for quality analysis */
  metadata?: Record<string, unknown>;
}

export function AIFeedbackButtons({
  messageId,
  serviceType,
  conversationId,
  userQuery,
  botResponse,
  metadata,
}: AIFeedbackButtonsProps) {
  const { mutate } = useAIFeedback();
  const [given, setGiven] = React.useState<AIFeedbackDirection | null>(null);

  const handleFeedback = (direction: AIFeedbackDirection) => {
    if (given != null) return;
    setGiven(direction);
    mutate({
      message_id: messageId,
      feedback: direction,
      service_type: serviceType,
      conversation_id: conversationId,
      user_query: userQuery?.slice(0, 500),
      bot_response: botResponse?.slice(0, 500),
      metadata,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleFeedback('up')}
        disabled={given != null}
        className={cn(
          'p-1 rounded transition-colors',
          given === 'up'
            ? 'text-green-600 dark:text-green-400'
            : given != null
              ? 'text-muted-foreground/30 cursor-default'
              : 'text-muted-foreground hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/20'
        )}
        title={given === 'up' ? 'Rated helpful' : 'Helpful'}
      >
        <ThumbsUp className={cn('h-3.5 w-3.5', given === 'up' && 'fill-current')} />
      </button>
      <button
        type="button"
        onClick={() => handleFeedback('down')}
        disabled={given != null}
        className={cn(
          'p-1 rounded transition-colors',
          given === 'down'
            ? 'text-red-600 dark:text-red-400'
            : given != null
              ? 'text-muted-foreground/30 cursor-default'
              : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
        )}
        title={given === 'down' ? 'Rated unhelpful' : 'Not helpful'}
      >
        <ThumbsDown className={cn('h-3.5 w-3.5', given === 'down' && 'fill-current')} />
      </button>
      {given && (
        <span className="text-[10px] text-muted-foreground ml-1">
          Thanks!
        </span>
      )}
    </div>
  );
}
