'use client';

/**
 * CommentInput — textarea with submit button for creating comments/replies.
 * Features @mention autocomplete that shows matching users as you type.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { commentsApi } from '@/lib/api/comments';
import type { MentionSuggestion } from '@/lib/types/comments';

interface CommentInputProps {
  onSubmit: (body: string) => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function CommentInput({
  onSubmit,
  placeholder = 'Write a comment... Use @username to mention someone.',
  autoFocus = false,
  disabled = false,
}: CommentInputProps) {
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch mention suggestions when typing @ (fires even with empty string after @)
  const { data: suggestions = [] } = useQuery<MentionSuggestion[]>({
    queryKey: ['mention-suggestions', mentionQuery],
    queryFn: () => commentsApi.mentionSearch(mentionQuery ?? ''),
    enabled: mentionQuery !== null,
    staleTime: 10_000,
  });

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody('');
      setMentionQuery(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setBody(value);
    setCursorPosition(cursor);

    // Detect @mention trigger
    const textBeforeCursor = value.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch && mentionMatch[1] !== undefined) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback(
    (user: MentionSuggestion) => {
      const textBeforeCursor = body.slice(0, cursorPosition);
      const textAfterCursor = body.slice(cursorPosition);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        const beforeMention = textBeforeCursor.slice(0, mentionMatch.index);
        const newBody = `${beforeMention}@${user.username} ${textAfterCursor}`;
        setBody(newBody);
        setMentionQuery(null);
        // Focus back on textarea
        setTimeout(() => {
          if (textareaRef.current) {
            const newCursor = beforeMention.length + user.username.length + 2;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursor, newCursor);
          }
        }, 0);
      }
    },
    [body, cursorPosition]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle mention dropdown navigation
      if (mentionQuery !== null && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const selected = suggestions[mentionIndex];
          if (selected) insertMention(selected);
          return;
        }
        if (e.key === 'Escape') {
          setMentionQuery(null);
          return;
        }
      }

      // Ctrl+Enter to submit
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [mentionQuery, suggestions, mentionIndex, insertMention, handleSubmit]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate dropdown position relative to viewport (for portal rendering)
  useEffect(() => {
    if (mentionQuery !== null && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.top, left: rect.left });
    } else {
      setDropdownPos(null);
    }
  }, [mentionQuery]);

  return (
    <div className="relative">
      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled || isSubmitting}
          className="min-h-[60px] max-h-[120px] resize-none text-sm"
          rows={2}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!body.trim() || isSubmitting}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* @mention autocomplete dropdown (portaled to avoid overflow clipping in dialogs) */}
      {mentionQuery !== null && suggestions.length > 0 && dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            className="fixed w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-md shadow-md z-[100] -translate-y-full"
          >
            {suggestions.map((user, index) => (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors ${
                  index === mentionIndex ? 'bg-accent' : ''
                }`}
              >
                <span className="font-medium">@{user.username}</span>
                <span className="text-muted-foreground text-xs truncate">
                  {user.full_name}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
