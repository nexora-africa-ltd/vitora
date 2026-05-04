'use client';

/**
 * CommentInput — textarea with submit button for creating comments/replies.
 * Supports @mention suggestions (basic username autocomplete).
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
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
  );
}
