/**
 * Full-page AI Chat View
 *
 * Provides a full-width chat interface with session management sidebar.
 * Accessible via /ai or from the "Open full view" link in the floating widget.
 *
 * Features:
 * - Desktop: persistent session sidebar (md+)
 * - Mobile: bottom sheet for session management (< md)
 * - "Minimize to widget" button to pop back to the previous page with widget
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  MessageSquare,
  Plus,
  Loader2,
  PanelRightClose,
  List,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { AIChatPanel } from '@/components/shared/ai-chat-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils/cn';
import { useAIChatContext } from '@/lib/context/ai-chat-context';
import {
  useAIClinicalChat,
  useAIClinicalAssist,
  useAIChatSessions,
  useAIChatSession,
  useDeleteAIChatSession,
} from '@/lib/hooks/use-ai';
import type { AIChatMessage, AIChatSession } from '@/lib/types/ai';

// =============================================================================
// Session List (shared between sidebar & bottom sheet)
// =============================================================================

interface SessionListProps {
  sessions: AIChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSelect: (session: AIChatSession) => void;
  onDelete: (sessionId: string) => void;
  onNewSession: () => void;
}

function SessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSelect,
  onDelete,
  onNewSession,
}: SessionListProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold">Sessions</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNewSession}
          title="New session"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && sessions.length === 0 && (
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
              onClick={() => onSelect(session)}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{session.title}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                title="Delete session"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function AIPage() {
  const router = useRouter();
  const {
    availability,
    activeSessionId,
    setActiveSessionId,
    addMessage,
    updateStreamingMessage,
    clearMessages,
    patientContext,
    encounterContext,
    openWidget,
    returnToUrl,
    setReturnToUrl,
  } = useAIChatContext();

  const { verbosity } = useAIChatContext();

  const chatMutation = useAIClinicalChat();
  const assistMutation = useAIClinicalAssist();
  const { data: sessionsData, isLoading: sessionsLoading } = useAIChatSessions();
  const { data: sessionDetail } = useAIChatSession(activeSessionId);
  const deleteSession = useDeleteAIChatSession();

  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);

  // Load messages when a session is selected and its detail is fetched
  useEffect(() => {
    if (sessionDetail?.messages && activeSessionId) {
      clearMessages();
      for (const msg of sessionDetail.messages) {
        addMessage(msg);
      }
    }
  }, [sessionDetail, activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

        updateStreamingMessage(assistantMsgId, response.message.content, true, response.model);
      } catch {
        updateStreamingMessage(
          assistantMsgId,
          "Sorry, I couldn't process your request. Please try again.",
          true,
        );
      }
    },
    [activeSessionId, addMessage, updateStreamingMessage, chatMutation, setActiveSessionId]
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
        verbosity,
      });

      updateStreamingMessage(assistantMsgId, response.response, true);
    } catch {
      updateStreamingMessage(
        assistantMsgId,
        "Sorry, I couldn't analyze this patient's data. Please try again.",
        true,
      );
    }
  }, [addMessage, updateStreamingMessage, assistMutation, patientContext, encounterContext]);

  // Session management
  const handleSelectSession = useCallback(
    (session: AIChatSession) => {
      setActiveSessionId(session.id);
      clearMessages();
      setSessionSheetOpen(false);
    },
    [setActiveSessionId, clearMessages]
  );

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    clearMessages();
    setSessionSheetOpen(false);
  }, [setActiveSessionId, clearMessages]);

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

  // Minimize to widget — navigate back and open the floating widget
  const handleMinimizeToWidget = useCallback(() => {
    const url = returnToUrl || '/dashboard';
    setReturnToUrl(null);
    openWidget();
    router.push(url);
  }, [returnToUrl, setReturnToUrl, openWidget, router]);

  const sessions = sessionsData?.sessions ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="AI Assistant"
        helpContent="Chat with TibaBot for clinical questions, differential diagnoses, ICD-10 lookups, and encounter-aware clinical analysis. All responses are advisory only."
        actions={
          <div className="flex items-center gap-2">
            {/* Mobile: open session sheet */}
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => setSessionSheetOpen(true)}
            >
              <List className="h-4 w-4 mr-1.5" />
              <span>Sessions</span>
            </Button>

            {/* Minimize to floating widget */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleMinimizeToWidget}
              title="Minimize to floating widget"
            >
              <PanelRightClose className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Minimize</span>
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* Desktop session sidebar (md+) */}
        <Card className="hidden md:flex flex-col w-64 shrink-0">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={sessionsLoading}
            onSelect={handleSelectSession}
            onDelete={handleDeleteSession}
            onNewSession={handleNewSession}
          />
        </Card>

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

      {/* Mobile session bottom sheet */}
      <Sheet open={sessionSheetOpen} onOpenChange={setSessionSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] flex flex-col p-0 rounded-t-2xl">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle>Chat Sessions</SheetTitle>
            <SheetDescription>
              Switch between conversations or start a new one.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 flex flex-col overflow-hidden">
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              isLoading={sessionsLoading}
              onSelect={handleSelectSession}
              onDelete={handleDeleteSession}
              onNewSession={handleNewSession}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
