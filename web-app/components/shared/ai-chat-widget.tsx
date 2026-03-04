/**
 * AI Chat Widget
 *
 * Persistent floating widget for TibaBot clinical chat.
 * Appears in the bottom-right corner of all dashboard pages.
 *
 * States:
 * - **Minimized**: 56×56px floating button with status indicator
 * - **Expanded**: ~400px wide sidebar panel with chat UI
 *
 * Access control:
 * - Feature-gated by NEXT_PUBLIC_ENABLE_AI
 * - Permission-gated by ai.use_clinical_chat
 * - Hidden for non-clinical roles
 */
'use client';

import React, { useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAIChatContext } from '@/lib/context/ai-chat-context';
import { useAIEnabled } from '@/lib/hooks/use-ai';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { TibaBotStatusIndicator, TibaBotStatusStyles } from './tibabot-status-indicator';
import { AIChatPanel } from './ai-chat-panel';
import { useAIClinicalChat, useAIClinicalAssist } from '@/lib/hooks/use-ai';
import {
  assessContextSufficiency,
  buildContextGuidanceMessage,
  mergeContextWithEnrichment,
} from '@/lib/utils/ai-context-sufficiency';
import type { AIChatMessage, AIQuickAction } from '@/lib/types/ai';

// =============================================================================
// Component
// =============================================================================

