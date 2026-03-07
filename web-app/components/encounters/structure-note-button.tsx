/**
 * Structure Note Button — Convert free-text to SOAP/SBAR format
 *
 * A button component that sends free-text clinical notes to TibaBot
 * for structuring into SOAP or SBAR format. Returns named sections
 * that can be applied to encounter form fields.
 *
 * Advisory only — clinician reviews structured output before accepting.
 *
 * Phase 5: Clerking Assist
 * @see docs/clinical-features-api-guide.md
 */
'use client';

import * as React from 'react';
import { AlignLeft, Check, Loader2, BrainCircuit, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { useAIClerkingStructure, useAIEnabled } from '@/lib/hooks/use-ai';
import type { AIClerkingStructureResponse } from '@/lib/types/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface StructureNoteButtonProps {
  /** Free-text note to structure */
  freeText: string;
  /** Target format */
  noteFormat?: 'soap' | 'sbar';
  /** Called when user accepts the structured output */
  onAccept: (sections: Record<string, string>) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Minimum text length to enable (default: 20) */
  minLength?: number;
}

// =============================================================================
// SECTION LABELS
// =============================================================================

const SECTION_LABELS: Record<string, string> = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  situation: 'Situation',
  background: 'Background',
  recommendation: 'Recommendation',
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function StructureNoteButton({
  freeText,
  noteFormat = 'soap',
  onAccept,
  disabled,
  minLength = 20,
}: StructureNoteButtonProps) {
  const isAIEnabled = useAIEnabled();
  const { mutate, data: result, isPending, reset } = useAIClerkingStructure();
  const [showPreview, setShowPreview] = React.useState(false);

  if (!isAIEnabled) return null;

  const canStructure = freeText.length >= minLength;

  const handleStructure = () => {
    mutate(
      { free_text: freeText, note_format: noteFormat },
      {
        onSuccess: () => setShowPreview(true),
      },
    );
  };

  const handleAccept = () => {
    if (result?.structured_note) {
      onAccept(result.structured_note);
    }
    setShowPreview(false);
    reset();
  };

  const handleCancel = () => {
    setShowPreview(false);
    reset();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || isPending || !canStructure}
        onClick={handleStructure}
        className="gap-1.5 text-xs"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <AlignLeft className="h-3.5 w-3.5" />
        )}
        <span className="sm:hidden">Structure</span>
        <span className="hidden sm:inline">Structure to {noteFormat.toUpperCase()}</span>
        <BrainCircuit className="h-3 w-3 text-purple-400" />
      </Button>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Structured Note Preview</DialogTitle>
              <HelpPopover content="Review the AI-structured note. Accept to apply to the form fields, or cancel to discard." />
            </div>
            <DialogDescription className="sr-only">
              Preview of AI-structured clinical note
            </DialogDescription>
          </DialogHeader>

          {result?.structured_note && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {noteFormat.toUpperCase()}
                </Badge>
                {result.mode && result.mode !== 'tibabot' && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {result.mode}
                  </Badge>
                )}
              </div>

              {result.sections.map((section) => (
                <div key={section} className="space-y-1">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {SECTION_LABELS[section.toLowerCase()] ?? section}
                  </h4>
                  <div className="rounded-md p-2.5 bg-muted/50 text-sm whitespace-pre-wrap">
                    {result.structured_note[section] || '(empty)'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result?.error && (
            <p className="text-sm text-destructive">{result.error}</p>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleCancel} className="gap-1.5">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" onClick={handleAccept} disabled={!result?.structured_note} className="gap-1.5">
              <Check className="h-4 w-4" />
              Apply to Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
