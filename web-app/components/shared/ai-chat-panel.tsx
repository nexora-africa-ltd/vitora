/**
 * AI Chat Panel
 *
 * Shared chat UI used by both the floating widget (expanded state) and the
 * full-page `/ai` view. Contains:
 * - Message list with auto-scroll
 * - Message input with send button
 * - Clinical Assist "Ask about this patient" button (encounter-aware mode)
 * - Session management (new session, switch sessions)
 * - Streaming message support
 *
 * This component is presentation-focused. State lives in AIChatContext.
 */
'use client';

import React, { useCallback, useRef, useState, useEffect, useMemo, type PointerEvent as RPointerEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Plus,
  Trash2,
  Stethoscope,
  ExternalLink,
  Loader2,
  Gauge,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';
import { useAIChatContext } from '@/lib/context/ai-chat-context';
import { useAIFeedback } from '@/lib/hooks/use-ai';
import { TibaBotStatusIndicator } from './tibabot-status-indicator';
import { assessContextSufficiency, mergeContextWithEnrichment } from '@/lib/utils/ai-context-sufficiency';
import { AIContextEnrichmentForm } from './ai-context-enrichment';
import type { AIChatMessage, AIVerbosity, AIFeedbackDirection, AIQuickAction } from '@/lib/types/ai';
import { AI_VERBOSITY_OPTIONS } from '@/lib/types/ai';

// =============================================================================
// Types
// =============================================================================

export interface AIChatPanelProps {
  /** Additional className */
  className?: string;
  /** Whether to show the panel header (hidden in full-page view which has its own) */
  showHeader?: boolean;
  /** Called when user clicks "Open full view" link */
  onOpenFullView?: () => void;
  /** Called when the panel should be closed/minimized */
  onClose?: () => void;
  /** Called when user sends a message */
  onSendMessage: (message: string) => void;
  /** Called when user clicks "Ask about this patient" */
  onAskAboutPatient?: () => void;
  /** Called when user clicks a quick action button */
  onQuickAction?: (action: AIQuickAction) => void;
  /** Whether a message is currently being sent/streamed */
  isSending?: boolean;
  /** Pointer events forwarded to the header for pull-down-to-dismiss (mobile) */
  headerDragHandlers?: {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => void;
  };
}

// =============================================================================
// Message Bubble
// =============================================================================

interface MessageBubbleProps {
  message: AIChatMessage;
  /** Current feedback state for this message (null = not rated) */
  feedbackGiven?: AIFeedbackDirection | null;
  /** Called when user clicks thumbs up or down */
  onFeedback?: (direction: AIFeedbackDirection) => void;
}

function MessageBubble({ message, feedbackGiven, onFeedback }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';
  const showFeedback = isAssistant && !message.isStreaming && onFeedback;

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className="max-w-[85%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed overflow-hidden',
            isUser && 'bg-primary text-primary-foreground rounded-br-md',
            !isUser && !isSystem && 'bg-muted text-foreground rounded-bl-md',
            isSystem && 'bg-muted/50 text-muted-foreground text-xs italic text-center w-full'
          )}
        >
          {/* Streaming indicator */}
          {message.isStreaming && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
          {isUser ? (
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          ) : (
            <div className="tibabot-markdown break-words overflow-hidden">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {children}
                    </a>
                  ),
                  pre: ({ children, ...props }) => (
                    <pre
                      {...props}
                      className="overflow-x-auto rounded bg-black/10 p-2 text-xs my-1"
                    >
                      {children}
                    </pre>
                  ),
                  code: ({ children, className: codeClassName, ...props }) => {
                    const isInline = !codeClassName;
                    return isInline ? (
                      <code
                        {...props}
                        className="rounded bg-black/10 px-1 py-0.5 text-xs"
                      >
                        {children}
                      </code>
                    ) : (
                      <code {...props} className={codeClassName}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </Markdown>
            </div>
          )}
        </div>

        {/* Feedback buttons — only on assistant messages that are done streaming */}
        {showFeedback && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            <button
              type="button"
              onClick={() => onFeedback('up')}
              disabled={feedbackGiven != null}
              className={cn(
                'p-1 rounded transition-colors',
                feedbackGiven === 'up'
                  ? 'text-green-600 dark:text-green-400'
                  : feedbackGiven != null
                    ? 'text-muted-foreground/30 cursor-default'
                    : 'text-muted-foreground hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/20'
              )}
              title={feedbackGiven === 'up' ? 'You rated this helpful' : 'Helpful'}
            >
              <ThumbsUp className={cn('h-3 w-3', feedbackGiven === 'up' && 'fill-current')} />
            </button>
            <button
              type="button"
              onClick={() => onFeedback('down')}
              disabled={feedbackGiven != null}
              className={cn(
                'p-1 rounded transition-colors',
                feedbackGiven === 'down'
                  ? 'text-red-600 dark:text-red-400'
                  : feedbackGiven != null
                    ? 'text-muted-foreground/30 cursor-default'
                    : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
              )}
              title={feedbackGiven === 'down' ? 'You rated this unhelpful' : 'Not helpful'}
            >
              <ThumbsDown className={cn('h-3 w-3', feedbackGiven === 'down' && 'fill-current')} />
            </button>
            {feedbackGiven && (
              <span className="text-[10px] text-muted-foreground ml-1">
                Thanks for the feedback
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AIChatPanel({
  className,
  showHeader = true,
  onOpenFullView,
  onClose,
  onSendMessage,
  onAskAboutPatient,
  onQuickAction,
  isSending = false,
  headerDragHandlers,
}: AIChatPanelProps) {
  const {
    messages,
    availability,
    unreadCount,
    isEncounterAware,
    activeSessionId,
    setActiveSessionId,
    clearMessages,
    verbosity,
    setVerbosity,
    quickActions,
    patientContext,
    encounterContext,
    contextEnrichment,
    setContextEnrichment,
  } = useAIChatContext();

  const [inputValue, setInputValue] = useState('');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, AIFeedbackDirection>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const feedbackMutation = useAIFeedback();

  // Merge base context with user-provided enrichment, then assess sufficiency
  const { mergedPatient, mergedEncounter } = useMemo(
    () => mergeContextWithEnrichment(patientContext, encounterContext, contextEnrichment),
    [patientContext, encounterContext, contextEnrichment]
  );

  const contextSufficiency = useMemo(
    () => assessContextSufficiency(mergedPatient, mergedEncounter),
    [mergedPatient, mergedEncounter]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle send
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) return;
    onSendMessage(trimmed);
    setInputValue('');
  }, [inputValue, isSending, onSendMessage]);

  // Handle Enter to send (Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // New session
  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    clearMessages();
    setFeedbackMap({});
    inputRef.current?.focus();
  }, [setActiveSessionId, clearMessages]);

  // Handle feedback on a message
  const handleFeedback = useCallback(
    (msg: AIChatMessage, direction: AIFeedbackDirection) => {
      // Find the preceding user message to include as user_query
      const msgIndex = messages.findIndex((m) => m.id === msg.id);
      const userMsg = msgIndex > 0
        ? messages.slice(0, msgIndex).reverse().find((m) => m.role === 'user')
        : undefined;

      setFeedbackMap((prev) => ({ ...prev, [msg.id]: direction }));
      feedbackMutation.mutate({
        message_id: msg.id,
        conversation_id: activeSessionId ?? undefined,
        feedback: direction,
        user_query: userMsg?.content,
        bot_response: msg.content.slice(0, 500),
      });
    },
    [messages, activeSessionId, feedbackMutation]
  );

  const isAvailable = availability === 'available' || availability === 'degraded';

  const headerSubtitle = (() => {
    if (availability === 'loading') return 'Connecting...';
    if (availability === 'degraded') return 'Basic Mode';
    if (availability === 'available') return 'Clinical Assistant';
    return 'Unavailable';
  })();

  return (
    <div className={cn('relative flex flex-col h-full', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
      {/* Header */}
      {showHeader && (
        <>
          <div
            className="flex items-center justify-between px-4 py-3 md:cursor-default touch-none select-none"
            {...(headerDragHandlers ?? {})}
          >
            <div className="flex items-center gap-2.5">
              <TibaBotStatusIndicator
                availability={availability}
                unreadCount={unreadCount}
                size={20}
                showHalo={false}
              />
              <div>
                <h3 className="text-sm font-semibold leading-tight">TibaBot</h3>
                <p className="text-xs text-muted-foreground">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* New session */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleNewSession}
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>

              {/* Open full view */}
              {onOpenFullView && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onOpenFullView}
                  title="Open full view"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {/* Close */}
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onClose}
                  title="Minimize"
                >
                  <span className="text-lg leading-none">−</span>
                </Button>
              )}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TibaBotStatusIndicator
                availability={availability}
                size={40}
                showHalo
                className="mb-4"
              />
              <p className="text-sm font-medium text-foreground">
                {isAvailable ? 'How can I help?' : 'TibaBot is currently unavailable'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
                {isAvailable
                  ? 'Ask clinical questions, get differential diagnoses, or look up ICD-10 codes.'
                  : 'The AI service is unreachable. Try again later.'}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              feedbackGiven={feedbackMap[msg.id] ?? null}
              onFeedback={(dir) => handleFeedback(msg, dir)}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <Separator />

      {/* Clinical Assist CTA (encounter-aware) + context indicator */}
      {isEncounterAware && isAvailable && (
        <>
          <div className="px-3 pt-2 pb-1.5 space-y-1.5">
            {/* Context sufficiency indicator */}
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
                contextSufficiency.level === 'sufficient' && 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400',
                contextSufficiency.level === 'partial' && 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
                contextSufficiency.level === 'insufficient' && 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
              )}
            >
              {contextSufficiency.level === 'sufficient' && (
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              {contextSufficiency.level === 'partial' && (
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              {contextSufficiency.level === 'insufficient' && (
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="font-medium">
                  {contextSufficiency.level === 'sufficient' && 'Good context'}
                  {contextSufficiency.level === 'partial' && 'Limited context'}
                  {contextSufficiency.level === 'insufficient' && 'Missing data'}
                </span>
                {' — '}
                {contextSufficiency.presentFields.length > 0
                  ? contextSufficiency.presentFields.join(', ')
                  : 'no clinical data entered yet'}
              </div>
            </div>

            {/* Ask about patient button */}
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors w-full text-left rounded-lg"
              onClick={onAskAboutPatient}
              disabled={isSending}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              Ask about this patient
            </button>
          </div>

          {/* Inline enrichment form for missing fields */}
          <AIContextEnrichmentForm
            sufficiency={contextSufficiency}
            currentEnrichment={contextEnrichment}
            onEnrich={setContextEnrichment}
          />

          <Separator />
        </>
      )}

      {/* Quick Actions (context-sensitive) */}
      {quickActions.length > 0 && isAvailable && (
        <>
          <div className="flex flex-wrap gap-1.5 px-3 py-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-50"
                onClick={() => onQuickAction?.(action)}
                disabled={isSending}
              >
                {action.label}
              </button>
            ))}
          </div>
          <Separator />
        </>
      )}

      {/* Input area */}
      <div className="p-3">
        {/* Verbosity selector */}
        <div className="flex items-center gap-1.5 mb-2">
          <Gauge className="h-3 w-3 text-muted-foreground shrink-0" />
          <div className="flex gap-0.5 flex-wrap">
            {(['concise', 'standard', 'educational'] as AIVerbosity[]).map((v) => {
              const opt = AI_VERBOSITY_OPTIONS.find((o) => o.value === v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVerbosity(v)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    verbosity === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                  title={opt?.description}
                >
                  {opt?.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAvailable
                ? 'Ask a clinical question...'
                : 'TibaBot is unavailable'
            }
            disabled={!isAvailable || isSending}
            className={cn(
              'flex-1 resize-none rounded-lg border bg-background px-3 py-2',
              'text-sm placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'min-h-[40px] max-h-[120px]'
            )}
            rows={1}
          />
          <Button
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={handleSend}
            disabled={!inputValue.trim() || !isAvailable || isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          Advisory only — always verify with clinical guidelines
        </p>
      </div>
    </div>
  );
}
