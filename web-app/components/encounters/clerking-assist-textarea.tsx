/**
 * Clerking Assist Textarea — AI-powered autocomplete for clinical text fields
 *
 * Wraps a standard Textarea with debounced AI autocomplete suggestions.
 * Suggestions appear as a dropdown below the textarea when the clinician
 * is typing and can be accepted with Tab/Enter or dismissed with Escape.
 *
 * Advisory only — clinician chooses whether to accept suggestions.
 *
 * Phase 5: Clerking Assist
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import { Loader2, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Textarea } from '@/components/ui/textarea';
import { useAIClerkingAutocomplete, useAIEnabled, useAISuggestionAudit } from '@/lib/hooks/use-ai';
import type { AIPatientContext, AIClerkingAutocompleteSuggestion } from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface ClerkingAssistTextareaProps
  extends Omit<React.ComponentProps<typeof Textarea>, 'onChange'> {
  /** Form field name (e.g., 'chief_complaint', 'assessment') */
  fieldName: string;
  /** Current value */
  value: string;
  /** Called when value changes (direct typing or suggestion accepted) */
  onChange: (value: string) => void;
  /** SOAP or SBAR note format */
  noteFormat?: 'soap' | 'sbar';
  /** Optional patient context for better suggestions */
  patientContext?: AIPatientContext;
  /** Debounce delay in ms (default: 600) */
  debounceMs?: number;
  /** Minimum text length before triggering autocomplete (default: 3) */
  minLength?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract the trailing fragment after the last sentence boundary.
 * TibaBot autocomplete works on partial words/phrases, not full paragraphs.
 * e.g. "Patient has fever. Risk for inf" → "Risk for inf"
 */
function extractTrailingFragment(text: string): string {
  // Split on sentence-ending punctuation or newlines
  const parts = text.split(/[.\n]+/);
  const last = parts[parts.length - 1]?.trim() ?? '';
  return last;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ClerkingAssistTextarea({
  fieldName,
  value,
  onChange,
  noteFormat = 'soap',
  patientContext,
  debounceMs = 600,
  minLength = 3,
  className,
  disabled,
  ...textareaProps
}: ClerkingAssistTextareaProps) {
  const isAIEnabled = useAIEnabled();
  const { mutate, data: result, isPending, reset } = useAIClerkingAutocomplete();
  const { mutate: auditSuggestionAction } = useAISuggestionAudit();
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Store latest props in refs so the debounce callback always reads fresh values
  // without needing them in any dependency array.
  const fieldNameRef = React.useRef(fieldName);
  fieldNameRef.current = fieldName;
  const noteFormatRef = React.useRef(noteFormat);
  noteFormatRef.current = noteFormat;
  const patientContextRef = React.useRef(patientContext);
  patientContextRef.current = patientContext;

  const suggestions = React.useMemo(() => result?.suggestions ?? [], [result]);

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced autocomplete — triggered from onChange, NOT from a useEffect on value.
  // This avoids React effect cleanup/setup overhead on every keystroke.
  const scheduleAutocomplete = React.useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const fragment = extractTrailingFragment(text);
      if (!isAIEnabled || disabled || fragment.length < minLength) {
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        mutate({
          text: fragment,
          field_name: fieldNameRef.current,
          note_format: noteFormatRef.current,
          patient_context: patientContextRef.current,
        });
        setShowSuggestions(true);
        setSelectedIndex(0);
      }, debounceMs);
    },
    [isAIEnabled, disabled, minLength, debounceMs, mutate],
  );

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      scheduleAutocomplete(newValue);
    },
    [onChange, scheduleAutocomplete],
  );

  const acceptSuggestion = React.useCallback(
    (suggestion: AIClerkingAutocompleteSuggestion) => {
      // Replace only the trailing fragment with the accepted suggestion
      const fragment = extractTrailingFragment(value);
      const prefix = fragment.length < value.length
        ? value.slice(0, value.length - fragment.length)
        : '';
      const newValue = prefix + suggestion.text;
      onChange(newValue);
      auditSuggestionAction({
        suggestion_type: 'clerking_autocomplete',
        event_type: 'accepted',
        note_format: noteFormat,
        suggestions: [
          {
            field_name: fieldName,
            source: 'ai',
            confidence: suggestion.confidence,
            accepted_value: suggestion.text,
          },
        ],
      });
      setShowSuggestions(false);
      reset();
      textareaRef.current?.focus();
    },
    [auditSuggestionAction, fieldName, noteFormat, onChange, reset, value]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          acceptSuggestion(suggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [showSuggestions, suggestions, selectedIndex, acceptSuggestion]
  );

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => setShowSuggestions(false), 200);
        }}
        disabled={disabled}
        className={cn(isAIEnabled && 'pr-8', className)}
        {...textareaProps}
      />

      {/* AI indicator */}
      {isAIEnabled && (
        <div className="absolute top-2 right-2">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <BrainCircuit className="h-3.5 w-3.5 text-purple-400 opacity-50" />
          )}
        </div>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors',
                i === selectedIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptSuggestion(suggestion);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{suggestion.text}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
              {suggestion.category && (
                <span className="text-xs text-muted-foreground">{suggestion.category}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
