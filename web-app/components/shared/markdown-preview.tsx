'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Eye } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Markdown → plain-text conversion
// ---------------------------------------------------------------------------

/** Strip markdown syntax while preserving readable structure. */
function markdownToPlainText(md: string): string {
  return md
    // Remove heading markers but keep the text
    .replace(/^#{1,6}\s+/gm, '')
    // Bold / italic → just the text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Unordered list markers → dash
    .replace(/^[\t ]*[*+-]\s+/gm, '- ')
    // Ordered list markers → keep the number
    .replace(/^[\t ]*(\d+)\.\s+/gm, '$1. ')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Block quotes
    .replace(/^>\s?/gm, '')
    // Strip leftover HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface MarkdownPreviewProps {
  /** Current content (may be markdown or plain text) */
  value: string;
  /** Called when the user edits the plain text */
  onChange: (value: string) => void;
  /** Placeholder for the textarea in edit mode */
  placeholder?: string;
  /** Number of rows for the textarea */
  rows?: number;
  /** Whether to start in edit mode (default: false when value is non-empty, true when empty) */
  defaultEditing?: boolean;
  /** Additional className for the outer container */
  className?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
}

/**
 * Toggleable markdown preview / plain-text editor.
 *
 * - AI-generated content is rendered as markdown.
 * - Clicking "Edit" strips markdown to plain text so the user edits clean prose.
 * - Once edited, the content is treated as plain text (no markdown rendering).
 * - "Regenerate" in the parent restores the AI-generated markdown view.
 */
export function MarkdownPreview({
  value,
  onChange,
  placeholder,
  rows = 6,
  defaultEditing,
  className,
  disabled = false,
}: MarkdownPreviewProps) {
  const hasContent = value.trim().length > 0;
  const [isEditing, setIsEditing] = useState(defaultEditing ?? !hasContent);
  // Track whether the content is still raw AI markdown or user-edited plain text
  const [isMarkdown, setIsMarkdown] = useState(true);
  // Track whether the latest value change came from user typing (vs external/AI)
  const isUserEdit = useRef(false);

  // When the parent sets a new value externally (AI regeneration),
  // switch back to markdown preview mode.
  useEffect(() => {
    if (isUserEdit.current) {
      isUserEdit.current = false;
      return;
    }
    if (value && isEditing) {
      // External value change while editing → AI regenerated
      const looksLikeMarkdown = /^#{1,3}\s|^\*\*|\*\*$|^- |^\d+\.\s/m.test(value);
      if (looksLikeMarkdown) {
        setIsMarkdown(true);
        setIsEditing(false);
      }
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartEditing = useCallback(() => {
    if (isMarkdown && hasContent) {
      // Convert markdown → plain text for the editor
      const plain = markdownToPlainText(value);
      isUserEdit.current = true;
      onChange(plain);
      setIsMarkdown(false);
    }
    setIsEditing(true);
  }, [isMarkdown, hasContent, value, onChange]);

  if (isEditing || !hasContent) {
    return (
      <div className={cn('space-y-1', className)}>
        <Textarea
          value={value}
          onChange={(e) => {
            isUserEdit.current = true;
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
        {hasContent && !isMarkdown && (
          <p className="text-xs text-muted-foreground">
            Editing as plain text. Use Regenerate to restore formatted output.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('relative group', className)}>
      <div className="rounded-md border bg-muted/30 p-4 tibabot-markdown break-words overflow-hidden min-h-[80px]">
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
                <code {...props} className="rounded bg-black/10 px-1 py-0.5 text-xs">
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
          {value}
        </Markdown>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleStartEditing}
        disabled={disabled}
        className="absolute top-2 right-2 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
    </div>
  );
}
