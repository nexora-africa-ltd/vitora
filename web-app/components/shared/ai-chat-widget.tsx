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

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
// Drag Hook — draggable floating button position
// =============================================================================

interface Position {
  x: number;
  y: number;
}

const DRAG_STORAGE_KEY = 'tibabot-widget-position';

function readStoredPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(DRAG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Position;
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return { x: 0, y: 0 };
}

function useDraggable() {
  const [position, setPosition] = useState<Position>(readStoredPosition);
  const dragState = useRef<{
    isDragging: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Persist position to localStorage after each drag ends
  const persistPosition = useCallback((pos: Position) => {
    try { localStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(pos)); } catch { /* quota */ }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only primary button (left click / touch)
      if (e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      dragState.current = {
        isDragging: true,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (!ds?.isDragging) return;

    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;

    // Dead-zone: require 5px movement to start drag (distinguishes tap from drag)
    if (!ds.hasMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    ds.hasMoved = true;

    // Use negative deltas because we position via bottom/right
    const newX = ds.originX - dx;
    const newY = ds.originY - dy;

    // Clamp to viewport
    const maxX = window.innerWidth - 72; // 56px button + 16px margin
    const maxY = window.innerHeight - 72;
    setPosition({
      x: Math.max(-8, Math.min(newX, maxX)),
      y: Math.max(-8, Math.min(newY, maxY)),
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    const wasDrag = ds?.hasMoved ?? false;
    dragState.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Persist the final position if it was a real drag
    if (wasDrag) {
      setPosition((cur) => { persistPosition(cur); return cur; });
    }
    return wasDrag;
  }, [persistPosition]);

  return {
    position,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

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
    triggerPanelAction,
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
        updateStreamingMessage(assistantMsgId, response.message.content, true, response.model);
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
    // Panel actions: trigger the dedicated Phase 5 panel instead of chat
    if (action.panelAction) {
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: action.userMessage || action.label,
        timestamp: new Date().toISOString(),
      });
      addMessage({
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `✨ Opening **${action.label}** panel below. Scroll down to see the detailed assessment.`,
        timestamp: new Date().toISOString(),
      });
      triggerPanelAction(action.panelAction);
      minimizeWidget();
      return;
    }

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
  }, [addMessage, updateStreamingMessage, assistMutation, mergedPatient, mergedEncounter, pageContext, verbosity, triggerPanelAction, minimizeWidget]);

  // Open full view — store current URL so user can pop back to widget later
  const handleOpenFullView = useCallback(() => {
    setReturnToUrl(pathname);
    minimizeWidget();
    router.push('/ai');
  }, [minimizeWidget, router, pathname, setReturnToUrl]);

  // -----------------------------------------------------------------------
  // Pull-down-to-dismiss on the expanded panel (small screens only)
  // -----------------------------------------------------------------------
  const pullState = useRef<{
    active: boolean;
    startY: number;
    pointerId: number;
  } | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const DISMISS_THRESHOLD = 80; // px of downward drag to dismiss

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only on small screens (< md = 768px)
    if (window.innerWidth >= 768) return;
    // Only primary pointer
    if (e.button !== 0) return;
    // Ignore if the target is a button or inside a button (allow button clicks)
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    pullState.current = {
      active: true,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  }, []);

  const handleHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pullState.current;
    if (!ps?.active) return;

    const dy = e.clientY - ps.startY;
    // Only allow pulling downward (dy > 0), with rubber-band resistance
    if (dy > 0) {
      setPullOffset(dy);
    }
  }, []);

  const handleHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pullState.current;
    if (!ps?.active) return;

    e.currentTarget.releasePointerCapture(ps.pointerId);
    const dy = e.clientY - ps.startY;
    pullState.current = null;

    if (dy >= DISMISS_THRESHOLD) {
      // Dismiss — animate out then minimize
      setPullOffset(window.innerHeight);
      setTimeout(() => {
        minimizeWidget();
        setPullOffset(0);
      }, 200);
    } else {
      // Snap back
      setPullOffset(0);
    }
  }, [minimizeWidget]);

  const handleHeaderPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pullState.current) {
      e.currentTarget.releasePointerCapture(pullState.current.pointerId);
      pullState.current = null;
      setPullOffset(0);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Draggable floating button
  // -----------------------------------------------------------------------
  const {
    position: dragPosition,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useDraggable();

  // Ref to distinguish drag from click
  const wasDragRef = useRef(false);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      wasDragRef.current = handlePointerUp(e);
    },
    [handlePointerUp]
  );

  const onButtonClick = useCallback(() => {
    // If the pointer-up indicated a drag, swallow the click
    if (wasDragRef.current) {
      wasDragRef.current = false;
      return;
    }
    toggleWidget();
  }, [toggleWidget]);

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
            ref={panelRef}
            style={pullOffset > 0 ? {
              transform: `translateY(${pullOffset}px)`,
              transition: pullState.current?.active ? 'none' : 'transform 0.2s ease-out',
            } : undefined}
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
            {/* Pull-down handle — visible on small screens only */}
            <div
              className="md:hidden flex flex-col items-center pt-2 pb-0 cursor-grab active:cursor-grabbing touch-none select-none"
              onPointerDown={handleHeaderPointerDown}
              onPointerMove={handleHeaderPointerMove}
              onPointerUp={handleHeaderPointerUp}
              onPointerCancel={handleHeaderPointerCancel}
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <AIChatPanel
              showHeader
              onClose={minimizeWidget}
              onOpenFullView={handleOpenFullView}
              onSendMessage={handleSendMessage}
              onAskAboutPatient={handleAskAboutPatient}
              onQuickAction={handleQuickAction}
              isSending={chatMutation.isPending || assistMutation.isPending}
              headerDragHandlers={{
                onPointerDown: handleHeaderPointerDown,
                onPointerMove: handleHeaderPointerMove,
                onPointerUp: handleHeaderPointerUp,
                onPointerCancel: handleHeaderPointerCancel,
              }}
            />
          </div>
        </>
      )}

      {/* Floating button (minimized state) — draggable */}
      {!isExpanded && (
        <button
          type="button"
          onClick={onButtonClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={onPointerUp}
          style={{
            right: `${24 + dragPosition.x}px`,
            bottom: `${24 + dragPosition.y}px`,
          }}
          className={cn(
            'fixed z-[58]',
            'h-14 w-14 rounded-full',
            'bg-background border-2',
            'flex items-center justify-center',
            'shadow-lg hover:shadow-xl transition-shadow',
            'touch-none select-none cursor-grab active:cursor-grabbing',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            availability === 'available' ? 'border-green-500/30'
              : availability === 'degraded' ? 'border-amber-500/30'
              : 'border-red-500/30'
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
