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

import React, { useCallback, useRef, useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Plus,
  Trash2,
  Stethoscope,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';
import { useAIChatContext } from '@/lib/context/ai-chat-context';
import { TibaBotStatusIndicator } from './tibabot-status-indicator';
import type { AIChatMessage } from '@/lib/types/ai';

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
  /** Whether a message is currently being sent/streamed */
  isSending?: boolean;
}

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({ message }: { message: AIChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed overflow-hidden',
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
                // Ensure links open in new tab and are styled
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
                // Prevent code blocks from overflowing
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
  isSending = false,
}: AIChatPanelProps) {
  const {
    messages,
    availability,
    unreadCount,
    isEncounterAware,
    activeSessionId,
    setActiveSessionId,
    clearMessages,
  } = useAIChatContext();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    inputRef.current?.focus();
  }, [setActiveSessionId, clearMessages]);

  const isAvailable = availability === 'available';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      {showHeader && (
        <>
          <div className="flex items-center justify-between px-4 py-3">
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
                  {availability === 'loading'
                    ? 'Connecting...'
                    : isAvailable
                      ? 'Clinical Assistant'
                      : 'Unavailable'}
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
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <Separator />

      {/* Clinical Assist CTA (encounter-aware) */}
      {isEncounterAware && isAvailable && (
        <>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors w-full text-left"
            onClick={onAskAboutPatient}
            disabled={isSending}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            Ask about this patient
          </button>
          <Separator />
        </>
      )}

      {/* Input area */}
      <div className="p-3">
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
