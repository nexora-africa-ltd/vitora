'use client';

import { useState } from 'react';
import { Pencil, Eye } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';

interface MarkdownPreviewProps {
  /** Current markdown content */
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
  /** Label shown above the preview (optional) */
  label?: string;
}

/**
 * Toggleable markdown preview / plain-text editor.
 *
 * When content is present and was AI-generated, renders the markdown with
 * the global `tibabot-markdown` styles. An edit button switches to a plain
 * Textarea for manual edits.
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

  // When new content arrives (e.g., AI generation) switch to preview
  // This is controlled by the parent setting `value` — the toggle is UI only

  if (isEditing || !hasContent) {
    return (
      <div className={cn('space-y-1', className)}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
        {hasContent && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="gap-1.5 text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
          </div>
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
        onClick={() => setIsEditing(true)}
        disabled={disabled}
        className="absolute top-2 right-2 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
    </div>
  );
}
