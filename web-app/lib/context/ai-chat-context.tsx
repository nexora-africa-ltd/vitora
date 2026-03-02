/**
 * AI Chat Context Provider
 *
 * Global state for the TibaBot chat widget:
 * - Widget open/closed and display state
 * - Active session tracking
 * - Encounter context detection (for Clinical Assist mode)
 * - Unread message tracking
 * - TibaBot availability status
 *
 * Must be mounted inside <AuthGuard> in the dashboard layout.
 */
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAIStatus } from '@/lib/hooks/use-ai';
import type {
  AIChatMessage,
  AIWidgetState,
  TibaBotAvailability,
  AIPatientContext,
  AIEncounterContext,
} from '@/lib/types/ai';

// =============================================================================
// Types
// =============================================================================

export interface AIChatContextValue {
  /** Current widget display state */
  widgetState: AIWidgetState;
  /** Open/expand the widget */
  openWidget: () => void;
  /** Minimize the widget */
  minimizeWidget: () => void;
  /** Close (fully hide) the widget — same as minimize in this implementation */
  closeWidget: () => void;
  /** Toggle between minimized and expanded */
  toggleWidget: () => void;

  /** Active chat session ID (null = new session) */
  activeSessionId: string | null;
  /** Set the active session */
  setActiveSessionId: (id: string | null) => void;

  /** Current chat messages in-memory for the active session */
  messages: AIChatMessage[];
  /** Add a message to the current session */
  addMessage: (message: AIChatMessage) => void;
  /** Update a streaming message's content */
  updateStreamingMessage: (id: string, content: string, done?: boolean) => void;
  /** Clear messages (on session switch) */
  clearMessages: () => void;

  /** Number of unread messages/suggestions */
  unreadCount: number;
  /** Mark all as read */
  markAllRead: () => void;
  /** Increment unread count */
  incrementUnread: () => void;

  /** TibaBot service availability */
  availability: TibaBotAvailability;

  /** Patient context for Clinical Assist (set by encounter pages) */
  patientContext: AIPatientContext | null;
  /** Encounter context for Clinical Assist */
  encounterContext: AIEncounterContext | null;
  /** Set encounter-aware context (called by encounter pages) */
  setEncounterAwareContext: (
    patient: AIPatientContext | null,
    encounter: AIEncounterContext | null
  ) => void;
  /** Whether the widget is in encounter-aware mode */
  isEncounterAware: boolean;
}

// =============================================================================
// Context
// =============================================================================

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export interface AIChatProviderProps {
  children: ReactNode;
}

export function AIChatProvider({ children }: AIChatProviderProps) {
  // Widget state
  const [widgetState, setWidgetState] = useState<AIWidgetState>('minimized');

  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);

  // Unread tracking
  const [unreadCount, setUnreadCount] = useState(0);

  // Encounter-aware context
  const [patientContext, setPatientContext] = useState<AIPatientContext | null>(null);
  const [encounterContext, setEncounterContext] = useState<AIEncounterContext | null>(null);

  // TibaBot availability from status endpoint
  const { data: statusData, isLoading: statusLoading } = useAIStatus();

  const availability: TibaBotAvailability = useMemo(() => {
    if (statusLoading) return 'loading';
    if (statusData?.enabled && statusData?.service_available) return 'available';
    return 'unavailable';
  }, [statusData, statusLoading]);

  // Widget actions
  const openWidget = useCallback(() => {
    setWidgetState('expanded');
    setUnreadCount(0);
  }, []);

  const minimizeWidget = useCallback(() => {
    setWidgetState('minimized');
  }, []);

  const closeWidget = useCallback(() => {
    setWidgetState('minimized');
  }, []);

  const toggleWidget = useCallback(() => {
    setWidgetState((prev) => {
      if (prev === 'minimized') {
        setUnreadCount(0);
        return 'expanded';
      }
      return 'minimized';
    });
  }, []);

  // Message actions
  const addMessage = useCallback((message: AIChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateStreamingMessage = useCallback(
    (id: string, content: string, done?: boolean) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id ? { ...msg, content, isStreaming: done ? false : msg.isStreaming } : msg
        )
      );
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Unread actions
  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const incrementUnread = useCallback(() => {
    setUnreadCount((prev) => prev + 1);
  }, []);

  // Encounter context
  const setEncounterAwareContext = useCallback(
    (patient: AIPatientContext | null, encounter: AIEncounterContext | null) => {
      setPatientContext(patient);
      setEncounterContext(encounter);
    },
    []
  );

  const isEncounterAware = patientContext !== null || encounterContext !== null;

  const value = useMemo<AIChatContextValue>(
    () => ({
      widgetState,
      openWidget,
      minimizeWidget,
      closeWidget,
      toggleWidget,
      activeSessionId,
      setActiveSessionId,
      messages,
      addMessage,
      updateStreamingMessage,
      clearMessages,
      unreadCount,
      markAllRead,
      incrementUnread,
      availability,
      patientContext,
      encounterContext,
      setEncounterAwareContext,
      isEncounterAware,
    }),
    [
      widgetState,
      openWidget,
      minimizeWidget,
      closeWidget,
      toggleWidget,
      activeSessionId,
      messages,
      addMessage,
      updateStreamingMessage,
      clearMessages,
      unreadCount,
      markAllRead,
      incrementUnread,
      availability,
      patientContext,
      encounterContext,
      setEncounterAwareContext,
      isEncounterAware,
    ]
  );

  return <AIChatContext.Provider value={value}>{children}</AIChatContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Access the AI chat context. Throws if used outside AIChatProvider.
 */
export function useAIChatContext(): AIChatContextValue {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error('useAIChatContext must be used within an AIChatProvider');
  }
  return context;
}

/**
 * Optionally access the AI chat context. Returns undefined if not in provider.
 * Useful for components that may exist outside the dashboard layout.
 */
export function useOptionalAIChatContext(): AIChatContextValue | undefined {
  return useContext(AIChatContext);
}
