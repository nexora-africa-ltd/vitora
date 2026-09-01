'use client';

import {
  BrainCircuit,
  Loader2,
  AlertTriangle,
  Pencil,
  Eye,
  Trash2,
  Eraser,
  Printer,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DischargeSummarySection } from '@/lib/discharge/types';
import { formatAdvisoryText } from '@/lib/discharge/utils';

interface SectionCardProps {
  section: DischargeSummarySection;
  isEditing: boolean;
  isGenerating: boolean;
  isAIEnabled: boolean;
  isAIPending: boolean;
  hasActiveGeneration: boolean;
  onContentChange: (content: string) => void;
  onRename: (title: string) => void;
  onToggleEdit: () => void;
  onRemove: () => void;
  onClear: () => void;
  onGenerate: () => void;
  onTogglePrintable: () => void;
}

export function SectionCard({
  section,
  isEditing,
  isGenerating,
  isAIEnabled,
  isAIPending,
  hasActiveGeneration,
  onContentChange,
  onRename,
  onToggleEdit,
  onRemove,
  onClear,
  onGenerate,
  onTogglePrintable,
}: SectionCardProps) {
  const hasContent = !!section.content.trim();
  const isPrintable = section.printable !== false;
  const hasCritical = section.advisories?.some((a) => a.severity === 'critical');
  const hasAdvisories = (section.advisories?.length ?? 0) > 0;
  const borderColor = hasCritical
    ? 'border-red-400 dark:border-red-500'
    : hasAdvisories
      ? 'border-amber-400 dark:border-amber-500'
      : '';

  return (
    <div className={`rounded-lg border bg-card ${borderColor} ${!isPrintable ? 'opacity-60' : ''}`}>
      <div className="flex flex-col gap-1.5 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            value={section.title}
            onChange={(e) => onRename(e.target.value)}
            className="-mx-1 w-full min-w-0 rounded border-none bg-transparent px-1 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
            placeholder="Section title"
          />
          {section.source === 'ai' && section.provenance && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              {section.provenance === 'from_input'
                ? 'From input'
                : section.provenance === 'llm_generated'
                  ? 'AI generated'
                  : section.provenance === 'llm_suggested'
                    ? 'AI suggested'
                    : section.provenance === 'guideline_rag'
                      ? 'Guideline'
                      : section.provenance === 'not_documented'
                        ? 'Not documented'
                        : section.provenance === 'skeleton'
                          ? 'Template'
                          : section.provenance}
            </Badge>
          )}
          {hasAdvisories && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`shrink-0 cursor-default px-1.5 py-0 text-[10px] ${
                      hasCritical
                        ? 'border-red-400 text-red-700 dark:text-red-400'
                        : 'border-amber-400 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                    {section.advisories!.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {section.advisories!.length} AI{' '}
                  {section.advisories!.length === 1 ? 'advisory' : 'advisories'} — review flagged
                  items below
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isAIEnabled && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onGenerate}
                    disabled={isGenerating || (isAIPending && !hasActiveGeneration)}
                    className="h-7 w-7 p-0 text-purple-500 hover:text-purple-600"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generate this section with TibaBot</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onTogglePrintable}
                  className={`active:scale-135 h-7 w-7 shrink-0 p-0 transition-transform ${isPrintable ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}
                >
                  {isPrintable ? (
                    <Printer className="h-4 w-4" />
                  ) : (
                    <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
                      <Printer className="h-3.5 w-3.5 opacity-50" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="block h-5 w-[1px] rotate-45 bg-current" />
                      </span>
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPrintable ? 'Exclude from print' : 'Include in print'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onToggleEdit}
                  className="h-7 w-7 shrink-0 p-0"
                >
                  {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isEditing ? 'Preview' : 'Edit'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {hasContent && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-amber-600"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear content</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove section</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="p-3">
        {isGenerating ? (
          <div className="animate-pulse space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : isEditing ? (
          <Textarea
            value={section.content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder={`Write ${section.title.toLowerCase()} content...`}
          />
        ) : hasContent ? (
          <div className="tibabot-markdown prose prose-sm dark:prose-invert max-w-none overflow-hidden break-words">
            <Markdown remarkPlugins={[remarkGfm]}>{section.content}</Markdown>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No content — click edit to write or generate with TibaBot.
          </p>
        )}
      </div>
      {/* Advisory banners */}
      {section.advisories && section.advisories.length > 0 && !isEditing && (
        <div className="space-y-1.5 border-t px-3 pb-3 pt-2">
          {section.advisories.map((adv, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                adv.severity === 'critical'
                  ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  adv.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                }`}
              />
              <span>{formatAdvisoryText(adv.text)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
