/**
 * Full-page AI Chat View
 *
 * Provides a full-width chat interface with session management sidebar.
 * Accessible via /ai or from the "Open full view" link in the floating widget.
 */
'use client';

import React, { useCallback, useState } from 'react';
import { Trash2, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { AIChatPanel } from '@/components/shared/ai-chat-panel';
import { TibaBotStatusIndicator } from '@/components/shared/tibabot-status-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';
import { useAIChatContext } from '@/lib/context/ai-chat-context';
import {
  useAIClinicalChat,
  useAIClinicalAssist,
  useAIChatSessions,
  useDeleteAIChatSession,
} from '@/lib/hooks/use-ai';
import type { AIChatMessage, AIChatSession } from '@/lib/types/ai';

export default function AIPage() {
  const {
    availability,
    unreadCount,
    activeSessionId,
    setActiveSessionId,
    addMessage,
    clearMessages,
    patientContext,
    encounterContext,
  } = useAIChatContext();

  const chatMutation = useAIClinicalChat();
  const assistMutation = useAIClinicalAssist();
  const { data: sessionsData, isLoading: sessionsLoading } = useAIChatSessions();
  const deleteSession = useDeleteAIChatSession();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Handle send message
  const handleSendMessage = useCallback(
    async (message: string) => {
      const userMsg: AIChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);

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
        });

        if (!activeSessionId && response.session_id) {
          setActiveSessionId(response.session_id);
        }

        addMessage({
          ...response.message,
          id: assistantMsgId,
          isStreaming: false,
        });
      } catch {
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: "Sorry, I couldn't process your request. Please try again.",
          timestamp: new Date().toISOString(),
          isStreaming: false,
        });
      }
    },
    [activeSessionId, addMessage, chatMutation, setActiveSessionId]
  );

  // Handle Clinical Assist
  const handleAskAboutPatient = useCallback(async () => {
    const userMsg: AIChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: '🩺 Requesting clinical analysis for the current patient...',
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);

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
        patient_context: patientContext ?? undefined,
        encounter_context: encounterContext ?? undefined,
        verbosity: 'standard',
      });

      addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
        isStreaming: false,
      });
    } catch {
      addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: "Sorry, I couldn't analyze this patient's data. Please try again.",
        timestamp: new Date().toISOString(),
        isStreaming: false,
      });
    }
  }, [addMessage, assistMutation, patientContext, encounterContext]);

  // Handle session switch
  const handleSelectSession = useCallback(
    (session: AIChatSession) => {
      setActiveSessionId(session.id);
      clearMessages();
      // Messages will be loaded by the session query
    },
    [setActiveSessionId, clearMessages]
  );

  // Handle new session
  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    clearMessages();
  }, [setActiveSessionId, clearMessages]);

  // Handle delete session
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      deleteSession.mutate(sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        clearMessages();
      }
    },
    [deleteSession, activeSessionId, setActiveSessionId, clearMessages]
  );

  const sessions = sessionsData?.sessions ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="AI Assistant"
        helpContent="Chat with TibaBot for clinical questions, differential diagnoses, ICD-10 lookups, and encounter-aware clinical analysis. All responses are advisory only."
      />

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* Session sidebar */}
        {sidebarOpen && (
          <Card className="hidden md:flex flex-col w-64 shrink-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-semibold">Sessions</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNewSession}
                title="New session"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {sessionsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!sessionsLoading && sessions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No sessions yet
                  </p>
                )}

                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                      activeSessionId === session.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                    onClick={() => handleSelectSession(session)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{session.title}</span>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* Chat area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <AIChatPanel
            showHeader={false}
            onSendMessage={handleSendMessage}
            onAskAboutPatient={handleAskAboutPatient}
            isSending={chatMutation.isPending || assistMutation.isPending}
          />
        </Card>
      </div>
    </div>
  );
}
