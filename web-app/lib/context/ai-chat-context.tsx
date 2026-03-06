/**
 * AI Chat Context Provider
 *
 * Global state for the TibaBot chat widget:
 * - Widget open/closed and display state
 * - Active session tracking
 * - Encounter context detection (for Clinical Assist mode)
 * - Unread message tracking
 * - TibaBot availability status
 * - Return-to-widget flow (full-page → pop back to widget)
 *
 * Must be mounted inside <AuthGuard> in the dashboard layout.
 */
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
  AIPageContext,
  AIVerbosity,
  AIQuickAction,
} from '@/lib/types/ai';
import type { AIContextEnrichment } from '@/lib/utils/ai-context-sufficiency';

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

  /** Page context — auto-populated from the current route */
  pageContext: AIPageContext | null;
  /** Set the current page context (called by the usePageContextForAI hook) */
  setPageContext: (ctx: AIPageContext | null) => void;

  /** Context-sensitive quick action buttons (set by page layouts) */
  quickActions: AIQuickAction[];
  /** Register quick actions for the current page (cleared on navigation) */
  setQuickActions: (actions: AIQuickAction[]) => void;

  /** User-provided context enrichment from the chat inline form */
  contextEnrichment: AIContextEnrichment | null;
  /** Update context enrichment (merged with base context for API calls) */
  setContextEnrichment: (data: AIContextEnrichment | null) => void;

  /** Current verbosity preference for AI responses */
  verbosity: AIVerbosity;
  /** Update verbosity preference */
  setVerbosity: (v: AIVerbosity) => void;

  /**
   * Store the URL to return to when minimizing from the full-page AI view.
   * Set when navigating from the widget to /ai, used to pop back.
   */
  returnToUrl: string | null;
  /** Save the current URL before navigating to /ai full page */
  setReturnToUrl: (url: string | null) => void;

  /**
   * Active panel action — set by the widget when a quick action with
   * `panelAction` is clicked. Phase 5 panels subscribe to this and
   * auto-trigger their mutation when it matches their ID.
   */
  activePanelAction: string | null;
  /** Signal a panel to activate (called from widget handler) */
  triggerPanelAction: (actionId: string) => void;
  /** Clear the active panel action (called by panel after triggering) */
  clearPanelAction: () => void;
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

  // Page context — auto-populated from the current route
  const [pageContext, setPageContextState] = useState<AIPageContext | null>(null);

  // Quick actions — context-sensitive buttons registered by page layouts
  const [quickActions, setQuickActionsState] = useState<AIQuickAction[]>([]);

  // Context enrichment — user-provided data from the chat inline form
  const [contextEnrichment, setContextEnrichmentState] = useState<AIContextEnrichment | null>(null);

  const setContextEnrichment = useCallback((data: AIContextEnrichment | null) => {
    setContextEnrichmentState(data);
  }, []);

  // Verbosity preference (persisted in-memory; resets to standard on reload)
  const [verbosity, setVerbosity] = useState<AIVerbosity>('standard');

  // Panel action — set by widget when a quick action has panelAction
  const [activePanelAction, setActivePanelAction] = useState<string | null>(null);

  const triggerPanelAction = useCallback((actionId: string) => {
    setActivePanelAction(actionId);
  }, []);

  const clearPanelAction = useCallback(() => {
    setActivePanelAction(null);
  }, []);

  // Return-to-widget flow: store URL before navigating to /ai
  const returnToUrlRef = useRef<string | null>(null);
  const [returnToUrl, setReturnToUrlState] = useState<string | null>(null);

  const setReturnToUrl = useCallback((url: string | null) => {
    returnToUrlRef.current = url;
    setReturnToUrlState(url);
  }, []);

  // TibaBot availability from status endpoint
  const { data: statusData, isLoading: statusLoading } = useAIStatus();

  const availability: TibaBotAvailability = useMemo(() => {
    if (statusLoading) return 'loading';
    if (statusData?.enabled && statusData?.service_available) {
      // demo_mode means TibaBot is running without an LLM (RAG-only / rule-based)
      if (statusData.demo_mode) return 'degraded';
      return 'available';
    }
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
      // Clear enrichment when the base context changes (e.g., navigation to
      // a different patient/encounter). The enrichment was specific to the
      // previous context.
      setContextEnrichmentState(null);
    },
    []
  );

  const isEncounterAware = patientContext !== null || encounterContext !== null;

  const setPageContext = useCallback((ctx: AIPageContext | null) => {
    setPageContextState(ctx);
  }, []);

  const setQuickActions = useCallback((actions: AIQuickAction[]) => {
    setQuickActionsState(actions);
  }, []);

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
      pageContext,
      setPageContext,
      contextEnrichment,
      setContextEnrichment,
      quickActions,
      setQuickActions,
      verbosity,
      setVerbosity,
      returnToUrl,
      setReturnToUrl,
      activePanelAction,
      triggerPanelAction,
      clearPanelAction,
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
      pageContext,
      setPageContext,
      contextEnrichment,
      setContextEnrichment,
      quickActions,
      setQuickActions,
      verbosity,
      setVerbosity,
      returnToUrl,
      setReturnToUrl,
      activePanelAction,
      triggerPanelAction,
      clearPanelAction,
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