export function AIChatWidget() {
  const aiEnabled = useAIEnabled();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  const {
    widgetState,
    toggleWidget,
    minimizeWidget,
    availability,
    unreadCount,
    activeSessionId,
    setActiveSessionId,
    addMessage,
    updateStreamingMessage,
    incrementUnread,
    patientContext,
    encounterContext,
    contextEnrichment,
    setReturnToUrl,
    pageContext,
  } = useAIChatContext();

  // Verbosity from context
  const { verbosity } = useAIChatContext();

  // Merge base context with user-provided enrichment
  const { mergedPatient, mergedEncounter } = useMemo(
    () => mergeContextWithEnrichment(patientContext, encounterContext, contextEnrichment),
    [patientContext, encounterContext, contextEnrichment]
  );

  // Chat mutation
  const chatMutation = useAIClinicalChat();
  const assistMutation = useAIClinicalAssist();

  // Permission check — only show for users with clinical chat permission
  const canUseChat = useMemo(
    () => hasPermission('ai.use_clinical_chat'),
    [hasPermission]
  );

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (message: string) => {
      // Add user message immediately
      const userMsg: AIChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);

      // Add placeholder assistant message
      const assistantMsgId = `assistant-${Date.now()}`;
      addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      });

      try {
        const response = await chatMutation.mutateAsync({
          message,
          session_id: activeSessionId ?? undefined,
          patient_context: mergedPatient ?? undefined,
          encounter_context: mergedEncounter ?? undefined,
          page_context: pageContext ?? undefined,
          verbosity,
        });

        // Set session ID if this is a new conversation
        if (!activeSessionId && response.session_id) {
          setActiveSessionId(response.session_id);
        }

        // Update placeholder with actual response
        updateStreamingMessage(assistantMsgId, response.message.content, true);
      } catch {
        // Update placeholder with error message
        updateStreamingMessage(
          assistantMsgId,
          'Sorry, I couldn\'t process your request. Please try again.',
          true,
        );
      }
    },
    [activeSessionId, addMessage, updateStreamingMessage, chatMutation, setActiveSessionId, mergedPatient, mergedEncounter, pageContext, verbosity]
  );

  // Handle "Ask about this patient"
  const handleAskAboutPatient = useCallback(async () => {
    // Check context sufficiency using merged context (base + enrichment)
    const sufficiency = assessContextSufficiency(mergedPatient, mergedEncounter);

    if (!sufficiency.canProceed) {
      // Insufficient context — show guidance instead of a hollow API call
      addMessage({
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: buildContextGuidanceMessage(sufficiency),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userMsg: AIChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: '🩺 Requesting clinical analysis for the current patient...',
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);

    // If partial context, prepend a brief note so the clinician knows
    if (sufficiency.level === 'partial') {
      addMessage({
        id: `system-ctx-${Date.now()}`,
        role: 'assistant',
        content: buildContextGuidanceMessage(sufficiency),
        timestamp: new Date().toISOString(),
      });
    }

    const assistantMsgId = `assistant-${Date.now()}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    });

    try {
      const response = await assistMutation.mutateAsync({
        query: 'Provide a differential diagnosis and recommended workup for this presentation.',
        patient_context: mergedPatient ?? undefined,
        encounter_context: mergedEncounter ?? undefined,
        page_context: pageContext ?? undefined,
        verbosity,
      });

      updateStreamingMessage(assistantMsgId, response.response, true);
    } catch {
      updateStreamingMessage(
        assistantMsgId,
        'Sorry, I couldn\'t analyze this patient\'s data. Please try again.',
        true,
      );
    }
  }, [addMessage, updateStreamingMessage, assistMutation, mergedPatient, mergedEncounter, pageContext, verbosity]);

  // Handle quick action click
  const handleQuickAction = useCallback(async (action: AIQuickAction) => {
    // Check context sufficiency using merged context (base + enrichment)
    const sufficiency = assessContextSufficiency(mergedPatient, mergedEncounter);

    if (!sufficiency.canProceed) {
      // Insufficient context — show guidance instead of a hollow API call
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: action.userMessage || action.label,
        timestamp: new Date().toISOString(),
      });
      addMessage({
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: buildContextGuidanceMessage(sufficiency),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userMsg: AIChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: action.userMessage || action.label,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);

    // If partial context, prepend a brief note so the clinician knows
    if (sufficiency.level === 'partial') {
      addMessage({
        id: `system-ctx-${Date.now()}`,
        role: 'assistant',
        content: buildContextGuidanceMessage(sufficiency),
        timestamp: new Date().toISOString(),
      });
    }

    const assistantMsgId = `assistant-${Date.now()}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    });

    try {
      const response = await assistMutation.mutateAsync({
        query: action.query,
        patient_context: mergedPatient ?? undefined,
        encounter_context: mergedEncounter ?? undefined,
        page_context: pageContext ?? undefined,
        verbosity,
      });

      updateStreamingMessage(assistantMsgId, response.response, true);
    } catch {
      updateStreamingMessage(
        assistantMsgId,
        'Sorry, I couldn\'t process that request. Please try again.',
        true,
      );
    }
  }, [addMessage, updateStreamingMessage, assistMutation, mergedPatient, mergedEncounter, pageContext, verbosity]);

  // Open full view — store current URL so user can pop back to widget later
  const handleOpenFullView = useCallback(() => {
    setReturnToUrl(pathname);
    minimizeWidget();
    router.push('/ai');
  }, [minimizeWidget, router, pathname, setReturnToUrl]);

  // Don't render if AI is disabled or user lacks permission
  // Also hide the widget entirely when already on the full-page /ai view
  const isOnAIPage = pathname?.startsWith('/ai');
  if (!aiEnabled || !canUseChat || isOnAIPage) return null;

  const isExpanded = widgetState === 'expanded';

  return (
    <>
      {/* Inject keyframe styles once */}
      <TibaBotStatusStyles />

      {/* Expanded panel */}
      {isExpanded && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 z-[59] bg-black/20 md:hidden"
            onClick={minimizeWidget}
            aria-hidden="true"
          />

          {/* Chat panel */}
          <div
            className={cn(
              'fixed z-[60] bg-background border rounded-2xl shadow-2xl',
              'flex flex-col overflow-hidden',
              // Mobile: nearly full screen
              'inset-x-3 bottom-3 top-16',
              // Desktop: fixed width bottom-right
              'md:inset-auto md:bottom-6 md:right-6 md:w-[400px] md:h-[600px] md:max-h-[80vh]'
            )}
            role="dialog"
            aria-label="TibaBot Clinical Assistant"
          >
            <AIChatPanel
              showHeader
              onClose={minimizeWidget}
              onOpenFullView={handleOpenFullView}
              onSendMessage={handleSendMessage}
              onAskAboutPatient={handleAskAboutPatient}
              onQuickAction={handleQuickAction}
              isSending={chatMutation.isPending || assistMutation.isPending}
            />
          </div>
        </>
      )}

      {/* Floating button (minimized state) */}
      {!isExpanded && (
        <button
          type="button"
          onClick={toggleWidget}
          className={cn(
            'fixed z-[58] bottom-6 right-6',
            'h-14 w-14 rounded-full',
            'bg-background border-2',
            'flex items-center justify-center',
            'shadow-lg hover:shadow-xl transition-shadow',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            availability === 'available' ? 'border-green-500/30' : 'border-red-500/30'
          )}
          aria-label={
            unreadCount > 0
              ? `Open TibaBot, ${unreadCount} unread`
              : 'Open TibaBot'
          }
        >
          <TibaBotStatusIndicator
            availability={availability}
            unreadCount={unreadCount}
            size={26}
            showHalo
          />
        </button>
      )}
    </>
  );
}
