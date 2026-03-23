'use client';

import { BrainCircuit, Loader2, AlertTriangle, Pencil, Eye, Trash2 } from 'lucide-react';
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
  onGenerate: () => void;
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
  onGenerate,
}: SectionCardProps) {
  const hasContent = !!section.content.trim();
  const hasCritical = section.advisories?.some((a) => a.severity === 'critical');
  const hasAdvisories = (section.advisories?.length ?? 0) > 0;
  const borderColor = hasCritical
    ? 'border-red-400 dark:border-red-500'
    : hasAdvisories
      ? 'border-amber-400 dark:border-amber-500'
      : '';

  return (
    <div className={`rounded-lg border bg-card ${borderColor}`}>
      <div className="flex items-center justify-between border-b px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            value={section.title}
            onChange={(e) => onRename(e.target.value)}
            className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded px-1 -mx-1 w-full min-w-0"
            placeholder="Section title"
          />
          {section.source === 'ai' && section.provenance && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
              {section.provenance === 'from_input' ? 'From input'
                : section.provenance === 'llm_generated' ? 'AI generated'
                : section.provenance === 'llm_suggested' ? 'AI suggested'
                : section.provenance === 'guideline_rag' ? 'Guideline'
                : section.provenance === 'not_documented' ? 'Not documented'
                : section.provenance === 'skeleton' ? 'Template'
                : section.provenance}
            </Badge>
          )}
          {hasAdvisories && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 cursor-default ${
                    hasCritical ? 'border-red-400 text-red-700 dark:text-red-400' : 'border-amber-400 text-amber-700 dark:text-amber-400'
                  }`}>
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {section.advisories!.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {section.advisories!.length} AI {section.advisories!.length === 1 ? 'advisory' : 'advisories'} — review flagged items below
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
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
                  onClick={onToggleEdit}
                  className="h-7 w-7 p-0 shrink-0"
                >
                  {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isEditing ? 'Preview' : 'Edit'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
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
          <div className="space-y-2 animate-pulse">
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
          <div className="tibabot-markdown prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden">
            <Markdown remarkPlugins={[remarkGfm]}>{section.content}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No content — click edit to write or generate with TibaBot.
          </p>
        )}
      </div>
      {/* Advisory banners */}
      {section.advisories && section.advisories.length > 0 && !isEditing && (
        <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
          {section.advisories.map((adv, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                adv.severity === 'critical'
                  ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
              }`}
            >
              <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                adv.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
              }`} />
              <span>{formatAdvisoryText(adv.text)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
